// Change the start date of a booking that has NOT STARTED yet (LIVE_IN and SHIFT_BASED).
//
// A not-started booking is PENDING with its staff still SCHEDULED: nothing has been
// recorded, invoiced or paid for any day yet, so moving the date only moves anchors.
// It never creates or changes any money row.
//
// The start date lives in several places, which all move together:
//   - bookings.start_date (care timeline day 1)
//   - each SCHEDULED staff assignment's service_start_date that sat on the old start
//   - the ASSIGNMENT_START scheduled action for each of those assignments
//   - SHIFT_BASED: the booking's only shift pattern (effective_from_date) and its
//     SHIFT_PATTERN_CHANGE scheduled action
//   - LIVE_IN: bookings.scheduled_end_time (the planned end), when one is set
//
// If the new start is today, the staff start straight away (the same scheduler code
// the nightly run would use), so the booking becomes ACTIVE — exactly what assigning
// staff with today's date does.
//
// Rules (enforced in preview AND again inside the apply transaction):
//   - LIVE_IN or SHIFT_BASED, status PENDING, at least one SCHEDULED staff assignment,
//     and no assignment that has ever started (ACTIVE / COMPLETED / anything else).
//   - No attendance, day invoice, day draft, pause or reschedule rows at all.
//   - No open scheduled action other than the staff starts / pattern start above.
//   - New start is today or later (Asia/Colombo business date), and not the current start.
//   - LIVE_IN: new start must be one of the booking's repeat days; new end after new start.
//   - Each staff member moved must be free (other bookings, approved leave) on the new dates.
//   - The service request and quotes are never changed.

const { conflictThreshold } = require('./staffAvailability');
const { isServiceDay } = require('./repeatDays');
const { getBusinessDate, dispatchScheduledAction } = require('./scheduledActions');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MODELS = ['LIVE_IN', 'SHIFT_BASED'];
const MOVABLE_ACTIONS = ['ASSIGNMENT_START', 'SHIFT_PATTERN_CHANGE'];

const fail = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

const ACTION_LABEL = {
    TERMINATION: 'termination', COMPLETION: 'completion', STAFF_SWAP: 'staff swap',
    STAFF_RELIEVE: 'staff leave', SHIFT_REASSIGNMENT: 'shift reassignment',
    ASSIGNMENT_START: 'staff start', SHIFT_PATTERN_CHANGE: 'shift pattern change',
};

/**
 * Works out what moving a not-started booking's start date would do, without writing.
 * Returns { ok, blocks, notices, booking, changes, starts_today, business_date }.
 * Pass `lock: true` (inside a transaction) to lock the booking row for the apply step.
 */
