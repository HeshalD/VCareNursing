// controllers/dailyAttendanceController.js
const db = require('../config/db');
const { creditStaffSalary } = require('../services/billingService');
const { maybeAutoCompleteVisitingBooking } = require('../services/visitingBookings');

async function getDeciderName(userId) {
    const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
    return result.rows[0]?.full_name || 'Admin';
}

/**
 * @route   GET /api/bookings/:booking_id/attendance
 * @desc    List staff_daily_attendance rows for a booking (for the day-detail UI)
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getBookingAttendance = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const result = await db.query(
            `SELECT
                a.attendance_id,
                a.booking_id,
                a.assignment_id,
                a.staff_profile_id,
                a.service_date::text as service_date,
                a.in_time,
                a.out_time,
                a.hours_served,
                a.entry_mode,
                a.salary_status,
                a.salary_amount,
                a.salary_transaction_id,
                a.decided_by_name,
                a.decided_at,
                a.notes,
                a.shift_slot_id,
                ss.shift_number,
                ss.label as shift_label,
                ss.duration_hours as shift_duration_hours,
                bsa.assigned_hours,
                sp.full_name as staff_name
             FROM staff_daily_attendance a
             JOIN staff_profiles sp ON a.staff_profile_id = sp.staff_profile_id
             LEFT JOIN booking_shift_slots ss ON a.shift_slot_id = ss.shift_slot_id
             LEFT JOIN booking_staff_assignments bsa ON a.assignment_id = bsa.assignment_id
             WHERE a.booking_id = $1
             ORDER BY a.service_date DESC`,
            [booking_id]
        );

        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Get booking attendance error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch attendance' });
    }
};

/**
 * @route   POST /api/bookings/:booking_id/attendance
 * @desc    Log/update a staff member's in/out time for a given day on a booking.
 *          Computes hours_served from the two timestamps (handles overnight shifts
 *          naturally since both are full timestamps, not bare times).
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    assignment_id, service_date, in_time, out_time, notes (optional)
 */
