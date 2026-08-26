// controllers/shiftPatternController.js
// SHIFT_BASED-only: define a booking's shift pattern (count + time window per
// shift) and assign/reassign staff to individual shift slots. LIVE_IN/VISITING
// bookings are rejected — they keep using the original booking-wide endpoints.

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

function extractActorRole(role) {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}
const {
    getActivePattern,
    getScheduledPattern,
    getPatternHistory,
    createShiftPattern,
} = require('../services/shiftPatternService');
const {
    getBusinessDate,
    toDateStr,
    isFutureDate,
    enqueueScheduledAction,
    hasOpenAction,
    executeShiftReassignment,
} = require('../services/scheduledActions');
const { applyPartialAttendanceTime } = require('./dailyAttendanceController')._internal;

async function requireShiftBasedBooking(booking_id, queryable = db) {
    const res = await queryable.query(`SELECT booking_id, service_model, daily_rate FROM bookings WHERE booking_id = $1`, [booking_id]);
    if (res.rows.length === 0) return { error: { status: 404, message: 'Booking not found' } };
    if (res.rows[0].service_model !== 'SHIFT_BASED') {
        return { error: { status: 400, message: 'This endpoint only applies to SHIFT_BASED bookings' } };
    }
    return { booking: res.rows[0] };
}

/**
 * @route GET /api/bookings/:booking_id/shift-pattern
 */
exports.getShiftPattern = async (req, res) => {
    const { booking_id } = req.params;
    try {
        const { error } = await requireShiftBasedBooking(booking_id);
        if (error) return res.status(error.status).json({ status: 'error', message: error.message });

        const businessDate = await getBusinessDate(db);
        const [active, scheduled] = await Promise.all([
            getActivePattern(db, booking_id, businessDate),
            getScheduledPattern(db, booking_id),
        ]);

        res.status(200).json({ status: 'success', data: { active, scheduled } });
    } catch (error) {
        console.error('Get shift pattern error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch shift pattern' });
    }
};

/**
 * @route GET /api/bookings/:booking_id/shift-pattern/history
 */
exports.getShiftPatternHistory = async (req, res) => {
    const { booking_id } = req.params;
    try {
        const { error } = await requireShiftBasedBooking(booking_id);
        if (error) return res.status(error.status).json({ status: 'error', message: error.message });

        const history = await getPatternHistory(db, booking_id);
        res.status(200).json({ status: 'success', data: history });
    } catch (error) {
        console.error('Get shift pattern history error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch shift pattern history' });
    }
};

/**
 * @route POST /api/bookings/:booking_id/shift-pattern
 * @body  shift_count, slots: [{shift_number, start_time, duration_hours, label}], effective_from_date
 */
exports.createOrChangeShiftPattern = async (req, res) => {
    const { booking_id } = req.params;
    const { shift_count, slots, effective_from_date } = req.body;

    if (!shift_count || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ status: 'error', message: 'shift_count and a non-empty slots array are required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(`SELECT booking_id, service_model FROM bookings WHERE booking_id = $1 FOR UPDATE`, [booking_id]);
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        if (bookingRes.rows[0].service_model !== 'SHIFT_BASED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'This endpoint only applies to SHIFT_BASED bookings' });
        }

        const { pattern, scheduled, warnings } = await createShiftPattern(client, {
            booking_id,
            shift_count,
            slots,
            effective_from_date,
            created_by: req.user?.user_id || null,
        });

        await client.query('COMMIT');

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: extractActorRole(req.user?.role),
            actionType: scheduled ? 'SHIFT_PATTERN_CHANGE_SCHEDULED' : 'SHIFT_PATTERN_CHANGED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { booking_id, pattern_id: pattern.pattern_id, shift_count, effective_from_date: pattern.effective_from_date },
        }).catch((e) => console.error('[ShiftPattern] activity log error:', e.message));

        res.status(201).json({
            status: 'success',
            scheduled,
            warnings,
            message: scheduled
                ? `Shift pattern change scheduled to take effect on ${toDateStr(pattern.effective_from_date)}.`
                : 'Shift pattern updated.',
            data: { pattern },
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create/change shift pattern error:', error);
        res.status(400).json({ status: 'error', message: error.message || 'Failed to save shift pattern' });
    } finally {
        client.release();
    }
};

/**
 * @route GET /api/bookings/:booking_id/shift-slots
 * @desc  Flat list of the active (or pending) pattern's slots, each with its current
 *        or upcoming assignment. Prefers an ACTIVE assignment per slot; falls back to
 *        a SCHEDULED one (a future-dated booking's slots are all SCHEDULED until their
 *        start date arrives — those must still show up as "assigned", not blank).
 */