async function previewScheduledStartChange(client, { booking_id, new_start_date, new_end_date, lock = false }) {
    if (!ISO.test(String(new_start_date || ''))) {
        throw fail(400, 'new_start_date must be a date in YYYY-MM-DD format');
    }
    if (new_end_date !== undefined && new_end_date !== null && new_end_date !== '' && !ISO.test(String(new_end_date))) {
        throw fail(400, 'new_end_date must be a date in YYYY-MM-DD format');
    }

    const bookingRes = await client.query(
        `SELECT booking_id, booking_code, service_model, status, repeat_days, request_id,
                start_date::text AS start_date,
                scheduled_end_time::date::text AS end_date
         FROM bookings WHERE booking_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
        [booking_id]
    );
    const booking = bookingRes.rows[0];
    if (!booking) throw fail(404, 'Booking not found');

    const isLiveIn = booking.service_model === 'LIVE_IN';
    const businessDate = await getBusinessDate(client);
    const blocks = [];
    const notices = [];

    let requestedStart = null;
    let quoteDays = null;
    if (booking.request_id) {
        const srRes = await client.query(
            `SELECT sr.start_date::text AS start_date, q.qty_days
             FROM service_requests sr
             LEFT JOIN quotations q ON q.quote_id = sr.active_quote_id
             WHERE sr.request_id = $1`,
            [booking.request_id]
        );
        requestedStart = srRes.rows[0]?.start_date || null;
        quoteDays = srRes.rows[0]?.qty_days ?? null;
    }

    const result = {
        ok: false,
        blocks,
        notices,
        business_date: businessDate,
        starts_today: false,
        booking: {
            booking_id: booking.booking_id,
            booking_code: booking.booking_code,
            status: booking.status,
            service_model: booking.service_model,
            booking_start_date: booking.start_date,
            current_start_date: null,
            current_end_date: booking.end_date,
            requested_start_date: requestedStart,
        },
        changes: {
            booking_start_date: null,
            booking_end_date: null,
            patterns: [],
            assignments: [],
            actions: [],
        },
    };

    if (!ALLOWED_MODELS.includes(booking.service_model)) {
        blocks.push('Changing the start date here is only available for live-in and shift-based bookings.');
    }
    if (booking.status !== 'PENDING') {
        blocks.push(`This is only for bookings that have not started yet (this one is ${booking.status}).`);
    }
    if (blocks.length) return result;

    // ── Staff assignments: all must still be waiting to start ───────────────────────
    const assignRes = await client.query(
        `SELECT bsa.assignment_id, bsa.staff_profile_id, bsa.status, bsa.shift_slot_id,
                bsa.service_start_date::text AS service_start_date,
                sp.full_name, sp.staff_code, sp.can_dual_book,
                slot.pattern_id, slot.shift_number
         FROM booking_staff_assignments bsa
         JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
         LEFT JOIN booking_shift_slots slot ON slot.shift_slot_id = bsa.shift_slot_id
         WHERE bsa.booking_id = $1
         ORDER BY bsa.assigned_on ASC`,
        [booking_id]
    );
    const started = assignRes.rows.filter((a) => !['SCHEDULED', 'CANCELLED'].includes(a.status));
    const scheduled = assignRes.rows.filter((a) => a.status === 'SCHEDULED');
    if (started.length) {
        blocks.push(`${started[0].full_name} has already started on this booking, so it is no longer a not-started booking.`);
        return result;
    }
    if (!scheduled.length) {
        blocks.push('No staff are scheduled to start on this booking yet. Pick the right start date when you assign staff.');
        return result;
    }

    // ── Where "day 1" lives today ───────────────────────────────────────────────────
    let anchor = null;
    let pattern = null;
    if (isLiveIn) {
        const liveInRows = scheduled.filter((a) => !a.shift_slot_id);
        if (liveInRows.length !== 1) {
            blocks.push('This booking has more than one staff member waiting to start. Cancel the extra one in Upcoming Events first.');
            return result;
        }
        anchor = liveInRows[0].service_start_date;
    } else {
        const patternRes = await client.query(
            `SELECT pattern_id, status, effective_from_date::text AS effective_from_date
             FROM booking_shift_patterns WHERE booking_id = $1`,
            [booking_id]
        );
        if (patternRes.rows.length !== 1 || !['SCHEDULED', 'ACTIVE'].includes(patternRes.rows[0].status)) {
            blocks.push("This booking's shift pattern has already been changed, so its start date can't be moved here.");
            return result;
        }
        pattern = patternRes.rows[0];
        anchor = pattern.effective_from_date;
        if (scheduled.some((a) => a.pattern_id !== pattern.pattern_id)) {
            blocks.push('A scheduled staff member is not on this booking\'s shift pattern, so the start date can\'t be moved here.');
            return result;
        }
    }
    result.booking.current_start_date = anchor;

    // ── The new dates ───────────────────────────────────────────────────────────────
    if (new_start_date === anchor) {
        blocks.push('That is already the start date.');
        return result;
    }
    if (new_start_date < businessDate) {
        blocks.push(`The new start date can't be in the past (today is ${businessDate}).`);
        return result;
    }
    result.starts_today = new_start_date === businessDate;
    result.changes.booking_start_date = { from: booking.start_date, to: new_start_date };

    if (isLiveIn && !isServiceDay(booking.repeat_days, new_start_date)) {
        blocks.push('The new start date falls on a day off for this booking. Pick one of its repeat days.');
    }

    if (isLiveIn) {
        let endTo = null;
        if (new_end_date) {
            endTo = new_end_date;
        } else if (booking.end_date) {
            // Keep the same length: shift the planned end by the same number of days.
            endTo = (await client.query(
                `SELECT ($1::date + ($2::date - $3::date))::text AS d`,
                [booking.end_date, new_start_date, anchor]
            )).rows[0].d;
        }
        if (endTo) {
            if (endTo <= new_start_date) {
                blocks.push('The planned end date must be after the new start date.');
            } else {
                result.changes.booking_end_date = { from: booking.end_date, to: endTo };
                const span = (await client.query(`SELECT ($1::date - $2::date) AS n`, [endTo, new_start_date])).rows[0].n;
                if (quoteDays && Number(quoteDays) !== Number(span)) {
                    notices.push(`The quote is for ${quoteDays} day(s), but the new dates cover ${span}. The quote itself is not changed.`);
                }
            }
        }
    }

    // ── Which assignments, pattern and actions move ─────────────────────────────────
    const moving = [];
    for (const a of scheduled) {
        if (a.service_start_date === anchor) {
            moving.push(a);
        } else if (a.service_start_date < new_start_date) {
            blocks.push(`${a.full_name} is set to start on ${a.service_start_date}, which would be before the new start date. Change that shift's staff first.`);
        } else {
            notices.push(`${a.full_name} starts later, on ${a.service_start_date}. That date is not changed.`);
        }
    }
    result.changes.assignments = moving.map((a) => ({
        assignment_id: a.assignment_id, staff_name: a.full_name, staff_code: a.staff_code,
        shift_number: a.shift_number || null, from: a.service_start_date, to: new_start_date,
    }));
    if (pattern) {
        result.changes.patterns = [{ pattern_id: pattern.pattern_id, status: pattern.status, from: pattern.effective_from_date, to: new_start_date }];
        const slotRes = await client.query(
            `SELECT repeat_days FROM booking_shift_slots WHERE pattern_id = $1`,
            [pattern.pattern_id]
        );
        if (slotRes.rows.length && !slotRes.rows.some((s) => isServiceDay(s.repeat_days, new_start_date))) {
            notices.push('No shift runs on that weekday, so the first shift will be on the next working day.');
        }
    }

    const actionsRes = await client.query(
        `SELECT action_id, action_type, effective_date::text AS effective_date, payload
         FROM scheduled_actions WHERE booking_id = $1 AND status = 'SCHEDULED'`,
        [booking_id]
    );
    const movingIds = new Set(moving.map((a) => a.assignment_id));
    const scheduledIds = new Set(scheduled.map((a) => a.assignment_id));
    for (const act of actionsRes.rows) {
        const p = act.payload || {};
        if (act.action_type === 'ASSIGNMENT_START' && scheduledIds.has(p.assignment_id)) {
            if (movingIds.has(p.assignment_id)) {
                result.changes.actions.push({ action_id: act.action_id, action_type: act.action_type, from: act.effective_date, to: new_start_date });
            }
        } else if (act.action_type === 'SHIFT_PATTERN_CHANGE' && pattern && p.new_pattern_id === pattern.pattern_id) {
            result.changes.actions.push({ action_id: act.action_id, action_type: act.action_type, from: act.effective_date, to: new_start_date });
        } else {
            blocks.push(`A ${ACTION_LABEL[act.action_type] || act.action_type} is scheduled for ${act.effective_date}. Cancel it in Upcoming Events first.`);
        }
    }

    // ── Nothing may be recorded against any day yet ─────────────────────────────────
    // Sequential on purpose: `client` may be a single transaction connection.
    const recorded = [
        ['staff_daily_attendance', 'Staff attendance'],
        ['booking_daily_invoices', 'A day invoice'],
        ['booking_day_drafts', 'A day draft'],
        ['booking_pauses', 'A pause'],
        ['shift_reschedules', 'A shift reschedule'],
    ];
    for (const [table, label] of recorded) {
        const r = await client.query(`SELECT 1 FROM ${table} WHERE booking_id = $1 LIMIT 1`, [booking_id]);
        if (r.rows.length) blocks.push(`${label} is already recorded on this booking, so it has effectively started.`);
    }

    // ── Each moved staff member must be free on the new dates ───────────────────────
    // Moving earlier adds the days before the old start; moving later only needs the
    // new first day checked (the rest was already theirs).
    const windowEnd = new_start_date < anchor
        ? (await client.query(`SELECT ($1::date - 1)::text AS d`, [anchor])).rows[0].d
        : new_start_date;
    const seenStaff = new Set();
    for (const a of moving) {
        if (seenStaff.has(a.staff_profile_id)) continue;
        seenStaff.add(a.staff_profile_id);

        const conflicts = await client.query(
            `SELECT b.booking_code
             FROM booking_staff_assignments o
             JOIN bookings b ON b.booking_id = o.booking_id
             LEFT JOIN LATERAL (
                 SELECT effective_date FROM scheduled_actions
                 WHERE booking_id = o.booking_id
                   AND action_type IN ('TERMINATION', 'COMPLETION')
                   AND status = 'SCHEDULED'
                 ORDER BY effective_date ASC
                 LIMIT 1
             ) sa ON o.service_end_date IS NULL
             WHERE o.staff_profile_id = $1 AND o.booking_id <> $2
               AND o.status IN ('ACTIVE', 'SCHEDULED')
               AND o.service_start_date <= $4::date
               AND (COALESCE(o.service_end_date, sa.effective_date) IS NULL
                    OR COALESCE(o.service_end_date, sa.effective_date) >= $3::date)
             LIMIT 2`,
            [a.staff_profile_id, booking_id, new_start_date, windowEnd]
        );
        if (conflicts.rows.length >= conflictThreshold(a.can_dual_book)) {
            blocks.push(`${a.full_name} is already on ${conflicts.rows[0].booking_code} on ${new_start_date === windowEnd ? new_start_date : `${new_start_date} to ${windowEnd}`}.`);
        }

        const leave = await client.query(
            `SELECT start_date::text AS start_date, end_date::text AS end_date
             FROM staff_leave_requests
             WHERE staff_profile_id = $1 AND status = 'APPROVED' AND actual_return_date IS NULL
               AND start_date <= $3::date AND end_date >= $2::date
             LIMIT 1`,
            [a.staff_profile_id, new_start_date, windowEnd]
        );
        if (leave.rows.length) {
            blocks.push(`${a.full_name} has approved leave (${leave.rows[0].start_date} to ${leave.rows[0].end_date}) on the new dates.`);
        }
    }

    if (result.starts_today) {
        notices.push('The new date is today, so the staff start straight away and the booking becomes Active. Enter today\'s in-time on the care timeline as usual.');
    }

    result.ok = blocks.length === 0;
    return result;
}

