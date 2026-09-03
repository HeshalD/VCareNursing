// services/coverageEvents.js
// Staff handoffs on a LIVE_IN booking come in three shapes. Until now only the
// first existed, and it was hard-coded: the outgoing staff's assignment closed on
// the swap date and the incoming staff's opened the next day, always.
//
//   IMMEDIATE — new staff starts the day after the old staff's last day. The
//               normal, back-to-back handoff. No coverage event is recorded.
//   GAP       — the incoming staff is late and one or more whole days pass with
//               nobody on site. Capped at MAX_GAP_DAYS.
//   OVERLAP   — the outgoing staff stays on after the incoming staff has started,
//               so both are on site for one or more whole days. Capped at
//               MAX_OVERLAP_DAYS.
//
// Only whole uncovered/double-covered CALENDAR DAYS produce an event. A handoff
// where the old staff leaves at 08:00 and the new one arrives at 20:00 the next
// day is still IMMEDIATE: both of those are partial boundary days, which the
// nightly cron already leaves PENDING for the admin (see cron/dailyInvoicing.js),
// so there is nothing extra to decide and no event is written.
//
// What an event changes downstream is narrow by design — it adds dates to the two
// "this day is the admin's call, not the cron's" sets that dailyInvoicing.js
// already maintains for a booking's first and last day. Nothing here moves money.

const MAX_GAP_DAYS = 3;
const MAX_OVERLAP_DAYS = 7;

// ─── Date helpers ────────────────────────────────────────────────────────────
// Everything here is a plain 'YYYY-MM-DD' string. Deliberately never a JS Date:
// pg parses DATE columns into Date objects in the server's timezone, and
// .toISOString() on one of those silently shifts the day — the same off-by-one
// that daily attendance/invoicing hit before (see the ::text casts throughout).

const toDateStr = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addDays = (dateStr, days) => {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toDateStr(d);
};

const daysBetween = (fromStr, toStr) =>
    Math.round((new Date(`${toStr}T12:00:00`) - new Date(`${fromStr}T12:00:00`)) / 86400000);

/** Inclusive list of date strings from start to end. */
const expandDays = (startStr, endStr) => {
    const out = [];
    for (let d = startStr; d <= endStr; d = addDays(d, 1)) out.push(d);
    return out;
};

// ─── Handoff derivation ──────────────────────────────────────────────────────

/**
 * Works out which of the three handoff shapes a pair of dates describes, and the
 * affected range. The dates are the source of truth; the admin's declared type is
 * only cross-checked against this (see validateHandoff) so a mistyped date can't
 * quietly become a 3-day gap.
 *
 * @param {string} oldEndDateStr   outgoing staff's last service date
 * @param {string} newStartDateStr incoming staff's first service date
 */
const deriveHandoff = (oldEndDateStr, newStartDateStr) => {
    const oldEnd = toDateStr(oldEndDateStr);
    const newStart = toDateStr(newStartDateStr);
    const delta = daysBetween(oldEnd, newStart); // 1 = back-to-back

    if (delta > 1) {
        return {
            type: 'GAP',
            start_date: addDays(oldEnd, 1),
            end_date: addDays(newStart, -1),
            days: delta - 1,
        };
    }

    if (delta <= 0) {
        return {
            type: 'OVERLAP',
            start_date: newStart,
            end_date: oldEnd,
            days: Math.abs(delta) + 1,
        };
    }

    return { type: 'IMMEDIATE', start_date: null, end_date: null, days: 0 };
};

/**
 * Validates a derived handoff against what the admin said they were doing and
 * against the booking's service model. Throws an Error with `.statusCode` set,
 * matching the convention the attendance/invoice helpers use.
 *
 * GAP/OVERLAP are LIVE_IN-only for now. SHIFT_BASED never reaches here (swapStaff
 * rejects it outright — shifts use the per-slot reassign endpoint), and VISITING
 * is a single one-day visit, so a multi-day gap or overlap is meaningless there.
 *
 * A declared GAP/OVERLAP that derives as IMMEDIATE is allowed through as
 * IMMEDIATE: it means the admin picked dates only hours apart, which is a normal
 * boundary-day handoff, not an error worth blocking on.
 */
