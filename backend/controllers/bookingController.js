const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsAppMessage } = require('../utils/whatsapp');
const sendEmail = require('../utils/email');
const { upload } = require('../config/cloudinaryConfig');

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

const getBookingSettlementSnapshot = async (client, booking_id) => {
    const bookingResult = await client.query(
        `SELECT
            b.booking_id,
            b.status,
            b.assigned_staff_id,
            b.client_id,
            b.start_date,
            b.scheduled_end_time,
            b.actual_end_time,
            b.daily_rate,
            b.ot_rate,
            c.full_name as client_name,
            c.wallet_balance,
            sr.active_quote_id as quote_id,
            q.total_amount,
            q.daily_rate as quote_daily_rate
         FROM bookings b
         LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
         LEFT JOIN service_requests sr ON b.request_id = sr.request_id
         LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
         WHERE b.booking_id = $1
         FOR UPDATE OF b`,
        [booking_id]
    );

    if (bookingResult.rows.length === 0) {
        return null;
    }

    const booking = bookingResult.rows[0];

    const [paymentSummaryResult, invoiceSummaryResult] = await Promise.all([
        booking.quote_id
            ? client.query(
                `SELECT COALESCE(SUM(amount_received), 0) as total_paid
                 FROM payment_tracking
                 WHERE quote_id = $1 AND status = 'VERIFIED'`,
                [booking.quote_id]
            )
            : Promise.resolve({ rows: [{ total_paid: 0 }] }),
        client.query(
            `SELECT COALESCE(SUM(amount), 0) as total_invoiced
             FROM transactions
             WHERE booking_id = $1
               AND category = 'SERVICE_INVOICE'
               AND transaction_type = 'DEBIT'
               AND status = 'COMPLETED'`,
            [booking_id]
        )
    ]);

    const totalPaid = parseFloat(paymentSummaryResult.rows[0]?.total_paid || 0);
    const totalInvoiced = parseFloat(invoiceSummaryResult.rows[0]?.total_invoiced || 0);

    return {
        ...booking,
        total_paid: totalPaid,
        total_invoiced: totalInvoiced,
        remaining_balance: Math.max(totalPaid - totalInvoiced, 0),
        amount_owed: Math.max(totalInvoiced - totalPaid, 0)
    };
};

const applyBookingSettlement = async (client, booking, settlementAction, settlementNote, reason, actorLabel) => {
    const remainingBalance = parseFloat(booking.remaining_balance || 0);
    let walletDepositedAmount = 0;

    if (settlementAction === 'WALLET_DEPOSIT' && remainingBalance > 0) {
        walletDepositedAmount = remainingBalance;

        await client.query(
            `UPDATE client_profiles
             SET wallet_balance = wallet_balance + $1
             WHERE client_profile_id = $2`,
            [walletDepositedAmount, booking.client_id]
        );
    }

    const settlementNotes = [
        `${actorLabel}`,
        reason ? `Reason: ${reason}` : null,
        settlementAction ? `Settlement action: ${settlementAction}` : null,
        remainingBalance > 0 ? `Remaining balance: Rs.${remainingBalance.toFixed(2)}` : 'No remaining balance',
        settlementNote ? `Note: ${settlementNote}` : null
    ].filter(Boolean).join(' | ');

    await client.query(
        `INSERT INTO transactions (
            client_id,
            booking_id,
            category,
            transaction_type,
            amount,
            status,
            notes,
            created_at
        ) VALUES ($1, $2, $3, 'CREDIT', $4, 'COMPLETED', $5, NOW())`,
        [
            booking.client_id,
            booking.booking_id,
            'BOOKING_SETTLEMENT',
            walletDepositedAmount,
            settlementNotes
        ]
    );

    return {
        remaining_balance: remainingBalance,
        wallet_deposited_amount: walletDepositedAmount,
        settlement_notes: settlementNotes
    };
};

