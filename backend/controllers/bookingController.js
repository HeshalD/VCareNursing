const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsAppMessage } = require('../utils/whatsapp');
const sendEmail = require('../utils/email');
const { upload } = require('../config/cloudinaryConfig');
const { logActivity } = require('../utils/activityLogger');
const { sendClientTerminationRequested, sendClientTerminationApproved, sendStaffAssignmentTerminated, sendClientForceTerminated, sendStaffForceTerminated, sendStaffNewAssignment, sendClientStaffSwapped, sendClientWelcomeNew, sendCandidateProfile } = require('../utils/metaWhatsapp');
const { sendSms } = require('../utils/sms');
const { createServiceInvoice, calculateShiftSlotCharge, checkAndFlagBookingOverdue } = require('../services/billingService');
const {
    getBookingFinancialTotals,
    getBookingSettlementSnapshot,
    applyBookingSettlement,
    VALID_BOOKING_SETTLEMENT_ACTIONS
} = require('../services/bookingSettlement');
const {
    getBusinessDate,
    toDateStr,
    isFutureDate,
    enqueueScheduledAction,
    hasOpenAction,
    executeTermination,
    executeCompletion,
} = require('../services/scheduledActions');
const { computeRegFeeSplit, settleRegistrationFee } = require('../services/registrationFeeSplit');
const { applyPartialAttendanceTime } = require('./dailyAttendanceController')._internal;
const { creditSalespersonForRegistration } = require('../services/clientSalespersonService');
const { maybeAutoCompleteVisitingBooking } = require('../services/visitingBookings');
const { closeActivePatternForPause } = require('../services/shiftPatternService');
const { drawWalletForBooking } = require('../services/walletService');

function extractActorRole(role) {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
    const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
    return result.rows[0]?.full_name || 'Admin';
}

// Middleware for handling payment slip upload
exports.uploadPaymentSlip = (req, res, next) => {
    console.log('Upload middleware called');
    upload.single('payment_slip')(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ message: 'File upload error: ' + err.message });
        }
        console.log('File upload middleware completed');
        next();
    });
};


const finalizeBookingState = async (req, res, nextStatus, actorLabel, includeTerminationLog = false) => {
    const { booking_id } = req.params;
    const {
        actual_end_time,
        effective_date,
        settlement_action,
        settlement_note,
        reason
    } = req.body || {};

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Resolve the chosen completion/termination date up front so the settlement snapshot
        // can project the balance through that date — not just what's been invoiced so far.
        const targetDateInput = effective_date || actual_end_time || null;

        const booking = await getBookingSettlementSnapshot(client, booking_id, targetDateInput);

        if (!booking) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        if (['COMPLETED', 'TERMINATED'].includes(booking.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Booking is already ${booking.status}`
            });
        }

        const settlementBalance = parseFloat(booking.settlement_balance ?? booking.remaining_balance ?? 0);

        if (settlementBalance > 0 && !settlement_action) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'settlement_action is required when there is a remaining balance',
                remaining_balance: settlementBalance,
                allowed_actions: VALID_BOOKING_SETTLEMENT_ACTIONS
            });
        }

        // Previously the allowed list was only echoed back in the error above and
        // never enforced, so an unrecognised action fell through and silently
        // behaved like a write-off. Now that each action moves money differently,
        // reject anything off the list outright.
        if (settlement_action && !VALID_BOOKING_SETTLEMENT_ACTIONS.includes(settlement_action)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Invalid settlement_action. Must be one of: ${VALID_BOOKING_SETTLEMENT_ACTIONS.join(', ')}`,
                allowed_actions: VALID_BOOKING_SETTLEMENT_ACTIONS
            });
        }

        if (settlementBalance > 0 && settlement_action === 'NO_REFUND' && !settlement_note) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'settlement_note is required when waiving the balance as income',
                remaining_balance: settlementBalance
            });
        }

        // If the admin chose a future date, defer execution: leave the booking running
        // (still billed) and enqueue a scheduled_actions row the cron will execute on the day.
        const businessDate = await getBusinessDate(client);

        if (targetDateInput && isFutureDate(toDateStr(targetDateInput), businessDate)) {
            const actionType = nextStatus === 'COMPLETED' ? 'COMPLETION' : 'TERMINATION';

            const alreadyScheduled = await hasOpenAction(client, booking_id, actionType);
            if (alreadyScheduled) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: 'error',
                    message: `A ${actionType.toLowerCase()} is already scheduled for this booking.`
                });
            }

            let termination_id = null;
            if (includeTerminationLog) {
                const pendingTermRes = await client.query(
                    `SELECT termination_id FROM service_terminations WHERE booking_id = $1 AND status = 'PENDING' FOR UPDATE`,
                    [booking_id]
                );
                const terminationReason = reason || settlement_note || `${actorLabel} booking end (scheduled)`;

                if (pendingTermRes.rows.length > 0) {
                    termination_id = pendingTermRes.rows[0].termination_id;
                    await client.query(
                        `UPDATE service_terminations
                         SET status = 'SCHEDULED', end_date = $1, reason = COALESCE($2, reason)
                         WHERE termination_id = $3`,
                        [targetDateInput, terminationReason, termination_id]
                    );
                } else {
                    const insertRes = await client.query(
                        `INSERT INTO service_terminations (
                            booking_id, requested_by, urgency, requested_end_date, end_date, reason, status
                        ) VALUES ($1, 'ADMIN', 'FUTURE', $2, $2, $3, 'SCHEDULED')
                        RETURNING termination_id`,
                        [booking_id, targetDateInput, terminationReason]
                    );
                    termination_id = insertRes.rows[0].termination_id;
                }
            }

            await enqueueScheduledAction(client, {
                booking_id,
                action_type: actionType,
                effective_date: targetDateInput,
                payload: { settlement_action: settlement_action || 'NO_REFUND', settlement_note: settlement_note || null },
                reason: reason || null,
                termination_id,
                created_by: req.user?.user_id || null,
            });

            await client.query('COMMIT');

            return res.status(200).json({
                status: 'success',
                scheduled: true,
                message: `Booking ${nextStatus === 'COMPLETED' ? 'completion' : 'termination'} scheduled for ${toDateStr(targetDateInput)}. It stays active and billed until then.`,
                data: { booking_id, effective_date: toDateStr(targetDateInput), action_type: actionType }
            });
        }

        const endTime = targetDateInput ? new Date(targetDateInput) : new Date();

        await client.query(
            `UPDATE bookings
             SET status = $1,
                 actual_end_time = $2
             WHERE booking_id = $3`,
            [nextStatus, endTime, booking_id]
        );

        // Free any staff tied to this booking. We key off the assignment record,
        // not bookings.assigned_staff_id, because a future-dated SCHEDULED assignment
        // reserves the staff (current_status = 'ASSIGNED') without ever setting
        // assigned_staff_id — that only happens when the cron activates it.
        await client.query(
            `UPDATE staff_profiles sp
             SET current_status = 'AVAILABLE'
             FROM booking_staff_assignments bsa
             WHERE bsa.booking_id = $1
               AND bsa.status IN ('ACTIVE', 'SCHEDULED')
               AND sp.staff_profile_id = bsa.staff_profile_id`,
            [booking_id]
        );

        // Close those assignments (ACTIVE and not-yet-started SCHEDULED) with the end date.
        await client.query(
            `UPDATE booking_staff_assignments
             SET service_end_date = $1, status = 'COMPLETED'
             WHERE booking_id = $2 AND status IN ('ACTIVE', 'SCHEDULED')`,
            [endTime.toISOString().split('T')[0], booking_id]
        );

        // Cancel any pending future-assignment activation so the cron can't
        // re-reserve staff for a booking that has now ended.
        await client.query(
            `UPDATE scheduled_actions
             SET status = 'CANCELLED'
             WHERE booking_id = $1 AND action_type = 'ASSIGNMENT_START' AND status = 'SCHEDULED'`,
            [booking_id]
        );

        if (includeTerminationLog) {
            const pendingTermRes = await client.query(
                `SELECT termination_id
                 FROM service_terminations
                 WHERE booking_id = $1 AND status = 'PENDING'
                 FOR UPDATE`,
                [booking_id]
            );

            const terminationReason = reason || settlement_note || `${actorLabel} booking end`;

            if (pendingTermRes.rows.length > 0) {
                await client.query(
                    `UPDATE service_terminations
                     SET status = 'APPROVED',
                         end_date = $1,
                         reason = COALESCE($2, reason)
                     WHERE termination_id = $3`,
                    [endTime, terminationReason, pendingTermRes.rows[0].termination_id]
                );
            } else {
                await client.query(
                    `INSERT INTO service_terminations (
                        booking_id,
                        requested_by,
                        urgency,
                        requested_end_date,
                        end_date,
                        reason,
                        status
                    ) VALUES ($1, 'ADMIN', 'IMMEDIATE', $2, $3, $4, 'APPROVED')`,
                    [booking_id, endTime, endTime, terminationReason]
                );
            }
        }

        const settlementResult = await applyBookingSettlement(
            client,
            booking,
            settlement_action || 'NO_REFUND',
            settlement_note || null,
            reason || null,
            actorLabel
        );

        await client.query('COMMIT');

        try {
            const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
            const actorNameResult = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameResult.rows[0]?.full_name || 'Admin';
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: nextStatus === 'COMPLETED' ? 'BOOKING_COMPLETED' : 'BOOKING_TERMINATED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: {
                    booking_id,
                    client_name: booking.client_name,
                    status: nextStatus,
                    settlement_action: settlement_action || 'NO_REFUND',
                    remaining_balance: settlementResult.remaining_balance,
                    reason: reason || null,
                },
            });
        } catch (logErr) {
            console.error('Activity log failed (finalizeBookingState):', logErr.message);
        }

        // Fire-and-forget: notify assigned staff their assignment has ended
        if (booking.assigned_staff_id) {
            (async () => {
                try {
                    const endDateStr = endTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                    const staffRes = await db.query(
                        `SELECT u.mobile_number, sp.full_name, sr.patient_name
                         FROM staff_profiles sp
                         JOIN users u ON sp.user_id = u.user_id
                         LEFT JOIN bookings b ON b.booking_id = $2
                         LEFT JOIN service_requests sr ON sr.request_id = b.request_id
                         WHERE sp.staff_profile_id = $1`,
                        [booking.assigned_staff_id, booking_id]
                    );
                    if (staffRes.rows.length > 0) {
                        const { mobile_number, full_name, patient_name } = staffRes.rows[0];
                        const patientDisplay = patient_name || booking.client_name || 'the patient';
                        const smsText = nextStatus === 'COMPLETED'
                            ? `VCare: Hi ${full_name}, your assignment for ${patientDisplay} has been completed successfully on ${endDateStr}. Thank you for your dedication and service.`
                            : `VCare: Hi ${full_name}, your assignment for ${patientDisplay} has ended on ${endDateStr}. Please contact the VCare office to confirm your next steps.`;
                        await Promise.allSettled([
                            sendStaffAssignmentTerminated(mobile_number, full_name, patientDisplay, endDateStr),
                            sendSms(mobile_number, smsText),
                        ]);
                    }
                } catch (e) {
                    console.error('[finalizeBookingState] Staff notification error:', e.message);
                }
            })();
        }

        return res.status(200).json({
            status: 'success',
            message: nextStatus === 'COMPLETED'
                ? 'Booking completed successfully.'
                : 'Booking terminated successfully.',
            data: {
                booking_id,
                status: nextStatus,
                actual_end_time: endTime,
                assigned_staff_id: booking.assigned_staff_id,
                client_id: booking.client_id,
                client_name: booking.client_name,
                remaining_balance: settlementResult.remaining_balance,
                wallet_deposited_amount: settlementResult.wallet_deposited_amount,
                settlement_action: settlement_action || 'NO_REFUND',
                settlement_note: settlement_note || null,
                reason: reason || null
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`${actorLabel} error:`, error);
        return res.status(500).json({
            status: 'error',
            message: `Failed to ${nextStatus === 'COMPLETED' ? 'complete' : 'terminate'} booking`
        });
    } finally {
        client.release();
    }
};

exports.completeBooking = async (req, res) => {
    return finalizeBookingState(req, res, 'COMPLETED', 'Admin complete booking', false);
};

exports.adminTerminateBooking = async (req, res) => {
    return finalizeBookingState(req, res, 'TERMINATED', 'Admin terminate booking', true);
};

/**
 * @route   POST /api/bookings/:booking_id/pause
 * @desc    Client wants a temporary break in service (LIVE_IN/SHIFT_BASED only).
 *          Closes the current staff assignment(s)/shift pattern as of today (freeing
 *          the staff, same mechanics as termination), flips the booking to PAUSED —
 *          which drops it out of the cron's ACTIVE/OVERDUE processing entirely, so
 *          no billing or staff pay happens while paused — and logs a booking_pauses
 *          row. resume_date is a target/reminder only; resuming is always a manual
 *          admin action (see resumeBooking).
 *
 *          If the booking already has a scheduled TERMINATION/COMPLETION, that date
 *          was computed assuming continuous service and is now stale — it's always
 *          cancelled here (so the cron can't fire it mid-pause). When resume_date is
 *          set, the admin can choose to reschedule it to a new date in the same call
 *          (end_date_action='RESCHEDULE' + new_end_date) or explicitly leave the
 *          booking with no scheduled end (end_date_action='CLEAR', or just omitted).
 * @body    resume_date (optional, YYYY-MM-DD), reason (optional),
 *          end_date_action ('RESCHEDULE' | 'CLEAR', optional), new_end_date (required if RESCHEDULE)
 * @access  Private (SUPER_ADMIN, COORDINATOR)
 */
exports.pauseBooking = async (req, res) => {
    const { booking_id } = req.params;
    const { resume_date, reason, end_date_action, new_end_date } = req.body || {};

    if (end_date_action === 'RESCHEDULE' && (!resume_date || !new_end_date)) {
        return res.status(400).json({ status: 'error', message: 'new_end_date requires both resume_date and new_end_date' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(
            `SELECT booking_id, status, service_model FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [booking_id]
        );
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        const booking = bookingRes.rows[0];

        if (!['LIVE_IN', 'SHIFT_BASED'].includes(booking.service_model)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Only LIVE_IN and SHIFT_BASED bookings can be paused' });
        }
        if (!['ACTIVE', 'OVERDUE'].includes(booking.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Booking cannot be paused while ${booking.status}` });
        }

        const businessDate = await getBusinessDate(client);

        if (booking.service_model === 'SHIFT_BASED') {
            await closeActivePatternForPause(client, booking_id, businessDate);
        } else {
            await client.query(
                `UPDATE staff_profiles sp
                 SET current_status = 'AVAILABLE'
                 FROM booking_staff_assignments bsa
                 WHERE bsa.booking_id = $1 AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                   AND sp.staff_profile_id = bsa.staff_profile_id`,
                [booking_id]
            );
            await client.query(
                `UPDATE booking_staff_assignments
                 SET service_end_date = $2, status = 'COMPLETED'
                 WHERE booking_id = $1 AND status IN ('ACTIVE', 'SCHEDULED')`,
                [booking_id, businessDate]
            );
            await client.query(
                `UPDATE scheduled_actions SET status = 'CANCELLED'
                 WHERE booking_id = $1 AND action_type = 'ASSIGNMENT_START' AND status = 'SCHEDULED'`,
                [booking_id]
            );
        }

        // A pre-existing scheduled TERMINATION/COMPLETION was computed assuming
        // continuous service — the pause invalidates it, so cancel it unconditionally
        // (otherwise the cron could fire it mid-pause). If the admin gave a fixed
        // resume date and asked to reschedule, re-enqueue it at the new date, carrying
        // over its settlement payload/reason (and service_terminations.end_date, for
        // a TERMINATION) so it behaves exactly like the original once it fires.
        const openFinalizationRes = await client.query(
            `SELECT * FROM scheduled_actions
             WHERE booking_id = $1 AND action_type IN ('TERMINATION', 'COMPLETION') AND status = 'SCHEDULED'
             FOR UPDATE`,
            [booking_id]
        );
        const openFinalization = openFinalizationRes.rows[0] || null;

        if (openFinalization) {
            await client.query(`UPDATE scheduled_actions SET status = 'CANCELLED' WHERE action_id = $1`, [openFinalization.action_id]);

            if (resume_date && end_date_action === 'RESCHEDULE' && new_end_date) {
                if (openFinalization.action_type === 'TERMINATION' && openFinalization.termination_id) {
                    await client.query(
                        `UPDATE service_terminations SET end_date = $1 WHERE termination_id = $2`,
                        [new_end_date, openFinalization.termination_id]
                    );
                }
                await enqueueScheduledAction(client, {
                    booking_id,
                    action_type: openFinalization.action_type,
                    effective_date: new_end_date,
                    payload: openFinalization.payload || {},
                    reason: openFinalization.reason || null,
                    termination_id: openFinalization.termination_id || null,
                    created_by: req.user?.user_id || null,
                });
            }
        }

        // assigned_staff_id is a denormalized pointer to whoever's currently on the booking
        // (getAdminBookingDetail's current_staff reads it directly, not the live assignment
        // row) — must be cleared here or the UI keeps showing the just-freed staff member as
        // "current staff" after resume, hiding the Assign Staff button that's supposed to
        // reappear once there's genuinely no one assigned.
        await client.query(`UPDATE bookings SET status = 'PAUSED', assigned_staff_id = NULL WHERE booking_id = $1`, [booking_id]);

        const pausedByName = await getActorName(req.user?.user_id);
        const pauseRes = await client.query(
            `INSERT INTO booking_pauses (booking_id, paused_date, resume_date, reason, paused_by, paused_by_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [booking_id, businessDate, resume_date || null, reason || null, req.user?.user_id || null, pausedByName]
        );

        await client.query('COMMIT');

        try {
            await logActivity({
                actorUserId: req.user?.user_id,
                actorName: pausedByName,
                actorRole: extractActorRole(req.user?.role),
                actionType: 'BOOKING_PAUSED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: {
                    booking_id,
                    resume_date: resume_date || null,
                    reason: reason || null,
                    cancelled_finalization: openFinalization ? { action_type: openFinalization.action_type, was_effective_date: openFinalization.effective_date } : null,
                    rescheduled_end_date: (end_date_action === 'RESCHEDULE' && new_end_date) ? new_end_date : null,
                },
            });
        } catch (logErr) {
            console.error('Activity log failed (pauseBooking):', logErr.message);
        }

        res.status(200).json({ status: 'success', data: pauseRes.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Pause booking error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to pause booking' });
    } finally {
        client.release();
    }
};

/**
 * @route   POST /api/bookings/:booking_id/resume
 * @desc    Flips a PAUSED booking back to ACTIVE and closes its open booking_pauses
 *          row. Does not assign staff itself — the booking simply re-enters the same
 *          "no staff assigned yet" state a brand-new booking is in, so the existing
 *          Assign Staff / shift-pattern-creation flow handles staffing it for the
 *          resumed period (possibly with a different staff member than before).
 * @access  Private (SUPER_ADMIN, COORDINATOR)
 */
exports.resumeBooking = async (req, res) => {
    const { booking_id } = req.params;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(
            `SELECT booking_id, status FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [booking_id]
        );
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        if (bookingRes.rows[0].status !== 'PAUSED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Booking is not paused' });
        }

        const businessDate = await getBusinessDate(client);
        const resumedByName = await getActorName(req.user?.user_id);

        const pauseRes = await client.query(
            `UPDATE booking_pauses
             SET resumed_date = $2, resumed_by = $3, resumed_by_name = $4, resumed_at = NOW()
             WHERE booking_id = $1 AND resumed_at IS NULL
             RETURNING *`,
            [booking_id, businessDate, req.user?.user_id || null, resumedByName]
        );

        await client.query(`UPDATE bookings SET status = 'ACTIVE' WHERE booking_id = $1`, [booking_id]);

        await client.query('COMMIT');

        try {
            await logActivity({
                actorUserId: req.user?.user_id,
                actorName: resumedByName,
                actorRole: extractActorRole(req.user?.role),
                actionType: 'BOOKING_RESUMED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: { booking_id },
            });
        } catch (logErr) {
            console.error('Activity log failed (resumeBooking):', logErr.message);
        }

        res.status(200).json({ status: 'success', data: pauseRes.rows[0] || null });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Resume booking error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to resume booking' });
    } finally {
        client.release();
    }
};

