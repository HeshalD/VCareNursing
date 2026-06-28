// services/scheduledActions.js
// Engine for admin actions that must take effect on a FUTURE date rather than
// immediately: scheduled terminations, scheduled completions, future staff swaps,
// and future assignment starts.
//
// Each execute* function performs only DB mutations using the transaction `client`
// it is given (it never commits or rolls back) and returns an optional `notify`
// thunk. The CALLER commits the transaction and then runs the notify thunk so that
// WhatsApp/SMS/activity-log side effects never block or roll back the DB write.
//
// The same execute* functions back two callers:
//   1. The daily enforcer (cron/scheduledActions.js) — runs due rows.
//   2. The "execute now" admin override (scheduledActionsController).

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { getBookingSettlementSnapshot, applyBookingSettlement } = require('./bookingSettlement');
const {
    sendClientTerminationApproved,
    sendStaffAssignmentTerminated,
    sendStaffNewAssignment,
    sendClientStaffSwapped,
} = require('../utils/metaWhatsapp');
const { sendSms } = require('../utils/sms');

const SYSTEM_ACTOR = { user_id: null, name: 'SYSTEM (scheduled)', role: 'SYSTEM' };

// ─── Date helpers ────────────────────────────────────────────────────────────

// Business date in the company timezone, as 'YYYY-MM-DD'. Matches the cron.
const getBusinessDate = async (client = db) => {
    const r = await client.query(
        `SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS d`
    );
    return r.rows[0].d;
};

// Normalise a Date | string to 'YYYY-MM-DD' (date-only, no timezone surprises).
const toDateStr = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
};

// 'YYYY-MM-DD' strings compare correctly lexicographically.
const isFutureDate = (effectiveDateStr, businessDateStr) => effectiveDateStr > businessDateStr;

// ─── Enqueue ─────────────────────────────────────────────────────────────────

