// Correct a booking's start date to an EARLIER day (SHIFT_BASED and LIVE_IN).
//
// SHIFT_BASED: the start date lives in bookings.start_date, the first shift pattern's
//   effective_from_date and the first assignment of each shift slot.
// LIVE_IN: it lives in bookings.start_date and the first assignment's service_start_date.
//
// The care timeline numbers its days from bookings.start_date, so a day before it can never
// be opened, invoiced or paid. This moves everything anchored to "day 1" back together, in
// one transaction.
//
// It never creates a salary or attendance row. For LIVE_IN it also seeds a PENDING
// (no money) day-invoice row for every added service day — the same row the nightly cron
// seeds for manual days — so those days show as "action needed". The controller may then
// invoice some of them in the same transaction (see bookingController.changeStartDate).
//
// Rules (enforced in preview AND again inside the apply transaction):
//   - Booking is ACTIVE or OVERDUE; earlier only, at most MAX_BACKDATE_DAYS back.
//   - Nothing may already exist on the days being added (attendance, invoice, reschedule, pause).
//   - A staff member being pulled back must not be committed elsewhere or on approved leave.
//   - The planned end date (scheduled_end_time) is never touched.
//   - Existing rows on the OLD first day are never edited; they are only described in notices.

const { conflictThreshold } = require('./staffAvailability');
const { isServiceDay } = require('./repeatDays');

const MAX_BACKDATE_DAYS = 14;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_STATUSES = ['ACTIVE', 'OVERDUE'];
const ALLOWED_MODELS = ['SHIFT_BASED', 'LIVE_IN'];

const fail = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

// Dates between two ISO days, inclusive, computed in SQL so there is no JS timezone drift.
async function daysBetween(client, from, to) {
    const r = await client.query(
        `SELECT d::date::text AS d FROM generate_series($1::date, $2::date, interval '1 day') AS d`,
        [from, to]
    );
    return r.rows.map((row) => row.d);
}

const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-LK')}`;

/**
 * Works out what a start-date change would do, without writing anything.
 * Returns { ok, blocks, notices, booking, changes, days_added, added_days_detail }.
 * `blocks` are plain-English reasons the change can't go ahead (ok is true only when empty);
 * `notices` are non-blocking things the admin should know.
 * Pass `lock: true` (inside a transaction) to lock the booking row for the apply step.
 */