/**
 * @route   GET /api/bookings/:booking_id/pauses
 * @desc    Full pause/resume history for a booking, most recent first.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getBookingPauses = async (req, res) => {
    const { booking_id } = req.params;
    try {
        const result = await db.query(
            `SELECT * FROM booking_pauses WHERE booking_id = $1 ORDER BY paused_at DESC`,
            [booking_id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Get booking pauses error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch pause history' });
    }
};

// Refactored convertToBooking - ONLY creates booking (Step 2B)
// Payment recording happens separately (Step 2A via paymentTrackingController.recordPayment)
// Staff assignment happens separately (Step 2C via staffAssignmentController.assignStaffToBooking)
const convertToBookingInternal = async (req, res) => {
    // Only requires request_id and quote_id
    // Staff assignment and payment are handled in separate endpoints
    const { request_id, quote_id } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch Request Details
        const requestRes = await client.query('SELECT * FROM service_requests WHERE request_id = $1', [request_id]);

        if (requestRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Request not found' });
        }

        const reqData = requestRes.rows[0];

        // Use the active_quote_id from service_requests if available, otherwise use the provided quote_id
        const bookingQuoteId = reqData.active_quote_id || quote_id;

        if (!bookingQuoteId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'No quote ID provided and no active quote found in service request' });
        }

        // Fetch Quote Details
        const quoteRes = await client.query('SELECT * FROM quotations WHERE quote_id = $1', [bookingQuoteId]);

        if (quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Quote not found' });
        }

        const quoteData = quoteRes.rows[0];
        const registrationFeeAmount = parseFloat(quoteData.registration_fee || 0);
        // Calculate scheduled end time from start date + qty_days
        const startDate = new Date(reqData.start_date);
        const scheduledEndTime = new Date(startDate);
        scheduledEndTime.setDate(scheduledEndTime.getDate() + parseInt(quoteData.qty_days));

        // 2 & 3. Resolve the billing profile — prefer service_requests.client_id
        // (already set at request-creation time, or by payment recording via
        // getOrCreateClientProfileForQuotation) over a mobile-number lookup.
        // Falling back to mobile matching here as the primary path is what
        // spun up a duplicate client profile: a payer_mobile that differs
        // from the client's on-file number by even one digit (formatting,
        // typo) fails the lookup and silently creates a second profile +
        // user for the same person.
        let clientProfileId;
        if (reqData.client_id) {
            clientProfileId = reqData.client_id;

            // If the quote included a registration fee, mark the client profile as fully paid
            // and start its 365-day membership countdown.
            if (registrationFeeAmount > 0) {
                const clientProfile = await client.query(
                    'SELECT is_registration_fee_paid FROM client_profiles WHERE client_profile_id = $1',
                    [clientProfileId]
                );
                if (clientProfile.rows.length > 0 && !clientProfile.rows[0].is_registration_fee_paid) {
                    await client.query(
                        `UPDATE client_profiles
                         SET is_registration_fee_paid = TRUE, reg_fee_status = 'PAID',
                             reg_fee_paid_at = NOW(), reg_fee_expires_at = NOW() + INTERVAL '365 days'
                         WHERE client_profile_id = $1`,
                        [clientProfileId]
                    );
                }
            }
        } else {
            // SMART CHECK: Create User (Payer) if they don't exist
            let userId;
            const userCheck = await client.query('SELECT user_id FROM users WHERE mobile_number = $1', [reqData.payer_mobile]);

            if (userCheck.rows.length === 0) {
                const tempPassword = Math.random().toString(36).slice(-8);
                const hashedPassword = await bcrypt.hash(tempPassword, 12);

                const newUser = await client.query(
                    `INSERT INTO users (mobile_number, password_hash, email, role, is_active)
                     VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
                    [reqData.payer_mobile, hashedPassword, reqData.payer_email || null, ['CLIENT'], true]
                );
                userId = newUser.rows[0].user_id;
                reqData.tempPassword = tempPassword; // Store for the welcome SMS/WhatsApp after commit
            } else {
                userId = userCheck.rows[0].user_id;
            }

            // Create/Ensure Client Profile (Billing Profile)
            const profileCheck = await client.query('SELECT client_profile_id, is_registration_fee_paid FROM client_profiles WHERE user_id = $1', [userId]);

            if (profileCheck.rows.length === 0) {
                const regFeePaid = registrationFeeAmount > 0;
                const newProfile = await client.query(
                    `INSERT INTO client_profiles
                       (user_id, full_name, primary_address, gender, client_type, company_name, honorific, is_registration_fee_paid, reg_fee_status, reg_fee_paid_at, reg_fee_expires_at)
                     VALUES ($1, $2, $3, $4::gender_enum, $5::client_type_enum, $6, $7, $8, $9, $10, $11) RETURNING client_profile_id`,
                    [
                        userId, reqData.payer_name, reqData.location_address,
                        reqData.payer_gender || null, reqData.client_type || 'INDIVIDUAL',
                        reqData.company_name || null, reqData.honorific || null,
                        regFeePaid, regFeePaid ? 'PAID' : 'PENDING',
                        regFeePaid ? new Date() : null,
                        regFeePaid ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
                    ]
                );
                clientProfileId = newProfile.rows[0].client_profile_id;
            } else {
                clientProfileId = profileCheck.rows[0].client_profile_id;

                // If the quote included a registration fee, mark the client profile as fully paid
                // and start its 365-day membership countdown.
                const clientProfile = profileCheck.rows[0];
                if (!clientProfile.is_registration_fee_paid && registrationFeeAmount > 0) {
                    await client.query(
                        `UPDATE client_profiles
                         SET is_registration_fee_paid = TRUE, reg_fee_status = 'PAID',
                             reg_fee_paid_at = NOW(), reg_fee_expires_at = NOW() + INTERVAL '365 days'
                         WHERE client_profile_id = $1`,
                        [clientProfileId]
                    );
                }
            }
        }

        // 4. PATIENT LOGIC (The Fix for Proxy Mode)
        let patientId;

        if (reqData.patient_id) {
            // SCENARIO A: Existing Patient (e.g., Mr. Sunil was added manually)
            patientId = reqData.patient_id;

            // Check if THIS quote charged a registration fee. If so, mark them as PAID.
            if (Number(quoteData.registration_fee) > 0) {
                await client.query(
                    `UPDATE patient_profiles SET is_registration_fee_paid = TRUE WHERE patient_id = $1`,
                    [patientId]
                );
            }
        } else {
            // SCENARIO B: New Lead (Auto-create Patient)
            // Prefer the emergency contact(s) captured on the request itself;
            // fall back to the payer's own name/number when none were given.
            const newPatient = await client.query(
                `INSERT INTO patient_profiles (client_id, full_name, age, gender, relationship_to_client, medical_condition, is_registration_fee_paid, special_remarks, residential_address, emergency_contact_name, emergency_contact_number)
                 VALUES ($1, $2, $3, $4::gender_enum, $5, $6, TRUE, $7, $8, $9, $10) RETURNING patient_id`,
                [
                    clientProfileId, reqData.patient_name, reqData.patient_age, reqData.gender || null,
                    reqData.relationship_to_client, reqData.patient_condition, reqData.remarks, reqData.location_address,
                    reqData.emergency_contact_name || reqData.payer_name,
                    reqData.emergency_contact_number || reqData.payer_mobile,
                ]
            );
            patientId = newPatient.rows[0].patient_id;
        }

        // 6. Create Booking Record with PENDING status (No staff assignment yet)
        // NOTE: assigned_staff_id is NULL - staff assignment happens in separate step via staffAssignmentController
        // SHIFT_BASED bookings have no booking end date — billing is purely
        // shift-count-derived, never date-derived (see governing rule at the
        // top of this file's shift-billing section).
        const isShiftBasedBooking = (reqData.service_model || 'SHIFT_BASED') === 'SHIFT_BASED';
        const newBooking = await client.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id, status, preferred_gender, request_id, service_mode, scheduled_end_time, actual_end_time, ot_rate, daily_rate, shift_rate, amount_quotated, amount_paid)
             VALUES ($1, $2, $3, $4::service_model_enum, $5, NULL, 'PENDING', $6::gender_preference_enum, $7, $8, $9, NULL, $10, $11, $12, $13, $14)
             RETURNING booking_id, booking_code`,
            [clientProfileId, patientId, reqData.service_type, reqData.service_model || 'SHIFT_BASED', reqData.start_date, reqData.preferred_gender || 'ANY', request_id, null, isShiftBasedBooking ? null : scheduledEndTime, 500.00, quoteData.daily_rate, quoteData.per_shift_rate, parseFloat(quoteData.total_amount || 0) - registrationFeeAmount, 0]
        );

        const bookingId = newBooking.rows[0].booking_id;
        const bookingCode = newBooking.rows[0].booking_code;

        if (registrationFeeAmount > 0) {
            const regFeeCategoryResult = await client.query(
                `SELECT EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'transaction_category'
                      AND e.enumlabel = 'REGISTRATION_FEE'
                 ) as exists`
            );
            const registrationFeeCategory = regFeeCategoryResult.rows[0]?.exists
                ? 'REGISTRATION_FEE'
                : 'SERVICE_INVOICE';

            await client.query(
                `INSERT INTO transactions (
                   booking_id,
                   quote_id,
                   client_id,
                   category,
                   amount,
                   status,
                   notes,
                   transaction_type,
                   reference_number,
                   created_at
                 ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, 'DEBIT', $7, NOW())`,
                [
                    bookingId,
                    bookingQuoteId,
                    clientProfileId,
                    registrationFeeCategory,
                    registrationFeeAmount,
                    registrationFeeCategory === 'REGISTRATION_FEE'
                        ? 'Registration fee charged during booking conversion'
                        : 'Registration fee charged during booking conversion (stored as SERVICE_INVOICE for compatibility)',
                    quoteData.estimate_number || bookingQuoteId
                ]
            );
        }

        // Service-charge payments already made against this quote (before this
        // booking existed) already reached the client's wallet at payment time —
        // see paymentTrackingController.recordPayment, which credits the wallet
        // unconditionally, not just once a booking is linked. Nothing to mirror
        // into this booking's ledger here; it'll draw from the wallet lazily as
        // its days/shifts are actually invoiced (see walletService.drawWalletForBooking).

        // The registration-fee CREDIT recorded when the client paid (before this
        // booking existed) was inserted with booking_id = NULL, since there was no
        // booking to attach it to yet. The DEBIT charged just above always gets the
        // real booking_id — without this backfill, this booking's own ledger view
        // (getBookingFinancialTotals) would show that DEBIT with no offsetting
        // CREDIT and report the full registration fee as "overdue".
        await client.query(
            `UPDATE transactions
             SET booking_id = $1
             WHERE quote_id = $2 AND category = 'REGISTRATION_FEE' AND transaction_type = 'CREDIT' AND booking_id IS NULL`,
            [bookingId, bookingQuoteId]
        );

        // Same story for the wallet earmark: the service-charge money paid against
        // this quote went into the wallet before there was a booking to reserve it
        // for, so creditClientWallet could not earmark it. Claim those WALLET_TOPUP
        // rows for this booking now, so an early termination knows how much of the
        // wallet belongs to it.
        //
        // Capped at what this quote actually charges for service (total minus the
        // registration fee, which is settled on its own). Anything the client paid
        // beyond that is genuine overpayment and must stay unearmarked — free for
        // any of their bookings — which also matches the deliberate choice made by
        // recordAllocatedPayment's overflow→WALLET branch.
        const quoteServiceCap = Math.max(0, parseFloat(quoteData.total_amount || 0) - registrationFeeAmount);
        const walletTopupRes = await client.query(
            `SELECT transaction_id, amount FROM transactions
             WHERE quote_id = $1 AND category = 'WALLET_TOPUP' AND transaction_type = 'CREDIT'
               AND status = 'COMPLETED' AND earmarked_booking_id IS NULL
             ORDER BY created_at ASC`,
            [bookingQuoteId]
        );

        let earmarkTotal = 0;
        for (const row of walletTopupRes.rows) {
            const headroom = quoteServiceCap - earmarkTotal;
            if (headroom <= 0.005) break;
            const claimable = Math.min(parseFloat(row.amount) || 0, headroom);
            if (claimable <= 0.005) continue;
            earmarkTotal += claimable;
            // Only stamp rows fully inside the cap, so the audit trail never claims
            // a row that is partly overpayment.
            if (claimable >= (parseFloat(row.amount) || 0) - 0.005) {
                await client.query(
                    `UPDATE transactions SET earmarked_booking_id = $1 WHERE transaction_id = $2`,
                    [bookingId, row.transaction_id]
                );
            }
        }

        if (earmarkTotal > 0) {
            await client.query(
                `UPDATE bookings SET wallet_earmarked = COALESCE(wallet_earmarked, 0) + $1 WHERE booking_id = $2`,
                [earmarkTotal, bookingId]
            );
        }

        // 7. Update Quotation to link booking_id
        await client.query(
            `UPDATE quotations SET booking_id = $1 WHERE quote_id = $2`,
            [bookingId, bookingQuoteId]
        );

        // 8. Update Service Request Status to 'BOOKING_CREATED'
        // Note: Service request remains open for payment recording phase
        await client.query(
            `UPDATE service_requests SET status = 'BOOKING_CREATED' WHERE request_id = $1`,
            [request_id]
        );

        // NOTE: Payment recording and staff assignment happen in SEPARATE steps
        // Step 2A (Payment): POST /api/quotations/:quote_id/record-payment (via paymentTrackingController)
        // Step 2B (This function): Create booking
        // Step 2C (Staff Assignment): POST /api/bookings/:booking_id/assign-staff (via staffAssignmentController)

        await client.query('COMMIT');

        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'BOOKING_CREATED',
                entityType: 'BOOKING',
                entityId: bookingId,
                details: {
                    booking_id: bookingId,
                    request_id,
                    quote_id: bookingQuoteId,
                    total_amount: parseFloat(quoteData.total_amount),
                },
            });
        } catch (logErr) {
            console.error('Activity log error:', logErr);
        }

        // Welcome a brand-new client: send their login id (mobile number) and temporary
        // password so they can sign in and set their own password — mirrors the staff
        // onboarding flow. Only fires when this conversion created the user account.
        if (reqData.tempPassword) {
            const welcomeSms = `Welcome to VCare Nursing, ${reqData.payer_name}! An account has been created for you. Log in at https://vcarenursing.com/login\n\nUsername (mobile): ${reqData.payer_mobile}\nTemporary password: ${reqData.tempPassword}\n\nYou'll be asked to set your own password on first login. - VCare Nursing`;

            Promise.allSettled([
                sendSms(reqData.payer_mobile, welcomeSms),
                sendClientWelcomeNew(reqData.payer_mobile, reqData.payer_name)
            ]).then(([smsResult, waResult]) => {
                if (smsResult.status === 'rejected') console.error('Client welcome SMS failed:', smsResult.reason?.message);
                if (waResult.status === 'rejected') console.error('Client welcome WhatsApp failed:', waResult.reason?.message);
            });
        }

        // Return success with booking details for next step
        res.status(201).json({
            status: 'success',
            message: "Booking created successfully. Proceed to: (1) Record Payment, (2) Assign Staff.",
            data: {
                booking_id: bookingId,
                booking_code: bookingCode,
                status: 'PENDING',
                quote_id: bookingQuoteId,
                quotation_amount: parseFloat(quoteData.total_amount),
                next_steps: {
                    step_1: "Record client payment(s) via POST /api/quotations/:quote_id/record-payment",
                    step_2: "Assign staff to booking via POST /api/bookings/:booking_id/assign-staff"
                }
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Conversion Error:", error);
        res.status(500).json({ message: "Failed to convert lead to booking." });
    } finally {
        client.release();
    }
};

// Public convertToBooking function - Step 2B of three-step workflow
// Requires: request_id, quote_id
// Does NOT handle: Payment recording, Staff assignment
exports.convertToBooking = async (req, res) => {
    try {
        // Validate required fields
        const { request_id, quote_id } = req.body;
        if (!request_id) {
            return res.status(400).json({
                status: 'error',
                message: 'request_id is required'
            });
        }

        // Call the conversion logic (Step 2B)
        await convertToBookingInternal(req, res);
    } catch (error) {
        console.error("Booking conversion error:", error);
        res.status(500).json({
            status: 'error',
            message: "Failed to create booking."
        });
    }
};

/**
 * @route   GET /api/bookings/:booking_id
 * @desc    Get booking details (may include assignment form data for next step)
 * @access  Private
 */
exports.getByBookingID = async (req, res) => {
    const { booking_id } = req.params;

    try {
        // Simplified query first to test basic functionality
        const query = `
            SELECT
                b.booking_id,
                b.booking_code,
                b.service_type,
                b.service_model,
                b.start_date,
                b.status,
                b.preferred_gender,
                b.created_at,
                b.service_mode,
                b.scheduled_end_time,
                b.actual_end_time,
                b.ot_rate,
                b.daily_rate,
                b.is_hospitalized,
                b.hospital_name,
                c.client_profile_id,
                c.full_name as client_name,
                c.primary_address as client_address,
                uc.mobile_number as client_mobile,
                p.patient_id,
                p.full_name as patient_name,
                p.age as patient_age,
                p.relationship_to_client,
                p.medical_condition,
                s.staff_profile_id,
                s.full_name as staff_name,
                us.mobile_number as staff_mobile,
                s.profile_picture_url,
                us.email as staff_email,
                (SELECT bsa.service_start_time
                   FROM booking_staff_assignments bsa
                   WHERE bsa.booking_id = b.booking_id
                     AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                   ORDER BY bsa.service_start_date DESC
                   LIMIT 1) as service_start_time
            FROM bookings b
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN users uc ON c.user_id = uc.user_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
            LEFT JOIN users us ON s.user_id = us.user_id
            WHERE b.booking_id = $1
        `;

        console.log('Executing query for booking_id:', booking_id);
        const result = await db.query(query, [booking_id]);
        console.log('Query result:', result.rows);

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Get Booking by ID Error:", error);
        console.error("Error details:", error.message);
        res.status(500).json({ message: 'Failed to fetch booking details' });
    }
};