const enqueueScheduledAction = async (
    client,
    { booking_id, action_type, effective_date, payload = {}, reason = null, termination_id = null, created_by = null }
) => {
    const r = await client.query(
        `INSERT INTO scheduled_actions
            (booking_id, action_type, effective_date, payload, reason, termination_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [booking_id, action_type, toDateStr(effective_date), JSON.stringify(payload || {}), reason, termination_id, created_by]
    );
    return r.rows[0];
};

// True if the booking already has an open (SCHEDULED) action of this type.
const hasOpenAction = async (client, booking_id, action_type) => {
    const r = await client.query(
        `SELECT 1 FROM scheduled_actions
         WHERE booking_id = $1 AND action_type = $2 AND status = 'SCHEDULED' LIMIT 1`,
        [booking_id, action_type]
    );
    return r.rows.length > 0;
};

// ─── TERMINATION ───────────────────────────────────────────────────────────────
// Mirrors the committed effects of approveTerminationRequest, but transaction-scoped.

const executeTermination = async (client, params) => {
    const {
        booking_id,
        end_date,
        reason = null,
        settlement_action = 'WALLET_DEPOSIT',
        settlement_note = null,
        termination_id = null,
        actorLabel = 'Scheduled termination',
        actor = SYSTEM_ACTOR,
    } = params;

    const endDate = new Date(end_date);

    // Pull booking + staff for the mutation and for notifications.
    const bRes = await client.query(
        `SELECT assigned_staff_id, client_id, start_date FROM bookings WHERE booking_id = $1 FOR UPDATE`,
        [booking_id]
    );
    if (bRes.rows.length === 0) throw new Error(`Booking ${booking_id} not found`);
    const booking = bRes.rows[0];

    // Mark the linked termination request approved (if any).
    let terminationCode = null;
    if (termination_id) {
        const tRes = await client.query(
            `UPDATE service_terminations SET status = 'APPROVED', end_date = $1 WHERE termination_id = $2
             RETURNING termination_code`,
            [endDate, termination_id]
        );
        terminationCode = tRes.rows[0]?.termination_code || null;
    }

    // Terminate the booking.
    await client.query(
        `UPDATE bookings SET status = 'TERMINATED', actual_end_time = $2 WHERE booking_id = $1`,
        [booking_id, endDate]
    );

    // Close any active assignment so payroll stops.
    await client.query(
        `UPDATE booking_staff_assignments
         SET service_end_date = $1, status = 'COMPLETED'
         WHERE booking_id = $2 AND status = 'ACTIVE'`,
        [toDateStr(endDate), booking_id]
    );

    // Free the staff member.
    if (booking.assigned_staff_id) {
        await client.query(
            `UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`,
            [booking.assigned_staff_id]
        );
    }

    // Financial settlement — quote-based unused-days refund (same rule as approveTerminationRequest).
    const financeRes = await client.query(
        `SELECT b.start_date, b.client_id, q.daily_rate, q.qty_days
         FROM bookings b
         JOIN service_requests sr ON b.request_id = sr.request_id
         JOIN quotations q ON sr.active_quote_id = q.quote_id
         WHERE b.booking_id = $1`,
        [booking_id]
    );

    if (financeRes.rows.length > 0) {
        const { start_date, client_id, daily_rate, qty_days } = financeRes.rows[0];
        const diffTime = endDate.getTime() - new Date(start_date).getTime();
        let daysWorked = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysWorked < 0) daysWorked = 0;
        if (daysWorked === 0 && diffTime > 0) daysWorked = 1;

        const unusedDays = qty_days - daysWorked;
        if (unusedDays > 0 && settlement_action === 'WALLET_DEPOSIT') {
            const refundAmount = unusedDays * daily_rate;
            await client.query(
                `UPDATE client_profiles SET wallet_balance = wallet_balance + $1 WHERE client_profile_id = $2`,
                [refundAmount, client_id]
            );
        }
    }

    const notify = async () => {
        try {
            await logActivity({
                actorUserId: actor.user_id,
                actorName: actor.name,
                actorRole: actor.role,
                actionType: 'TERMINATION_APPROVED',
                entityType: 'booking',
                entityId: String(booking_id),
                details: { termination_id, termination_code: terminationCode, booking_id, official_end_date: endDate, reason },
            });

            const endDateStr = endDate.toLocaleDateString('en-GB');

            const clientRes = await db.query(
                `SELECT u.mobile_number, cp.full_name
                 FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id
                 WHERE cp.client_profile_id = $1`,
                [booking.client_id]
            );
            if (clientRes.rows.length > 0) {
                const { mobile_number, full_name } = clientRes.rows[0];
                const ref = terminationCode || 'your request';
                await Promise.allSettled([
                    sendClientTerminationApproved(mobile_number, full_name, ref, endDateStr),
                    sendSms(mobile_number, `VCare: Hi ${full_name}, your booking has ended. Official end date: ${endDateStr}. Please contact us regarding any eligible refund.`),
                ]);
            }

            if (booking.assigned_staff_id) {
                const staffRes = await db.query(
                    `SELECT u.mobile_number, sp.full_name, sr.patient_name
                     FROM staff_profiles sp JOIN users u ON sp.user_id = u.user_id
                     LEFT JOIN bookings b ON b.booking_id = $2
                     LEFT JOIN service_requests sr ON sr.request_id = b.request_id
                     WHERE sp.staff_profile_id = $1`,
                    [booking.assigned_staff_id, booking_id]
                );
                if (staffRes.rows.length > 0) {
                    const { mobile_number, full_name, patient_name } = staffRes.rows[0];
                    const patientDisplay = patient_name || 'the patient';
                    await Promise.allSettled([
                        sendStaffAssignmentTerminated(mobile_number, full_name, patientDisplay, endDateStr),
                        sendSms(mobile_number, `VCare: Hi ${full_name}, your assignment for ${patientDisplay} has ended. End date: ${endDateStr}. Thank you for your dedication and service.`),
                    ]);
                }
            }
        } catch (e) {
            console.error('[executeTermination] notify error:', e.message);
        }
    };

    return { result: { booking_id, status: 'TERMINATED', end_date: endDate }, notify };
};

// ─── COMPLETION ────────────────────────────────────────────────────────────────
// Mirrors the COMPLETED path of finalizeBookingState, transaction-scoped.

const executeCompletion = async (client, params) => {
    const {
        booking_id,
        end_date,
        settlement_action = 'NO_REFUND',
        settlement_note = null,
        reason = null,
        actorLabel = 'Scheduled completion',
        actor = SYSTEM_ACTOR,
    } = params;

    const endTime = new Date(end_date);

    const booking = await getBookingSettlementSnapshot(client, booking_id);
    if (!booking) throw new Error(`Booking ${booking_id} not found`);
    if (['COMPLETED', 'TERMINATED'].includes(booking.status)) {
        return { result: { booking_id, skipped: `already ${booking.status}` }, notify: null };
    }

    await client.query(
        `UPDATE bookings SET status = 'COMPLETED', actual_end_time = $2 WHERE booking_id = $1`,
        [booking_id, endTime]
    );

    await client.query(
        `UPDATE booking_staff_assignments
         SET service_end_date = $1, status = 'COMPLETED'
         WHERE booking_id = $2 AND status = 'ACTIVE'`,
        [toDateStr(endTime), booking_id]
    );

    if (booking.assigned_staff_id) {
        await client.query(
            `UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`,
            [booking.assigned_staff_id]
        );
    }

    const settlementResult = await applyBookingSettlement(
        client, booking, settlement_action || 'NO_REFUND', settlement_note, reason, actorLabel
    );

    const notify = async () => {
        try {
            await logActivity({
                actorUserId: actor.user_id,
                actorName: actor.name,
                actorRole: actor.role,
                actionType: 'BOOKING_COMPLETED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: {
                    booking_id,
                    client_name: booking.client_name,
                    status: 'COMPLETED',
                    settlement_action: settlement_action || 'NO_REFUND',
                    remaining_balance: settlementResult.remaining_balance,
                    reason,
                },
            });

            if (booking.assigned_staff_id) {
                const endDateStr = endTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                const staffRes = await db.query(
                    `SELECT u.mobile_number, sp.full_name, sr.patient_name
                     FROM staff_profiles sp JOIN users u ON sp.user_id = u.user_id
                     LEFT JOIN bookings b ON b.booking_id = $2
                     LEFT JOIN service_requests sr ON sr.request_id = b.request_id
                     WHERE sp.staff_profile_id = $1`,
                    [booking.assigned_staff_id, booking_id]
                );
                if (staffRes.rows.length > 0) {
                    const { mobile_number, full_name, patient_name } = staffRes.rows[0];
                    const patientDisplay = patient_name || booking.client_name || 'the patient';
                    await Promise.allSettled([
                        sendStaffAssignmentTerminated(mobile_number, full_name, patientDisplay, endDateStr),
                        sendSms(mobile_number, `VCare: Hi ${full_name}, your assignment for ${patientDisplay} has been completed successfully on ${endDateStr}. Thank you for your dedication and service.`),
                    ]);
                }
            }
        } catch (e) {
            console.error('[executeCompletion] notify error:', e.message);
        }
    };

    return { result: { booking_id, status: 'COMPLETED', ...settlementResult }, notify };
};

// ─── STAFF SWAP ────────────────────────────────────────────────────────────────
// Executes a swap whose incoming assignment was pre-created with status 'SCHEDULED'.

const executeStaffSwap = async (client, payload) => {
    const {
        booking_id,
        old_staff_id,
        new_staff_id,
        new_assignment_id,
        swap_reason = null,
        billing_gap = false,
        new_daily_rate,
        new_ot_rate,
        new_scheduled_end_time,
        effective_date,
        swapped_by = null,
        actor = SYSTEM_ACTOR,
    } = payload;

    const effDateStr = toDateStr(effective_date);

    // Close the outgoing assignment.
    await client.query(
        `UPDATE booking_staff_assignments
         SET service_end_date = $1, status = 'COMPLETED'
         WHERE booking_id = $2 AND status = 'ACTIVE' AND assignment_id <> $3`,
        [effDateStr, booking_id, new_assignment_id]
    );

    // Activate the incoming (previously SCHEDULED) assignment.
    await client.query(
        `UPDATE booking_staff_assignments SET status = 'ACTIVE' WHERE assignment_id = $1`,
        [new_assignment_id]
    );

    // Audit row.
    await client.query(
        `INSERT INTO staff_swaps
            (booking_id, old_staff_id, new_staff_id, swap_reason, swapped_at, swapped_by, arrival_time, billing_gap)
         VALUES ($1, $2, $3, $4, NOW(), $5, NULL, $6)`,
        [booking_id, old_staff_id, new_staff_id, swap_reason, swapped_by, billing_gap]
    );

    // Update the booking's pointer + optional overrides.
    const fields = [`assigned_staff_id = $1`];
    const values = [new_staff_id];
    let p = 2;
    if (new_daily_rate !== undefined && new_daily_rate !== null) { fields.push(`daily_rate = $${p}`); values.push(new_daily_rate); p++; }
    if (new_ot_rate !== undefined && new_ot_rate !== null) { fields.push(`ot_rate = $${p}`); values.push(new_ot_rate); p++; }
    if (new_scheduled_end_time) { fields.push(`scheduled_end_time = $${p}`); values.push(new Date(new_scheduled_end_time)); p++; }
    values.push(booking_id);
    await client.query(`UPDATE bookings SET ${fields.join(', ')} WHERE booking_id = $${p}`, values);

    // Free old, occupy new.
    if (old_staff_id) {
        await client.query(`UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`, [old_staff_id]);
    }
    await client.query(`UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`, [new_staff_id]);

    const notify = async () => {
        try {
            await logActivity({
                actorUserId: actor.user_id,
                actorName: actor.name,
                actorRole: actor.role,
                actionType: 'STAFF_SWAPPED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: { booking_id, old_staff_id, new_staff_id, swap_reason, billing_gap, scheduled: true },
            });

            const ctx = await db.query(
                `SELECT p.full_name AS patient_name,
                        cp.full_name AS client_name, uc.mobile_number AS client_mobile,
                        os.full_name AS old_name, uo.mobile_number AS old_mobile,
                        ns.full_name AS new_name, un.mobile_number AS new_mobile,
                        COALESCE(sr.location_address, cp.primary_address, '') AS location,
                        COALESCE(p.medical_condition, 'None specified') AS conditions
                 FROM bookings b
                 LEFT JOIN service_requests sr ON b.request_id = sr.request_id
                 LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                 LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
                 LEFT JOIN users uc ON cp.user_id = uc.user_id
                 LEFT JOIN staff_profiles os ON os.staff_profile_id = $2
                 LEFT JOIN users uo ON os.user_id = uo.user_id
                 LEFT JOIN staff_profiles ns ON ns.staff_profile_id = $3
                 LEFT JOIN users un ON ns.user_id = un.user_id
                 WHERE b.booking_id = $1`,
                [booking_id, old_staff_id, new_staff_id]
            );
            const c = ctx.rows[0];
            if (!c) return;
            const swapDateStr = new Date(effective_date).toLocaleDateString('en-GB');
            const patient = c.patient_name || 'the patient';
            const tasks = [];
            if (c.old_mobile && c.old_name) {
                tasks.push(
                    sendStaffAssignmentTerminated(c.old_mobile, c.old_name, patient, swapDateStr),
                    sendSms(c.old_mobile, `VCare: Hi ${c.old_name}, your assignment for ${patient} has ended. End date: ${swapDateStr}. Thank you for your service.`)
                );
            }
            if (c.new_mobile && c.new_name) {
                tasks.push(
                    sendStaffNewAssignment(c.new_mobile, c.new_name, patient, c.location, c.conditions, swapDateStr),
                    sendSms(c.new_mobile, `VCare: Hi ${c.new_name}, you have a new assignment for ${patient} at ${c.location}. Please contact the VCare office for full details.`)
                );
            }
            if (c.client_mobile) {
                tasks.push(
                    sendClientStaffSwapped(c.client_mobile, c.client_name, patient, c.new_name, swapDateStr),
                    sendSms(c.client_mobile, `VCare: Hi ${c.client_name}, your caregiver for ${patient} has been updated to ${c.new_name}. Contact us with any questions.`)
                );
            }
            await Promise.allSettled(tasks);
        } catch (e) {
            console.error('[executeStaffSwap] notify error:', e.message);
        }
    };

    return { result: { booking_id, new_staff_id }, notify };
};

// ─── ASSIGNMENT START ──────────────────────────────────────────────────────────
// Activates a future-dated first assignment that was created with status 'SCHEDULED'.
// The assignment notifications were already sent at scheduling time, so this only
// flips DB state.

const executeAssignmentStart = async (client, payload) => {
    const { booking_id, assignment_id, staff_profile_id, ot_rate, shift_slot_id = null, actor = SYSTEM_ACTOR } = payload;

    const upd = await client.query(
        `UPDATE booking_staff_assignments SET status = 'ACTIVE'
         WHERE assignment_id = $1 AND status = 'SCHEDULED'
         RETURNING assignment_id`,
        [assignment_id]
    );
    if (upd.rows.length === 0) {
        return { result: { booking_id, skipped: 'assignment no longer scheduled' }, notify: null };
    }

    if (shift_slot_id) {
        // SHIFT_BASED: one slot starting does not make the booking "ACTIVE" on its
        // own (other slots may still be unstaffed) and assigned_staff_id is
        // meaningless when multiple staff cover the same booking concurrently.
        await client.query(
            `UPDATE bookings SET status = CASE WHEN status = 'PENDING' THEN 'ACTIVE' ELSE status END
             WHERE booking_id = $1`,
            [booking_id]
        );
    } else {
        await client.query(
            `UPDATE bookings SET status = 'ACTIVE', assigned_staff_id = $2, ot_rate = COALESCE($3, ot_rate)
             WHERE booking_id = $1`,
            [booking_id, staff_profile_id, ot_rate ?? null]
        );
    }

    await client.query(
        `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
        [staff_profile_id]
    );

    const notify = async () => {
        try {
            await logActivity({
                actorUserId: actor.user_id,
                actorName: actor.name,
                actorRole: actor.role,
                actionType: 'STAFF_ASSIGNED',
                entityType: 'booking',
                entityId: String(booking_id),
                details: { booking_id, assignment_id, staff_profile_id, scheduled_start: true },
            });
        } catch (e) {
            console.error('[executeAssignmentStart] notify error:', e.message);
        }
    };

    return { result: { booking_id, assignment_id, status: 'ACTIVE' }, notify };
};

