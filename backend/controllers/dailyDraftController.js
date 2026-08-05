// controllers/dailyDraftController.js
// Backend-persisted staging area for the Day Detail modal (BookingDetailPageV2.jsx).
// Everything an admin enters for a day — staff in/out times or absences, salary
// decisions, invoice decisions/waives — is cached here via PUT and never touches
// staff_daily_attendance/booking_daily_invoices/wallets/transactions until the
// admin explicitly hits Confirm (POST .../confirm), which applies every entry
// atomically and deletes the draft row. See applyAttendanceTime/applyAttendanceAbsent/
// applySalaryDecision (dailyAttendanceController.js) and applyInvoiceDecision/
// applyWaiveDecision (bookingController.js) for the actual business-table writes
// this composes — this file owns none of that logic itself, only orchestration.

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { maybeAutoCompleteVisitingBooking } = require('../services/visitingBookings');
const dailyAttendanceController = require('./dailyAttendanceController');
const bookingController = require('./bookingController');

const { applyAttendanceTime, applyAttendanceAbsent, applySalaryDecision, getDeciderName } = dailyAttendanceController._internal;
const { applyInvoiceDecision, applyWaiveDecision, getActorName } = bookingController._internal;

/**
 * @route   GET /api/bookings/:booking_id/day-draft?service_date=YYYY-MM-DD
 * @desc    Fetch the cached (unconfirmed) draft for a day, if one exists.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getDayDraft = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date } = req.query;

    if (!service_date) {
        return res.status(400).json({ status: 'error', message: 'service_date is required' });
    }

    try {
        const result = await db.query(
            `SELECT draft_id, booking_id, service_date::text as service_date, payload, updated_by_name, updated_at
             FROM booking_day_drafts WHERE booking_id = $1 AND service_date = $2`,
            [booking_id, service_date]
        );

        res.status(200).json({ status: 'success', data: result.rows[0] || null });
    } catch (error) {
        console.error('Get day draft error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch day draft' });
    }
};

/**
 * @route   GET /api/bookings/:booking_id/day-drafts
 * @desc    List every date on this booking that currently has an unconfirmed
 *          draft — used by CareTimeline to badge in-progress days.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.listDayDrafts = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const result = await db.query(
            `SELECT service_date::text as service_date, updated_at FROM booking_day_drafts WHERE booking_id = $1`,
            [booking_id]
        );

        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('List day drafts error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch day drafts' });
    }
};

/**
 * @route   PUT /api/bookings/:booking_id/day-draft
 * @desc    Upsert the cached form state for a day. Pure cache write — no
 *          business-table rows are touched, nothing moves money.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    service_date, payload (object — see file header for shape)
 */
exports.upsertDayDraft = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date, payload } = req.body;

    if (!service_date || !payload || typeof payload !== 'object') {
        return res.status(400).json({ status: 'error', message: 'service_date and payload (object) are required' });
    }

    try {
        const deciderName = await getDeciderName(req.user?.user_id);

        const result = await db.query(
            `INSERT INTO booking_day_drafts (booking_id, service_date, payload, updated_by_user_id, updated_by_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (booking_id, service_date)
             DO UPDATE SET payload = EXCLUDED.payload,
                           updated_by_user_id = EXCLUDED.updated_by_user_id,
                           updated_by_name = EXCLUDED.updated_by_name,
                           updated_at = NOW()
             RETURNING draft_id, service_date::text as service_date, payload, updated_by_name, updated_at`,
            [booking_id, service_date, JSON.stringify(payload), req.user?.user_id || null, deciderName]
        );

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Upsert day draft error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save day draft' });
    }
};

/**
 * @route   DELETE /api/bookings/:booking_id/day-draft
 * @desc    Discard a day's cached draft without applying anything.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    service_date
 */
exports.discardDayDraft = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date } = req.body;

    if (!service_date) {
        return res.status(400).json({ status: 'error', message: 'service_date is required' });
    }

    try {
        await db.query(
            `DELETE FROM booking_day_drafts WHERE booking_id = $1 AND service_date = $2`,
            [booking_id, service_date]
        );

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Discard day draft error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to discard day draft' });
    }
};

/**
 * @route   POST /api/bookings/:booking_id/day-draft/confirm
 * @desc    Applies every staff attendance/salary entry and every invoice
 *          decision cached in the day's draft, atomically, then deletes the
 *          draft. This is the only place a Day Detail action actually moves
 *          money or writes a terminal status — everything up to this point
 *          was just cache.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    service_date
 */