/**
 * @route   GET /api/bookings/:booking_id/admin-detail
 * @desc    Get a consolidated admin view for one booking
 * @access  Private (SUPER_ADMIN, ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getAdminBookingDetail = async (req, res) => {
    const { booking_id } = req.params;

    const bookingQuery = `
        SELECT
            b.booking_id,
            b.booking_code,
            b.request_id,
            b.client_id,
            b.patient_id,
            b.service_type,
            b.service_model,
            b.service_mode,
            b.status,
            b.preferred_gender,
            b.start_date,
            b.scheduled_end_time,
            b.actual_end_time,
            b.created_at,
            b.assigned_staff_id,
            b.daily_rate,
            b.shift_rate,
            b.ot_rate,
            b.amount_quotated,
            b.amount_paid,
            b.wallet_earmarked,
            b.invoicing_mode,
            b.is_hospitalized,
            b.hospital_name,
            c.client_profile_id,
            c.client_code,
            c.full_name as client_name,
            c.primary_address as client_address,
            c.wallet_balance,
            uc.mobile_number as client_mobile,
            uc.email as client_email,
            p.patient_id as resolved_patient_id,
            p.patient_code,
            p.full_name as patient_name,
            p.age as patient_age,
            p.relationship_to_client,
            p.medical_condition,
            p.residential_address as patient_address,
            s.staff_profile_id,
            s.staff_code,
            s.full_name as staff_name,
            us.mobile_number as staff_mobile,
            us.email as staff_email,
            s.profile_picture_url,
            sr.active_quote_id as quote_id,
            q.estimate_number,
            q.total_amount,
            q.daily_rate as quote_daily_rate,
            q.qty_days,
            q.registration_fee,
            (SELECT bsa.service_start_time
               FROM booking_staff_assignments bsa
               WHERE bsa.booking_id = b.booking_id
                 AND bsa.status IN ('ACTIVE', 'SCHEDULED')
               ORDER BY bsa.service_start_date DESC
               LIMIT 1) as service_start_time
        FROM bookings b
        LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
        LEFT JOIN users uc ON c.user_id = uc.user_id
        LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
        LEFT JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
        LEFT JOIN users us ON s.user_id = us.user_id
        LEFT JOIN service_requests sr ON b.request_id = sr.request_id
        LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
        WHERE b.booking_id = $1
    `;

    try {
        const bookingResult = await db.query(bookingQuery, [booking_id]);

        if (bookingResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        const booking = bookingResult.rows[0];
        const quoteId = booking.quote_id;
        const clientId = booking.client_id;

        const [paymentHistoryResult, financialTotalsResult, assignmentHistoryResult, swapHistoryResult, terminationHistoryResult, invoiceSummaryResult, hospitalizationHistoryResult] = await Promise.all([
            db.query(
                `SELECT booking_payment_id as payment_id, 'BOOKING'::text as source_type, amount_received, payment_method, bank_account_id, cheque_number, reference_number, slip_url, status, payment_date, verified_at, verified_by, notes
                 FROM booking_payment_tracking
                 WHERE booking_id = $1
                 ORDER BY payment_date DESC`,
                [booking_id]
            ),
                        getBookingFinancialTotals(db, booking_id),
            db.query(
                `SELECT
                    bsa.assignment_id,
                    bsa.booking_id,
                    bsa.staff_profile_id,
                    bsa.daily_rate,
                    bsa.service_start_date,
                    bsa.service_start_time,
                    bsa.assigned_hours,
                    bsa.service_end_date,
                    bsa.amount_allocated,
                    bsa.status,
                    bsa.notes,
                    bsa.shift_slot_id,
                    bsa.reschedule_id,
                    ss.shift_number,
                    ss.start_time as shift_start_time,
                    ss.duration_hours as shift_duration_hours,
                    ss.label as shift_label,
                    sp.full_name,
                    sp.staff_code,
                    sp.designation,
                    sp.current_status
                 FROM booking_staff_assignments bsa
                 JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
                 LEFT JOIN booking_shift_slots ss ON bsa.shift_slot_id = ss.shift_slot_id
                 WHERE bsa.booking_id = $1
                 ORDER BY bsa.service_start_date ASC`,
                [booking_id]
            ),
            db.query(
                `SELECT
                    ss.swap_id,
                    ss.swapped_at,
                    ss.swap_reason,
                    ss.arrival_time,
                    ss.billing_gap,
                    old_sp.full_name as old_staff_name,
                    new_sp.full_name as new_staff_name,
                    u.mobile_number as swapped_by_mobile
                 FROM staff_swaps ss
                 JOIN staff_profiles old_sp ON ss.old_staff_id = old_sp.staff_profile_id
                 JOIN staff_profiles new_sp ON ss.new_staff_id = new_sp.staff_profile_id
                 JOIN users u ON ss.swapped_by = u.user_id
                 WHERE ss.booking_id = $1
                 ORDER BY ss.swapped_at DESC`,
                [booking_id]
            ),
            db.query(
                `SELECT
                    st.termination_id,
                    st.termination_code,
                    st.requested_by,
                    st.urgency,
                    st.requested_end_date,
                    st.end_date,
                    st.reason,
                    st.rejection_reason,
                    st.status,
                    st.created_at,
                    st.end_date - CURRENT_DATE as days_until_end
                 FROM service_terminations st
                 WHERE st.booking_id = $1
                 ORDER BY st.created_at DESC`,
                [booking_id]
            ),
            quoteId
                ? db.query(
                    `SELECT
                        COUNT(*) as invoice_count,
                        COALESCE(SUM(amount), 0) as total_invoiced,
                        MAX(created_at) as last_invoice_at
                     FROM transactions
                     WHERE booking_id = $1
                       AND transaction_type = 'DEBIT'`,
                    [booking_id]
                )
                : Promise.resolve({ rows: [{ invoice_count: 0, total_invoiced: 0, last_invoice_at: null }] }),
            db.query(
                `SELECT hospitalization_id, hospital_name, started_date, ended_date
                 FROM booking_hospitalizations
                 WHERE booking_id = $1
                 ORDER BY started_date ASC`,
                [booking_id]
            )
        ]);

        const verifiedPaid = parseFloat(financialTotalsResult.total_paid || 0);
        const totalInvoiced = parseFloat(financialTotalsResult.total_invoiced || 0);
        const totalAmount = parseFloat(booking.total_amount || 0);
        const registrationFeeAmount = parseFloat(booking.registration_fee || 0);
        const walletBalance = parseFloat(booking.wallet_balance || 0);

        // Under the lazy wallet model service-charge money sits in the client's
        // shared wallet until a day/shift is actually invoiced. What THIS booking
        // can actually spend is its own reservation plus whatever in the wallet
        // isn't reserved by any booking — exactly the pool
        // walletService.drawWalletForBooking will draw from, so "shifts/days paid
        // for" lines up with what will really be funded. Another booking's earmark
        // is deliberately excluded.
        const earmarkedForThis = parseFloat(booking.wallet_earmarked || 0);
        const earmarkedTotalRes = await db.query(
            `SELECT COALESCE(SUM(wallet_earmarked), 0) AS earmarked FROM bookings WHERE client_id = $1`,
            [booking.client_id]
        );
        const unearmarked = Math.max(0, walletBalance - parseFloat(earmarkedTotalRes.rows[0]?.earmarked || 0));
        const walletAvailable = Math.min(walletBalance, earmarkedForThis + unearmarked);

        const remainingBalance = verifiedPaid - totalInvoiced;
        const remainingToInvoice = Math.max(remainingBalance, 0);
        // Overdue reflects real, already-incurred debt from when a charge was
        // invoiced and the wallet fell short at that moment — it doesn't
        // auto-clear just because the client has since topped up their wallet;
        // an admin applies that manually via the wallet-payoff action.
        const overdueAmount = verifiedPaid > totalInvoiced ? 0 : totalInvoiced - verifiedPaid;

        let daysRemaining = null;
        let overdueDays = null;
        if (booking.quote_daily_rate) {
            const rate = parseFloat(booking.quote_daily_rate);
            if (rate > 0) {
                daysRemaining = walletAvailable / rate;
                overdueDays = overdueAmount > 0 ? Math.ceil(overdueAmount / rate) : 0;
            }
        }

        res.status(200).json({
            status: 'success',
            data: {
                booking_summary: {
                    booking_id: booking.booking_id,
                    booking_code: booking.booking_code,
                    request_id: booking.request_id,
                    status: booking.status,
                    service_type: booking.service_type,
                    service_model: booking.service_model,
                    service_mode: booking.service_mode,
                    preferred_gender: booking.preferred_gender,
                    start_date: booking.start_date,
                    service_start_time: booking.service_start_time,
                    scheduled_end_time: booking.scheduled_end_time,
                    actual_end_time: booking.actual_end_time,
                    created_at: booking.created_at,
                    daily_rate: booking.daily_rate,
                    shift_rate: booking.shift_rate,
                    ot_rate: booking.ot_rate,
                    amount_quotated: booking.amount_quotated,
                    amount_paid: booking.amount_paid,
                    invoicing_mode: booking.invoicing_mode,
                    is_hospitalized: booking.is_hospitalized,
                    hospital_name: booking.hospital_name,
                    quote_id: booking.quote_id,
                    estimate_number: booking.estimate_number,
                    quote_daily_rate: booking.quote_daily_rate,
                    quote_total_amount: booking.total_amount,
                    qty_days: booking.qty_days,
                    registration_fee: booking.registration_fee,
                    auto_complete_when_paid: false
                },
                client_details: {
                    client_profile_id: booking.client_profile_id,
                    client_code: booking.client_code,
                    client_name: booking.client_name,
                    client_address: booking.client_address,
                    client_mobile: booking.client_mobile,
                    client_email: booking.client_email,
                    wallet_balance: parseFloat(booking.wallet_balance || 0)
                },
                patient_details: {
                    patient_id: booking.resolved_patient_id || booking.patient_id,
                    patient_code: booking.patient_code,
                    patient_name: booking.patient_name,
                    patient_age: booking.patient_age,
                    relationship_to_client: booking.relationship_to_client,
                    medical_condition: booking.medical_condition,
                    patient_address: booking.patient_address
                },
                current_staff: booking.staff_profile_id ? {
                    staff_profile_id: booking.staff_profile_id,
                    staff_code: booking.staff_code,
                    staff_name: booking.staff_name,
                    staff_mobile: booking.staff_mobile,
                    staff_email: booking.staff_email,
                    profile_picture_url: booking.profile_picture_url
                } : null,
                payment_summary: {
                    payment_count: paymentHistoryResult.rows.length,
                    total_paid: walletAvailable,
                    remaining_amount: Math.max((totalAmount - registrationFeeAmount) - walletAvailable, 0),
                    // Same figure as total_paid — kept as a separate, explicitly-named
                    // field for BookingDetailPageV2's shiftBank/days-covered math to
                    // read from, so that intent stays clear even if total_paid's
                    // definition changes again later.
                    funded_for_service: walletAvailable,
                    // Reserved specifically for this booking, and therefore the amount
                    // the admin is asked to settle if it ends early.
                    wallet_earmarked: earmarkedForThis,
                    // The rest of the client's wallet that no booking has claimed —
                    // this booking may draw on it, but so may any of their others.
                    wallet_unearmarked: unearmarked
                },
                invoice_summary: {
                    invoice_count: parseInt(invoiceSummaryResult.rows[0]?.invoice_count || 0, 10),
                    total_invoiced: totalInvoiced,
                    remaining_to_invoice: remainingToInvoice,
                    overdue_amount: overdueAmount,
                    days_remaining: daysRemaining,
                    overdue_days: overdueDays,
                    last_invoice_at: invoiceSummaryResult.rows[0]?.last_invoice_at || null
                },
                payment_history: paymentHistoryResult.rows,
                staff_assignment_history: assignmentHistoryResult.rows,
                swap_history: swapHistoryResult.rows,
                termination_requests: terminationHistoryResult.rows,
                hospitalization_periods: hospitalizationHistoryResult.rows
            }
        });
    } catch (error) {
        console.error('Admin booking detail error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch admin booking details'
        });
    }
};

/**
 * @route   GET /api/bookings/:booking_id/termination-requests
 * @desc    Get all termination requests for a booking
 * @access  Private (SUPER_ADMIN, ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getBookingTerminationRequests = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const result = await db.query(
            `SELECT
                termination_id,
                termination_code,
                requested_by,
                urgency,
                requested_end_date,
                end_date,
                reason,
                status,
                created_at
             FROM service_terminations
             WHERE booking_id = $1
             ORDER BY created_at DESC`,
            [booking_id]
        );

        res.status(200).json({
            status: 'success',
            count: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        console.error('Booking termination history error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch booking termination history'
        });
    }
};

/**
 * @route   GET /api/bookings/:booking_id/invoice-breakdown
 * @desc    Get daily invoicing vs payment breakdown for a booking
 * @access  Private (SUPER_ADMIN, ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getBookingInvoiceBreakdown = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const bookingResult = await db.query(
            `SELECT
                b.booking_id,
                b.booking_code,
                b.status,
                b.client_id,
                b.assigned_staff_id,
                b.start_date,
                b.scheduled_end_time,
                b.actual_end_time,
                b.daily_rate,
                b.amount_paid,
                b.amount_quotated,
                c.full_name as client_name,
                c.wallet_balance,
                q.quote_id,
                q.total_amount,
                q.daily_rate as quote_daily_rate,
                q.qty_days
             FROM bookings b
             LEFT JOIN service_requests sr ON b.request_id = sr.request_id
             LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
             LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
             WHERE b.booking_id = $1`,
            [booking_id]
        );

        if (bookingResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        const booking = bookingResult.rows[0];
        const rate = parseFloat(booking.quote_daily_rate || booking.daily_rate || 0);

        const [financialTotalsResult, recentPaymentResult, recentInvoiceResult] = await Promise.all([
            getBookingFinancialTotals(db, booking_id),
            booking.quote_id
                ? db.query(
                    `SELECT payment_id, amount_received, payment_method, payment_date, status, verified_at
                     FROM payment_tracking
                     WHERE quote_id = $1
                     ORDER BY payment_date DESC
                     LIMIT 5`,
                    [booking.quote_id]
                )
                : Promise.resolve({ rows: [] }),
            db.query(
                `SELECT transaction_id, amount, notes, created_at
                 FROM transactions
                 WHERE booking_id = $1
                   AND transaction_type = 'DEBIT'
                 ORDER BY created_at DESC
                 LIMIT 5`,
                [booking_id]
            )
        ]);

        const totalPaid = parseFloat(financialTotalsResult.total_paid || 0);
        const totalInvoiced = parseFloat(financialTotalsResult.total_invoiced || 0);
        // Same wallet-pool "paid" figure as getAdminBookingDetail — see its
        // comment for why this is the client's wallet balance directly.
        const walletAvailable = parseFloat(booking.wallet_balance || 0);
        const remainingBalance = totalPaid - totalInvoiced;
        const overdueAmount = totalPaid > totalInvoiced ? 0 : totalInvoiced - totalPaid;
        const remainingDays = rate > 0 ? walletAvailable / rate : null;
        const overdueDays = rate > 0 ? Math.max(Math.ceil(overdueAmount / rate), 0) : null;

        res.status(200).json({
            status: 'success',
            data: {
                booking_id: booking.booking_id,
                booking_code: booking.booking_code,
                booking_status: booking.status,
                client_id: booking.client_id,
                client_name: booking.client_name,
                quote_id: booking.quote_id,
                quote_daily_rate: rate,
                quote_total_amount: parseFloat(booking.total_amount || 0),
                payment_summary: {
                    payment_count: recentPaymentResult.rows.length,
                    total_paid: walletAvailable,
                    funded_for_service: walletAvailable,
                    last_payment_at: recentPaymentResult.rows[0]?.payment_date || null
                },
                invoice_summary: {
                    invoice_count: recentInvoiceResult.rows.length,
                    total_invoiced: totalInvoiced,
                    last_invoice_at: recentInvoiceResult.rows[0]?.created_at || null,
                    remaining_to_invoice: Math.max(remainingBalance, 0),
                    overdue_amount: overdueAmount,
                    remaining_days: remainingDays,
                    overdue_days: overdueDays
                },
                recent_payments: recentPaymentResult.rows,
                recent_invoices: recentInvoiceResult.rows
            }
        });
    } catch (error) {
        console.error('Booking invoice breakdown error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch booking invoice breakdown'
        });
    }
};

/**
 * @route   GET /api/bookings/:booking_id/staff-allocation-history
 * @desc    Get staff assignment and allocation history for a booking
 * @access  Private (SUPER_ADMIN, ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getBookingStaffAllocationHistory = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const result = await db.query(
            `SELECT
                bsa.assignment_id,
                bsa.booking_id,
                bsa.staff_profile_id,
                bsa.daily_rate,
                bsa.service_start_date,
                bsa.service_end_date,
                bsa.amount_allocated,
                bsa.status,
                bsa.notes,
                sp.full_name as staff_name,
                sp.designation,
                sp.current_status,
                COALESCE(salary_totals.total_salary_paid, 0) as total_salary_paid
             FROM booking_staff_assignments bsa
             JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
             LEFT JOIN (
                 SELECT staff_profile_id, booking_id, COALESCE(SUM(amount), 0) as total_salary_paid
                 FROM transactions
                 WHERE category = 'STAFF_SALARY'
                   AND transaction_type = 'CREDIT'
                   AND status = 'COMPLETED'
                 GROUP BY staff_profile_id, booking_id
             ) salary_totals
               ON salary_totals.staff_profile_id = bsa.staff_profile_id
              AND salary_totals.booking_id = bsa.booking_id
             WHERE bsa.booking_id = $1
             ORDER BY bsa.service_start_date ASC`,
            [booking_id]
        );

        const totalAllocated = result.rows.reduce((sum, row) => sum + parseFloat(row.amount_allocated || 0), 0);
        const totalSalaryPaid = result.rows.reduce((sum, row) => sum + parseFloat(row.total_salary_paid || 0), 0);

        res.status(200).json({
            status: 'success',
            booking_id,
            summary: {
                assignment_count: result.rowCount,
                total_allocated: totalAllocated,
                total_salary_paid: totalSalaryPaid
            },
            data: result.rows
        });
    } catch (error) {
        console.error('Booking staff allocation history error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch booking staff allocation history'
        });
    }
};

/**
 * @route   GET /api/bookings/:booking_id/daily-invoices
 * @desc    List booking_daily_invoices rows for a booking (manual confirmation history)
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getBookingDailyInvoices = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const result = await db.query(
            `SELECT
                bdi.daily_invoice_id, bdi.booking_id, bdi.service_date::text as service_date, bdi.entry_mode,
                bdi.status, bdi.amount, bdi.transaction_id, bdi.decided_by_user_id, bdi.decided_by_name, bdi.decided_at,
                bdi.notes, bdi.created_at, bdi.updated_at, bdi.shift_slot_id,
                bdi.revoke_reason, bdi.revoked_by_name, bdi.revoked_at, bdi.settlement_action,
                ss.shift_number, ss.label as shift_label
             FROM booking_daily_invoices bdi
             LEFT JOIN booking_shift_slots ss ON bdi.shift_slot_id = ss.shift_slot_id
             WHERE bdi.booking_id = $1
             ORDER BY bdi.service_date DESC`,
            [booking_id]
        );

        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Get booking daily invoices error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch daily invoices' });
    }
};

/**
 * @route   POST /api/bookings/:booking_id/daily-invoices
 * @desc    Admin decision on whether to invoice the client for a given day.
 *          Always a manual judgement call for SHIFT_BASED/VISITING bookings,
 *          and for LIVE_IN bookings that have opted into invoicing_mode = 'MANUAL'.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    service_date, approve (boolean), amount (optional, defaults to booking.daily_rate)
 */
/**
 * Core validation + upsert for deciding a day's/shift's client invoice. MUST be
 * called within an open transaction on `client` (locks the invoice row FOR
 * UPDATE and, on approve, calls createServiceInvoice) — shared by the
 * single-shot `confirmDailyInvoice` endpoint and the day-draft confirm flow.
 * Throws an Error with `.statusCode` set on validation failure/conflict.
 */
