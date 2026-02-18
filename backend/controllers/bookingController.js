const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsAppMessage } = require('../utils/whatsapp');
const sendEmail = require('../utils/email');

exports.convertToBooking = async (req, res) => {
    // assigned_staff_id is optional - will use preferred_staff_id from request if not provided
    const { request_id, quote_id, slip_url, assigned_staff_id } = req.body;
    const client = await db.pool.connect(); 

    try {
        await client.query('BEGIN');

        // 1. Fetch Request & Quote Details
        const requestRes = await client.query('SELECT * FROM service_requests WHERE request_id = $1', [request_id]);
        const quoteRes = await client.query('SELECT * FROM quotations WHERE quote_id = $1', [quote_id]);

        if (requestRes.rows.length === 0 || quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Request or Quote not found' });
        }

        const reqData = requestRes.rows[0];
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
            // Note: If auto-creating from a lead, we assume they just paid the reg fee in this quote
            const newPatient = await client.query(
                `INSERT INTO patient_profiles (client_id, full_name, age, relationship_to_client, medical_condition, is_registration_fee_paid) 
                 VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING patient_id`,
                [clientProfileId, reqData.patient_name, reqData.patient_age, reqData.relationship_to_client, reqData.patient_condition]
            );
            patientId = newPatient.rows[0].patient_id;
        }

        // 5. Create Final Booking
        await client.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id, status, preferred_gender) 
             VALUES ($1, $2, $3, $4::service_model_enum, $5, $6, 'ACTIVE', $7::gender_preference_enum)`,
            [clientProfileId, patientId, reqData.service_type, reqData.service_model || 'SHIFT_BASED', reqData.start_date, finalStaffId, reqData.preferred_gender || 'ANY']
        );

        // 6. UPDATE STAFF STATUS (Lock them)
        // Ensure staff_profile_id column name matches your DB (id vs staff_profile_id)
        await client.query(
            `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`, 
            [finalStaffId]
        );

        // 7. Finalize Request & Payment
        await client.query(`UPDATE service_requests SET status = 'COMPLETED' WHERE request_id = $1`, [request_id]);
        await client.query(`INSERT INTO payment_slips (quote_id, slip_url, verified_at) VALUES ($1, $2, NOW())`, [quote_id, slip_url]);

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

        // 9. Send WhatsApp
        const welcomeMsg = `*Booking Confirmed!* \n` +
            `Caregiver ${staffName} has been assigned to your service.\n\n` +
            `You can view their profile by logging in at: vcarenursing.com\n` +
            (reqData.tempPassword ? `\n*Login:* ${reqData.payer_mobile}\n*Temp Password:* ${reqData.tempPassword}` : ``);

        await sendWhatsAppMessage(reqData.payer_mobile, welcomeMsg);

        // Construct the assignment details
        const assignmentMsg = 
            `*New Assignment Alert!* 🚨\n\n` +
            `*Patient:* ${reqData.patient_name}\n` +
            `*Location:* ${reqData.location_address}\n` +
            `*Condition:* ${reqData.patient_condition}\n` +
            `*Start Date:* ${new Date(reqData.start_date).toDateString()}\n\n` +
            `Please log in to the App for full details.`;

        // Send WhatsApp to Staff
        await sendWhatsAppMessage(staffData.mobile_number, assignmentMsg);

        if (staffData.email) {
            await sendEmail({
                email: staffData.email,
                subject: 'New Job Assignment - VCare Nursing',
                message: `Hello ${staffData.full_name},\n\nYou have been assigned a new patient.\n\n` +
                `Patient: ${reqData.patient_name}\nAddress: ${reqData.location_address}\nCondition: ${reqData.patient_condition}\n\n` +
                `Please proceed to the location by ${reqData.start_date}.`
            });
        }

        res.status(200).json({ status: 'success', message: "Booking confirmed and staff assigned." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Conversion Error:", error);
        res.status(500).json({ message: "Failed to convert lead to booking." });
    } finally {
        client.release();
    }
};