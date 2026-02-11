const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWhatsAppMessage } = require('../utils/whatsapp');

exports.convertToBooking = async (req, res) => {
    const { request_id, quote_id, slip_url, assigned_staff_id } = req.body;
    const client = await db.pool.connect(); // Use a transaction for safety

    try {
        await client.query('BEGIN');

        // 1. Fetch Request & Quote Details
        const requestRes = await client.query('SELECT * FROM service_requests WHERE request_id = $1', [request_id]);
        const quoteRes = await client.query('SELECT * FROM quotations WHERE quote_id = $1', [quote_id]);

        if (requestRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Service request not found' });
        }

        if (quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Quotation not found' });
        }

        const reqData = requestRes.rows[0];
        const quoteData = quoteRes.rows[0];

        // 2. SMART CHECK: Create User if they don't exist
        let userId;
        const userCheck = await client.query('SELECT user_id FROM users WHERE mobile_number = $1', [reqData.payer_mobile]);

        if (userCheck.rows.length === 0) {
            const tempPassword = Math.random().toString(36).slice(-8); // Generate random pass
            const hashedPassword = await bcrypt.hash(tempPassword, 12);

            const newUser = await client.query(
                `INSERT INTO users (mobile_number, password_hash, email, role, is_active) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
                [reqData.payer_mobile, hashedPassword, null, ['CLIENT'], true]
            );
            userId = newUser.rows[0].user_id;

            // Log temp password to send via SMS later
            reqData.tempPassword = tempPassword;
        } else {
            userId = userCheck.rows[0].user_id;
        }

        // 3. Create/Ensure Client Profile
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

        // 4. Create Patient Profile
        const newPatient = await client.query(
            `INSERT INTO patient_profiles (client_id, full_name, age, relationship_to_client, medical_condition, is_registration_fee_paid) 
             VALUES ($1, $2, $3, $4, $5, true) RETURNING patient_id`,
            [clientProfileId, reqData.patient_name, reqData.patient_age, reqData.relationship_to_client, reqData.patient_condition]
        );
        const patientId = newPatient.rows[0].patient_id;

        // 5. Create Final Booking & Finalize Statuses
        await client.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, start_date, assigned_staff_id, status) 
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
            [clientProfileId, patientId, reqData.service_type, reqData.start_date, assigned_staff_id]
        );

        // 6. UPDATE STAFF STATUS (Lock them)
        await client.query(
            `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
            [assigned_staff_id]
        );

        // 7. Finalize Request & Payment
        await client.query(`UPDATE service_requests SET status = 'COMPLETED' WHERE request_id = $1`, [request_id]);
        await client.query(`INSERT INTO payment_slips (quote_id, slip_url, verified_at) VALUES ($1, $2, NOW())`, [quote_id, slip_url]);

        await client.query('COMMIT');

        // 8. Fetch Staff Name for the Welcome Message
        const staffRes = await client.query('SELECT full_name FROM staff_profiles WHERE staff_profile_id = $1', [assigned_staff_id]);

        if (staffRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Staff profile not found' });
        }

        const staffName = staffRes.rows[0].full_name;

        // 9. Send Welcome WhatsApp (Updated with Staff Name)
        const welcomeMsg = `*Booking Confirmed!* \n` +
            `Caregiver ${staffName} has been assigned to your service.\n\n` +
            `You can view their profile by logging in at: vcarenursing.com\n` +
            (reqData.tempPassword ? `Temp Password: ${reqData.tempPassword}` : ``);

        await sendWhatsAppMessage(reqData.payer_mobile, welcomeMsg);

        res.status(200).json({ status: 'success', message: "Booking confirmed and staff assigned." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Conversion Error:", error);
        res.status(500).json({ message: "Failed to convert lead to booking." });
    } finally {
        client.release();
    }
};