async function applyInvoiceDecision(client, { booking_id, service_date, approve, amount, shift_slot_id, reschedule_id, deciderUserId, deciderName }) {
    if (!service_date || typeof approve !== 'boolean') {
        const err = new Error('service_date and approve (boolean) are required');
        err.statusCode = 400;
        throw err;
    }

    const bookingRes = await client.query(
        `SELECT booking_id, client_id, daily_rate, shift_rate, service_model FROM bookings WHERE booking_id = $1`,
        [booking_id]
    );

    if (bookingRes.rows.length === 0) {
        const err = new Error('Booking not found');
        err.statusCode = 404;
        throw err;
    }

    const booking = bookingRes.rows[0];

    if (booking.service_model === 'SHIFT_BASED' && !shift_slot_id) {
        const err = new Error('shift_slot_id is required for SHIFT_BASED bookings');
        err.statusCode = 400;
        throw err;
    }
    if (booking.service_model !== 'SHIFT_BASED' && shift_slot_id) {
        const err = new Error('shift_slot_id must not be provided for this booking type');
        err.statusCode = 400;
        throw err;
    }

    if (shift_slot_id) {
        const slotCheck = await client.query(
            `SELECT s.shift_slot_id FROM booking_shift_slots s
             JOIN booking_shift_patterns p ON s.pattern_id = p.pattern_id
             WHERE s.shift_slot_id = $1 AND p.booking_id = $2`,
            [shift_slot_id, booking_id]
        );
        if (slotCheck.rows.length === 0) {
            const err = new Error('Shift slot not found for this booking');
            err.statusCode = 404;
            throw err;
        }
    }

    if (reschedule_id) {
        const rescheduleCheck = await client.query(
            `SELECT reschedule_id FROM shift_reschedules WHERE reschedule_id = $1 AND booking_id = $2 AND status = 'ACTIVE'`,
            [reschedule_id, booking_id]
        );
        if (rescheduleCheck.rows.length === 0) {
            const err = new Error('Reschedule not found for this booking');
            err.statusCode = 404;
            throw err;
        }
    }

    const existing = reschedule_id
        ? await client.query(
            `SELECT * FROM booking_daily_invoices WHERE reschedule_id = $1 FOR UPDATE`,
            [reschedule_id]
        )
        : shift_slot_id
            ? await client.query(
                `SELECT * FROM booking_daily_invoices WHERE booking_id = $1 AND service_date = $2 AND shift_slot_id = $3 AND reschedule_id IS NULL FOR UPDATE`,
                [booking_id, service_date, shift_slot_id]
            )
            : await client.query(
                `SELECT * FROM booking_daily_invoices WHERE booking_id = $1 AND service_date = $2 AND shift_slot_id IS NULL AND reschedule_id IS NULL FOR UPDATE`,
                [booking_id, service_date]
            );

    if (existing.rows.length > 0 && existing.rows[0].status !== 'PENDING') {
        const err = new Error('This day has already been decided');
        err.statusCode = 409;
        throw err;
    }

    let transactionId = null;
    let finalAmount = null;

    if (approve) {
        if (amount !== undefined && amount !== null && amount !== '') {
            finalAmount = parseFloat(amount);
        } else if (shift_slot_id) {
            finalAmount = calculateShiftSlotCharge(booking).amount;
        } else {
            finalAmount = parseFloat(booking.daily_rate);
        }

        if (Number.isNaN(finalAmount) || finalAmount <= 0) {
            const err = new Error('amount must be a positive number');
            err.statusCode = 400;
            throw err;
        }

        transactionId = await createServiceInvoice(client, {
            booking_id,
            client_id: booking.client_id,
            amount: finalAmount,
            notes: `Manually confirmed ${shift_slot_id ? 'shift' : 'daily'} charge for ${service_date}`
        });

        // Draw as much of this charge as the client's wallet currently holds —
        // whatever's short simply leaves the booking OVERDUE below, rather than
        // being pre-funded ahead of time.
        await drawWalletForBooking(client, {
            booking_id,
            client_id: booking.client_id,
            maxAmount: finalAmount,
            verified_by: deciderUserId || null,
        });

        await checkAndFlagBookingOverdue(client, booking_id);
    }

    const result = reschedule_id
        ? await client.query(
            `INSERT INTO booking_daily_invoices (
                booking_id, service_date, entry_mode, status, amount, transaction_id,
                decided_by_user_id, decided_by_name, decided_at, shift_slot_id, reschedule_id
            ) VALUES ($1, $2, 'MANUAL', $3, $4, $5, $6, $7, NOW(), $8, $9)
            ON CONFLICT (reschedule_id) WHERE reschedule_id IS NOT NULL
            DO UPDATE SET status = EXCLUDED.status,
                          amount = EXCLUDED.amount,
                          transaction_id = EXCLUDED.transaction_id,
                          decided_by_user_id = EXCLUDED.decided_by_user_id,
                          decided_by_name = EXCLUDED.decided_by_name,
                          decided_at = NOW(),
                          updated_at = NOW()
            RETURNING *`,
            [booking_id, service_date, approve ? 'INVOICED' : 'SKIPPED', finalAmount, transactionId, deciderUserId || null, deciderName, shift_slot_id, reschedule_id]
        )
        : shift_slot_id
            ? await client.query(
                `INSERT INTO booking_daily_invoices (
                    booking_id, service_date, entry_mode, status, amount, transaction_id,
                    decided_by_user_id, decided_by_name, decided_at, shift_slot_id
                ) VALUES ($1, $2, 'MANUAL', $3, $4, $5, $6, $7, NOW(), $8)
                ON CONFLICT (booking_id, service_date, shift_slot_id) WHERE shift_slot_id IS NOT NULL AND reschedule_id IS NULL
                DO UPDATE SET status = EXCLUDED.status,
                              amount = EXCLUDED.amount,
                              transaction_id = EXCLUDED.transaction_id,
                              decided_by_user_id = EXCLUDED.decided_by_user_id,
                              decided_by_name = EXCLUDED.decided_by_name,
                              decided_at = NOW(),
                              updated_at = NOW()
                RETURNING *`,
                [booking_id, service_date, approve ? 'INVOICED' : 'SKIPPED', finalAmount, transactionId, deciderUserId || null, deciderName, shift_slot_id]
            )
            : await client.query(
                `INSERT INTO booking_daily_invoices (
                    booking_id, service_date, entry_mode, status, amount, transaction_id,
                    decided_by_user_id, decided_by_name, decided_at
                ) VALUES ($1, $2, 'MANUAL', $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (booking_id, service_date) WHERE shift_slot_id IS NULL
                DO UPDATE SET status = EXCLUDED.status,
                              amount = EXCLUDED.amount,
                              transaction_id = EXCLUDED.transaction_id,
                              decided_by_user_id = EXCLUDED.decided_by_user_id,
                              decided_by_name = EXCLUDED.decided_by_name,
                              decided_at = NOW(),
                              updated_at = NOW()
                RETURNING *`,
                [booking_id, service_date, approve ? 'INVOICED' : 'SKIPPED', finalAmount, transactionId, deciderUserId || null, deciderName]
            );

    return { invoice: result.rows[0], finalAmount };
}

exports.confirmDailyInvoice = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date, approve, amount, shift_slot_id, reschedule_id } = req.body;

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const decidedByName = await getActorName(req.user?.user_id);
        const { invoice, finalAmount } = await applyInvoiceDecision(client, {
            booking_id, service_date, approve, amount, shift_slot_id, reschedule_id,
            deciderUserId: req.user?.user_id, deciderName: decidedByName
        });

        // A VISITING booking's one-time visit may now be fully decided (salary + invoice)
        // — auto-complete it rather than leaving it ACTIVE for a manual close-out.
        await maybeAutoCompleteVisitingBooking(client, booking_id);

        await client.query('COMMIT');

        const isShift = Boolean(shift_slot_id);
        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: approve
                ? (isShift ? 'SHIFT_INVOICE_CONFIRMED' : 'DAILY_INVOICE_CONFIRMED')
                : (isShift ? 'SHIFT_INVOICE_SKIPPED' : 'DAILY_INVOICE_SKIPPED'),
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { service_date, amount: finalAmount, shift_slot_id: shift_slot_id || null },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', data: invoice });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('Confirm daily invoice error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to confirm daily invoice decision' });
    } finally {
        client.release();
    }
};

/**
 * @route   GET /api/bookings/:booking_id/shift-schedule?from&to
 * @desc    Derives every shift occurrence for a SHIFT_BASED booking across a date
 *          range from the active pattern (× calendar dates), overlaid with any
 *          reschedules (moved-away origins hidden, makeup occurrences added) and
 *          merged with attendance/invoice status. Replaces the old cron-seeded
 *          PENDING queue — nothing is pre-created, this is the live source of truth
 *          for both the admin confirm/waive/reschedule UI and the care calendars.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getShiftSchedule = async (req, res) => {
    const { booking_id } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
        return res.status(400).json({ status: 'error', message: 'from and to query params are required (YYYY-MM-DD)' });
    }

    try {
        const bookingRes = await db.query(
            `SELECT booking_id, service_model, shift_rate FROM bookings WHERE booking_id = $1`,
            [booking_id]
        );
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        const booking = bookingRes.rows[0];
        if (booking.service_model !== 'SHIFT_BASED') {
            return res.status(400).json({ status: 'error', message: 'shift-schedule is only available for SHIFT_BASED bookings' });
        }

        const patternsRes = await db.query(
            `SELECT p.pattern_id, p.effective_from_date::text, p.effective_to_date::text,
                    s.shift_slot_id, s.shift_number, s.start_time, s.duration_hours, s.label
             FROM booking_shift_patterns p
             JOIN booking_shift_slots s ON s.pattern_id = p.pattern_id
             WHERE p.booking_id = $1 AND p.status IN ('ACTIVE', 'SUPERSEDED')
             ORDER BY p.effective_from_date ASC, s.shift_number ASC`,
            [booking_id]
        );

        const assignmentsRes = await db.query(
            `SELECT bsa.assignment_id, bsa.shift_slot_id, bsa.staff_profile_id, bsa.status,
                    bsa.service_start_date::text, bsa.service_end_date::text, bsa.reschedule_id,
                    sp.full_name as staff_name
             FROM booking_staff_assignments bsa
             JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
             WHERE bsa.booking_id = $1`,
            [booking_id]
        );

        const reschedulesRes = await db.query(
            `SELECT r.*, sp.full_name as makeup_staff_name
             FROM shift_reschedules r
             LEFT JOIN booking_staff_assignments bsa ON bsa.assignment_id = r.assignment_id
             LEFT JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
             WHERE r.booking_id = $1 AND r.status = 'ACTIVE'
               AND (r.original_date BETWEEN $2 AND $3 OR r.new_date BETWEEN $2 AND $3)`,
            [booking_id, from, to]
        );

        const attendanceRes = await db.query(
            `SELECT attendance_id, assignment_id, shift_slot_id, service_date::text, salary_status,
                    salary_amount, hours_served, decided_by_name, reschedule_id
             FROM staff_daily_attendance
             WHERE booking_id = $1 AND service_date BETWEEN $2 AND $3`,
            [booking_id, from, to]
        );

        const invoicesRes = await db.query(
            `SELECT daily_invoice_id, shift_slot_id, service_date::text, status, amount,
                    decided_by_name, reschedule_id
             FROM booking_daily_invoices
             WHERE booking_id = $1 AND service_date BETWEEN $2 AND $3`,
            [booking_id, from, to]
        );

        const movedOrigins = new Set(
            reschedulesRes.rows.map((r) => `${r.shift_slot_id}__${r.original_date}`)
        );

        const standingAssignmentBySlot = new Map();
        assignmentsRes.rows.forEach((a) => {
            if (a.status === 'ACTIVE' && !a.reschedule_id) standingAssignmentBySlot.set(a.shift_slot_id, a);
        });
        const assignmentById = new Map(assignmentsRes.rows.map((a) => [a.assignment_id, a]));
        const attendanceByAssignmentSlotDate = new Map();
        const attendanceByReschedule = new Map();
        attendanceRes.rows.forEach((r) => {
            if (r.reschedule_id) attendanceByReschedule.set(r.reschedule_id, r);
            else attendanceByAssignmentSlotDate.set(`${r.assignment_id}__${r.shift_slot_id}__${r.service_date}`, r);
        });
        const invoiceBySlotDate = new Map();
        const invoiceByReschedule = new Map();
        invoicesRes.rows.forEach((r) => {
            if (r.reschedule_id) invoiceByReschedule.set(r.reschedule_id, r);
            else invoiceBySlotDate.set(`${r.shift_slot_id}__${r.service_date}`, r);
        });

        const patternsBySlot = new Map();
        patternsRes.rows.forEach((row) => {
            const arr = patternsBySlot.get(row.shift_slot_id) || [];
            arr.push(row);
            patternsBySlot.set(row.shift_slot_id, arr);
        });

        const occurrences = [];
        const fromD = new Date(`${from}T00:00:00`);
        const toD = new Date(`${to}T00:00:00`);

        for (const [slotId, patternRows] of patternsBySlot.entries()) {
            const slotMeta = patternRows[0];
            for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const active = patternRows.find((p) =>
                    p.effective_from_date <= dateStr && (!p.effective_to_date || p.effective_to_date >= dateStr)
                );
                if (!active) continue;
                if (movedOrigins.has(`${slotId}__${dateStr}`)) {
                    occurrences.push({
                        shift_slot_id: slotId, shift_number: slotMeta.shift_number, label: slotMeta.label,
                        start_time: slotMeta.start_time, service_date: dateStr, kind: 'MOVED',
                        staff_name: null, assignment_id: null, attendance: null, invoice: null,
                    });
                    continue;
                }
                const assignment = standingAssignmentBySlot.get(slotId);
                const attendance = assignment
                    ? attendanceByAssignmentSlotDate.get(`${assignment.assignment_id}__${slotId}__${dateStr}`) || null
                    : null;
                const invoice = invoiceBySlotDate.get(`${slotId}__${dateStr}`) || null;
                occurrences.push({
                    shift_slot_id: slotId, shift_number: slotMeta.shift_number, label: slotMeta.label,
                    start_time: slotMeta.start_time, service_date: dateStr, kind: 'NATURAL',
                    staff_name: assignment?.staff_name || null,
                    assignment_id: assignment?.assignment_id || null,
                    attendance, invoice,
                });
            }
        }

        // Makeup occurrences from reschedules landing in range
        reschedulesRes.rows.forEach((r) => {
            if (r.new_date < from || r.new_date > to) return;
            const slotMeta = patternsRes.rows.find((p) => p.shift_slot_id === r.shift_slot_id);
            const assignment = r.assignment_id ? assignmentById.get(r.assignment_id) : standingAssignmentBySlot.get(r.shift_slot_id);
            occurrences.push({
                shift_slot_id: r.shift_slot_id,
                shift_number: slotMeta?.shift_number ?? null,
                label: slotMeta?.label ?? null,
                start_time: r.new_start_time || slotMeta?.start_time || null,
                service_date: r.new_date,
                kind: 'MAKEUP',
                reschedule_id: r.reschedule_id,
                staff_name: r.makeup_staff_name || assignment?.staff_name || null,
                assignment_id: r.assignment_id || assignment?.assignment_id || null,
                attendance: attendanceByReschedule.get(r.reschedule_id) || null,
                invoice: invoiceByReschedule.get(r.reschedule_id) || null,
                original_date: r.original_date,
            });
        });

        occurrences.sort((a, b) => a.service_date.localeCompare(b.service_date) || (a.shift_number || 0) - (b.shift_number || 0));

        res.status(200).json({ status: 'success', data: { shift_rate: parseFloat(booking.shift_rate) || 0, occurrences } });
    } catch (error) {
        console.error('Get shift schedule error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to build shift schedule' });
    }
};

/**
 * @route   POST /api/bookings/:booking_id/shift-occurrences/waive
 * @desc    Waives one shift occurrence — no client charge AND no staff pay for it,
 *          per admin decision (e.g. staff no-show that isn't being made up). Skips
 *          both sides atomically; does not require attendance to have been logged.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    service_date, shift_slot_id, assignment_id, reschedule_id (optional), reason (optional)
 */
/**
 * Core validation + upsert for waiving a shift occurrence (skip both the
 * client charge and the staff pay atomically). MUST be called within an open
 * transaction on `client` — shared by the single-shot `waiveShiftOccurrence`
 * endpoint and the day-draft confirm flow.
 */
async function applyWaiveDecision(client, { booking_id, service_date, shift_slot_id, assignment_id, reschedule_id, reason, deciderUserId, deciderName }) {
    if (!service_date || !shift_slot_id || !assignment_id) {
        const err = new Error('service_date, shift_slot_id and assignment_id are required');
        err.statusCode = 400;
        throw err;
    }

    const bookingRes = await client.query(
        `SELECT booking_id, client_id, service_model FROM bookings WHERE booking_id = $1`,
        [booking_id]
    );
    if (bookingRes.rows.length === 0) {
        const err = new Error('Booking not found');
        err.statusCode = 404;
        throw err;
    }
    if (bookingRes.rows[0].service_model !== 'SHIFT_BASED') {
        const err = new Error('Waiving individual shifts only applies to SHIFT_BASED bookings');
        err.statusCode = 400;
        throw err;
    }

    const assignmentRes = await client.query(
        `SELECT staff_profile_id FROM booking_staff_assignments WHERE assignment_id = $1 AND booking_id = $2`,
        [assignment_id, booking_id]
    );
    if (assignmentRes.rows.length === 0) {
        const err = new Error('Assignment not found for this booking');
        err.statusCode = 404;
        throw err;
    }
    const staff_profile_id = assignmentRes.rows[0].staff_profile_id;

    const existingInvoice = reschedule_id
        ? await client.query(`SELECT status FROM booking_daily_invoices WHERE reschedule_id = $1 FOR UPDATE`, [reschedule_id])
        : await client.query(`SELECT status FROM booking_daily_invoices WHERE booking_id = $1 AND service_date = $2 AND shift_slot_id = $3 AND reschedule_id IS NULL FOR UPDATE`, [booking_id, service_date, shift_slot_id]);
    if (existingInvoice.rows.length > 0 && existingInvoice.rows[0].status !== 'PENDING') {
        const err = new Error('This shift has already been decided');
        err.statusCode = 409;
        throw err;
    }

    const notes = reason ? `Shift waived — ${reason}` : 'Shift waived by admin';

    if (reschedule_id) {
        await client.query(
            `INSERT INTO booking_daily_invoices (booking_id, service_date, entry_mode, status, shift_slot_id, reschedule_id, decided_by_user_id, decided_by_name, decided_at, notes)
             VALUES ($1, $2, 'MANUAL', 'SKIPPED', $3, $4, $5, $6, NOW(), $7)
             ON CONFLICT (reschedule_id) WHERE reschedule_id IS NOT NULL
             DO UPDATE SET status = 'SKIPPED', decided_by_user_id = EXCLUDED.decided_by_user_id, decided_by_name = EXCLUDED.decided_by_name, decided_at = NOW(), notes = EXCLUDED.notes, updated_at = NOW()`,
            [booking_id, service_date, shift_slot_id, reschedule_id, deciderUserId || null, deciderName, notes]
        );
        await client.query(
            `INSERT INTO staff_daily_attendance (booking_id, assignment_id, staff_profile_id, service_date, entry_mode, salary_status, shift_slot_id, reschedule_id, decided_by_user_id, decided_by_name, decided_at, notes)
             VALUES ($1, $2, $3, $4, 'MANUAL', 'SKIPPED', $5, $6, $7, $8, NOW(), $9)
             ON CONFLICT (reschedule_id) WHERE reschedule_id IS NOT NULL
             DO UPDATE SET salary_status = 'SKIPPED', decided_by_user_id = EXCLUDED.decided_by_user_id, decided_by_name = EXCLUDED.decided_by_name, decided_at = NOW(), notes = EXCLUDED.notes, updated_at = NOW()`,
            [booking_id, assignment_id, staff_profile_id, service_date, shift_slot_id, reschedule_id, deciderUserId || null, deciderName, notes]
        );
    } else {
        await client.query(
            `INSERT INTO booking_daily_invoices (booking_id, service_date, entry_mode, status, shift_slot_id, decided_by_user_id, decided_by_name, decided_at, notes)
             VALUES ($1, $2, 'MANUAL', 'SKIPPED', $3, $4, $5, NOW(), $6)
             ON CONFLICT (booking_id, service_date, shift_slot_id) WHERE shift_slot_id IS NOT NULL AND reschedule_id IS NULL
             DO UPDATE SET status = 'SKIPPED', decided_by_user_id = EXCLUDED.decided_by_user_id, decided_by_name = EXCLUDED.decided_by_name, decided_at = NOW(), notes = EXCLUDED.notes, updated_at = NOW()`,
            [booking_id, service_date, shift_slot_id, deciderUserId || null, deciderName, notes]
        );
        await client.query(
            `INSERT INTO staff_daily_attendance (booking_id, assignment_id, staff_profile_id, service_date, entry_mode, salary_status, shift_slot_id, decided_by_user_id, decided_by_name, decided_at, notes)
             VALUES ($1, $2, $3, $4, 'MANUAL', 'SKIPPED', $5, $6, $7, NOW(), $8)
             ON CONFLICT (assignment_id, service_date, shift_slot_id) WHERE shift_slot_id IS NOT NULL
             DO UPDATE SET salary_status = 'SKIPPED', decided_by_user_id = EXCLUDED.decided_by_user_id, decided_by_name = EXCLUDED.decided_by_name, decided_at = NOW(), notes = EXCLUDED.notes, updated_at = NOW()`,
            [booking_id, assignment_id, staff_profile_id, service_date, shift_slot_id, deciderUserId || null, deciderName, notes]
        );
    }

    return { notes };
}