const validateHandoff = (declaredType, derived, serviceModel) => {
    const declared = declaredType || 'IMMEDIATE';

    if (!['IMMEDIATE', 'GAP', 'OVERLAP'].includes(declared)) {
        const err = new Error(`Unknown handoff_type: ${declared}`);
        err.statusCode = 400;
        throw err;
    }

    if (derived.type === 'IMMEDIATE') return { ...derived, declared };

    if (serviceModel !== 'LIVE_IN') {
        const err = new Error(`A ${derived.type.toLowerCase()} handoff is only supported on LIVE_IN bookings`);
        err.statusCode = 400;
        throw err;
    }

    if (declared !== derived.type) {
        const err = new Error(
            `The dates describe a ${derived.type.toLowerCase()} handoff, not ${declared.toLowerCase()}. ` +
            `Check the outgoing staff's last day and the incoming staff's start date.`
        );
        err.statusCode = 400;
        throw err;
    }

    const cap = derived.type === 'GAP' ? MAX_GAP_DAYS : MAX_OVERLAP_DAYS;
    if (derived.days > cap) {
        const article = derived.type === 'GAP' ? 'A' : 'An';
        const err = new Error(
            `${article} ${derived.type.toLowerCase()} of ${derived.days} days exceeds the ${cap}-day maximum.`
        );
        err.statusCode = 400;
        throw err;
    }

    return { ...derived, declared };
};

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Records a GAP/OVERLAP range. No-op (returns null) for an IMMEDIATE handoff.
 * Must be called inside the caller's open transaction.
 */
const createCoverageEvent = async (client, {
    booking_id,
    event_type,
    start_date,
    end_date,
    old_staff_id = null,
    new_staff_id = null,
    old_assignment_id = null,
    new_assignment_id = null,
    swap_id = null,
    old_staff_out_time = null,
    new_staff_in_time = null,
    reason = null,
    created_by = null,
    created_by_name = null,
}) => {
    if (event_type !== 'GAP' && event_type !== 'OVERLAP') return null;

    const res = await client.query(
        `INSERT INTO booking_coverage_events (
            booking_id, event_type, start_date, end_date,
            old_staff_id, new_staff_id, old_assignment_id, new_assignment_id,
            swap_id, old_staff_out_time, new_staff_in_time,
            reason, created_by, created_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
            booking_id, event_type, start_date, end_date,
            old_staff_id, new_staff_id, old_assignment_id, new_assignment_id,
            swap_id, old_staff_out_time, new_staff_in_time,
            reason, created_by, created_by_name,
        ]
    );
    return res.rows[0];
};

/** Open events for a booking, newest range first — feeds the timeline and day modal. */
const getCoverageEventsForBooking = async (client, booking_id) => {
    const res = await client.query(
        `SELECT ce.*,
                ce.start_date::text AS start_date,
                ce.end_date::text AS end_date,
                os.full_name AS old_staff_name,
                ns.full_name AS new_staff_name
         FROM booking_coverage_events ce
         LEFT JOIN staff_profiles os ON ce.old_staff_id = os.staff_profile_id
         LEFT JOIN staff_profiles ns ON ce.new_staff_id = ns.staff_profile_id
         WHERE ce.booking_id = $1 AND ce.status = 'OPEN'
         ORDER BY ce.start_date DESC`,
        [booking_id]
    );
    return res.rows;
};

/**
 * The cron's single nightly lookup: which bookings are in a gap or an overlap on
 * this date. Returns Map<booking_id, { gap: boolean, overlap: boolean }>.
 */
const getCoverageDaysForDate = async (client, dateStr) => {
    const res = await client.query(
        `SELECT booking_id, event_type
         FROM booking_coverage_events
         WHERE status = 'OPEN' AND start_date <= $1::date AND end_date >= $1::date`,
        [dateStr]
    );

    const map = new Map();
    for (const row of res.rows) {
        const entry = map.get(row.booking_id) || { gap: false, overlap: false };
        if (row.event_type === 'GAP') entry.gap = true;
        else entry.overlap = true;
        map.set(row.booking_id, entry);
    }
    return map;
};

module.exports = {
    MAX_GAP_DAYS,
    MAX_OVERLAP_DAYS,
    toDateStr,
    addDays,
    daysBetween,
    expandDays,
    deriveHandoff,
    validateHandoff,
    createCoverageEvent,
    getCoverageEventsForBooking,
    getCoverageDaysForDate,
};