exports.confirmDayDraft = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date } = req.body;

    if (!service_date) {
        return res.status(400).json({ status: 'error', message: 'service_date is required' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const draftRes = await client.query(
            `SELECT * FROM booking_day_drafts WHERE booking_id = $1 AND service_date = $2 FOR UPDATE`,
            [booking_id, service_date]
        );

        if (draftRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'No draft found for this day' });
        }

        const payload = draftRes.rows[0].payload;
        const staffEntries = Array.isArray(payload.staff) ? payload.staff : [];
        const invoiceEntries = Array.isArray(payload.invoices) ? payload.invoices : [];

        if (staffEntries.length === 0 && invoiceEntries.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'This draft has nothing to confirm' });
        }

        const deciderUserId = req.user?.user_id;
        const deciderName = await getDeciderName(deciderUserId);
        const actorName = await getActorName(deciderUserId);

        const attendanceResults = [];
        const invoiceResults = [];
        const activityEntries = [];

        for (const entry of staffEntries) {
            if (entry.action === 'ABSENT') {
                const { attendance, absentNotes } = await applyAttendanceAbsent(client, {
                    booking_id, assignment_id: entry.assignment_id, service_date,
                    shift_slot_id: entry.shift_slot_id || null, notes: entry.notes,
                    deciderUserId, deciderName
                });
                attendanceResults.push(attendance);
                activityEntries.push({
                    actionType: 'STAFF_MARKED_ABSENT',
                    details: { assignment_id: entry.assignment_id, service_date, notes: absentNotes }
                });
                continue;
            }

            if (entry.action === 'WAIVE') {
                await applyWaiveDecision(client, {
                    booking_id, service_date, shift_slot_id: entry.shift_slot_id, assignment_id: entry.assignment_id,
                    reschedule_id: entry.reschedule_id || null, reason: entry.notes,
                    deciderUserId, deciderName: actorName
                });
                activityEntries.push({
                    actionType: 'SHIFT_OCCURRENCE_WAIVED',
                    details: { service_date, shift_slot_id: entry.shift_slot_id, assignment_id: entry.assignment_id }
                });
                continue;
            }

            // action === 'TIME'
            const { attendance, hoursServed } = await applyAttendanceTime(client, {
                booking_id, assignment_id: entry.assignment_id, service_date,
                in_time: entry.in_time, out_time: entry.out_time, notes: entry.notes,
                shift_slot_id: entry.shift_slot_id || null, reschedule_id: entry.reschedule_id || null
            });
            attendanceResults.push(attendance);
            activityEntries.push({
                actionType: 'ATTENDANCE_RECORDED',
                details: { assignment_id: entry.assignment_id, service_date, hours_served: hoursServed.toFixed(2) }
            });

            if (entry.salary_decision && typeof entry.salary_decision.approve === 'boolean') {
                const { attendance: decided, salaryAmount } = await applySalaryDecision(client, {
                    attendance_id: attendance.attendance_id,
                    approve: entry.salary_decision.approve,
                    amount: entry.salary_decision.amount,
                    deciderUserId, deciderName
                });
                attendanceResults[attendanceResults.length - 1] = decided;
                activityEntries.push({
                    actionType: entry.salary_decision.approve ? 'STAFF_SALARY_CONFIRMED' : 'STAFF_SALARY_SKIPPED',
                    details: { attendance_id: attendance.attendance_id, service_date, amount: salaryAmount }
                });
            }
        }

        for (const entry of invoiceEntries) {
            if (entry.action === 'WAIVE') {
                // Already handled via a staff entry with action WAIVE above when both
                // sides are cached together; a bare invoice-only waive (no staff entry
                // present) is also supported here for completeness.
                await applyWaiveDecision(client, {
                    booking_id, service_date, shift_slot_id: entry.shift_slot_id, assignment_id: entry.assignment_id,
                    reschedule_id: entry.reschedule_id || null, reason: entry.notes,
                    deciderUserId, deciderName: actorName
                });
                activityEntries.push({
                    actionType: 'SHIFT_OCCURRENCE_WAIVED',
                    details: { service_date, shift_slot_id: entry.shift_slot_id, assignment_id: entry.assignment_id }
                });
                continue;
            }

            const { invoice, finalAmount } = await applyInvoiceDecision(client, {
                booking_id, service_date, approve: entry.approve, amount: entry.amount,
                shift_slot_id: entry.shift_slot_id || null, reschedule_id: entry.reschedule_id || null,
                deciderUserId, deciderName: actorName
            });
            invoiceResults.push(invoice);
            const isShift = Boolean(entry.shift_slot_id);
            activityEntries.push({
                actionType: entry.approve
                    ? (isShift ? 'SHIFT_INVOICE_CONFIRMED' : 'DAILY_INVOICE_CONFIRMED')
                    : (isShift ? 'SHIFT_INVOICE_SKIPPED' : 'DAILY_INVOICE_SKIPPED'),
                details: { service_date, amount: finalAmount, shift_slot_id: entry.shift_slot_id || null }
            });
        }

        await maybeAutoCompleteVisitingBooking(client, booking_id);
        await client.query(`DELETE FROM booking_day_drafts WHERE booking_id = $1 AND service_date = $2`, [booking_id, service_date]);

        await client.query('COMMIT');

        for (const entry of activityEntries) {
            logActivity({
                actorUserId: deciderUserId,
                actorRole: req.user?.role,
                actionType: entry.actionType,
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: entry.details,
            }).catch(err => console.error('Activity log failed:', err));
        }
        logActivity({
            actorUserId: deciderUserId,
            actorRole: req.user?.role,
            actionType: 'DAY_CONFIRMED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { service_date, staff_decided: attendanceResults.length, invoices_decided: invoiceResults.length },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', data: { attendance: attendanceResults, invoices: invoiceResults } });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('Confirm day draft error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to confirm day' });
    } finally {
        client.release();
    }
};