exports.waiveShiftOccurrence = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date, shift_slot_id, assignment_id, reschedule_id, reason } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const decidedByName = await getActorName(req.user?.user_id);
        const { notes } = await applyWaiveDecision(client, {
            booking_id, service_date, shift_slot_id, assignment_id, reschedule_id, reason,
            deciderUserId: req.user?.user_id, deciderName: decidedByName
        });

        await client.query('COMMIT');

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'SHIFT_OCCURRENCE_WAIVED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { service_date, shift_slot_id, assignment_id, notes },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', message: 'Shift waived — no charge and no pay recorded' });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('Waive shift occurrence error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to waive shift' });
    } finally {
        client.release();
    }
};

/**
 * @route   POST /api/bookings/:booking_id/shift-occurrences/reschedule
 * @desc    Moves a missed/upcoming shift occurrence to a different date (any date
 *          within the same booking — doesn't have to fall within the paid plan;
 *          defaults to just after the booking's scheduled end in the frontend).
 *          Staff can optionally change for the makeup occurrence; if unchanged,
 *          the slot's standing assignment covers it.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    shift_slot_id, original_date, new_date, new_start_time (optional),
 *          new_staff_profile_id (optional), reason (optional)
 */
exports.rescheduleShiftOccurrence = async (req, res) => {
    const { booking_id } = req.params;
    const { shift_slot_id, original_date, new_date, new_start_time, new_staff_profile_id, reason } = req.body;

    if (!shift_slot_id || !original_date || !new_date) {
        return res.status(400).json({ status: 'error', message: 'shift_slot_id, original_date and new_date are required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(
            `SELECT booking_id, service_model FROM bookings WHERE booking_id = $1`,
            [booking_id]
        );
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        if (bookingRes.rows[0].service_model !== 'SHIFT_BASED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Rescheduling only applies to SHIFT_BASED bookings' });
        }

        const slotCheck = await client.query(
            `SELECT s.shift_slot_id FROM booking_shift_slots s
             JOIN booking_shift_patterns p ON s.pattern_id = p.pattern_id
             WHERE s.shift_slot_id = $1 AND p.booking_id = $2`,
            [shift_slot_id, booking_id]
        );
        if (slotCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Shift slot not found for this booking' });
        }

        const dupeCheck = await client.query(
            `SELECT reschedule_id FROM shift_reschedules WHERE booking_id = $1 AND shift_slot_id = $2 AND original_date = $3 AND status = 'ACTIVE'`,
            [booking_id, shift_slot_id, original_date]
        );
        if (dupeCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'This shift has already been rescheduled — cancel that move first' });
        }

        const standingRes = await client.query(
            `SELECT assignment_id, staff_profile_id, daily_rate FROM booking_staff_assignments
             WHERE shift_slot_id = $1 AND status = 'ACTIVE' AND reschedule_id IS NULL`,
            [shift_slot_id]
        );
        const standing = standingRes.rows[0] || null;

        let makeupAssignmentId = standing?.assignment_id || null;

        const rescheduleRes = await client.query(
            `INSERT INTO shift_reschedules (booking_id, shift_slot_id, original_date, new_date, new_start_time, reason, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [booking_id, shift_slot_id, original_date, new_date, new_start_time || null, reason || null, req.user?.user_id || null]
        );
        const reschedule = rescheduleRes.rows[0];

        if (new_staff_profile_id && new_staff_profile_id !== standing?.staff_profile_id) {
            const newAssignmentRes = await client.query(
                `INSERT INTO booking_staff_assignments (booking_id, staff_profile_id, shift_slot_id, daily_rate, service_start_date, service_end_date, status, reschedule_id)
                 VALUES ($1, $2, $3, $4, $5, $5, 'ACTIVE', $6) RETURNING assignment_id`,
                [booking_id, new_staff_profile_id, shift_slot_id, standing?.daily_rate || 0, new_date, reschedule.reschedule_id]
            );
            makeupAssignmentId = newAssignmentRes.rows[0].assignment_id;
        }

        await client.query(
            `UPDATE shift_reschedules SET assignment_id = $1 WHERE reschedule_id = $2`,
            [makeupAssignmentId, reschedule.reschedule_id]
        );

        await client.query('COMMIT');

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'SHIFT_OCCURRENCE_RESCHEDULED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { shift_slot_id, original_date, new_date, reason: reason || null },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(201).json({
            status: 'success',
            data: { ...reschedule, assignment_id: makeupAssignmentId }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Reschedule shift occurrence error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to reschedule shift' });
    } finally {
        client.release();
    }
};

/**
 * @route   POST /api/bookings/:booking_id/shift-occurrences/:reschedule_id/cancel
 * @desc    Cancels a pending reschedule — the original occurrence becomes normal
 *          again (no longer "moved"), and the makeup occurrence disappears. Only
 *          allowed while neither side has been invoiced/paid yet.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.cancelShiftReschedule = async (req, res) => {
    const { booking_id, reschedule_id } = req.params;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const rescheduleRes = await client.query(
            `SELECT * FROM shift_reschedules WHERE reschedule_id = $1 AND booking_id = $2 AND status = 'ACTIVE' FOR UPDATE`,
            [reschedule_id, booking_id]
        );
        if (rescheduleRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Active reschedule not found' });
        }
        const reschedule = rescheduleRes.rows[0];

        const invDecided = await client.query(
            `SELECT 1 FROM booking_daily_invoices WHERE reschedule_id = $1 AND status != 'PENDING'`,
            [reschedule_id]
        );
        const attDecided = await client.query(
            `SELECT 1 FROM staff_daily_attendance WHERE reschedule_id = $1 AND salary_status != 'PENDING'`,
            [reschedule_id]
        );
        if (invDecided.rows.length > 0 || attDecided.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'This makeup shift has already been decided — it cannot be cancelled' });
        }

        await client.query(`DELETE FROM booking_daily_invoices WHERE reschedule_id = $1`, [reschedule_id]);
        await client.query(`DELETE FROM staff_daily_attendance WHERE reschedule_id = $1`, [reschedule_id]);
        await client.query(`UPDATE shift_reschedules SET status = 'CANCELLED' WHERE reschedule_id = $1`, [reschedule_id]);
        if (reschedule.assignment_id) {
            await client.query(
                `UPDATE booking_staff_assignments SET status = 'CANCELLED' WHERE assignment_id = $1 AND reschedule_id = $2`,
                [reschedule.assignment_id, reschedule_id]
            );
        }

        await client.query('COMMIT');

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'SHIFT_RESCHEDULE_CANCELLED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { reschedule_id, shift_slot_id: reschedule.shift_slot_id, original_date: reschedule.original_date },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', message: 'Reschedule cancelled' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cancel shift reschedule error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to cancel reschedule' });
    } finally {
        client.release();
    }
};

/**
 * @route   GET /api/bookings/:booking_id/shift-reschedules
 * @desc    All ACTIVE shift reschedules for a booking — lets calendars (CareTimeline,
 *          StaffCareTimeline) mark a moved-away origin date/slot distinctly instead of
 *          rendering it as a normal working day, and show the makeup occurrence on its
 *          new date. Unlike getShiftSchedule (date-range-bounded, derives full occurrence
 *          lists), this is a lightweight lookup covering the whole booking at once.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getShiftReschedules = async (req, res) => {
    const { booking_id } = req.params;
    try {
        const result = await db.query(
            `SELECT
                r.reschedule_id, r.booking_id, r.shift_slot_id,
                r.original_date::text, r.new_date::text, r.new_start_time::text,
                r.assignment_id, r.reason, r.status,
                ss.shift_number, ss.label as shift_label,
                sp.full_name as makeup_staff_name,
                -- Cancelling a reschedule is only allowed while neither side of
                -- the makeup shift has been decided yet (mirrors cancelShiftReschedule's
                -- own guard) — surfaced here so the UI can disable/hide the action
                -- instead of letting the admin hit the 409.
                COALESCE(bdi.status != 'PENDING', false) OR COALESCE(sda.salary_status != 'PENDING', false) as decided
             FROM shift_reschedules r
             LEFT JOIN booking_shift_slots ss ON ss.shift_slot_id = r.shift_slot_id
             LEFT JOIN booking_staff_assignments bsa ON bsa.assignment_id = r.assignment_id
             LEFT JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
             LEFT JOIN booking_daily_invoices bdi ON bdi.reschedule_id = r.reschedule_id
             LEFT JOIN staff_daily_attendance sda ON sda.reschedule_id = r.reschedule_id
             WHERE r.booking_id = $1 AND r.status = 'ACTIVE'
             ORDER BY r.original_date ASC`,
            [booking_id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Get shift reschedules error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch shift reschedules' });
    }
};

/**
 * @route   PATCH /api/bookings/:booking_id/invoicing-mode
 * @desc    Toggle a LIVE_IN booking between automatic nightly invoicing and manual
 *          per-day confirmation. Only applicable to LIVE_IN bookings — other service
 *          models are always manual.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 * @body    invoicing_mode ('AUTO' | 'MANUAL')
 */
exports.updateInvoicingMode = async (req, res) => {
    const { booking_id } = req.params;
    const { invoicing_mode } = req.body;

    if (!['AUTO', 'MANUAL'].includes(invoicing_mode)) {
        return res.status(400).json({ status: 'error', message: "invoicing_mode must be 'AUTO' or 'MANUAL'" });
    }

    try {
        const bookingRes = await db.query(
            `SELECT booking_id, service_model FROM bookings WHERE booking_id = $1`,
            [booking_id]
        );

        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }

        if (bookingRes.rows[0].service_model !== 'LIVE_IN') {
            return res.status(400).json({
                status: 'error',
                message: 'Only LIVE_IN bookings support an invoicing mode toggle — other service models are always manual'
            });
        }

        const result = await db.query(
            `UPDATE bookings SET invoicing_mode = $1 WHERE booking_id = $2 RETURNING booking_id, invoicing_mode`,
            [invoicing_mode, booking_id]
        );

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'INVOICING_MODE_UPDATED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { invoicing_mode },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Update invoicing mode error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update invoicing mode' });
    }
};

/**
 * @route   PATCH /api/bookings/:booking_id/rates
 * @desc    Update the CLIENT-facing billing rate(s) on a booking — daily_rate
 *          (LIVE_IN/VISITING), shift_rate (SHIFT_BASED), and/or ot_rate. These
 *          feed billingService.js's invoice calculations going forward; they do
 *          NOT touch what any staff member is paid (see booking_staff_assignments.daily_rate,
 *          updated instead via PUT /api/assignments/assignment/:assignment_id).
 * @access  Private (gated by BOOKING_UPDATE_RATE)
 * @body    daily_rate (optional), shift_rate (optional), ot_rate (optional) — at least one required
 */
exports.updateBookingRates = async (req, res) => {
    const { booking_id } = req.params;
    const { daily_rate, shift_rate, ot_rate } = req.body;

    if (daily_rate === undefined && shift_rate === undefined && ot_rate === undefined) {
        return res.status(400).json({ status: 'error', message: 'At least one of daily_rate, shift_rate, or ot_rate is required' });
    }

    for (const [label, value] of [['daily_rate', daily_rate], ['shift_rate', shift_rate], ['ot_rate', ot_rate]]) {
        if (value !== undefined && (Number.isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
            return res.status(400).json({ status: 'error', message: `${label} must be a non-negative number` });
        }
    }

    try {
        const beforeRes = await db.query(
            `SELECT booking_id, daily_rate, shift_rate, ot_rate FROM bookings WHERE booking_id = $1`,
            [booking_id]
        );
        if (beforeRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        const before = beforeRes.rows[0];

        const fields = [];
        const values = [];
        let p = 1;
        if (daily_rate !== undefined) { fields.push(`daily_rate = $${p}`); values.push(parseFloat(daily_rate)); p++; }
        if (shift_rate !== undefined) { fields.push(`shift_rate = $${p}`); values.push(parseFloat(shift_rate)); p++; }
        if (ot_rate !== undefined) { fields.push(`ot_rate = $${p}`); values.push(parseFloat(ot_rate)); p++; }
        values.push(booking_id);

        const result = await db.query(
            `UPDATE bookings SET ${fields.join(', ')} WHERE booking_id = $${p} RETURNING booking_id, daily_rate, shift_rate, ot_rate`,
            values
        );

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'BOOKING_RATE_UPDATED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: {
                before: { daily_rate: before.daily_rate, shift_rate: before.shift_rate, ot_rate: before.ot_rate },
                after: result.rows[0],
            },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Update booking rates error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update booking rates' });
    }
};

exports.updateHospitalizationStatus = async (req, res) => {
    const { booking_id } = req.params;
    const { is_hospitalized, hospital_name } = req.body;

    if (typeof is_hospitalized !== 'boolean') {
        return res.status(400).json({ status: 'error', message: 'is_hospitalized must be a boolean' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(
            `SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [booking_id]
        );

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }

        // hospital_name only means something while is_hospitalized is true — clear it
        // whenever the toggle is switched off so a stale name never lingers.
        const resolvedHospitalName = is_hospitalized ? (hospital_name || null) : null;
        const businessDate = await getBusinessDate(client);

        // Maintain the day-by-day history in booking_hospitalizations so the care
        // timeline can mark exactly which days were hospitalized. The day a period is
        // closed still counts as hospitalized (ended_date is inclusive) — only the
        // following day onward drops the marker.
        const openPeriodRes = await client.query(
            `SELECT hospitalization_id FROM booking_hospitalizations
             WHERE booking_id = $1 AND ended_date IS NULL
             ORDER BY started_date DESC LIMIT 1`,
            [booking_id]
        );
        const openPeriod = openPeriodRes.rows[0] || null;

        if (is_hospitalized) {
            if (openPeriod) {
                await client.query(
                    `UPDATE booking_hospitalizations SET hospital_name = $1 WHERE hospitalization_id = $2`,
                    [resolvedHospitalName, openPeriod.hospitalization_id]
                );
            } else {
                await client.query(
                    `INSERT INTO booking_hospitalizations (booking_id, hospital_name, started_date)
                     VALUES ($1, $2, $3)`,
                    [booking_id, resolvedHospitalName, businessDate]
                );
            }
        } else if (openPeriod) {
            await client.query(
                `UPDATE booking_hospitalizations SET ended_date = $1 WHERE hospitalization_id = $2`,
                [businessDate, openPeriod.hospitalization_id]
            );
        }

        const result = await client.query(
            `UPDATE bookings SET is_hospitalized = $1, hospital_name = $2 WHERE booking_id = $3
             RETURNING booking_id, is_hospitalized, hospital_name`,
            [is_hospitalized, resolvedHospitalName, booking_id]
        );

        await client.query('COMMIT');

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'HOSPITALIZATION_STATUS_UPDATED',
            entityType: 'BOOKING',
            entityId: String(booking_id),
            details: { is_hospitalized, hospital_name: resolvedHospitalName },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update hospitalization status error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update hospitalization status' });
    } finally {
        client.release();
    }
};

// 3. Retrieve all active bookings (status = 'ACTIVE')
exports.getActiveBookings = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM bookings WHERE status = $1 ORDER BY created_at DESC',
            ['ACTIVE']
        );

        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching active bookings' });
    }
};