// ─── SHIFT REASSIGNMENT ────────────────────────────────────────────────────────
// Shift-scoped sibling of executeStaffSwap: swaps staff on one shift_slot_id only,
// leaving other slots on the same booking untouched. Does not touch
// bookings.assigned_staff_id (meaningless for SHIFT_BASED bookings).

const executeShiftReassignment = async (client, payload) => {
    const {
        booking_id,
        shift_slot_id,
        old_staff_id,
        new_staff_id,
        new_assignment_id,
        effective_date,
        reason = null,
        actor = SYSTEM_ACTOR,
    } = payload;

    const effDateStr = toDateStr(effective_date);

    await client.query(
        `UPDATE booking_staff_assignments
         SET service_end_date = $1, status = 'COMPLETED'
         WHERE shift_slot_id = $2 AND status = 'ACTIVE' AND assignment_id <> $3`,
        [effDateStr, shift_slot_id, new_assignment_id]
    );

    await client.query(
        `UPDATE booking_staff_assignments SET status = 'ACTIVE' WHERE assignment_id = $1`,
        [new_assignment_id]
    );

    if (old_staff_id) {
        await client.query(`UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`, [old_staff_id]);
    }
    await client.query(`UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`, [new_staff_id]);

    const notify = async () => {
        try {
            await logActivity({
                actorUserId: actor.user_id,
                actorName: actor.name,
                actorRole: actor.role,
                actionType: 'SHIFT_STAFF_REASSIGNED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: { booking_id, shift_slot_id, old_staff_id, new_staff_id, reason, scheduled: true },
            });
        } catch (e) {
            console.error('[executeShiftReassignment] notify error:', e.message);
        }
    };

    return { result: { booking_id, shift_slot_id, new_staff_id }, notify };
};