const finalizeBookingState = async (req, res, nextStatus, actorLabel, includeTerminationLog = false) => {
    const { booking_id } = req.params;
    const {
        actual_end_time,
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

        const endTime = actual_end_time ? new Date(actual_end_time) : new Date();
        const remainingBalance = parseFloat(booking.remaining_balance || 0);

        if (remainingBalance > 0 && !settlement_action) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'settlement_action is required when there is a remaining balance',
                remaining_balance: remainingBalance,
                allowed_actions: ['WALLET_DEPOSIT', 'NO_REFUND']
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

        await client.query(
            `UPDATE bookings
             SET status = $1,
                 actual_end_time = $2
             WHERE booking_id = $3`,
            [nextStatus, endTime, booking_id]
        );

        if (booking.assigned_staff_id) {
            await client.query(
                `UPDATE staff_profiles
                 SET current_status = 'AVAILABLE'
                 WHERE staff_profile_id = $1`,
                [booking.assigned_staff_id]
            );
        }

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
            reqData.tempPassword = tempPassword; // Store for SMS
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
                `INSERT INTO patient_profiles (client_id, full_name, age, relationship_to_client, medical_condition, is_registration_fee_paid, special_remarks, residential_address, emergency_contact_name, emergency_contact_number) 
                 VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9) RETURNING patient_id`,
                [clientProfileId, reqData.patient_name, reqData.patient_age, reqData.relationship_to_client, reqData.patient_condition, reqData.remarks, reqData.location_address, reqData.payer_name, reqData.payer_mobile]
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
             RETURNING booking_id`,
            [clientProfileId, patientId, reqData.service_type, reqData.service_model || 'SHIFT_BASED', reqData.start_date, reqData.preferred_gender || 'ANY', request_id, null, scheduledEndTime, 500.00, quoteData.daily_rate, quoteData.total_amount, 0]
        );

        const bookingId = newBooking.rows[0].booking_id;

        for (const payment of paymentRes.rows) {
            await client.query(
                `INSERT INTO booking_payment_tracking (
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
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VERIFIED', $11, $12, $13, $14)`,
                [
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
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'COMPLETED', $13, 'DEBIT', $14)`,
                [
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
                    payment.notes || null,
                    payment.payment_date || new Date()
                ]
            );
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

        // Return success with booking details for next step
        res.status(201).json({
            status: 'success',
            message: "Booking created successfully. Proceed to: (1) Record Payment, (2) Assign Staff.",
            data: {
                booking_id: bookingId,
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
                us.email as staff_email
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
            c.client_profile_id,
            c.full_name as client_name,
            c.primary_address as client_address,
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
            q.registration_fee
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

        const [paymentHistoryResult, paymentSummaryResult, assignmentHistoryResult, swapHistoryResult, terminationHistoryResult, invoiceSummaryResult] = await Promise.all([
            db.query(
                quoteId
                    ? `SELECT payment_id, source_type, amount_received, payment_method, bank_account_id, cheque_number, reference_number, slip_url, status, payment_date, verified_at, verified_by, notes
                       FROM (
                         SELECT payment_id, 'QUOTE'::text as source_type, amount_received, payment_method, bank_account_id, cheque_number, reference_number, slip_url, status, payment_date, verified_at, verified_by, notes
                         FROM payment_tracking
                         WHERE quote_id = $1
                         UNION ALL
                         SELECT booking_payment_id as payment_id, 'BOOKING'::text as source_type, amount_received, payment_method, bank_account_id, cheque_number, reference_number, slip_url, status, payment_date, verified_at, verified_by, notes
                         FROM booking_payment_tracking
                         WHERE booking_id = $2
                       ) payment_history
                       ORDER BY payment_date DESC`
                    : `SELECT booking_payment_id as payment_id, 'BOOKING'::text as source_type, amount_received, payment_method, bank_account_id, cheque_number, reference_number, slip_url, status, payment_date, verified_at, verified_by, notes
                       FROM booking_payment_tracking
                       WHERE booking_id = $1
                       ORDER BY payment_date DESC`,
                quoteId ? [quoteId, booking_id] : [booking_id]
            ),
            db.query(
                quoteId
                    ? `SELECT
                         COUNT(*) as payment_count,
                         COALESCE(SUM(amount_received), 0) as total_paid
                       FROM (
                         SELECT amount_received
                         FROM payment_tracking
                         WHERE quote_id = $1 AND status = 'VERIFIED'
                         UNION ALL
                         SELECT amount_received
                         FROM booking_payment_tracking
                         WHERE booking_id = $2 AND status = 'VERIFIED'
                       ) payment_totals`
                    : `SELECT
                         COUNT(*) as payment_count,
                         COALESCE(SUM(amount_received), 0) as total_paid
                       FROM booking_payment_tracking
                       WHERE booking_id = $1 AND status = 'VERIFIED'`,
                quoteId ? [quoteId, booking_id] : [booking_id]
            ),
            db.query(
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
                       AND category = 'SERVICE_INVOICE'
                       AND transaction_type = 'DEBIT'
                       AND status = 'COMPLETED'`,
                    [booking_id]
                )
                : Promise.resolve({ rows: [{ invoice_count: 0, total_invoiced: 0, last_invoice_at: null }] })
        ]);

        const verifiedPaid = parseFloat(paymentSummaryResult.rows[0]?.total_paid || 0);
        const totalInvoiced = parseFloat(invoiceSummaryResult.rows[0]?.total_invoiced || 0);
        const totalAmount = parseFloat(booking.total_amount || 0);
        const remainingToInvoice = Math.max(verifiedPaid - totalInvoiced, 0);
        const balanceRemaining = Math.max(totalAmount - verifiedPaid, 0);
        const overdueAmount = Math.max(totalInvoiced - verifiedPaid, 0);

        let daysRemaining = null;
        let overdueDays = null;
        if (booking.quote_daily_rate) {
            const rate = parseFloat(booking.quote_daily_rate);
            if (rate > 0) {
                const daySpan = balanceRemaining / rate;
                if (verifiedPaid >= totalInvoiced) {
                    daysRemaining = daySpan > 0 ? daySpan : 0;
                } else {
                    overdueDays = Math.ceil(overdueAmount / rate);
                }
            }
        }

        res.status(200).json({
            status: 'success',
            data: {
                booking_summary: {
                    booking_id: booking.booking_id,
                    request_id: booking.request_id,
                    status: booking.status,
                    service_type: booking.service_type,
                    service_model: booking.service_model,
                    service_mode: booking.service_mode,
                    preferred_gender: booking.preferred_gender,
                    start_date: booking.start_date,
                    scheduled_end_time: booking.scheduled_end_time,
                    actual_end_time: booking.actual_end_time,
                    created_at: booking.created_at,
                    daily_rate: booking.daily_rate,
                    ot_rate: booking.ot_rate,
                    amount_quotated: booking.amount_quotated,
                    amount_paid: booking.amount_paid,
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
                    client_email: booking.client_email
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
                    payment_count: parseInt(paymentSummaryResult.rows[0]?.payment_count || 0, 10),
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

        const [paymentSummaryResult, invoiceSummaryResult, recentPaymentResult, recentInvoiceResult] = await Promise.all([
            booking.quote_id
                ? db.query(
                    `SELECT
                        COUNT(*) as payment_count,
                        COALESCE(SUM(amount_received), 0) as total_paid,
                        MAX(payment_date) as last_payment_at
                     FROM payment_tracking
                     WHERE quote_id = $1 AND status = 'VERIFIED'`,
                    [booking.quote_id]
                )
                : Promise.resolve({ rows: [{ payment_count: 0, total_paid: 0, last_payment_at: null }] }),
            db.query(
                `SELECT
                    COUNT(*) as invoice_count,
                    COALESCE(SUM(amount), 0) as total_invoiced,
                    MAX(created_at) as last_invoice_at
                 FROM transactions
                 WHERE booking_id = $1
                   AND category = 'SERVICE_INVOICE'
                   AND transaction_type = 'DEBIT'
                   AND status = 'COMPLETED'`,
                [booking_id]
            ),
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
                   AND category = 'SERVICE_INVOICE'
                   AND transaction_type = 'DEBIT'
                   AND status = 'COMPLETED'
                 ORDER BY created_at DESC
                 LIMIT 5`,
                [booking_id]
            )
        ]);

        const totalPaid = parseFloat(paymentSummaryResult.rows[0]?.total_paid || 0);
        const totalInvoiced = parseFloat(invoiceSummaryResult.rows[0]?.total_invoiced || 0);
        const remainingToInvoice = Math.max(totalPaid - totalInvoiced, 0);
        const overdueAmount = Math.max(totalInvoiced - totalPaid, 0);
        const remainingDays = rate > 0 ? Math.max(Math.floor(remainingToInvoice / rate), 0) : null;
        const overdueDays = rate > 0 ? Math.max(Math.ceil(overdueAmount / rate), 0) : null;

        res.status(200).json({
            status: 'success',
            data: {
                booking_id: booking.booking_id,
                booking_status: booking.status,
                client_id: booking.client_id,
                client_name: booking.client_name,
                quote_id: booking.quote_id,
                quote_daily_rate: rate,
                quote_total_amount: parseFloat(booking.total_amount || 0),
                payment_summary: {
                    payment_count: parseInt(paymentSummaryResult.rows[0]?.payment_count || 0, 10),
                    total_paid: totalPaid,
                    last_payment_at: paymentSummaryResult.rows[0]?.last_payment_at || null
                },
                invoice_summary: {
                    invoice_count: parseInt(invoiceSummaryResult.rows[0]?.invoice_count || 0, 10),
                    total_invoiced: totalInvoiced,
                    last_invoice_at: invoiceSummaryResult.rows[0]?.last_invoice_at || null,
                    remaining_to_invoice: remainingToInvoice,
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
            RETURNING termination_id;
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

        // 5. Alert the Admin Dashboard (High Priority Task)
        // This is where you'd trigger a WebSocket event, Email, or WhatsApp to your coordinators.
        console.log(`🚨 HIGH PRIORITY: Client requested termination for Booking ${booking_id}. Urgency: ${urgency}`);
        // await sendAdminAlert(`Termination requested for booking ${booking_id}. Urgency: ${urgency}. Reason: ${reason}`);

        res.status(201).json({
            status: 'success',
            message: "Termination request submitted successfully. Our team will review and confirm shortly.",
            data: {
                termination_id: termRes.rows[0].termination_id,
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
                st.urgency,
                st.requested_end_date,
                st.reason,
                st.created_at as request_date,
                b.booking_id,
                b.start_date,
                b.service_type,
                c.full_name as client_name,
                c.primary_address as location,
                p.full_name as patient_name,
                s.staff_profile_id,
                s.full_name as staff_name
            FROM service_terminations st
            JOIN bookings b ON st.booking_id = b.booking_id
            JOIN client_profiles c ON b.client_id = c.client_profile_id
            JOIN patient_profiles p ON b.patient_id = p.patient_id
            JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
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

exports.approveTerminationRequest = async (req, res) => {
    const { termination_id } = req.params;
    const { final_end_date } = req.body; // Admin can optionally override the exact stop time

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch the Termination and Booking Data
        const termRes = await client.query(
            `SELECT st.*, b.assigned_staff_id, b.client_id, b.start_date 
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

        // 2. Update Termination Request Status
        await client.query(
            `UPDATE service_terminations SET status = 'APPROVED', end_date = $1 WHERE termination_id = $2`,
            [officialEndDate, termination_id]
        );

        // 3. Terminate the Booking
        await client.query(
            `UPDATE bookings 
     SET status = 'COMPLETED', actual_end_time = $2
     WHERE booking_id = $1`,
            [request.booking_id, officialEndDate]
        );

        // 4. Free up the Staff Member! (Crucial for availability)
        await client.query(
            `UPDATE staff_profiles 
             SET current_status = 'AVAILABLE' 
             WHERE staff_profile_id = $1`,
            [request.assigned_staff_id]
        );

        // =========================================================
        // 5. FINANCIAL SETTLEMENT ENGINE (Wallet Logic)
        // =========================================================

        // =========================================================
        // 5. FINANCIAL SETTLEMENT ENGINE
        // =========================================================

        // A. Fetch the Financial Contract (The Quote)
        const financeRes = await client.query(
            `SELECT b.start_date, b.client_id, q.daily_rate, q.qty_days, q.registration_fee 
     FROM bookings b
     JOIN service_requests sr ON b.request_id = sr.request_id
     JOIN quotations q ON sr.active_quote_id = q.quote_id
     WHERE b.booking_id = $1`,
            [request.booking_id]
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

        // 6. Notifications (WhatsApp/SMS)
        // -> Message Staff: "Your assignment has ended. You are now available for new bookings."
        // -> Message Client: "Your service termination is confirmed. Any refunds have been added to your VCare Wallet."

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

        // 2. Handle the Paper Trail (service_terminations)
        // Let's check if the client already had a 'PENDING' request that the admin is just force-clearing
        const pendingTermRes = await client.query(
            `SELECT termination_id FROM service_terminations 
             WHERE booking_id = $1 AND status = 'PENDING' FOR UPDATE`,
            [booking_id]
        );

        if (pendingTermRes.rows.length > 0) {
            // Client requested it earlier, Admin is approving it now via Force Stop
            await client.query(
                `UPDATE service_terminations 
                 SET status = 'APPROVED', end_date = $1, reason = COALESCE($2, reason)
                 WHERE termination_id = $3`,
                [officialEndDate, reason, pendingTermRes.rows[0].termination_id]
            );
        } else {
            // Admin is doing this entirely manually over the phone, so we create the log
            await client.query(
                `INSERT INTO service_terminations (
                    booking_id, requested_by, urgency, requested_end_date, end_date, reason, status
                ) VALUES ($1, 'ADMIN', 'IMMEDIATE', $2, $3, $4, 'APPROVED')`,
                [booking_id, officialEndDate, officialEndDate, reason || 'Admin forced stop via phone request']
            );
        }

        // 3. Terminate the Booking
        await client.query(
            `UPDATE bookings 
     SET status = 'TERMINATED', actual_end_time = $2
     WHERE booking_id = $1`,
            [booking_id, officialEndDate]
        );
        // 4. Free up the Staff Member!
        if (booking.assigned_staff_id) {
            await client.query(
                `UPDATE staff_profiles 
                 SET current_status = 'AVAILABLE' 
                 WHERE staff_profile_id = $1`,
                [booking.assigned_staff_id]
            );
        }

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
                us.email as staff_email
            FROM bookings b
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN users uc ON c.user_id = uc.user_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN staff_profiles s ON b.assigned_staff_id = s.staff_profile_id
            LEFT JOIN users us ON s.user_id = us.user_id
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

        // 5. Build the booking update dynamically
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

        // 6. Free old staff member
        await client.query(
            `UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`,
            [oldStaffId]
        );

        // 7. Lock new staff member
        await client.query(
            `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
            [new_staff_id]
        );

        await client.query('COMMIT');

        // 8. Notifications — stubbed out, ready for WhatsApp go-live
        // await sendBookingConfirmation(
        //     booking.client_mobile,
        //     booking.client_name,
        //     newStaff.full_name,
        //     booking.patient_name,
        //     new Date().toDateString()
        // );
        // await sendWhatsAppMessage(
        //     booking.old_staff_mobile,
        //     `Your assignment for patient ${booking.patient_name} has ended. You are now available for new bookings.`
        // );
        // await sendWhatsAppMessage(
        //     newStaff.staff_mobile,
        //     `New Assignment: You have been assigned to care for ${booking.patient_name} at ${booking.client_name}'s address. Please log in to the app for full details.`
        // );

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