exports.getShiftSlots = async (req, res) => {
    const { booking_id } = req.params;
    try {
        const { error } = await requireShiftBasedBooking(booking_id);
        if (error) return res.status(error.status).json({ status: 'error', message: error.message });

        const businessDate = await getBusinessDate(db);
        // Fall back to the SCHEDULED pattern for PENDING bookings that have no ACTIVE
        // pattern yet (effective date is in the future).
        const pattern = await getActivePattern(db, booking_id, businessDate)
                     || await getScheduledPattern(db, booking_id);
        if (!pattern) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        const slotIds = pattern.slots.map((s) => s.shift_slot_id);
        const assignmentsRes = slotIds.length
            ? await db.query(
                `SELECT DISTINCT ON (bsa.shift_slot_id)
                        bsa.shift_slot_id, bsa.assignment_id, bsa.staff_profile_id, bsa.daily_rate,
                        bsa.service_start_date, bsa.status, sp.full_name AS staff_name
                 FROM booking_staff_assignments bsa
                 JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
                 WHERE bsa.shift_slot_id = ANY($1::uuid[]) AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                 ORDER BY bsa.shift_slot_id, (bsa.status = 'ACTIVE') DESC, bsa.assigned_on DESC`,
                [slotIds]
            )
            : { rows: [] };

        const assignmentBySlot = {};
        for (const a of assignmentsRes.rows) assignmentBySlot[a.shift_slot_id] = a;

        const data = pattern.slots.map((slot) => ({
            ...slot,
            assignment: assignmentBySlot[slot.shift_slot_id] || null,
        }));

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        console.error('Get shift slots error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch shift slots' });
    }
};

/**
 * @route POST /api/bookings/:booking_id/shift-slots/:shift_slot_id/assign-staff
 * @body  staff_profile_id, service_start_date, daily_rate (per-shift rate), notes
 */