// ─── Dispatch ────────────────────────────────────────────────────────────────

const dispatchScheduledAction = async (client, action, actor = SYSTEM_ACTOR) => {
    const payload = { ...(action.payload || {}), actor };
    switch (action.action_type) {
        case 'TERMINATION':
            return executeTermination(client, {
                booking_id: action.booking_id,
                end_date: action.effective_date,
                reason: action.reason,
                termination_id: action.termination_id,
                actorLabel: 'Scheduled termination',
                actor,
                ...payload,
            });
        case 'COMPLETION':
            return executeCompletion(client, {
                booking_id: action.booking_id,
                end_date: action.effective_date,
                reason: action.reason,
                actorLabel: 'Scheduled completion',
                actor,
                ...payload,
            });
        case 'STAFF_SWAP':
            return executeStaffSwap(client, { booking_id: action.booking_id, effective_date: action.effective_date, ...payload });
        case 'ASSIGNMENT_START':
            return executeAssignmentStart(client, { booking_id: action.booking_id, ...payload });
        case 'SHIFT_REASSIGNMENT':
            return executeShiftReassignment(client, { booking_id: action.booking_id, effective_date: action.effective_date, ...payload });
        case 'SHIFT_PATTERN_CHANGE': {
            // Required here (not at module top) to avoid a circular require:
            // shiftPatternService imports helpers from this module.
            const { executeShiftPatternChange } = require('./shiftPatternService');
            return executeShiftPatternChange(client, payload);
        }
        default:
            throw new Error(`Unknown scheduled action_type: ${action.action_type}`);
    }
};

module.exports = {
    SYSTEM_ACTOR,
    getBusinessDate,
    toDateStr,
    isFutureDate,
    enqueueScheduledAction,
    hasOpenAction,
    executeTermination,
    executeCompletion,
    executeStaffSwap,
    executeAssignmentStart,
    executeShiftReassignment,
    dispatchScheduledAction,
};