exports.upsertAttendance = async (req, res) => {
    const { booking_id } = req.params;
    const { assignment_id, service_date, in_time, out_time, notes, shift_slot_id, reschedule_id } = req.body;

    if (!assignment_id || !service_date || !in_time || !out_time) {
        return res.status(400).json({
            status: 'error',
            message: 'assignment_id, service_date, in_time and out_time are required'
        });
    }

    const inDate = new Date(in_time);
    const outDate = new Date(out_time);

    if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime()) || outDate <= inDate) {
        return res.status(400).json({
            status: 'error',
            message: 'out_time must be a valid timestamp after in_time'
        });
    }

    const hoursServed = (outDate - inDate) / (1000 * 60 * 60);

    try {
        const assignmentCheck = await db.query(
            `SELECT assignment_id, staff_profile_id, shift_slot_id FROM booking_staff_assignments
             WHERE assignment_id = $1 AND booking_id = $2`,
            [assignment_id, booking_id]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Assignment not found for this booking' });
        }

        const assignmentShiftSlotId = assignmentCheck.rows[0].shift_slot_id;

        if (assignmentShiftSlotId) {
            if (!shift_slot_id) {
                return res.status(400).json({ status: 'error', message: 'shift_slot_id is required for shift-based attendance' });
            }
            if (shift_slot_id !== assignmentShiftSlotId) {
                return res.status(400).json({ status: 'error', message: 'shift_slot_id does not match this assignment\'s shift' });
            }
        } else if (shift_slot_id) {
            return res.status(400).json({ status: 'error', message: 'This assignment is not shift-based; shift_slot_id must not be provided' });
        }

        if (reschedule_id) {
            const rescheduleCheck = await db.query(
                `SELECT reschedule_id FROM shift_reschedules WHERE reschedule_id = $1 AND booking_id = $2 AND status = 'ACTIVE'`,
                [reschedule_id, booking_id]
            );
            if (rescheduleCheck.rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Reschedule not found for this booking' });
            }
        }

        const existing = reschedule_id
            ? await db.query(`SELECT attendance_id, salary_status FROM staff_daily_attendance WHERE reschedule_id = $1`, [reschedule_id])
            : await db.query(
                `SELECT attendance_id, salary_status FROM staff_daily_attendance
                 WHERE assignment_id = $1 AND service_date = $2 AND reschedule_id IS NULL`,
                [assignment_id, service_date]
            );

        if (existing.rows.length > 0 && existing.rows[0].salary_status !== 'PENDING') {
            return res.status(409).json({
                status: 'error',
                message: 'This day has already been decided and cannot be edited'
            });
        }

        const staffProfileId = assignmentCheck.rows[0].staff_profile_id;

        const result = reschedule_id
            ? await db.query(
                `INSERT INTO staff_daily_attendance (
                    booking_id, assignment_id, staff_profile_id, service_date,
                    in_time, out_time, hours_served, entry_mode, notes, shift_slot_id, reschedule_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'MANUAL', $8, $9, $10)
                ON CONFLICT (reschedule_id) WHERE reschedule_id IS NOT NULL
                DO UPDATE SET in_time = EXCLUDED.in_time,
                              out_time = EXCLUDED.out_time,
                              hours_served = EXCLUDED.hours_served,
                              notes = EXCLUDED.notes,
                              updated_at = NOW()
                RETURNING *`,
                [booking_id, assignment_id, staffProfileId, service_date, in_time, out_time, hoursServed.toFixed(2), notes || null, assignmentShiftSlotId, reschedule_id]
            )
            : assignmentShiftSlotId
                ? await db.query(
                    `INSERT INTO staff_daily_attendance (
                        booking_id, assignment_id, staff_profile_id, service_date,
                        in_time, out_time, hours_served, entry_mode, notes, shift_slot_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'MANUAL', $8, $9)
                    ON CONFLICT (assignment_id, service_date, shift_slot_id) WHERE shift_slot_id IS NOT NULL
                    DO UPDATE SET in_time = EXCLUDED.in_time,
                                  out_time = EXCLUDED.out_time,
                                  hours_served = EXCLUDED.hours_served,
                                  notes = EXCLUDED.notes,
                                  updated_at = NOW()
                    RETURNING *`,
                    [booking_id, assignment_id, staffProfileId, service_date, in_time, out_time, hoursServed.toFixed(2), notes || null, assignmentShiftSlotId]
                )
                : await db.query(
                    `INSERT INTO staff_daily_attendance (
                        booking_id, assignment_id, staff_profile_id, service_date,
                        in_time, out_time, hours_served, entry_mode, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'MANUAL', $8)
                    ON CONFLICT (assignment_id, service_date) WHERE shift_slot_id IS NULL
                    DO UPDATE SET in_time = EXCLUDED.in_time,
                                  out_time = EXCLUDED.out_time,
                                  hours_served = EXCLUDED.hours_served,
                                  notes = EXCLUDED.notes,
                                  updated_at = NOW()
                    RETURNING *`,
                    [booking_id, assignment_id, staffProfileId, service_date, in_time, out_time, hoursServed.toFixed(2), notes || null]
                );

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Upsert attendance error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save attendance' });
    }
};

/**
 * @route   POST /api/bookings/:booking_id/attendance/absent
 * @desc    Marks a staff member as a no-show for a given day/shift in one step —
 *          no in/out time required. Skips their salary only; does NOT touch the
 *          client invoice for that day/shift (use the Waive action for that, or
 *          the Cover Shift/Reschedule flow if someone else covered the shift).
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    assignment_id, service_date, shift_slot_id (optional), notes (optional)
 */