exports.assignStaffToSlot = async (req, res) => {
    const { booking_id, shift_slot_id } = req.params;
    const { staff_profile_id, service_start_date, daily_rate, notes, staff_in_time } = req.body;
    const assigned_by = req.user?.user_id || null;

    if (!staff_profile_id || !service_start_date) {
        return res.status(400).json({ status: 'error', message: 'staff_profile_id and service_start_date are required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const { error } = await requireShiftBasedBooking(booking_id, client);
        if (error) {
            await client.query('ROLLBACK');
            return res.status(error.status).json({ status: 'error', message: error.message });
        }

        const slotRes = await client.query(
            `SELECT s.*, p.shift_count FROM booking_shift_slots s
             JOIN booking_shift_patterns p ON s.pattern_id = p.pattern_id
             WHERE s.shift_slot_id = $1 AND p.booking_id = $2`,
            [shift_slot_id, booking_id]
        );
        if (slotRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Shift slot not found for this booking' });
        }
        const slot = slotRes.rows[0];

        const activeRes = await client.query(
            `SELECT 1 FROM booking_staff_assignments WHERE shift_slot_id = $1 AND status = 'ACTIVE'`,
            [shift_slot_id]
        );
        if (activeRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'This shift already has an active staff member. Use reassign-staff to change it.' });
        }

        const staffRes = await client.query(
            `SELECT staff_profile_id, full_name, current_status FROM staff_profiles WHERE staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (staffRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Staff member not found' });
        }
        const staff = staffRes.rows[0];
        if (staff.current_status !== 'AVAILABLE') {
            // current_status is a live snapshot that only flips back to AVAILABLE when the
            // cron closes out the old assignment, so it lags a staff member whose existing
            // commitment(s) will have ended before this shift's start date. Not a real
            // conflict either if what's holding them "ASSIGNED" is another shift (or the
            // pattern being replaced) on this SAME booking. Only block on a genuine
            // date-overlapping assignment elsewhere.
            const conflictRes = await client.query(
                `SELECT 1
                 FROM booking_staff_assignments bsa
                 LEFT JOIN LATERAL (
                     SELECT effective_date FROM scheduled_actions
                     WHERE booking_id = bsa.booking_id
                       AND action_type IN ('TERMINATION', 'COMPLETION')
                       AND status = 'SCHEDULED'
                     ORDER BY effective_date ASC
                     LIMIT 1
                 ) sa ON bsa.service_end_date IS NULL
                 WHERE bsa.staff_profile_id = $1
                   AND bsa.booking_id != $2
                   AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                   AND bsa.service_start_date <= $3::date
                   AND (COALESCE(bsa.service_end_date, sa.effective_date) IS NULL
                        OR COALESCE(bsa.service_end_date, sa.effective_date) >= $3::date)
                 LIMIT 1`,
                [staff_profile_id, booking_id, toDateStr(service_start_date)]
            );
            if (conflictRes.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: `${staff.full_name} is not available (status: ${staff.current_status})` });
            }
        }

        const bookingRes = await client.query(`SELECT daily_rate FROM bookings WHERE booking_id = $1`, [booking_id]);
        const perShiftRate = daily_rate ?? (parseFloat(bookingRes.rows[0].daily_rate || 0) / slot.shift_count);
        if (!perShiftRate || perShiftRate <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'A valid per-shift daily_rate is required' });
        }

        const businessDate = await getBusinessDate(client);
        const startDateStr = toDateStr(service_start_date);
        const isFuture = isFutureDate(startDateStr, businessDate);

        const insertRes = await client.query(
            `INSERT INTO booking_staff_assignments
                (booking_id, staff_profile_id, shift_slot_id, assigned_on, assigned_by, daily_rate,
                 service_start_date, amount_allocated, status, notes)
             VALUES ($1, $2, $3, NOW(), $4, $5, $6, $5, $7, $8)
             RETURNING *`,
            [booking_id, staff_profile_id, shift_slot_id, assigned_by, perShiftRate, startDateStr, isFuture ? 'SCHEDULED' : 'ACTIVE', notes || null]
        );
        const assignment = insertRes.rows[0];

        await client.query(`UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`, [staff_profile_id]);

        if (isFuture) {
            await enqueueScheduledAction(client, {
                booking_id,
                action_type: 'ASSIGNMENT_START',
                effective_date: startDateStr,
                payload: { assignment_id: assignment.assignment_id, staff_profile_id, shift_slot_id, staff_in_time: staff_in_time || null },
                created_by: assigned_by,
            });
        } else {
            // Stamp the booking's own start_date from the first staffed shift.
            // CareTimeline (BookingDetailPageV2) only renders once bookings.start_date
            // is set, and its day-numbering is anchored to it — COALESCE so a later
            // slot assignment or a post-pause reassignment never overwrites the
            // booking's original epoch. Mirrors staffAssignmentController's
            // isFirstAssignment handling on the LIVE_IN/VISITING path.
            await client.query(
                `UPDATE bookings
                 SET status = CASE WHEN status = 'PENDING' THEN 'ACTIVE' ELSE status END,
                     start_date = COALESCE(start_date, $2::date)
                 WHERE booking_id = $1`,
                [booking_id, startDateStr]
            );
            if (staff_in_time) {
                await applyPartialAttendanceTime(client, {
                    booking_id, assignment_id: assignment.assignment_id,
                    service_date: startDateStr, in_time: staff_in_time, shift_slot_id,
                });
            }
        }

        await client.query('COMMIT');

        logActivity({
            actorUserId: assigned_by,
            actorRole: extractActorRole(req.user?.role),
            actionType: 'SHIFT_STAFF_ASSIGNED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { booking_id, shift_slot_id, assignment_id: assignment.assignment_id, staff_profile_id, scheduled: isFuture },
        }).catch((e) => console.error('[ShiftAssign] activity log error:', e.message));

        res.status(201).json({
            status: 'success',
            scheduled: isFuture,
            message: isFuture
                ? `${staff.full_name} reserved for this shift. Starts on ${startDateStr}.`
                : `${staff.full_name} assigned to this shift.`,
            data: assignment,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('Assign staff to slot error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to assign staff to shift' });
    } finally {
        client.release();
    }
};

/**
 * @route POST /api/bookings/:booking_id/shift-slots/:shift_slot_id/reassign-staff
 * @body  new_staff_id, effective_date, reason
 */
exports.reassignSlotStaff = async (req, res) => {
    const { booking_id, shift_slot_id } = req.params;
    const { new_staff_id, effective_date, reason, old_staff_out_time, new_staff_in_time } = req.body;
    const actorUserId = req.user?.user_id || null;

    if (!new_staff_id || !effective_date) {
        return res.status(400).json({ status: 'error', message: 'new_staff_id and effective_date are required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const { error } = await requireShiftBasedBooking(booking_id, client);
        if (error) {
            await client.query('ROLLBACK');
            return res.status(error.status).json({ status: 'error', message: error.message });
        }

        const currentRes = await client.query(
            `SELECT assignment_id, staff_profile_id, daily_rate FROM booking_staff_assignments
             WHERE shift_slot_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
            [shift_slot_id]
        );
        const current = currentRes.rows[0] || null;

        const newStaffRes = await client.query(
            `SELECT staff_profile_id, full_name, current_status FROM staff_profiles WHERE staff_profile_id = $1`,
            [new_staff_id]
        );
        if (newStaffRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'New staff member not found' });
        }
        const newStaff = newStaffRes.rows[0];
        if (newStaff.current_status !== 'AVAILABLE') {
            // Same exception as assignStaffToSlot — being tied up on THIS booking (another
            // shift, or the pattern being replaced) isn't a real conflict, and neither is a
            // stale current_status if the staff member's other commitments end before this
            // shift's effective date.
            const conflictRes = await client.query(
                `SELECT 1
                 FROM booking_staff_assignments bsa
                 LEFT JOIN LATERAL (
                     SELECT effective_date FROM scheduled_actions
                     WHERE booking_id = bsa.booking_id
                       AND action_type IN ('TERMINATION', 'COMPLETION')
                       AND status = 'SCHEDULED'
                     ORDER BY effective_date ASC
                     LIMIT 1
                 ) sa ON bsa.service_end_date IS NULL
                 WHERE bsa.staff_profile_id = $1
                   AND bsa.booking_id != $2
                   AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                   AND bsa.service_start_date <= $3::date
                   AND (COALESCE(bsa.service_end_date, sa.effective_date) IS NULL
                        OR COALESCE(bsa.service_end_date, sa.effective_date) >= $3::date)
                 LIMIT 1`,
                [new_staff_id, booking_id, toDateStr(effective_date)]
            );
            if (conflictRes.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: `${newStaff.full_name} is not available (status: ${newStaff.current_status})` });
            }
        }

        const businessDate = await getBusinessDate(client);
        const effDateStr = toDateStr(effective_date);
        const isFuture = isFutureDate(effDateStr, businessDate);

        const insertRes = await client.query(
            `INSERT INTO booking_staff_assignments
                (booking_id, staff_profile_id, shift_slot_id, assigned_on, assigned_by, daily_rate,
                 service_start_date, amount_allocated, status, notes)
             VALUES ($1, $2, $3, NOW(), $4, $5, $6, $5, $7, $8)
             RETURNING assignment_id`,
            [
                booking_id,
                new_staff_id,
                shift_slot_id,
                actorUserId,
                current?.daily_rate || 0,
                effDateStr,
                isFuture ? 'SCHEDULED' : 'ACTIVE',
                reason || null,
            ]
        );
        const newAssignmentId = insertRes.rows[0].assignment_id;

        if (isFuture) {
            const alreadyScheduled = await hasOpenAction(client, booking_id, 'SHIFT_REASSIGNMENT');
            if (alreadyScheduled) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: 'A shift reassignment is already scheduled for this booking.' });
            }

            await client.query(`UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`, [new_staff_id]);

            await enqueueScheduledAction(client, {
                booking_id,
                action_type: 'SHIFT_REASSIGNMENT',
                effective_date: effDateStr,
                payload: {
                    shift_slot_id,
                    old_staff_id: current?.staff_profile_id || null,
                    new_staff_id,
                    new_assignment_id: newAssignmentId,
                    reason: reason || null,
                    old_staff_out_time: old_staff_out_time || null,
                    new_staff_in_time: new_staff_in_time || null,
                },
                reason: reason || null,
                created_by: actorUserId,
            });

            await client.query('COMMIT');
            return res.status(200).json({
                status: 'success',
                scheduled: true,
                message: `${newStaff.full_name} scheduled for this shift starting ${effDateStr}.`,
                data: { booking_id, shift_slot_id, new_staff_id, effective_date: effDateStr },
            });
        }

        const { result } = await executeShiftReassignment(client, {
            booking_id,
            shift_slot_id,
            old_staff_id: current?.staff_profile_id || null,
            new_staff_id,
            new_assignment_id: newAssignmentId,
            effective_date: effDateStr,
            reason: reason || null,
            old_staff_out_time: old_staff_out_time || null,
            new_staff_in_time: new_staff_in_time || null,
        });

        await client.query('COMMIT');

        logActivity({
            actorUserId,
            actorRole: extractActorRole(req.user?.role),
            actionType: 'SHIFT_STAFF_REASSIGNED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { booking_id, shift_slot_id, old_staff_id: current?.staff_profile_id || null, new_staff_id, reason, scheduled: false },
        }).catch((e) => console.error('[ShiftReassign] activity log error:', e.message));

        res.status(200).json({ status: 'success', scheduled: false, message: `${newStaff.full_name} is now on this shift.`, data: result });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('Reassign slot staff error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to reassign shift staff' });
    } finally {
        client.release();
    }
};
