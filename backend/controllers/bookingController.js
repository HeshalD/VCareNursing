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

// Original convertToBooking function (now internal)
const convertToBookingInternal = async (req, res) => {
    // assigned_staff_id is optional - will use preferred_staff_id from request if not provided
    // quote_id is optional - will use active_quote_id from service_requests if not provided
    // payment_method is new (optional) - defaults to BANK_TRANSFER since they upload a slip
    const { request_id, quote_id, slip_url, assigned_staff_id, payment_method = 'BANK_TRANSFER' } = req.body;
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

        // Determine staff assignment: use provided assigned_staff_id, fallback to preferred_staff_id from request
        const finalStaffId = assigned_staff_id || reqData.preferred_staff_id;

        if (!finalStaffId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'No staff assigned and no preferred staff found in request' });
        }

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
        const profileCheck = await client.query('SELECT client_profile_id FROM client_profiles WHERE user_id = $1', [userId]);

        if (profileCheck.rows.length === 0) {
            const newProfile = await client.query(
                `INSERT INTO client_profiles (user_id, full_name, primary_address) VALUES ($1, $2, $3) RETURNING client_profile_id`,
                [userId, reqData.payer_name, reqData.location_address]
            );
            clientProfileId = newProfile.rows[0].client_profile_id;
        } else {
            clientProfileId = profileCheck.rows[0].client_profile_id;
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
                `INSERT INTO patient_profiles (client_id, full_name, age, relationship_to_client, medical_condition, is_registration_fee_paid) 
                 VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING patient_id`,
                [clientProfileId, reqData.patient_name, reqData.patient_age, reqData.relationship_to_client, reqData.patient_condition]
            );
            patientId = newPatient.rows[0].patient_id;
        }

        // 5. Create Final Booking (UPDATED: Added RETURNING booking_id)
        const newBooking = await client.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id, status, preferred_gender, request_id) 
             VALUES ($1, $2, $3, $4::service_model_enum, $5, $6, 'ACTIVE', $7::gender_preference_enum, $8)
             RETURNING booking_id`,
            [clientProfileId, patientId, reqData.service_type, reqData.service_model || 'SHIFT_BASED', reqData.start_date, finalStaffId, reqData.preferred_gender || 'ANY', request_id]
        );
        
        const bookingId = newBooking.rows[0].booking_id;

        // 6. UPDATE STAFF STATUS (Lock them)
        await client.query(
            `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
            [finalStaffId]
        );

        // 7. Finalize Request & Payment Slip
        await client.query(`UPDATE service_requests SET status = 'ACTIVE' WHERE request_id = $1`, [request_id]);
        await client.query(`INSERT INTO payment_slips (quote_id, slip_url, verified_at) VALUES ($1, $2, NOW())`, [bookingQuoteId, slip_url]);

        // =========================================================
        // 7.5 CREATE THE FINANCIAL TRANSACTION RECORD (NEW!)
        // =========================================================
        
        // Note: Assuming your admin's ID is available in req.user.user_id from your auth middleware.
        // If not, you can leave verified_by as NULL for now.
        const adminId = req.user ? req.user.user_id : null; 
        
        // Note: Assuming your quotations table has a 'total_amount' column. 
        // Change quoteData.total_amount if your column is named differently.
        await client.query(
            `INSERT INTO transactions (
                client_id, booking_id, quote_id, 
                category, transaction_type, -- <--- ADDED HERE
                amount, payment_method, receipt_url, verified_by, status, notes
            ) VALUES ($1, $2, $3, 'CLIENT_PAYMENT', 'CREDIT', $4, $5, $6, $7, 'COMPLETED', 'Initial payment for quote conversion')`,
            [
                clientProfileId, 
                bookingId, 
                bookingQuoteId, 
                quoteData.total_amount, 
                payment_method, 
                slip_url, 
                adminId
            ]
        );
        // =========================================================

        // 8. Fetch Staff Details (For Notification)
        const staffRes = await client.query(
            'SELECT sp.full_name, sp.profile_picture_url, u.mobile_number, u.email FROM staff_profiles sp JOIN users u ON sp.user_id = u.user_id WHERE sp.staff_profile_id = $1',
            [finalStaffId]
        );

        if (staffRes.rows.length === 0) {
            throw new Error('Assigned Staff ID not found');
        }
        const staffData = staffRes.rows[0];
        const staffName = staffData.full_name;

        await client.query('COMMIT');

        // 9. Send WhatsApp messages ... (rest of your notification code remains identical)
        const welcomeMsg = `*Booking Confirmed!* \n` +
            `Caregiver ${staffName} has been assigned to your service.\n\n` +
            `You can view their profile by logging in at: vcarenursing.com\n` +
            (reqData.tempPassword ? `\n*Login:* ${reqData.payer_mobile}\n*Temp Password:* ${reqData.tempPassword}` : ``);

        // await sendWhatsAppMessage(reqData.payer_mobile, welcomeMsg);

        const assignmentMsg =
            `*New Assignment Alert!* 🚨\n\n` +
            `*Patient:* ${reqData.patient_name}\n` +
            `*Location:* ${reqData.location_address}\n` +
            `*Condition:* ${reqData.patient_condition}\n` +
            `*Start Date:* ${new Date(reqData.start_date).toDateString()}\n\n` +
            `Please log in to the App for full details.`;

        // await sendWhatsAppMessage(staffData.mobile_number, assignmentMsg);

        // if (staffData.email) { ... sendEmail ... }

        res.status(200).json({ status: 'success', message: "Booking confirmed, payment recorded, and staff assigned." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Conversion Error:", error);
        res.status(500).json({ message: "Failed to convert lead to booking." });
    } finally {
        client.release();
    }
};

// Public convertToBooking function with file upload support
exports.convertToBooking = async (req, res) => {
    try {
        // Handle file upload
        if (req.file) {
            // File was uploaded, use the Cloudinary URL
            console.log('Uploaded file:', req.file); // Debug log
            req.body.slip_url = req.file.secure_url || req.file.path;
        } else if (!req.body.slip_url) {
            // No file uploaded and no slip_url provided
            console.log('No file and no slip_url found. Request body:', req.body); // Debug log
            return res.status(400).json({ message: "Payment slip file or URL is required" });
        }

        // Call the internal conversion logic
        await convertToBookingInternal(req, res);
    } catch (error) {
        console.error("File upload error:", error);
        res.status(500).json({ message: "Failed to process payment slip upload." });
    }
};

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
             SET status = 'COMPLETED'
             WHERE booking_id = $1`,
            [request.booking_id]
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
             SET status = 'TERMINATED'
             WHERE booking_id = $1`,
            [booking_id]
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