exports.requestTermination = async (req, res) => {
    const { booking_id } = req.params;
    const { urgency, requested_end_date, reason } = req.body;

    // Validate urgency input
    const validUrgencies = ['TODAY', 'FUTURE', 'IMMEDIATE'];
    if (!validUrgencies.includes(urgency)) {
        return res.status(400).json({ message: "Invalid urgency level. Must be TODAY, FUTURE, or IMMEDIATE." });
    }

    if (urgency === 'FUTURE' && !requested_end_date) {
        return res.status(400).json({ message: "A requested_end_date is required for FUTURE terminations." });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verify the booking exists and is currently ACTIVE
        const bookingRes = await client.query(
            `SELECT status, client_id FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [booking_id]
        );

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Booking not found." });
        }

        const booking = bookingRes.rows[0];

        if (booking.status !== 'ACTIVE') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `Cannot request termination. Booking is currently in '${booking.status}' status.`
            });
        }

        // 2. Determine the exact requested timestamp
        let targetEndDate;
        if (urgency === 'IMMEDIATE') {
            targetEndDate = new Date(); // Right now
        } else if (urgency === 'TODAY') {
            // Set to 11:59:59 PM of today
            targetEndDate = new Date();
            targetEndDate.setHours(23, 59, 59, 999);
        } else {
            targetEndDate = new Date(requested_end_date);
        }

        // 3. Insert the Termination Request
        const insertReqQuery = `
            INSERT INTO service_terminations (
                booking_id, requested_by, urgency, requested_end_date, reason, status
            ) VALUES ($1, 'CLIENT', $2, $3, $4, 'PENDING')
            RETURNING termination_id, termination_code;
        `;
        const termRes = await client.query(insertReqQuery, [
            booking_id, urgency, targetEndDate, reason
        ]);

        // 4. Update the Booking Status to PENDING_TERMINATION
        await client.query(
            `UPDATE bookings SET status = 'PENDING_TERMINATION' WHERE booking_id = $1`,
            [booking_id]
        );

        await client.query('COMMIT');

        const terminationCode = termRes.rows[0].termination_code;

        // Notify client via WhatsApp (fire-and-forget)
        (async () => {
            try {
                const clientRes = await db.query(
                    `SELECT u.mobile_number, cp.full_name
                     FROM client_profiles cp
                     JOIN users u ON cp.user_id = u.user_id
                     WHERE cp.client_profile_id = $1`,
                    [booking.client_id]
                );
                if (clientRes.rows.length > 0) {
                    const { mobile_number, full_name } = clientRes.rows[0];
                    const endDateStr = targetEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                    await sendClientTerminationRequested(mobile_number, full_name, terminationCode, endDateStr);
                }
            } catch (e) {
                console.error('[requestTermination] WhatsApp notify error:', e.message);
            }
        })();

        res.status(201).json({
            status: 'success',
            message: "Termination request submitted successfully. Our team will review and confirm shortly.",
            data: {
                termination_id: termRes.rows[0].termination_id,
                termination_code: termRes.rows[0].termination_code,
                target_end_date: targetEndDate
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Termination Request Error:", error);
        res.status(500).json({ message: "Failed to process termination request." });
    } finally {
        client.release();
    }
};

exports.getPendingTerminationRequests = async (req, res) => {
    try {
        const query = `
            SELECT
                st.termination_id,
                st.termination_code,
                st.urgency,
                st.requested_end_date,
                st.reason,
                st.created_at as request_date,
                b.booking_id,
                b.booking_code,
                b.start_date,
                b.service_type,
                c.full_name as client_name,
                c.primary_address as location,
                p.full_name as patient_name,
                s.staff_profile_id,
                s.full_name as staff_name,
                COALESCE(fin.total_paid, 0) AS total_paid,
                COALESCE(fin.total_invoiced, 0) AS total_invoiced,
                COALESCE(fin.total_paid, 0) - COALESCE(fin.total_invoiced, 0) AS remaining_balance
            FROM service_terminations st
            JOIN bookings b ON st.booking_id = b.booking_id
            JOIN client_profiles c ON b.client_id = c.client_profile_id
            JOIN patient_profiles p ON b.patient_id = p.patient_id
            JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
            LEFT JOIN (
                SELECT
                    booking_id,
                    COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') <> 'STAFF_SALARY' THEN amount ELSE 0 END), 0) AS total_paid,
                    COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_invoiced
                FROM transactions
                GROUP BY booking_id
            ) fin ON fin.booking_id = b.booking_id
            WHERE st.status = 'PENDING'
            ORDER BY
                CASE WHEN st.urgency = 'IMMEDIATE' THEN 1
                     WHEN st.urgency = 'TODAY' THEN 2
                     ELSE 3 END,
                st.created_at ASC;
        `;

        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error("Get Pending Terminations Error:", error);
        res.status(500).json({ message: "Failed to fetch termination requests." });
    }
};

exports.getTerminationHistory = async (req, res) => {
    try {
        const query = `
            SELECT
                st.termination_id,
                st.termination_code,
                st.urgency,
                st.requested_end_date,
                st.end_date as official_end_date,
                st.status,
                st.reason,
                st.rejection_reason,
                st.created_at as request_date,
                b.booking_id,
                b.booking_code,
                b.start_date,
                b.service_type,
                c.full_name as client_name,
                c.primary_address as location,
                p.full_name as patient_name,
                s.staff_profile_id,
                s.full_name as staff_name,
                COALESCE(fin.total_paid, 0) AS total_paid,
                COALESCE(fin.total_invoiced, 0) AS total_invoiced,
                COALESCE(fin.total_paid, 0) - COALESCE(fin.total_invoiced, 0) AS remaining_balance
            FROM service_terminations st
            JOIN bookings b ON st.booking_id = b.booking_id
            JOIN client_profiles c ON b.client_id = c.client_profile_id
            JOIN patient_profiles p ON b.patient_id = p.patient_id
            JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
            LEFT JOIN (
                SELECT
                    booking_id,
                    COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') <> 'STAFF_SALARY' THEN amount ELSE 0 END), 0) AS total_paid,
                    COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_invoiced
                FROM transactions
                GROUP BY booking_id
            ) fin ON fin.booking_id = b.booking_id
            WHERE st.status != 'PENDING'
            ORDER BY st.created_at DESC;
        `;

        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error("Get Termination History Error:", error);
        res.status(500).json({ message: "Failed to fetch termination history." });
    }
};

exports.approveTerminationRequest = async (req, res) => {
    const { termination_id } = req.params;
    const { final_end_date, settlement_action = 'WALLET_DEPOSIT', settlement_note } = req.body;

    // This endpoint previously accepted any settlement_action unchecked. Each one
    // now moves money differently (see VALID_BOOKING_SETTLEMENT_ACTIONS), so it is
    // validated here the same way finalizeBookingState does.
    if (!VALID_BOOKING_SETTLEMENT_ACTIONS.includes(settlement_action)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid settlement_action. Must be one of: ${VALID_BOOKING_SETTLEMENT_ACTIONS.join(', ')}`,
            allowed_actions: VALID_BOOKING_SETTLEMENT_ACTIONS,
        });
    }

    if (settlement_action === 'NO_REFUND' && !settlement_note) {
        return res.status(400).json({
            status: 'error',
            message: 'settlement_note is required when waiving the balance as income',
        });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch the Termination and Booking Data
        const termRes = await client.query(
            `SELECT st.*, b.assigned_staff_id, b.client_id, b.start_date, b.status as booking_status
             FROM service_terminations st
             JOIN bookings b ON st.booking_id = b.booking_id
             WHERE st.termination_id = $1 FOR UPDATE`,
            [termination_id]
        );

        if (termRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Termination request not found." });
        }

        const request = termRes.rows[0];

        if (request.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `Request is already ${request.status}.` });
        }

        // Determine the official end time (Admin override or the requested date)
        const officialEndDate = final_end_date ? new Date(final_end_date) : new Date(request.requested_end_date);
        const businessDate = await getBusinessDate(client);

        if (isFutureDate(toDateStr(officialEndDate), businessDate)) {
            // ── FUTURE: defer execution, keep the booking running/billed until then ──
            const alreadyScheduled = await hasOpenAction(client, request.booking_id, 'TERMINATION');
            if (alreadyScheduled) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: "A termination is already scheduled for this booking." });
            }

            await client.query(
                `UPDATE service_terminations SET status = 'SCHEDULED', end_date = $1 WHERE termination_id = $2`,
                [officialEndDate, termination_id]
            );

            if (request.booking_status === 'PENDING_TERMINATION') {
                await client.query(`UPDATE bookings SET status = 'ACTIVE' WHERE booking_id = $1`, [request.booking_id]);
            }

            await enqueueScheduledAction(client, {
                booking_id: request.booking_id,
                action_type: 'TERMINATION',
                effective_date: officialEndDate,
                payload: { settlement_action, settlement_note: settlement_note || null },
                termination_id,
                created_by: req.user?.user_id || null,
            });

            await client.query('COMMIT');

            logActivity({
                actorUserId: req.user?.user_id,
                actorRole: req.user?.role,
                actionType: 'TERMINATION_APPROVED',
                entityType: 'BOOKING',
                entityId: String(request.booking_id),
                details: { termination_id, scheduled: true, effective_date: toDateStr(officialEndDate), settlement_action },
            }).catch(err => console.error('Activity log failed:', err));

            return res.status(200).json({
                status: 'success',
                scheduled: true,
                message: `Termination scheduled for ${toDateStr(officialEndDate)}. The booking stays active and billed until then.`,
                data: { termination_id, booking_id: request.booking_id, effective_date: toDateStr(officialEndDate) }
            });
        }

        // ── TODAY / PAST: execute immediately ──
        const actorUserId = req.user?.user_id;
        const actorRole = extractActorRole(req.user?.role);
        const actorName = await getActorName(actorUserId);

        const { notify } = await executeTermination(client, {
            booking_id: request.booking_id,
            end_date: officialEndDate,
            settlement_action,
            settlement_note: settlement_note || null,
            termination_id,
            actorLabel: 'Admin approved termination',
            actor: { user_id: actorUserId, name: actorName, role: actorRole },
        });

        await client.query('COMMIT');

        notify();

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: req.user?.role,
            actionType: 'TERMINATION_APPROVED',
            entityType: 'BOOKING',
            entityId: String(request.booking_id),
            details: { termination_id, scheduled: false, effective_date: toDateStr(officialEndDate), settlement_action },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({
            status: 'success',
            message: "Termination approved. Staff is now available and billing is finalized."
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Approve Termination Error:", error);
        res.status(500).json({ message: "Failed to approve termination request." });
    } finally {
        client.release();
    }
};