async function previewStartDateChange(client, { booking_id, new_start_date, lock = false }) {
    if (!ISO.test(String(new_start_date || ''))) {
        throw fail(400, 'new_start_date must be a date in YYYY-MM-DD format');
    }

    const bookingRes = await client.query(
        `SELECT booking_id, booking_code, service_model, status, daily_rate, repeat_days,
                start_date::text AS start_date, scheduled_end_time
         FROM bookings WHERE booking_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
        [booking_id]
    );
    const booking = bookingRes.rows[0];
    if (!booking) throw fail(404, 'Booking not found');

    const isLiveIn = booking.service_model === 'LIVE_IN';
    const blocks = [];
    const notices = [];
    const result = {
        ok: false,
        blocks,
        notices,
        booking: {
            booking_id: booking.booking_id,
            booking_code: booking.booking_code,
            status: booking.status,
            service_model: booking.service_model,
            current_start_date: booking.start_date,
            daily_rate: booking.daily_rate !== null ? Number(booking.daily_rate) : null,
        },
        changes: { booking_start_date: null, patterns: [], assignments: [] },
        days_added: [],
        added_days_detail: [],
        max_backdate_days: MAX_BACKDATE_DAYS,
    };

    if (!ALLOWED_MODELS.includes(booking.service_model)) {
        blocks.push('Correcting the start date is only available for shift-based and live-in bookings.');
    }
    if (!ALLOWED_STATUSES.includes(booking.status)) {
        blocks.push(`The start date can only be corrected while the booking is Active or Overdue (this one is ${booking.status}).`);
    }
    if (!booking.start_date) {
        blocks.push('This booking has no start date to correct.');
    }
    if (blocks.length) return result;

    const oldStart = booking.start_date;
    const dayDiff = (await client.query(`SELECT ($1::date - $2::date) AS n`, [oldStart, new_start_date])).rows[0].n;
    if (dayDiff <= 0) {
        blocks.push(`The new start date must be earlier than the current start date (${oldStart}).`);
        return result;
    }
    if (dayDiff > MAX_BACKDATE_DAYS) {
        blocks.push(`The start date can be moved back by at most ${MAX_BACKDATE_DAYS} days (to ${(await client.query(`SELECT ($1::date - $2::int)::text AS d`, [oldStart, MAX_BACKDATE_DAYS])).rows[0].d}).`);
        return result;
    }

    const lastAddedDay = (await client.query(`SELECT ($1::date - 1)::text AS d`, [oldStart])).rows[0].d;
    result.days_added = await daysBetween(client, new_start_date, lastAddedDay);
    result.changes.booking_start_date = { from: oldStart, to: new_start_date };

    // ── Shift patterns anchored to day 1 (SHIFT_BASED only) ─────────────────────────
    if (!isLiveIn) {
        const patternRes = await client.query(
            `SELECT pattern_id, effective_from_date::text AS effective_from_date, status
             FROM booking_shift_patterns
             WHERE booking_id = $1 AND effective_from_date = $2::date
               AND status IN ('ACTIVE', 'SUPERSEDED')`,
            [booking_id, oldStart]
        );
        result.changes.patterns = patternRes.rows.map((p) => ({
            pattern_id: p.pattern_id, from: p.effective_from_date, to: new_start_date, status: p.status,
        }));
    }

    // ── Standing staff assignments that started on day 1 ────────────────────────────
    // SHIFT_BASED: one per slot. LIVE_IN: only the FIRST one — a same-day swap replacement
    // also starts on day 1 but must stay where it is. Makeup assignments are never touched.
    const assignmentRes = await client.query(
        `SELECT bsa.assignment_id, bsa.staff_profile_id, bsa.status, bsa.shift_slot_id,
                bsa.service_start_date::text AS service_start_date,
                sp.full_name, sp.staff_code, sp.can_dual_book
         FROM booking_staff_assignments bsa
         JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
         WHERE bsa.booking_id = $1 AND bsa.reschedule_id IS NULL
           AND bsa.service_start_date = $2::date
           ${isLiveIn ? 'AND bsa.shift_slot_id IS NULL' : ''}
         ORDER BY bsa.assigned_on ASC
         ${isLiveIn ? 'LIMIT 1' : ''}`,
        [booking_id, oldStart]
    );
    for (const a of assignmentRes.rows) {
        result.changes.assignments.push({
            assignment_id: a.assignment_id, staff_name: a.full_name, staff_code: a.staff_code,
            from: a.service_start_date, to: new_start_date, status: a.status,
        });
        if (a.status === 'SCHEDULED') {
            blocks.push(`${a.full_name} is booked to start on ${oldStart} but has not started yet, so the start date can't be moved back.`);
            continue;
        }

        const conflicts = await client.query(
            `SELECT b.booking_code
             FROM booking_staff_assignments o
             JOIN bookings b ON b.booking_id = o.booking_id
             WHERE o.staff_profile_id = $1 AND o.booking_id <> $2
               AND o.status IN ('ACTIVE', 'SCHEDULED')
               AND o.service_start_date <= $4::date
               AND (o.service_end_date IS NULL OR o.service_end_date >= $3::date)
             LIMIT 2`,
            [a.staff_profile_id, booking_id, new_start_date, lastAddedDay]
        );
        if (conflicts.rows.length >= conflictThreshold(a.can_dual_book)) {
            blocks.push(`${a.full_name} is already on ${conflicts.rows[0].booking_code} during ${new_start_date} to ${lastAddedDay}.`);
        }

        const leave = await client.query(
            `SELECT start_date::text AS start_date, end_date::text AS end_date
             FROM staff_leave_requests
             WHERE staff_profile_id = $1 AND status = 'APPROVED' AND actual_return_date IS NULL
               AND start_date <= $3::date AND end_date >= $2::date
             LIMIT 1`,
            [a.staff_profile_id, new_start_date, lastAddedDay]
        );
        if (leave.rows.length) {
            blocks.push(`${a.full_name} has approved leave (${leave.rows[0].start_date} to ${leave.rows[0].end_date}) overlapping ${new_start_date} to ${lastAddedDay}.`);
        }
    }

    // A staff start that is still scheduled for this booking would be left out of order.
    if (isLiveIn) {
        const pendingStart = await client.query(
            `SELECT 1 FROM scheduled_actions
             WHERE booking_id = $1 AND action_type = 'ASSIGNMENT_START' AND status = 'SCHEDULED' LIMIT 1`,
            [booking_id]
        );
        if (pendingStart.rows.length) {
            blocks.push('A staff start is already scheduled for this booking. Wait until it has happened, then correct the start date.');
        }
    }

    // ── Anything already recorded on the days being added is not a clean move ───────
    // Sequential on purpose: `client` may be a single transaction connection.
    const att = await client.query(
        `SELECT service_date::text AS d FROM staff_daily_attendance
         WHERE booking_id = $1 AND service_date >= $2::date AND service_date < $3::date LIMIT 3`,
        [booking_id, new_start_date, oldStart]
    );
    const inv = await client.query(
        `SELECT service_date::text AS d FROM booking_daily_invoices
         WHERE booking_id = $1 AND service_date >= $2::date AND service_date < $3::date LIMIT 3`,
        [booking_id, new_start_date, oldStart]
    );
    const resched = await client.query(
        `SELECT original_date::text AS o, new_date::text AS n FROM shift_reschedules
         WHERE booking_id = $1 AND status = 'ACTIVE'
           AND ((original_date >= $2::date AND original_date < $3::date)
             OR (new_date >= $2::date AND new_date < $3::date)) LIMIT 3`,
        [booking_id, new_start_date, oldStart]
    );
    const pauses = await client.query(
        `SELECT paused_date::text AS d FROM booking_pauses
         WHERE booking_id = $1 AND paused_date >= $2::date AND paused_date < $3::date LIMIT 3`,
        [booking_id, new_start_date, oldStart]
    );
    if (att.rows.length) blocks.push(`Staff attendance is already recorded on ${att.rows.map((r) => r.d).join(', ')}.`);
    if (inv.rows.length) blocks.push(`A client invoice is already recorded on ${inv.rows.map((r) => r.d).join(', ')}.`);
    if (resched.rows.length) blocks.push('A shift reschedule already touches the days being added.');
    if (pauses.rows.length) blocks.push(`The booking has a pause recorded on ${pauses.rows.map((r) => r.d).join(', ')}.`);

    // ── LIVE_IN: which added days need invoicing, and what the old first day looks like ─
    if (isLiveIn) {
        const rate = booking.daily_rate !== null ? Number(booking.daily_rate) : 0;
        result.added_days_detail = result.days_added.map((d) => ({
            service_date: d,
            is_service_day: isServiceDay(booking.repeat_days, d),
            default_amount: rate,
        }));
        if (!(rate > 0)) {
            notices.push("This booking has no daily rate set, so type an amount for each day you invoice.");
        }

        const oldFirstAtt = await client.query(
            `SELECT salary_status, (in_time IS NOT NULL) AS has_in, (out_time IS NOT NULL) AS has_out
             FROM staff_daily_attendance
             WHERE booking_id = $1 AND service_date = $2::date AND shift_slot_id IS NULL AND reschedule_id IS NULL`,
            [booking_id, oldStart]
        );
        const oldFirstInv = await client.query(
            `SELECT status, amount FROM booking_daily_invoices
             WHERE booking_id = $1 AND service_date = $2::date AND shift_slot_id IS NULL AND reschedule_id IS NULL`,
            [booking_id, oldStart]
        );
        const attRow = oldFirstAtt.rows[0];
        if (attRow && attRow.salary_status === 'PENDING') {
            notices.push(`${oldStart} was the first day, so its staff pay was left to be settled when the assignment ends. It will now be an ordinary day: open it on the care timeline and mark the staff present, then calculate their salary.`);
        } else if (attRow) {
            notices.push(`${oldStart} already has its staff pay recorded (${attRow.salary_status.toLowerCase()}). It is left as it is.`);
        }
        const invRows = oldFirstInv.rows;
        const invoiced = invRows.filter((r) => r.status === 'INVOICED');
        if (invoiced.length) {
            const total = invoiced.reduce((s, r) => s + Number(r.amount || 0), 0);
            notices.push(`${oldStart} was already invoiced at ${money(total)} as a first day. It is now a full day, so check that amount and use Correct on the timeline if needed.`);
        } else if (invRows.some((r) => r.status === 'PENDING')) {
            notices.push(`${oldStart} has a pending invoice. It stays pending and can be decided on the care timeline.`);
        }
        if (booking.scheduled_end_time) {
            notices.push('The planned end date is not changed.');
        }
    }

    result.ok = blocks.length === 0;
    return result;
}

