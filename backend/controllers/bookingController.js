const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsAppMessage } = require('../utils/whatsapp');
const sendEmail = require('../utils/email');
const { upload } = require('../config/cloudinaryConfig');
const { logActivity } = require('../utils/activityLogger');
const { sendClientTerminationRequested, sendClientTerminationApproved, sendStaffAssignmentTerminated, sendClientForceTerminated, sendStaffForceTerminated, sendStaffNewAssignment, sendClientStaffSwapped, sendClientWelcomeNew } = require('../utils/metaWhatsapp');
const { sendSms } = require('../utils/sms');
const { createServiceInvoice } = require('../services/billingService');
const {
    getBookingFinancialTotals,
    getBookingSettlementSnapshot,
    applyBookingSettlement
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

        const booking = await getBookingSettlementSnapshot(client, booking_id);

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

        const remainingBalance = parseFloat(booking.remaining_balance || 0);

        if (remainingBalance > 0 && !settlement_action) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'settlement_action is required when there is a remaining balance',
                remaining_balance: remainingBalance,
                allowed_actions: ['WALLET_DEPOSIT', 'BANK_REFUND', 'NO_REFUND']
            });
        }

        if (remainingBalance > 0 && settlement_action === 'NO_REFUND' && !settlement_note) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'settlement_note is required when choosing NO_REFUND',
                remaining_balance: remainingBalance
            });
        }

        // If the admin chose a future date, defer execution: leave the booking running
        // (still billed) and enqueue a scheduled_actions row the cron will execute on the day.
        const targetDateInput = effective_date || actual_end_time || null;
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

        // 2. SMART CHECK: Create User (Payer) if they don't exist
        let userId;
        const userCheck = await client.query('SELECT user_id FROM users WHERE mobile_number = $1', [reqData.payer_mobile]);

        if (userCheck.rows.length === 0) {
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(tempPassword, 12);

            const newUser = await client.query(
                `INSERT INTO users (mobile_number, password_hash, email, role, is_active) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
                [reqData.payer_mobile, hashedPassword, null, ['CLIENT'], true]
            );
            userId = newUser.rows[0].user_id;
            reqData.tempPassword = tempPassword; // Store for the welcome SMS/WhatsApp after commit
        } else {
            userId = userCheck.rows[0].user_id;
        }

        // 3. Create/Ensure Client Profile (Billing Profile)
        let clientProfileId;
        const profileCheck = await client.query('SELECT client_profile_id, is_registration_fee_paid FROM client_profiles WHERE user_id = $1', [userId]);

        if (profileCheck.rows.length === 0) {
            const newProfile = await client.query(
                `INSERT INTO client_profiles (user_id, full_name, primary_address, is_registration_fee_paid) VALUES ($1, $2, $3, $4) RETURNING client_profile_id`,
                [userId, reqData.payer_name, reqData.location_address, Number(quoteData.registration_fee) > 0 ? true : false]
            );
            clientProfileId = newProfile.rows[0].client_profile_id;
        } else {
            clientProfileId = profileCheck.rows[0].client_profile_id;
            
            // Check if registration fee needs to be marked as paid
            const clientProfile = profileCheck.rows[0];
            if (!clientProfile.is_registration_fee_paid && Number(quoteData.registration_fee) > 0) {
                await client.query(
                    `UPDATE client_profiles SET is_registration_fee_paid = TRUE WHERE client_profile_id = $1`,
                    [clientProfileId]
                );
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
            const newPatient = await client.query(
                `INSERT INTO patient_profiles (client_id, full_name, age, gender, relationship_to_client, medical_condition, is_registration_fee_paid, special_remarks, residential_address, emergency_contact_name, emergency_contact_number)
                 VALUES ($1, $2, $3, $4::gender_enum, $5, $6, TRUE, $7, $8, $9, $10) RETURNING patient_id`,
                [clientProfileId, reqData.patient_name, reqData.patient_age, reqData.gender || null, reqData.relationship_to_client, reqData.patient_condition, reqData.remarks, reqData.location_address, reqData.payer_name, reqData.payer_mobile]
            );
            patientId = newPatient.rows[0].patient_id;
        }

        // 5. Fetch verified payments for this quote and mirror them into the booking payment ledger
        const paymentRes = await client.query(`
            SELECT
                payment_id,
                amount_received,
                payment_method,
                bank_account_id,
                cheque_number,
                cheque_date,
                reference_number,
                slip_url,
                verified_by,
                notes,
                payment_date,
                verified_at
            FROM payment_tracking
            WHERE quote_id = $1 AND status = 'VERIFIED'
            ORDER BY payment_date ASC
        `, [bookingQuoteId]);

        const amountPaid = paymentRes.rows.reduce((sum, payment) => sum + parseFloat(payment.amount_received || 0), 0);

        // 6. Create Booking Record with PENDING status (No staff assignment yet)
        // NOTE: assigned_staff_id is NULL - staff assignment happens in separate step via staffAssignmentController
        const newBooking = await client.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id, status, preferred_gender, request_id, service_mode, scheduled_end_time, actual_end_time, ot_rate, daily_rate, amount_quotated, amount_paid) 
             VALUES ($1, $2, $3, $4::service_model_enum, $5, NULL, 'PENDING', $6::gender_preference_enum, $7, $8, $9, NULL, $10, $11, $12, $13)
             RETURNING booking_id, booking_code`,
            [clientProfileId, patientId, reqData.service_type, reqData.service_model || 'SHIFT_BASED', reqData.start_date, reqData.preferred_gender || 'ANY', request_id, null, scheduledEndTime, 500.00, quoteData.daily_rate, quoteData.total_amount, 0]
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

        for (const payment of paymentRes.rows) {
            try {
                await client.query(
                `INSERT INTO booking_payment_tracking (
                   payment_tracking_id,
                   booking_id,
                   quote_id,
                   client_id,
                   amount_received,
                   payment_method,
                   bank_account_id,
                   cheque_number,
                   cheque_date,
                   reference_number,
                   slip_url,
                   status,
                   verified_by,
                   notes,
                   payment_date,
                   verified_at
                                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'VERIFIED', $12, $13, $14, $15)
                                 ON CONFLICT (payment_tracking_id) DO UPDATE SET
                                     booking_id = EXCLUDED.booking_id,
                                     quote_id = EXCLUDED.quote_id,
                                     client_id = EXCLUDED.client_id,
                                     amount_received = EXCLUDED.amount_received,
                                     payment_method = EXCLUDED.payment_method,
                                     bank_account_id = EXCLUDED.bank_account_id,
                                     cheque_number = EXCLUDED.cheque_number,
                                     cheque_date = EXCLUDED.cheque_date,
                                     reference_number = EXCLUDED.reference_number,
                                     slip_url = EXCLUDED.slip_url,
                                     status = EXCLUDED.status,
                                     verified_by = EXCLUDED.verified_by,
                                     notes = EXCLUDED.notes,
                                     payment_date = EXCLUDED.payment_date,
                                     verified_at = EXCLUDED.verified_at`,
                [
                    payment.payment_id,
                    bookingId,
                    bookingQuoteId,
                    clientProfileId,
                    payment.amount_received,
                    payment.payment_method,
                    payment.bank_account_id || null,
                    payment.cheque_number || null,
                    payment.cheque_date || null,
                    payment.reference_number || null,
                    payment.slip_url || null,
                    payment.verified_by || null,
                    payment.notes || null,
                    payment.payment_date || new Date(),
                    payment.verified_at || payment.payment_date || new Date()
                ]
            );

                await client.query(
                `INSERT INTO transactions (
                   payment_tracking_id,
                   client_id,
                   booking_id,
                   quote_id,
                   category,
                   amount,
                   payment_method,
                   bank_account_id,
                   cheque_number,
                   cheque_date,
                   reference_number,
                   receipt_url,
                   verified_by,
                   status,
                   notes,
                   transaction_type,
                   created_at
                                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'COMPLETED', $14, 'CREDIT', NOW())
                                 ON CONFLICT (payment_tracking_id) DO UPDATE SET
                                     client_id = EXCLUDED.client_id,
                                     booking_id = EXCLUDED.booking_id,
                                     quote_id = EXCLUDED.quote_id,
                                     category = EXCLUDED.category,
                                     amount = EXCLUDED.amount,
                                     payment_method = EXCLUDED.payment_method,
                                     bank_account_id = EXCLUDED.bank_account_id,
                                     cheque_number = EXCLUDED.cheque_number,
                                     cheque_date = EXCLUDED.cheque_date,
                                     receipt_url = EXCLUDED.receipt_url,
                                     reference_number = EXCLUDED.reference_number,
                                     verified_by = EXCLUDED.verified_by,
                                     status = EXCLUDED.status,
                                     notes = EXCLUDED.notes,
                                     transaction_type = EXCLUDED.transaction_type`,
                [
                    payment.payment_id,
                    clientProfileId,
                    bookingId,
                    bookingQuoteId,
                    'BOOKING_PAYMENT',
                    payment.amount_received,
                    payment.payment_method,
                    payment.bank_account_id || null,
                    payment.cheque_number || null,
                    payment.cheque_date || null,
                    payment.reference_number || null,
                    payment.slip_url || null,
                    payment.verified_by || null,
                    payment.notes || null
                ]
            );
            } catch (paymentMirrorError) {
                console.error('Payment mirror debug:', {
                    request_id,
                    bookingQuoteId,
                    payment_id: payment.payment_id,
                    payment_method: payment.payment_method,
                    payment_method_length: payment.payment_method ? String(payment.payment_method).length : 0,
                    cheque_number_length: payment.cheque_number ? String(payment.cheque_number).length : 0,
                    reference_number_length: payment.reference_number ? String(payment.reference_number).length : 0,
                    slip_url_length: payment.slip_url ? String(payment.slip_url).length : 0,
                    verified_by_length: payment.verified_by ? String(payment.verified_by).length : 0,
                    notes_length: payment.notes ? String(payment.notes).length : 0,
                    error_code: paymentMirrorError.code,
                    error_message: paymentMirrorError.message
                });
                throw paymentMirrorError;
            }
        }

        if (amountPaid > 0) {
            await client.query(
                `UPDATE bookings
                 SET amount_paid = $1,
                     last_payment_date = (
                        SELECT MAX(COALESCE(verified_at, payment_date))
                        FROM booking_payment_tracking
                        WHERE booking_id = $2 AND status = 'VERIFIED'
                     )
                 WHERE booking_id = $2`,
                [amountPaid, bookingId]
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
            b.ot_rate,
            b.amount_quotated,
            b.amount_paid,
            b.invoicing_mode,
            c.client_profile_id,
            c.full_name as client_name,
            c.primary_address as client_address,
            c.wallet_balance,
            uc.mobile_number as client_mobile,
            uc.email as client_email,
            p.patient_id as resolved_patient_id,
            p.full_name as patient_name,
            p.age as patient_age,
            p.relationship_to_client,
            p.medical_condition,
            p.residential_address as patient_address,
            s.staff_profile_id,
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

        const [paymentHistoryResult, financialTotalsResult, assignmentHistoryResult, swapHistoryResult, terminationHistoryResult, invoiceSummaryResult] = await Promise.all([
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
                    bsa.service_end_date,
                    bsa.amount_allocated,
                    bsa.status,
                    bsa.notes,
                    sp.full_name,
                    sp.designation,
                    sp.current_status
                 FROM booking_staff_assignments bsa
                 JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
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
                : Promise.resolve({ rows: [{ invoice_count: 0, total_invoiced: 0, last_invoice_at: null }] })
        ]);

        const verifiedPaid = parseFloat(financialTotalsResult.total_paid || 0);
        const totalInvoiced = parseFloat(financialTotalsResult.total_invoiced || 0);
        const totalAmount = parseFloat(booking.total_amount || 0);
        const remainingBalance = verifiedPaid - totalInvoiced;
        const remainingToInvoice = Math.max(remainingBalance, 0);
        const overdueAmount = verifiedPaid > totalInvoiced ? 0 : totalInvoiced - verifiedPaid;

        let daysRemaining = null;
        let overdueDays = null;
        if (booking.quote_daily_rate) {
            const rate = parseFloat(booking.quote_daily_rate);
            if (rate > 0) {
                daysRemaining = remainingBalance / rate;
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
                    ot_rate: booking.ot_rate,
                    amount_quotated: booking.amount_quotated,
                    amount_paid: booking.amount_paid,
                    invoicing_mode: booking.invoicing_mode,
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
                    client_name: booking.client_name,
                    client_address: booking.client_address,
                    client_mobile: booking.client_mobile,
                    client_email: booking.client_email,
                    wallet_balance: parseFloat(booking.wallet_balance || 0)
                },
                patient_details: {
                    patient_id: booking.resolved_patient_id || booking.patient_id,
                    patient_name: booking.patient_name,
                    patient_age: booking.patient_age,
                    relationship_to_client: booking.relationship_to_client,
                    medical_condition: booking.medical_condition,
                    patient_address: booking.patient_address
                },
                current_staff: booking.staff_profile_id ? {
                    staff_profile_id: booking.staff_profile_id,
                    staff_name: booking.staff_name,
                    staff_mobile: booking.staff_mobile,
                    staff_email: booking.staff_email,
                    profile_picture_url: booking.profile_picture_url
                } : null,
                payment_summary: {
                    payment_count: paymentHistoryResult.rows.length,
                    total_paid: verifiedPaid,
                    remaining_amount: Math.max(totalAmount - verifiedPaid, 0)
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
                termination_requests: terminationHistoryResult.rows
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
        const remainingBalance = totalPaid - totalInvoiced;
        const overdueAmount = totalPaid > totalInvoiced ? 0 : totalInvoiced - totalPaid;
        const remainingDays = rate > 0 ? remainingBalance / rate : null;
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
                    total_paid: totalPaid,
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
                daily_invoice_id, booking_id, service_date::text as service_date, entry_mode,
                status, amount, transaction_id, decided_by_user_id, decided_by_name, decided_at,
                notes, created_at, updated_at
             FROM booking_daily_invoices
             WHERE booking_id = $1
             ORDER BY service_date DESC`,
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
exports.confirmDailyInvoice = async (req, res) => {
    const { booking_id } = req.params;
    const { service_date, approve, amount } = req.body;

    if (!service_date || typeof approve !== 'boolean') {
        return res.status(400).json({ status: 'error', message: 'service_date and approve (boolean) are required' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT * FROM booking_daily_invoices WHERE booking_id = $1 AND service_date = $2 FOR UPDATE`,
            [booking_id, service_date]
        );

        if (existing.rows.length > 0 && existing.rows[0].status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'This day has already been decided' });
        }

        const bookingRes = await client.query(
            `SELECT booking_id, client_id, daily_rate FROM bookings WHERE booking_id = $1`,
            [booking_id]
        );

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Booking not found' });
        }

        const booking = bookingRes.rows[0];
        const decidedByName = await getActorName(req.user?.user_id);

        let transactionId = null;
        let finalAmount = null;

        if (approve) {
            finalAmount = amount !== undefined && amount !== null && amount !== ''
                ? parseFloat(amount)
                : parseFloat(booking.daily_rate);

            if (Number.isNaN(finalAmount) || finalAmount <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: 'amount must be a positive number' });
            }

            transactionId = await createServiceInvoice(client, {
                booking_id,
                client_id: booking.client_id,
                amount: finalAmount,
                notes: `Manually confirmed daily charge for ${service_date}`
            });
        }

        const result = await client.query(
            `INSERT INTO booking_daily_invoices (
                booking_id, service_date, entry_mode, status, amount, transaction_id,
                decided_by_user_id, decided_by_name, decided_at
            ) VALUES ($1, $2, 'MANUAL', $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (booking_id, service_date)
            DO UPDATE SET status = EXCLUDED.status,
                          amount = EXCLUDED.amount,
                          transaction_id = EXCLUDED.transaction_id,
                          decided_by_user_id = EXCLUDED.decided_by_user_id,
                          decided_by_name = EXCLUDED.decided_by_name,
                          decided_at = NOW(),
                          updated_at = NOW()
            RETURNING *`,
            [booking_id, service_date, approve ? 'INVOICED' : 'SKIPPED', finalAmount, transactionId, req.user?.user_id || null, decidedByName]
        );

        await client.query('COMMIT');
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Confirm daily invoice error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to confirm daily invoice decision' });
    } finally {
        client.release();
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

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Update invoicing mode error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update invoicing mode' });
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

exports.forceStopBooking = async (req, res) => {
    const { booking_id } = req.params;
    // Admin can specify an exact date/time, or default to right now. 
    // They can also type in the reason the client gave over the phone.
    const { target_end_date, reason } = req.body || {};

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
                payload: { settlement_action: 'WALLET_DEPOSIT' },
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
        // 5. FINANCIAL SETTLEMENT ENGINE GOES HERE
        /// =========================================================
        // 5. FINANCIAL SETTLEMENT ENGINE
        // =========================================================

        // A. Fetch the Financial Contract (The Quote)
        const financeRes = await client.query(
            `SELECT b.start_date, b.client_id, q.daily_rate, q.qty_days, q.registration_fee 
     FROM bookings b
     JOIN service_requests sr ON b.request_id = sr.request_id
     JOIN quotations q ON sr.active_quote_id = q.quote_id
     WHERE b.booking_id = $1`,
            [booking_id]
        );

        if (financeRes.rows.length > 0) {
            const financeData = financeRes.rows[0];
            const { start_date, client_id, daily_rate, qty_days } = financeData;

            // B. Calculate Days Worked
            // We calculate the difference in milliseconds, convert to days, and round up.
            // (e.g., if they worked 2.1 days, it counts as 3 billable days for the nurse's sake)
            const diffTime = officialEndDate.getTime() - new Date(start_date).getTime();
            let daysWorked = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Edge Case: If they cancel before the nurse even arrives (same day or future)
            if (daysWorked < 0) daysWorked = 0;
            // Edge Case: Minimum 1 day charge if they cancel a few hours after the nurse arrives
            if (daysWorked === 0 && diffTime > 0) daysWorked = 1;

            // C. Calculate Unused Days
            const unusedDays = qty_days - daysWorked;

            // D. Process the Wallet Refund
            if (unusedDays > 0) {
                // They paid for more days than they used!
                const refundAmount = unusedDays * daily_rate;

                // Add the exact refund amount to the Client's Wallet
                await client.query(
                    `UPDATE client_profiles 
             SET wallet_balance = wallet_balance + $1 
             WHERE client_profile_id = $2`,
                    [refundAmount, client_id]
                );

                console.log(`SETTLEMENT: Credited Rs. ${refundAmount} for ${unusedDays} unused days to Client ${client_id}`);

                // Optional: You can insert a record into a `wallet_transactions` table here 
                // to keep a history of "Why" they got this money.

            } else if (unusedDays < 0) {
                // SCENARIO: They overstayed their prepaid quote! 
                // e.g., Paid for 14 days, stopped on day 16.
                const amountOwed = Math.abs(unusedDays) * daily_rate;
                console.log(`SETTLEMENT ALERT: Client ${client_id} overstayed by ${Math.abs(unusedDays)} days and owes Rs. ${amountOwed}`);

                // Here, instead of a refund, you would trigger an alert for your accountant 
                // to send a final Post-Paid Invoice to the client for the extra days.
            } else {
                console.log(`SETTLEMENT: Perfect match. 0 unused days. No wallet changes.`);
            }
        }

        // =========================================================

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
            ORDER BY b.created_at DESC
        `;

        const result = await db.query(query);

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

    // Record the payment transaction if amount provided
    if (payment_amount && payment_amount > 0) {
      await client.query(
        `INSERT INTO transactions (
          client_id, booking_id, category, transaction_type,
          amount, payment_method, status, notes
        ) VALUES ($1, $2, 'CLIENT_PAYMENT', 'CREDIT', $3, $4, 'COMPLETED', $5)`,
        [
          booking.client_id,
          booking_id,
          payment_amount,
          payment_method || 'BANK_TRANSFER',
          notes || `Booking extended by ${additional_days} days`
        ]
      );
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
        new_scheduled_end_time
    } = req.body;

    if (!new_staff_id) {
        return res.status(400).json({ status: 'error', message: 'new_staff_id is required' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Lock the booking row first, then fetch related display fields separately.
        const bookingLockRes = await client.query(
            `SELECT booking_id, status, assigned_staff_id, client_id, patient_id
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

        if (newStaff.current_status !== 'AVAILABLE') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `${newStaff.full_name} is not available for assignment (status: ${newStaff.current_status})`
            });
        }

        // 2.5 If the incoming staff's start date is in the future, defer the swap:
        //     reserve them now, keep the current nurse working/billed, and let the
        //     cron flip the booking over on the effective date.
        const businessDate = await getBusinessDate(client);
        const requestedSwapDateStr = new_staff_start_date ? toDateStr(new_staff_start_date) : null;

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
        await client.query(
            `INSERT INTO booking_staff_assignments
                (booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
                 service_start_date, service_end_date, amount_allocated, status)
             VALUES ($1, $2, NOW(), $3, $4, $5, NULL, NULL, 'ACTIVE')`,
            [booking_id, new_staff_id, req.user.user_id, newDailyRate, newStartDateStr]
        );

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
        console.error('swapStaff error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to swap staff member' });
    } finally {
        client.release();
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
};