/**
 * Applies the change inside the caller's open transaction. Re-runs the preview with the
 * booking locked. Returns the preview plus `notifies` (functions to call after COMMIT)
 * and `started_now` (true when the staff were started because the new date is today).
 */
async function applyScheduledStartChange(client, { booking_id, new_start_date, new_end_date, expected_old_start_date, actor }) {
    const preview = await previewScheduledStartChange(client, { booking_id, new_start_date, new_end_date, lock: true });

    if (expected_old_start_date && preview.booking.current_start_date !== expected_old_start_date) {
        throw fail(409, `This booking's start date is now ${preview.booking.current_start_date}, not ${expected_old_start_date}. Reload and try again.`);
    }
    if (!preview.ok) {
        throw fail(409, preview.blocks[0]);
    }

    const end = preview.changes.booking_end_date;
    await client.query(
        `UPDATE bookings
         SET start_date = $2::date,
             scheduled_end_time = CASE WHEN $3::date IS NULL THEN scheduled_end_time ELSE $3::date::timestamp END
         WHERE booking_id = $1`,
        [booking_id, new_start_date, end ? end.to : null]
    );
    for (const p of preview.changes.patterns) {
        await client.query(
            `UPDATE booking_shift_patterns SET effective_from_date = $2::date WHERE pattern_id = $1`,
            [p.pattern_id, new_start_date]
        );
    }
    for (const a of preview.changes.assignments) {
        await client.query(
            `UPDATE booking_staff_assignments SET service_start_date = $2::date, updated_at = NOW() WHERE assignment_id = $1`,
            [a.assignment_id, new_start_date]
        );
    }
    for (const act of preview.changes.actions) {
        await client.query(
            `UPDATE scheduled_actions SET effective_date = $2::date WHERE action_id = $1 AND status = 'SCHEDULED'`,
            [act.action_id, new_start_date]
        );
    }

    const notifies = [];
    if (preview.starts_today) {
        // Same as the nightly scheduler would do on the day: pattern first, then staff.
        const due = await client.query(
            `SELECT * FROM scheduled_actions
             WHERE booking_id = $1 AND status = 'SCHEDULED' AND action_id = ANY($2::uuid[])
             ORDER BY CASE action_type WHEN 'SHIFT_PATTERN_CHANGE' THEN 0 ELSE 1 END
             FOR UPDATE`,
            [booking_id, preview.changes.actions.map((a) => a.action_id)]
        );
        for (const action of due.rows) {
            const { notify } = await dispatchScheduledAction(client, action, actor);
            await client.query(
                `UPDATE scheduled_actions SET status = 'EXECUTED', executed_at = NOW() WHERE action_id = $1`,
                [action.action_id]
            );
            if (notify) notifies.push(notify);
        }
        // A pattern scheduled without its own action is switched on directly.
        for (const p of preview.changes.patterns) {
            await client.query(
                `UPDATE booking_shift_patterns SET status = 'ACTIVE' WHERE pattern_id = $1 AND status = 'SCHEDULED'`,
                [p.pattern_id]
            );
        }
    }

    return { ...preview, notifies, started_now: preview.starts_today };
}

module.exports = { previewScheduledStartChange, applyScheduledStartChange };