/**
 * Applies the change inside the caller's open transaction. Re-runs the preview with the
 * booking locked, so nothing that changed since the admin looked can slip through.
 * For LIVE_IN, also seeds a PENDING whole-day invoice row for each added service day
 * (never overwriting an existing row). Returns the preview plus `seeded_dates`.
 */
async function applyStartDateChange(client, { booking_id, new_start_date, expected_old_start_date }) {
    const preview = await previewStartDateChange(client, { booking_id, new_start_date, lock: true });

    if (expected_old_start_date && preview.booking.current_start_date !== expected_old_start_date) {
        throw fail(409, `This booking's start date is now ${preview.booking.current_start_date}, not ${expected_old_start_date}. Reload and try again.`);
    }
    if (!preview.ok) {
        throw fail(409, preview.blocks[0]);
    }

    await client.query(`UPDATE bookings SET start_date = $2::date WHERE booking_id = $1`, [booking_id, new_start_date]);

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

    const seeded = [];
    for (const day of preview.added_days_detail) {
        if (!day.is_service_day) continue;
        // Same shape as the cron's manual-day seed: never adds a second row for a day that
        // already has one, and moves no money.
        const ins = await client.query(
            `INSERT INTO booking_daily_invoices (booking_id, service_date, entry_mode, status, amount)
             SELECT $1::uuid, $2::date, 'MANUAL', 'PENDING', $3::numeric
             WHERE NOT EXISTS (
               SELECT 1 FROM booking_daily_invoices
               WHERE booking_id = $1::uuid AND service_date = $2::date AND shift_slot_id IS NULL
             )
             ON CONFLICT (booking_id, service_date) WHERE shift_slot_id IS NULL AND assignment_id IS NULL DO NOTHING
             RETURNING service_date::text AS d`,
            [booking_id, day.service_date, day.default_amount]
        );
        if (ins.rows.length) seeded.push(ins.rows[0].d);
    }

    return { ...preview, seeded_dates: seeded };
}

module.exports = { previewStartDateChange, applyStartDateChange, MAX_BACKDATE_DAYS };