exports.markAbsent = async (req, res) => {
    const { booking_id } = req.params;
    const { assignment_id, service_date, shift_slot_id, notes } = req.body;

    if (!assignment_id || !service_date) {
        return res.status(400).json({
            status: 'error',
            message: 'assignment_id and service_date are required'
        });
    }

    try {
        const assignmentCheck = await db.query(
            `SELECT assignment_id, staff_profile_id, shift_slot_id FROM booking_staff_assignments
             WHERE assignment_id = $1 AND booking_id = $2`,
            [assignment_id, booking_id]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Assignment not found for this booking' });
        }

        const assignmentShiftSlotId = assignmentCheck.rows[0].shift_slot_id;

        if (assignmentShiftSlotId) {
            if (!shift_slot_id) {
                return res.status(400).json({ status: 'error', message: 'shift_slot_id is required for shift-based attendance' });
            }
            if (shift_slot_id !== assignmentShiftSlotId) {
                return res.status(400).json({ status: 'error', message: 'shift_slot_id does not match this assignment\'s shift' });
            }
        } else if (shift_slot_id) {
            return res.status(400).json({ status: 'error', message: 'This assignment is not shift-based; shift_slot_id must not be provided' });
        }

        const existing = await db.query(
            `SELECT attendance_id, salary_status FROM staff_daily_attendance
             WHERE assignment_id = $1 AND service_date = $2 AND reschedule_id IS NULL`,
            [assignment_id, service_date]
        );

        if (existing.rows.length > 0 && existing.rows[0].salary_status !== 'PENDING') {
            return res.status(409).json({
                status: 'error',
                message: 'This day has already been decided and cannot be edited'
            });
        }

        const staffProfileId = assignmentCheck.rows[0].staff_profile_id;
        const decidedByName = await getDeciderName(req.user?.user_id);
        const absentNotes = notes || 'Marked absent — no-show';

        const result = assignmentShiftSlotId
            ? await db.query(
                `INSERT INTO staff_daily_attendance (
                    booking_id, assignment_id, staff_profile_id, service_date,
                    entry_mode, salary_status, decided_by_user_id, decided_by_name, decided_at, notes, shift_slot_id
                ) VALUES ($1, $2, $3, $4, 'MANUAL', 'SKIPPED', $5, $6, NOW(), $7, $8)
                ON CONFLICT (assignment_id, service_date, shift_slot_id) WHERE shift_slot_id IS NOT NULL
                DO UPDATE SET in_time = NULL,
                              out_time = NULL,
                              hours_served = NULL,
                              salary_status = 'SKIPPED',
                              salary_amount = NULL,
                              salary_transaction_id = NULL,
                              decided_by_user_id = EXCLUDED.decided_by_user_id,
                              decided_by_name = EXCLUDED.decided_by_name,
                              decided_at = NOW(),
                              notes = EXCLUDED.notes,
                              updated_at = NOW()
                RETURNING *`,
                [booking_id, assignment_id, staffProfileId, service_date, req.user?.user_id || null, decidedByName, absentNotes, assignmentShiftSlotId]
            )
            : await db.query(
                `INSERT INTO staff_daily_attendance (
                    booking_id, assignment_id, staff_profile_id, service_date,
                    entry_mode, salary_status, decided_by_user_id, decided_by_name, decided_at, notes
                ) VALUES ($1, $2, $3, $4, 'MANUAL', 'SKIPPED', $5, $6, NOW(), $7)
                ON CONFLICT (assignment_id, service_date) WHERE shift_slot_id IS NULL
                DO UPDATE SET in_time = NULL,
                              out_time = NULL,
                              hours_served = NULL,
                              salary_status = 'SKIPPED',
                              salary_amount = NULL,
                              salary_transaction_id = NULL,
                              decided_by_user_id = EXCLUDED.decided_by_user_id,
                              decided_by_name = EXCLUDED.decided_by_name,
                              decided_at = NOW(),
                              notes = EXCLUDED.notes,
                              updated_at = NOW()
                RETURNING *`,
                [booking_id, assignment_id, staffProfileId, service_date, req.user?.user_id || null, decidedByName, absentNotes]
            );

        // Marking absent still "decides" the day (salary_status -> SKIPPED) — a VISITING
        // booking's one-time visit may now be fully decided (salary + invoice), in which
        // case it should auto-complete rather than sit ACTIVE waiting for a manual close-out.
        const autoCompleteClient = await db.pool.connect();
        try {
            await autoCompleteClient.query('BEGIN');
            await maybeAutoCompleteVisitingBooking(autoCompleteClient, booking_id);
            await autoCompleteClient.query('COMMIT');
        } catch (autoCompleteErr) {
            await autoCompleteClient.query('ROLLBACK');
            console.error('Auto-complete check failed after markAbsent:', autoCompleteErr);
        } finally {
            autoCompleteClient.release();
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Mark attendance absent error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to mark absent' });
    }
};

/**
 * @route   POST /api/attendance/:attendance_id/confirm-salary
 * @desc    Admin decision on whether to pay a staff member's salary for a logged day.
 *          The 12h-served threshold is informational only — the decision is always
 *          a manual judgement call.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    approve (boolean), amount (optional — overrides the assignment's daily_rate)
 */
exports.confirmSalary = async (req, res) => {
    const { attendance_id } = req.params;
    const { approve, amount } = req.body;

    if (typeof approve !== 'boolean') {
        return res.status(400).json({ status: 'error', message: 'approve (boolean) is required' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const attendanceRes = await client.query(
            `SELECT * FROM staff_daily_attendance WHERE attendance_id = $1 FOR UPDATE`,
            [attendance_id]
        );

        if (attendanceRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Attendance record not found' });
        }

        const attendance = attendanceRes.rows[0];

        if (attendance.salary_status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'This day has already been decided' });
        }

        if (attendance.hours_served === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'In/out time must be logged before confirming salary' });
        }

        const decidedByName = await getDeciderName(req.user?.user_id);
        let salaryTransactionId = null;
        let salaryAmount = null;

        if (approve) {
            if (amount !== undefined && amount !== null && amount !== '') {
                salaryAmount = parseFloat(amount);
                if (Number.isNaN(salaryAmount) || salaryAmount <= 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ status: 'error', message: 'amount must be a positive number' });
                }
            } else {
                const assignmentRes = await client.query(
                    `SELECT daily_rate FROM booking_staff_assignments WHERE assignment_id = $1`,
                    [attendance.assignment_id]
                );
                salaryAmount = parseFloat(assignmentRes.rows[0].daily_rate);
            }

            salaryTransactionId = await creditStaffSalary(client, {
                staff_profile_id: attendance.staff_profile_id,
                booking_id: attendance.booking_id,
                amount: salaryAmount,
                notes: `Daily earnings for ${attendance.service_date} (${attendance.hours_served}h served) — manually confirmed`
            });
        }

        const updated = await client.query(
            `UPDATE staff_daily_attendance
             SET salary_status = $1,
                 salary_amount = $2,
                 salary_transaction_id = $3,
                 decided_by_user_id = $4,
                 decided_by_name = $5,
                 decided_at = NOW(),
                 updated_at = NOW()
             WHERE attendance_id = $6
             RETURNING *`,
            [approve ? 'PAID' : 'SKIPPED', salaryAmount, salaryTransactionId, req.user?.user_id || null, decidedByName, attendance_id]
        );

        // A VISITING booking's one-time visit may now be fully decided (salary + invoice)
        // — auto-complete it rather than leaving it ACTIVE for a manual close-out.
        await maybeAutoCompleteVisitingBooking(client, attendance.booking_id);

        await client.query('COMMIT');
        res.status(200).json({ status: 'success', data: updated.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Confirm salary error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to confirm salary decision' });
    } finally {
        client.release();
    }
};