exports.rejectTerminationRequest = async (req, res) => {
    const { termination_id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
        return res.status(400).json({ status: 'error', message: 'A reason is required when rejecting a termination request.' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const termRes = await client.query(
            `SELECT st.*, b.client_id, b.status as booking_status
             FROM service_terminations st
             JOIN bookings b ON st.booking_id = b.booking_id
             WHERE st.termination_id = $1 FOR UPDATE`,
            [termination_id]
        );

        if (termRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Termination request not found.' });
        }

        const request = termRes.rows[0];

        if (request.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Request is already ${request.status}.` });
        }

        await client.query(
            `UPDATE service_terminations
             SET status = 'REJECTED', rejection_reason = $1, reviewed_by = $2, reviewed_at = NOW()
             WHERE termination_id = $3`,
            [reason.trim(), req.user?.user_id || null, termination_id]
        );

        // The booking was parked as PENDING_TERMINATION while this request was open — restore it.
        if (request.booking_status === 'PENDING_TERMINATION') {
            await client.query(`UPDATE bookings SET status = 'ACTIVE' WHERE booking_id = $1`, [request.booking_id]);
        }

        await client.query('COMMIT');

        // Notify the client (fire-and-forget, non-blocking)
        (async () => {
            try {
                const clientRes = await db.query(
                    `SELECT u.mobile_number, cp.full_name
                     FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id
                     WHERE cp.client_profile_id = $1`,
                    [request.client_id]
                );
                if (clientRes.rows.length > 0) {
                    const { mobile_number, full_name } = clientRes.rows[0];
                    await sendSms(
                        mobile_number,
                        `VCare: Hi ${full_name}, your termination request (${request.termination_code}) was not approved. Reason: ${reason.trim()}. Please contact us if you have questions.`
                    );
                }
            } catch (e) {
                console.error('[rejectTerminationRequest] notify error:', e.message);
            }
        })();

        try {
            const actorRole = extractActorRole(req.user?.role);
            const actorName = await getActorName(req.user?.user_id);
            await logActivity({
                actorUserId: req.user?.user_id,
                actorName,
                actorRole,
                actionType: 'TERMINATION_REJECTED',
                entityType: 'booking',
                entityId: String(request.booking_id),
                details: { termination_id, booking_id: request.booking_id, reason: reason.trim() },
            });
        } catch (e) {
            console.error('[rejectTerminationRequest] activity log error:', e.message);
        }

        res.status(200).json({
            status: 'success',
            message: 'Termination request rejected. The booking remains active.'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Reject Termination Error:", error);
        res.status(500).json({ status: 'error', message: "Failed to reject termination request." });
    } finally {
        client.release();
    }
};

exports.forceStopBooking = async (req, res) => {
    const { booking_id } = req.params;
    // Admin can specify an exact date/time, or default to right now.
    // They can also type in the reason the client gave over the phone.
    const { target_end_date, reason, settlement_action, settlement_note } = req.body || {};

    if (settlement_action && !VALID_BOOKING_SETTLEMENT_ACTIONS.includes(settlement_action)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid settlement_action. Must be one of: ${VALID_BOOKING_SETTLEMENT_ACTIONS.join(', ')}`,
        });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch the Booking to ensure it exists and get the staff ID
        const bookingRes = await client.query(
            `SELECT status, assigned_staff_id, client_id, start_date 
             FROM bookings 
             WHERE booking_id = $1 FOR UPDATE`,
            [booking_id]
        );

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Booking not found." });
        }

        const booking = bookingRes.rows[0];

        // If it's already terminated, stop here.
        if (booking.status === 'TERMINATED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "This booking is already terminated." });
        }

        // Determine the official cut-off time
        const officialEndDate = target_end_date ? new Date(target_end_date) : new Date();
        const businessDate = await getBusinessDate(client);
        const isFuture = isFutureDate(toDateStr(officialEndDate), businessDate);

        if (isFuture) {
            const alreadyScheduled = await hasOpenAction(client, booking_id, 'TERMINATION');
            if (alreadyScheduled) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: "A termination is already scheduled for this booking." });
            }
        }

        // 2. Handle the Paper Trail (service_terminations)
        // Let's check if the client already had a 'PENDING' request that the admin is just force-clearing
        const pendingTermRes = await client.query(
            `SELECT termination_id FROM service_terminations
             WHERE booking_id = $1 AND status = 'PENDING' FOR UPDATE`,
            [booking_id]
        );

        let termination_id;
        if (pendingTermRes.rows.length > 0) {
            // Client requested it earlier, Admin is approving it now via Force Stop
            termination_id = pendingTermRes.rows[0].termination_id;
            await client.query(
                `UPDATE service_terminations
                 SET status = $1, end_date = $2, reason = COALESCE($3, reason)
                 WHERE termination_id = $4`,
                [isFuture ? 'SCHEDULED' : 'APPROVED', officialEndDate, reason, termination_id]
            );
        } else {
            // Admin is doing this entirely manually over the phone, so we create the log
            const insertRes = await client.query(
                `INSERT INTO service_terminations (
                    booking_id, requested_by, urgency, requested_end_date, end_date, reason, status
                ) VALUES ($1, 'ADMIN', $2, $3, $3, $4, $5)
                RETURNING termination_id`,
                [
                    booking_id,
                    isFuture ? 'FUTURE' : 'IMMEDIATE',
                    officialEndDate,
                    reason || 'Admin forced stop via phone request',
                    isFuture ? 'SCHEDULED' : 'APPROVED'
                ]
            );
            termination_id = insertRes.rows[0].termination_id;
        }

        if (isFuture) {
            // Defer execution: keep the booking running/billed until the target date.
            await enqueueScheduledAction(client, {
                booking_id,
                action_type: 'TERMINATION',
                effective_date: officialEndDate,
                payload: {
                    settlement_action: settlement_action || 'WALLET_DEPOSIT',
                    settlement_note: settlement_note || null,
                },
                reason: reason || null,
                termination_id,
                created_by: req.user?.user_id || null,
            });

            await client.query('COMMIT');

            return res.status(200).json({
                status: 'success',
                scheduled: true,
                message: `Service stop scheduled for ${toDateStr(officialEndDate)}. The booking stays active until then.`,
                data: { booking_id, termination_id, effective_date: toDateStr(officialEndDate) }
            });
        }

        // 3. Terminate the Booking
        await client.query(
            `UPDATE bookings 
     SET status = 'TERMINATED', actual_end_time = $2
     WHERE booking_id = $1`,
            [booking_id, officialEndDate]
        );
        // 4. Free up the Staff Member!
        // Key off the assignment record, not bookings.assigned_staff_id: a future-dated
        // SCHEDULED assignment reserves the staff (current_status = 'ASSIGNED') without
        // ever setting assigned_staff_id, so terminating before the start date would
        // otherwise strand the staff member as ASSIGNED forever.
        await client.query(
            `UPDATE staff_profiles sp
             SET current_status = 'AVAILABLE'
             FROM booking_staff_assignments bsa
             WHERE bsa.booking_id = $1
               AND bsa.status IN ('ACTIVE', 'SCHEDULED')
               AND sp.staff_profile_id = bsa.staff_profile_id`,
            [booking_id]
        );

        // Close those assignments (ACTIVE and not-yet-started SCHEDULED) with the end date.
        await client.query(
            `UPDATE booking_staff_assignments
             SET service_end_date = $1, status = 'COMPLETED'
             WHERE booking_id = $2 AND status IN ('ACTIVE', 'SCHEDULED')`,
            [officialEndDate.toISOString().split('T')[0], booking_id]
        );

        // Cancel any pending future-assignment activation so the cron can't
        // re-reserve staff for a booking that has now ended.
        await client.query(
            `UPDATE scheduled_actions
             SET status = 'CANCELLED'
             WHERE booking_id = $1 AND action_type = 'ASSIGNMENT_START' AND status = 'SCHEDULED'`,
            [booking_id]
        );

        // =========================================================
        // 5. FINANCIAL SETTLEMENT
        // Routed through the shared settlement path so a force-stop honours the
        // admin's chosen action and always writes a ledger row — the same as every
        // other completion/termination. This replaces a legacy quote-based
        // `qty_days - daysWorked` calculation that credited wallet_balance directly
        // with no transaction record, always behaved as a wallet deposit whatever
        // the admin picked, and produced nothing at all for SHIFT_BASED bookings
        // (which have no qty_days and a zero daily_rate).
        // =========================================================

        const settlementSnapshot = await getBookingSettlementSnapshot(client, booking_id, officialEndDate);
        if (settlementSnapshot) {
            await applyBookingSettlement(
                client,
                settlementSnapshot,
                settlement_action || 'WALLET_DEPOSIT',
                settlement_note || null,
                reason || null,
                'Admin force stop'
            );
        }

        await client.query('COMMIT');

        // Fire-and-forget: notify client and staff
        (async () => {
            try {
                const endDateStr = officialEndDate.toLocaleDateString('en-GB');

                const infoRes = await db.query(
                    `SELECT
                        cp.full_name AS client_name, cu.mobile_number AS client_mobile,
                        sp.full_name AS staff_name, su.mobile_number AS staff_mobile,
                        sr.patient_name
                     FROM bookings b
                     JOIN client_profiles cp ON cp.client_profile_id = b.client_id
                     JOIN users cu ON cu.user_id = cp.user_id
                     LEFT JOIN staff_profiles sp ON sp.staff_profile_id = b.assigned_staff_id
                     LEFT JOIN users su ON su.user_id = sp.user_id
                     LEFT JOIN service_requests sr ON sr.request_id = b.request_id
                     WHERE b.booking_id = $1`,
                    [booking_id]
                );

                if (infoRes.rows.length > 0) {
                    const { client_name, client_mobile, staff_name, staff_mobile, patient_name } = infoRes.rows[0];
                    const patientDisplay = patient_name || 'the patient';
                    const notifications = [];

                    if (client_mobile) {
                        notifications.push(
                            sendClientForceTerminated(client_mobile, client_name, patientDisplay, endDateStr),
                            sendSms(client_mobile,
                                `VCare: Hi ${client_name}, your care arrangement for ${patientDisplay} has been ended effective ${endDateStr}. Please contact us if you have any questions.`
                            )
                        );
                    }

                    if (staff_mobile) {
                        notifications.push(
                            sendStaffForceTerminated(staff_mobile, staff_name, patientDisplay, endDateStr),
                            sendSms(staff_mobile,
                                `VCare: Hi ${staff_name}, your assignment for ${patientDisplay} has been ended effective ${endDateStr}. Please contact the VCare office to confirm your availability.`
                            )
                        );
                    }

                    await Promise.allSettled(notifications);
                }
            } catch (e) {
                console.error('[forceStopBooking] Post-commit notification error:', e.message);
            }
        })();

        res.status(200).json({
            status: 'success',
            message: "Service forcefully stopped. Staff member is now available.",
            data: {
                booking_id,
                end_date: officialEndDate
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Force Stop Error:", error);
        res.status(500).json({ message: "Failed to force stop the service." });
    } finally {
        client.release();
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const salespersonId = req.user?.salesperson_id;
        const salesFilter = salespersonId
            ? 'WHERE b.booking_id IN (SELECT booking_id FROM booking_salesperson_assignments WHERE salesperson_id = $1)'
            : '';
        const query = `
            SELECT
                b.booking_id,
                b.booking_code,
                b.service_type,
                b.service_model,
                b.start_date,
                b.status,
                b.preferred_gender,
                b.created_at,
                b.service_mode,
                b.scheduled_end_time,
                b.actual_end_time,
                b.ot_rate,
                b.daily_rate,
                b.is_hospitalized,
                b.hospital_name,
                c.client_profile_id,
                c.full_name as client_name,
                c.primary_address as client_address,
                uc.mobile_number as client_mobile,
                p.patient_id,
                p.full_name as patient_name,
                p.age as patient_age,
                p.relationship_to_client,
                p.medical_condition,
                s.staff_profile_id,
                s.full_name as staff_name,
                us.mobile_number as staff_mobile,
                s.profile_picture_url,
                us.email as staff_email,
                CASE
                    WHEN b.status = 'ACTIVE' AND b.daily_rate > 0 THEN
                        ROUND(
                            (COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0))
                            / b.daily_rate, 1
                        )
                    ELSE NULL
                END AS balance_days_remaining,
                CASE
                    WHEN b.status = 'ACTIVE'
                    AND b.daily_rate > 0
                    AND (COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0)) / b.daily_rate <= 1
                    THEN true
                    ELSE false
                END AS is_expiring_soon
            FROM bookings b
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN users uc ON c.user_id = uc.user_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
            LEFT JOIN users us ON s.user_id = us.user_id
            LEFT JOIN (
                SELECT
                    booking_id,
                    COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') != 'STAFF_SALARY' THEN amount ELSE 0 END), 0) AS total_paid,
                    COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_invoiced
                FROM transactions
                GROUP BY booking_id
            ) bill ON bill.booking_id = b.booking_id
            ${salesFilter}
            ORDER BY b.created_at DESC
        `;

        const result = await db.query(query, salespersonId ? [salespersonId] : []);

        res.status(200).json({
            status: 'success',
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error("Get All Bookings Error:", error);
        res.status(500).json({ message: 'Failed to fetch all bookings' });
    }
};

exports.extendBooking = async (req, res) => {
  const { booking_id } = req.params;
  const { additional_days, payment_amount, payment_method, notes } = req.body;

  if (!additional_days || additional_days <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid additional_days value' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch the booking
    const bookingRes = await client.query(
      `SELECT * FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [booking_id]
    );

    if (!bookingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];

    if (booking.service_model === 'SHIFT_BASED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'SHIFT_BASED bookings have no booking end date to extend. Use mark-overdue / resolve-overdue instead.'
      });
    }

    if (!['ACTIVE', 'OVERDUE'].includes(booking.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Cannot extend a booking with status ${booking.status}`
      });
    }

    // Calculate new scheduled_end_time
    // If overdue, extend from NOW rather than the old expired scheduled_end_time
    const baseDate = booking.status === 'OVERDUE' ? new Date() : new Date(booking.scheduled_end_time);
    const newScheduledEndTime = new Date(baseDate);
    newScheduledEndTime.setDate(newScheduledEndTime.getDate() + parseInt(additional_days));

    // Update the booking
    await client.query(
      `UPDATE bookings 
       SET scheduled_end_time = $1, status = 'ACTIVE'
       WHERE booking_id = $2`,
      [newScheduledEndTime, booking_id]
    );

    // Record the payment transaction if amount provided. In practice a
    // booking can only be extended once ACTIVE, meaning its registration fee
    // is already settled — but resolve/split defensively anyway rather than
    // assume, since computeRegFeeSplit is a cheap no-op once reg_fee_status
    // is PAID/WAIVED.
    if (payment_amount && payment_amount > 0) {
      const quoteRes = await client.query(
        `SELECT sr.active_quote_id as quote_id
           FROM service_requests sr WHERE sr.request_id = $1`,
        [booking.request_id]
      );
      const extendQuoteId = quoteRes.rows[0]?.quote_id || null;

      const regFeeSplit = extendQuoteId
        ? await computeRegFeeSplit(client, {
            client_id: booking.client_id,
            quote_id: extendQuoteId,
            amount: parseFloat(payment_amount),
            totalPaidBefore: parseFloat(booking.amount_paid || 0),
          })
        : { regFeePortion: 0, remainderAmount: payment_amount, regFeeItem: null };

      if (regFeeSplit.regFeePortion > 0) {
        await client.query(
          `INSERT INTO transactions (
            client_id, booking_id, quote_id, category, transaction_type,
            amount, payment_method, status, notes
          ) VALUES ($1, $2, $3, 'REGISTRATION_FEE', 'CREDIT', $4, $5, 'COMPLETED', $6)`,
          [
            booking.client_id,
            booking_id,
            extendQuoteId,
            regFeeSplit.regFeePortion,
            payment_method || 'BANK_TRANSFER',
            notes || `Booking extended by ${additional_days} days`
          ]
        );
      }

      if (regFeeSplit.remainderAmount > 0) {
        await client.query(
          `INSERT INTO transactions (
            client_id, booking_id, category, transaction_type,
            amount, payment_method, status, notes
          ) VALUES ($1, $2, 'CLIENT_PAYMENT', 'CREDIT', $3, $4, 'COMPLETED', $5)`,
          [
            booking.client_id,
            booking_id,
            regFeeSplit.remainderAmount,
            payment_method || 'BANK_TRANSFER',
            notes || `Booking extended by ${additional_days} days`
          ]
        );
      }

      if (regFeeSplit.regFeeItem) {
        const newTotalPaid = parseFloat(booking.amount_paid || 0) + parseFloat(payment_amount);
        if (newTotalPaid >= parseFloat(regFeeSplit.regFeeItem.amount)) {
          try {
            await settleRegistrationFee(client, {
              client_id: booking.client_id,
              regFeeItem: regFeeSplit.regFeeItem,
              verified_by: req.user?.user_id || null,
              creditSalespersonForRegistration,
            });
          } catch (regFeeErr) {
            console.error('Registration fee settlement check failed (extendBooking):', regFeeErr.message);
          }
        }
      }
    }

    await client.query('COMMIT');

    res.status(200).json({
      status: 'success',
      message: `Booking extended by ${additional_days} days.`,
      data: {
        booking_id,
        new_scheduled_end_time: newScheduledEndTime,
        status: 'ACTIVE'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('extendBooking error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to extend booking' });
  } finally {
    client.release();
  }
};

/**
 * @route   POST /api/bookings/:booking_id/mark-overdue
 * @desc    Manual overdue flag for SHIFT_BASED bookings. There is no automatic
 *          cron-driven overdue detection for this model (the day-level paid-vs-
 *          delivered comparison is only an approximation — the Shift Bank ledger
 *          is authoritative). An admin who sees more shifts delivered than paid
 *          for picks the date it went over and flags the booking OVERDUE by hand.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.markShiftBookingOverdue = async (req, res) => {
  const { booking_id } = req.params;
  const { as_of_date, reason } = req.body;

  if (!as_of_date) {
    return res.status(400).json({ status: 'error', message: 'as_of_date is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT booking_id, client_id, service_model, status FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [booking_id]
    );
    if (!bookingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    if (booking.service_model !== 'SHIFT_BASED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Manual overdue marking only applies to SHIFT_BASED bookings' });
    }
    if (!['ACTIVE', 'OVERDUE'].includes(booking.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Cannot mark a booking with status ${booking.status} as overdue` });
    }

    await client.query(`UPDATE bookings SET status = 'OVERDUE' WHERE booking_id = $1`, [booking_id]);

    await client.query(
      `INSERT INTO client_alerts (booking_id, client_id, alert_type, message, sent_at)
       VALUES ($1, $2, 'MANUAL_OVERDUE', $3, NOW())`,
      [
        booking_id,
        booking.client_id,
        `Manually flagged overdue as of ${as_of_date} by ${req.user?.email || req.user?.mobile_number || 'admin'}${reason ? ` — ${reason}` : ''}`
      ]
    );

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'BOOKING_MARKED_OVERDUE',
      entityType: 'BOOKING',
      entityId: String(booking_id),
      details: { as_of_date, reason: reason || null },
    }).catch(err => console.error('Activity log failed:', err));

    res.status(200).json({ status: 'success', message: 'Booking flagged as OVERDUE', data: { booking_id, status: 'OVERDUE' } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('markShiftBookingOverdue error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to mark booking overdue' });
  } finally {
    client.release();
  }
};

/**
 * @route   POST /api/bookings/:booking_id/resolve-overdue
 * @desc    Clears a manually-set OVERDUE flag on a SHIFT_BASED booking back to
 *          ACTIVE (e.g. once the client tops up payment). Purely manual, mirrors
 *          markShiftBookingOverdue.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.resolveShiftBookingOverdue = async (req, res) => {
  const { booking_id } = req.params;
  const { notes } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT booking_id, client_id, service_model, status FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [booking_id]
    );
    if (!bookingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Booking not found' });
    }
    const booking = bookingRes.rows[0];

    if (booking.service_model !== 'SHIFT_BASED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Manual overdue resolution only applies to SHIFT_BASED bookings' });
    }
    if (booking.status !== 'OVERDUE') {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Booking is not currently OVERDUE' });
    }

    await client.query(`UPDATE bookings SET status = 'ACTIVE' WHERE booking_id = $1`, [booking_id]);

    await client.query(
      `INSERT INTO client_alerts (booking_id, client_id, alert_type, message, sent_at)
       VALUES ($1, $2, 'MANUAL_OVERDUE_RESOLVED', $3, NOW())`,
      [
        booking_id,
        booking.client_id,
        `Overdue flag cleared by ${req.user?.email || req.user?.mobile_number || 'admin'}${notes ? ` — ${notes}` : ''}`
      ]
    );

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'BOOKING_OVERDUE_RESOLVED',
      entityType: 'BOOKING',
      entityId: String(booking_id),
      details: { notes: notes || null },
    }).catch(err => console.error('Activity log failed:', err));

    res.status(200).json({ status: 'success', message: 'Booking resolved back to ACTIVE', data: { booking_id, status: 'ACTIVE' } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('resolveShiftBookingOverdue error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to resolve overdue booking' });
  } finally {
    client.release();
  }
};

exports.swapStaff = async (req, res) => {
    const { booking_id } = req.params;
    const {
        new_staff_id,
        swap_reason,
        arrival_time,
        new_staff_start_date,
        // Optional overrides
        new_daily_rate,
        new_ot_rate,
        new_scheduled_end_time,
        // Out/in time capture — old staff's last logged out_time, new staff's first
        // logged in_time. Both optional; either can be entered for a swap that's
        // happening now, scheduled ahead, or being backfilled for a past date.
        old_staff_out_time,
        new_staff_in_time
    } = req.body;

    if (!new_staff_id) {
        return res.status(400).json({ status: 'error', message: 'new_staff_id is required' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Lock the booking row first, then fetch related display fields separately.
        const bookingLockRes = await client.query(
            `SELECT booking_id, status, assigned_staff_id, client_id, patient_id, service_model
             FROM bookings
             WHERE booking_id = $1
             FOR UPDATE`,
            [booking_id]
        );

        if (!bookingLockRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }

        const booking = bookingLockRes.rows[0];

        if (booking.service_model === 'SHIFT_BASED') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'SHIFT_BASED bookings have multiple concurrent staff per shift. Use POST /api/bookings/:booking_id/shift-slots/:shift_slot_id/reassign-staff instead.'
            });
        }

        const bookingRes = await client.query(
            `SELECT b.*, 
                    sp.full_name as old_staff_name,
                    u.mobile_number as old_staff_mobile,
                    cp.full_name as client_name,
                    uc.mobile_number as client_mobile,
                    p.full_name as patient_name
             FROM bookings b
             LEFT JOIN staff_profiles sp ON b.assigned_staff_id = sp.staff_profile_id
             LEFT JOIN users u ON sp.user_id = u.user_id
             LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
             LEFT JOIN users uc ON cp.user_id = uc.user_id
             LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
             WHERE b.booking_id = $1`,
            [booking_id]
        );

        const bookingDetail = bookingRes.rows[0] || booking;

        const activeAssignmentRes = await client.query(
            `SELECT
                bsa.staff_profile_id,
                sp.full_name as staff_name,
                sp.designation,
                bsa.service_start_date,
                bsa.service_end_date,
                bsa.assignment_id
             FROM booking_staff_assignments bsa
             JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
             WHERE bsa.booking_id = $1
               AND bsa.status = 'ACTIVE'
             ORDER BY bsa.assigned_on DESC
             LIMIT 1
             FOR UPDATE`,
            [booking_id]
        );

        const activeAssignment = activeAssignmentRes.rows[0] || null;
        const currentStaffId = booking.assigned_staff_id || activeAssignment?.staff_profile_id || null;
        const currentStaffName = bookingDetail.old_staff_name || activeAssignment?.staff_name || null;

        if (!currentStaffId) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'No staff is currently assigned to this booking, so a swap cannot be performed yet.'
            });
        }

        if (!['ACTIVE', 'OVERDUE'].includes(booking.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Cannot swap staff on a booking with status ${booking.status}`
            });
        }

        // 2. Verify new staff exists and is available
        const newStaffRes = await client.query(
            `SELECT sp.staff_profile_id, sp.full_name, sp.current_status,
                    u.mobile_number as staff_mobile
             FROM staff_profiles sp
             JOIN users u ON sp.user_id = u.user_id
             WHERE sp.staff_profile_id = $1`,
            [new_staff_id]
        );

        if (!newStaffRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'New staff member not found' });
        }

        const newStaff = newStaffRes.rows[0];

        // 2.5 If the incoming staff's start date is in the future, defer the swap:
        //     reserve them now, keep the current nurse working/billed, and let the
        //     cron flip the booking over on the effective date.
        const businessDate = await getBusinessDate(client);
        const requestedSwapDateStr = new_staff_start_date ? toDateStr(new_staff_start_date) : null;
        const swapReferenceDateStr = requestedSwapDateStr || businessDate;

        if (newStaff.current_status !== 'AVAILABLE') {
            // current_status is a live snapshot that only flips back to AVAILABLE when the
            // cron closes out an old assignment, so it lags a staff member whose other
            // commitment(s) will have ended before this swap's effective date. Only block
            // on a genuine date-overlapping assignment elsewhere.
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
                [new_staff_id, booking_id, swapReferenceDateStr]
            );
            if (conflictRes.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: 'error',
                    message: `${newStaff.full_name} is not available for assignment (status: ${newStaff.current_status})`
                });
            }
        }

        if (requestedSwapDateStr && isFutureDate(requestedSwapDateStr, businessDate)) {
            const alreadyScheduled = await hasOpenAction(client, booking_id, 'STAFF_SWAP');
            if (alreadyScheduled) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: 'A staff swap is already scheduled for this booking.' });
            }

            const newDailyRate = new_daily_rate ?? bookingDetail.daily_rate ?? bookingDetail.quote_daily_rate ?? 0;
            const insertRes = await client.query(
                `INSERT INTO booking_staff_assignments
                    (booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
                     service_start_date, service_end_date, amount_allocated, status)
                 VALUES ($1, $2, NOW(), $3, $4, $5, NULL, NULL, 'SCHEDULED')
                 RETURNING assignment_id`,
                [booking_id, new_staff_id, req.user.user_id, newDailyRate, requestedSwapDateStr]
            );
            const newAssignmentId = insertRes.rows[0].assignment_id;

            // Reserve the incoming staff so they aren't double-booked before the swap date.
            await client.query(
                `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
                [new_staff_id]
            );

            await enqueueScheduledAction(client, {
                booking_id,
                action_type: 'STAFF_SWAP',
                effective_date: requestedSwapDateStr,
                payload: {
                    old_staff_id: currentStaffId,
                    new_staff_id,
                    new_assignment_id: newAssignmentId,
                    swap_reason: swap_reason || null,
                    billing_gap: false,
                    new_daily_rate: new_daily_rate ?? null,
                    new_ot_rate: new_ot_rate ?? null,
                    new_scheduled_end_time: new_scheduled_end_time ?? null,
                    swapped_by: req.user.user_id,
                    old_staff_out_time: old_staff_out_time || null,
                    new_staff_in_time: new_staff_in_time || null,
                },
                reason: swap_reason || null,
                created_by: req.user.user_id,
            });

            await client.query('COMMIT');

            return res.status(200).json({
                status: 'success',
                scheduled: true,
                message: `Staff swap to ${newStaff.full_name} scheduled for ${requestedSwapDateStr}. ${currentStaffName || 'Current staff'} continues until then.`,
                data: { booking_id, new_staff_id, effective_date: requestedSwapDateStr }
            });
        }

        // 3. Determine billing gap
        // If arrival_time provided and it's within 4 hours of now — no billing gap
        let billingGap = false;
        if (arrival_time) {
            const arrivalDate = new Date(arrival_time);
            const now = new Date();
            const diffHours = (arrivalDate - now) / (1000 * 60 * 60);
            billingGap = diffHours > 4;
        }

        const oldStaffId = currentStaffId;

        // 4. Log the swap
        await client.query(
            `INSERT INTO staff_swaps 
                (booking_id, old_staff_id, new_staff_id, swap_reason, swapped_at, swapped_by, arrival_time, billing_gap)
             VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
            [
                booking_id,
                oldStaffId,
                new_staff_id,
                swap_reason || null,
                req.user.user_id,
                arrival_time ? new Date(arrival_time) : null,
                billingGap
            ]
        );

        // 5. Update booking_staff_assignments for the swap
        //    - Close the old assignment (service_end_date = swap date from modal)
        //    - Open a new assignment for the incoming staff starting the next day
        const swapDate = new_staff_start_date
            ? new Date(new_staff_start_date)
            : new Date();
        swapDate.setHours(0, 0, 0, 0);

        const oldEndDateStr = swapDate.toISOString().split('T')[0];

        const newStartDate = new Date(swapDate);
        newStartDate.setDate(newStartDate.getDate() + 1);
        const newStartDateStr = newStartDate.toISOString().split('T')[0];

        if (activeAssignment) {
            await client.query(
                `UPDATE booking_staff_assignments
                 SET service_end_date = $1, status = 'COMPLETED'
                 WHERE assignment_id = $2`,
                [oldEndDateStr, activeAssignment.assignment_id]
            );
        }

        const newDailyRate = new_daily_rate ?? bookingDetail.daily_rate ?? bookingDetail.quote_daily_rate ?? 0;
        const newAssignmentRes = await client.query(
            `INSERT INTO booking_staff_assignments
                (booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
                 service_start_date, service_end_date, amount_allocated, status)
             VALUES ($1, $2, NOW(), $3, $4, $5, NULL, NULL, 'ACTIVE')
             RETURNING assignment_id`,
            [booking_id, new_staff_id, req.user.user_id, newDailyRate, newStartDateStr]
        );
        const newAssignmentId = newAssignmentRes.rows[0].assignment_id;

        // Out/in time capture: old staff's last logged day gets its out_time, the
        // incoming staff's first day gets its in_time. Either/both optional.
        if (activeAssignment && old_staff_out_time) {
            await applyPartialAttendanceTime(client, {
                booking_id, assignment_id: activeAssignment.assignment_id,
                service_date: oldEndDateStr, out_time: old_staff_out_time,
            });
        }
        if (new_staff_in_time) {
            await applyPartialAttendanceTime(client, {
                booking_id, assignment_id: newAssignmentId,
                service_date: newStartDateStr, in_time: new_staff_in_time,
            });
        }

        // 6. Build the booking update dynamically
        // Only override fields the admin explicitly passed in
        let updateFields = [`assigned_staff_id = $1`];
        let updateValues = [new_staff_id];
        let paramCount = 2;

        if (new_daily_rate !== undefined) {
            updateFields.push(`daily_rate = $${paramCount}`);
            updateValues.push(new_daily_rate);
            paramCount++;
        }

        if (new_ot_rate !== undefined) {
            updateFields.push(`ot_rate = $${paramCount}`);
            updateValues.push(new_ot_rate);
            paramCount++;
        }

        if (new_scheduled_end_time !== undefined) {
            updateFields.push(`scheduled_end_time = $${paramCount}`);
            updateValues.push(new Date(new_scheduled_end_time));
            paramCount++;
        }

        updateValues.push(booking_id);

        await client.query(
            `UPDATE bookings SET ${updateFields.join(', ')} WHERE booking_id = $${paramCount}`,
            updateValues
        );

        // 7. Free old staff member
        await client.query(
            `UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`,
            [oldStaffId]
        );

        // 8. Lock new staff member
        await client.query(
            `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
            [new_staff_id]
        );

        await client.query('COMMIT');

        // 8. Activity log (non-fatal — must not roll back the committed swap)
        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'STAFF_SWAPPED',
                entityType: 'BOOKING',
                entityId: booking_id,
                details: {
                    booking_id,
                    old_staff_name: currentStaffName || null,
                    old_staff_id: oldStaffId,
                    new_staff_name: newStaff.full_name,
                    new_staff_id: new_staff_id,
                    swap_reason: swap_reason || null,
                    billing_gap: billingGap,
                }
            });
        } catch (logErr) {
            console.error('Activity log error (non-fatal):', logErr);
        }

        // 9. Fire-and-forget notifications
        (async () => {
            try {
                const swapDate = new Date().toLocaleDateString('en-GB');

                const supplementRes = await db.query(
                    `SELECT COALESCE(sr.location_address, cp.primary_address, '') AS location,
                            COALESCE(p.medical_condition, 'None specified') AS conditions
                     FROM bookings b
                     LEFT JOIN service_requests sr ON b.request_id = sr.request_id
                     LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                     LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
                     WHERE b.booking_id = $1`,
                    [booking_id]
                );

                const supp = supplementRes.rows[0] || {};
                const patientName = bookingDetail.patient_name || 'the patient';
                const location = supp.location || 'the client location';
                const conditions = supp.conditions || 'None specified';
                const clientMobile = bookingDetail.client_mobile;
                const clientName = bookingDetail.client_name;
                const oldMobile = bookingDetail.old_staff_mobile;
                const notifications = [];

                if (oldMobile && currentStaffName) {
                    notifications.push(
                        sendStaffAssignmentTerminated(oldMobile, currentStaffName, patientName, swapDate),
                        sendSms(oldMobile,
                            `VCare: Hi ${currentStaffName}, your assignment for ${patientName} has ended. End date: ${swapDate}. Thank you for your dedication and service.`
                        )
                    );
                }

                if (newStaff.staff_mobile) {
                    notifications.push(
                        sendStaffNewAssignment(newStaff.staff_mobile, newStaff.full_name, patientName, location, conditions, swapDate),
                        sendSms(newStaff.staff_mobile,
                            `VCare: Hi ${newStaff.full_name}, you have a new assignment for ${patientName} at ${location}. Please contact the VCare office for full details.`
                        )
                    );
                }

                if (clientMobile) {
                    notifications.push(
                        sendClientStaffSwapped(clientMobile, clientName, patientName, newStaff.full_name, swapDate),
                        sendSms(clientMobile,
                            `VCare: Hi ${clientName}, your caregiver for ${patientName} has been updated to ${newStaff.full_name}. Contact us if you have any questions.`
                        )
                    );
                }

                await Promise.allSettled(notifications);
            } catch (notifErr) {
                console.error('[swapStaff] Notification error (non-fatal):', notifErr.message);
            }
        })();

        res.status(200).json({
            status: 'success',
            message: `Staff swapped successfully. ${currentStaffName || 'Current staff'} replaced by ${newStaff.full_name}.`,
            data: {
                booking_id,
                old_staff: currentStaffName,
                new_staff: newStaff.full_name,
                billing_gap: billingGap,
                billing_note: billingGap
                    ? 'Gap exceeds 4 hours — billing gap recorded. Manual review may be needed.'
                    : 'Replacement within 4 hours — billing continues uninterrupted.'
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('swapStaff error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to swap staff member' });
    } finally {
        client.release();
    }
};

// POST /api/bookings/:booking_id/send-staff-profile   body: { staff_profile_id }
// Sends a staff member's profile to this booking's client on WhatsApp — used by the
// swap/assign modal so the client can see who is replacing their current carer before
// (or as) the change takes effect. Mirrors serviceRequestController.sendCandidateProfile,
// but keyed off the booking (works for admin-direct bookings with no service request)
// and deliberately not one-time-only: a client may need the same profile resent.
exports.sendStaffProfileToClient = async (req, res) => {
    const { booking_id } = req.params;
    const { staff_profile_id } = req.body;

    if (!staff_profile_id) {
        return res.status(400).json({ status: 'error', message: 'staff_profile_id is required' });
    }

    try {
        const bookingRes = await db.query(
            `SELECT b.booking_id,
                    COALESCE(cp.full_name, sr.payer_name)      AS client_name,
                    COALESCE(uc.mobile_number, sr.payer_mobile) AS client_mobile,
                    COALESCE(p.full_name, sr.patient_name)     AS patient_name
             FROM bookings b
             LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
             LEFT JOIN users uc ON cp.user_id = uc.user_id
             LEFT JOIN service_requests sr ON b.request_id = sr.request_id
             LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
             WHERE b.booking_id = $1`,
            [booking_id]
        );
        if (!bookingRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        const booking = bookingRes.rows[0];
        if (!booking.client_mobile) {
            return res.status(400).json({ status: 'error', message: 'This booking has no client mobile number on file.' });
        }

        const staffRes = await db.query(
            `SELECT staff_profile_id, full_name, designation FROM staff_profiles WHERE staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (!staffRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
        }
        const staff = staffRes.rows[0];

        let sendResult;
        try {
            sendResult = await sendCandidateProfile(
                booking.client_mobile,
                booking.client_name || 'there',
                booking.patient_name || 'your patient',
                staff.full_name,
                staff.designation
            );
        } catch (sendErr) {
            console.error('[sendStaffProfileToClient] WhatsApp send failed:', sendErr.message);
            return res.status(502).json({ status: 'error', message: 'WhatsApp send failed — the "vcare_candidate_profile" template may not be approved yet.' });
        }

        try {
            await logActivity({
                actorUserId: req.user?.user_id,
                actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
                actorRole: extractActorRole(req.user?.role),
                actionType: 'CANDIDATE_PROFILE_SENT',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: { staff_name: staff.full_name, staff_profile_id, client_name: booking.client_name, client_mobile: booking.client_mobile },
            });
        } catch (logErr) {
            console.error('Activity log failed (send staff profile):', logErr.message);
        }

        // metaWhatsapp carries a global kill switch — report that honestly rather than
        // claiming a send that never left the server.
        const blocked = sendResult?.blocked === true;
        res.status(200).json({
            status: 'success',
            blocked,
            message: blocked
                ? `WhatsApp sending is currently disabled system-wide, so ${staff.full_name}'s profile was NOT delivered to ${booking.client_name || 'the client'}.`
                : `${staff.full_name}'s profile sent to ${booking.client_name || 'the client'} on WhatsApp.`,
        });
    } catch (error) {
        console.error('sendStaffProfileToClient error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send staff profile' });
    }
};

// GET /api/bookings/:booking_id/swap-history
exports.getSwapHistory = async (req, res) => {
    const { booking_id } = req.params;

    try {
        const result = await db.query(
            `SELECT 
                ss.swap_id,
                ss.swapped_at,
                ss.swap_reason,
                ss.arrival_time,
                ss.billing_gap,
                old_sp.full_name as old_staff_name,
                new_sp.full_name as new_staff_name,
                u.mobile_number as swapped_by_mobile
             FROM staff_swaps ss
             JOIN staff_profiles old_sp ON ss.old_staff_id = old_sp.staff_profile_id
             JOIN staff_profiles new_sp ON ss.new_staff_id = new_sp.staff_profile_id
             JOIN users u ON ss.swapped_by = u.user_id
             WHERE ss.booking_id = $1
             ORDER BY ss.swapped_at DESC`,
            [booking_id]
        );

        res.status(200).json({
            status: 'success',
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('getSwapHistory error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch swap history' });
    }
};

exports.getClientBookings = async (req, res) => {
    try {
        const { client_id } = req.params;
        
        const result = await db.query(`
            SELECT b.*, 
                   sp.full_name as staff_name,
                   u.mobile_number as staff_mobile,
                   sr.patient_name,
                   sr.service_type,
                   sr.payer_name,
                   sr.payer_mobile,
                   cp.full_name as client_name,
                   uc.mobile_number as client_mobile,
                   pp.full_name as patient_full_name,
                   pp.age as patient_age,
                   pp.gender as patient_gender
            FROM bookings b
            JOIN staff_profiles sp ON b.assigned_staff_id = sp.staff_profile_id
            JOIN users u ON sp.user_id = u.user_id
            JOIN service_requests sr ON b.request_id = sr.request_id
            LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
            LEFT JOIN users uc ON cp.user_id = uc.user_id
            LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
            WHERE sr.client_id = $1
            ORDER BY b.created_at DESC
        `, [client_id]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching client bookings:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch bookings'
        });
    }
};

exports.getStaffBookings = async (req, res) => {
    try {
        const { staff_id } = req.params;

        const result = await db.query(`
            SELECT b.*,
                   cp.full_name as client_name,
                   u.mobile_number as client_mobile,
                   pp.full_name as patient_name,
                   pp.age as patient_age,
                   pp.gender as patient_gender,
                   pp.medical_condition,
                   pp.residential_address as patient_address,
                   pp.emergency_contact_name,
                   pp.emergency_contact_number,
                   sr.payer_name,
                   sr.payer_mobile,
                   sr.location_address,
                   sr.gps_coordinates,
                   sr.remarks as service_remarks,
                   q.daily_rate,
                   q.registration_fee,
                   q.total_amount,
                   q.qty_days as duration_days,
                   st.status as termination_status,
                    st.requested_end_date,
                    st.reason as termination_reason
            FROM bookings b
            JOIN client_profiles cp ON b.client_id = cp.client_profile_id
            JOIN users u ON cp.user_id = u.user_id
            LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
            LEFT JOIN service_requests sr ON b.request_id = sr.request_id
            LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
            LEFT JOIN service_terminations st ON b.booking_id = st.booking_id
            WHERE b.assigned_staff_id = $1
            ORDER BY b.created_at DESC
        `, [staff_id]);

        res.status(200).json({
            status: 'success',
            count: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching staff bookings:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch staff bookings'
        });
    }
}

exports.adminDirectBooking = async (req, res) => {
    const {
        client_profile_id,
        patient_id,
        // new patient fields (used if patient_id is not provided)
        new_patient_full_name,
        new_patient_age,
        new_patient_gender,
        new_patient_relationship_to_client,
        new_patient_medical_condition,
        new_patient_residential_address,
        new_patient_emergency_contact_name,
        new_patient_emergency_contact_number,
        // booking fields
        service_type,
        service_model,
        preferred_gender,
        start_date,
        scheduled_end_date,
        daily_rate,
        shift_rate,
        admin_notes,
    } = req.body;

    if (!client_profile_id || !service_type || !service_model || !start_date) {
        return res.status(400).json({ message: 'client_profile_id, service_type, service_model, and start_date are required.' });
    }
    if (!patient_id && !new_patient_full_name) {
        return res.status(400).json({ message: 'Either patient_id or new patient details (new_patient_full_name) are required.' });
    }

    const dbClient = await db.pool.connect();
    try {
        await dbClient.query('BEGIN');

        // Verify client exists
        const clientCheck = await dbClient.query(
            'SELECT client_profile_id FROM client_profiles WHERE client_profile_id = $1',
            [client_profile_id]
        );
        if (clientCheck.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ message: 'Client not found.' });
        }

        let finalPatientId = patient_id;

        // If no existing patient, create one
        if (!patient_id) {
            const patientRes = await dbClient.query(
                `INSERT INTO patient_profiles (client_id, full_name, age, gender, relationship_to_client, medical_condition, residential_address, emergency_contact_name, emergency_contact_number)
                 VALUES ($1, $2, $3, $4::gender_enum, $5, $6, $7, $8, $9) RETURNING patient_id`,
                [
                    client_profile_id,
                    new_patient_full_name,
                    new_patient_age ? parseInt(new_patient_age) : null,
                    new_patient_gender || null,
                    new_patient_relationship_to_client || null,
                    new_patient_medical_condition || null,
                    new_patient_residential_address || null,
                    new_patient_emergency_contact_name || null,
                    new_patient_emergency_contact_number || null,
                ]
            );
            finalPatientId = patientRes.rows[0].patient_id;
        } else {
            // Verify patient belongs to this client
            const patientCheck = await dbClient.query(
                'SELECT patient_id FROM patient_profiles WHERE patient_id = $1 AND client_id = $2',
                [patient_id, client_profile_id]
            );
            if (patientCheck.rows.length === 0) {
                await dbClient.query('ROLLBACK');
                return res.status(400).json({ message: 'Patient does not belong to this client.' });
            }
        }

        // SHIFT_BASED bookings have no booking end date — billing is purely
        // shift-count-derived, never date-derived.
        const scheduledEndTime = (service_model === 'SHIFT_BASED')
            ? null
            : (scheduled_end_date ? new Date(scheduled_end_date) : null);
        const parsedDailyRate = daily_rate ? parseFloat(daily_rate) : 0;
        const parsedShiftRate = shift_rate ? parseFloat(shift_rate) : null;

        const bookingRes = await dbClient.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id, status, preferred_gender, request_id, service_mode, scheduled_end_time, ot_rate, daily_rate, shift_rate, amount_quotated, amount_paid)
             VALUES ($1, $2, $3, $4::service_model_enum, $5, NULL, 'PENDING', $6::gender_preference_enum, NULL, NULL, $7, 500.00, $8, $9, 0, 0)
             RETURNING booking_id, booking_code`,
            [
                client_profile_id, finalPatientId, service_type,
                service_model, start_date,
                preferred_gender || 'ANY',
                scheduledEndTime,
                parsedDailyRate,
                parsedShiftRate,
            ]
        );
        const { booking_id, booking_code } = bookingRes.rows[0];

        await dbClient.query('COMMIT');

        try {
            const actorNameResult = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameResult.rows[0]?.full_name || 'Admin';
            const actorRole = extractActorRole(req.user.role);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole,
                actionType: 'BOOKING_CREATED',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: { booking_id, booking_code, client_profile_id, patient_id: finalPatientId, admin_notes, source: 'ADMIN_DIRECT' },
            });
        } catch (logErr) {
            console.error('Activity log failed (adminDirectBooking):', logErr.message);
        }

        res.status(201).json({
            status: 'success',
            message: 'Booking created successfully.',
            data: { booking_id, booking_code },
        });
    } catch (error) {
        await dbClient.query('ROLLBACK');
        console.error('adminDirectBooking error:', error);
        res.status(500).json({ message: 'Failed to create booking.' });
    } finally {
        dbClient.release();
    }
};

/**
 * @route   DELETE /api/bookings/:booking_id/hard-delete
 * @desc    SUPER_ADMIN-only. Permanently deletes a booking and every record tied to
 *          it (staff assignments, attendance, transactions, client payment
 *          allocations — and the receipt itself if it belongs solely to this
 *          booking, the linked quotation and everything under it including
 *          invoices/rental agreements/deposits). Irreversible. Requires the
 *          caller's own login password as a re-auth confirmation.
 * @body    password (required)
 * @access  Private (SUPER_ADMIN)
 */
exports.hardDeleteBooking = async (req, res) => {
    const { booking_id } = req.params;
    const { password } = req.body || {};

    if (!password) {
        return res.status(400).json({ status: 'error', message: 'Password is required to confirm this action.' });
    }

    const userRes = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.user_id]);
    const passwordHash = userRes.rows[0]?.password_hash;
    const passwordOk = passwordHash && await bcrypt.compare(password, passwordHash);
    if (!passwordOk) {
        return res.status(401).json({ status: 'error', message: 'Incorrect password.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(
            `SELECT booking_id, client_id, service_type, status FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [booking_id]
        );
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }
        const booking = bookingRes.rows[0];

        // Deletion order below is dictated entirely by FK direction (a row can only
        // be deleted once nothing still RESTRICTs it) — reordering any block here
        // without re-checking migrate.js's FK graph will likely reintroduce a
        // 23503 violation.

        // 1. client_payment_allocations references both booking_payment_tracking
        //    (booking_payment_id) and transactions (transaction_id) — must go before
        //    either. Delete the underlying receipt too if every allocation on it
        //    belongs solely to this booking; otherwise it's shared with another
        //    booking/wallet and only this allocation is removed.
        const recordIdsRes = await client.query(
            `SELECT DISTINCT record_id FROM client_payment_allocations WHERE booking_id = $1`,
            [booking_id]
        );
        for (const { record_id } of recordIdsRes.rows) {
            const sharedRes = await client.query(
                `SELECT 1 FROM client_payment_allocations WHERE record_id = $1 AND booking_id IS DISTINCT FROM $2 LIMIT 1`,
                [record_id, booking_id]
            );
            if (sharedRes.rows.length === 0) {
                await client.query(`DELETE FROM payment_receipts WHERE source_type = 'CLIENT_PAYMENT' AND source_id = $1`, [record_id]);
                await client.query(`DELETE FROM client_payment_records WHERE record_id = $1`, [record_id]);
            }
        }
        await client.query(`DELETE FROM client_payment_allocations WHERE booking_id = $1`, [booking_id]);

        // 2. scheduled_actions references service_terminations (termination_id) —
        //    must go before it, even though scheduled_actions would otherwise just
        //    cascade from the final bookings delete.
        await client.query(`DELETE FROM scheduled_actions WHERE booking_id = $1`, [booking_id]);

        // 3. booking_daily_invoices and staff_daily_attendance both reference
        //    booking_staff_assignments (assignment_id), booking_shift_slots
        //    (shift_slot_id), and shift_reschedules (reschedule_id) — must go
        //    before all three.
        await client.query(`DELETE FROM booking_daily_invoices WHERE booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM staff_daily_attendance WHERE booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM booking_day_drafts WHERE booking_id = $1`, [booking_id]);

        // 4. Now safe: nothing left references service_terminations.
        await client.query(`DELETE FROM service_terminations WHERE booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM staff_swaps WHERE booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM client_alerts WHERE booking_id = $1`, [booking_id]);

        // 5. shift_reschedules and booking_staff_assignments reference each other
        //    (assignment_id / reschedule_id, both nullable) — null both sides first,
        //    then shift_reschedules (also references booking_shift_slots, NOT NULL)
        //    can be deleted safely ahead of booking_staff_assignments.
        await client.query(`UPDATE booking_staff_assignments SET reschedule_id = NULL WHERE booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM shift_reschedules WHERE booking_id = $1`, [booking_id]);

        // 6. Now safe: client_payment_allocations, staff_daily_attendance and
        //    shift_reschedules (the only referencers) are gone.
        await client.query(`DELETE FROM booking_payment_tracking WHERE booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM booking_staff_assignments WHERE booking_id = $1`, [booking_id]);
        // client_notes.booking_id and staff_reviews.booking_id are ON DELETE SET
        // NULL — they survive automatically, no action needed here.

        // 7. Quotation tree — full teardown including invoices, rental agreements
        //    and deposits, per admin's explicit request, NOT just an unlink.
        //    invoices.rental_agreement_id references rental_agreements, so invoices
        //    must be deleted first; deposits/invoices both reference transactions,
        //    so transactions for this quote can't go until both are gone.
        const quoteIdsRes = await client.query(`SELECT quote_id FROM quotations WHERE booking_id = $1`, [booking_id]);
        const deletedQuoteIds = [];
        for (const { quote_id } of quoteIdsRes.rows) {
            deletedQuoteIds.push(quote_id);
            // Clear the sibling SERVICE/PRODUCT quote's back-pointer without touching the sibling itself.
            await client.query(`UPDATE quotations SET linked_quote_id = NULL WHERE linked_quote_id = $1`, [quote_id]);
            await client.query(`UPDATE service_requests SET active_quote_id = NULL WHERE active_quote_id = $1`, [quote_id]);
            await client.query(`DELETE FROM invoices WHERE quote_id = $1`, [quote_id]); // cascades invoice_payments
            await client.query(`DELETE FROM rental_agreements WHERE quote_id = $1`, [quote_id]); // cascades deposits
            await client.query(`DELETE FROM deposits WHERE quote_id = $1`, [quote_id]); // standalone deposits (no rental_agreement_id)
        }

        // 8. transactions: an earmark is a reservation against a future use of this
        //    booking, not a transaction that belongs to it — unlink rather than
        //    delete. Now safe for both booking_id and quote_id scoped rows (deposits/
        //    invoices referencing them are gone); payment_tracking references
        //    transactions too, so this must precede step 9.
        await client.query(`UPDATE transactions SET earmarked_booking_id = NULL WHERE earmarked_booking_id = $1`, [booking_id]);
        await client.query(`DELETE FROM transactions WHERE booking_id = $1`, [booking_id]);
        for (const quote_id of deletedQuoteIds) {
            await client.query(`DELETE FROM transactions WHERE quote_id = $1`, [quote_id]);
        }

        // 9. payment_tracking/booking_payment_tracking are referenced by
        //    transactions.payment_tracking_id — now safe. payment_slips has no
        //    inbound references.
        for (const quote_id of deletedQuoteIds) {
            await client.query(`DELETE FROM payment_tracking WHERE quote_id = $1`, [quote_id]);
            await client.query(`DELETE FROM payment_slips WHERE quote_id = $1`, [quote_id]);
        }

        // 10. quotations — safe now that invoices/deposits/payment_tracking/
        //     transactions/linked_quote_id/active_quote_id are all cleared.
        //     Cascades quote_line_items.
        for (const quote_id of deletedQuoteIds) {
            await client.query(`DELETE FROM quotations WHERE quote_id = $1`, [quote_id]);
        }

        // 11. Final delete — cascades booking_pauses, booking_salesperson_assignments,
        //     booking_shift_patterns (→ booking_shift_slots), booking_hospitalizations.
        await client.query(`DELETE FROM bookings WHERE booking_id = $1`, [booking_id]);

        await client.query('COMMIT');

        try {
            const actorRole = extractActorRole(req.user.role);
            await logActivity({
                actorUserId: req.user.user_id,
                actorRole,
                actionType: 'BOOKING_HARD_DELETE',
                entityType: 'BOOKING',
                entityId: String(booking_id),
                details: {
                    booking_id,
                    client_id: booking.client_id,
                    service_type: booking.service_type,
                    status: booking.status,
                    deleted_quote_ids: deletedQuoteIds,
                },
            });
        } catch (logErr) {
            console.error('Activity log failed (hardDeleteBooking):', logErr.message);
        }

        res.status(200).json({ status: 'success', message: 'Booking and all related records permanently deleted.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('hardDeleteBooking error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete booking.' });
    } finally {
        client.release();
    }
};

// Internal helpers reused by dailyDraftController.js's day-draft confirm flow —
// not HTTP handlers themselves, see the doc comments above each for contract details.
exports._internal = {
    applyInvoiceDecision,
    applyWaiveDecision,
    getActorName,
};