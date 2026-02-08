const db = require('../config/db');

exports.submitServiceRequest = async (req, res) => {
    try {
        const {
            payer_name,
            payer_mobile,
            patient_name,
            patient_age,
            relationship, // This maps to relationship_to_client
            patient_condition,
            service_type,
            home_address,
            latitude,
            longitude,
            start_date,
            remarks
        } = req.body;

        // 1. Smart Detection: Does this mobile number belong to an existing client?
        const userCheck = await db.query(
            'SELECT user_id FROM users WHERE mobile_number = $1',
            [payer_mobile]
        );

        let clientId = null;
        if (userCheck.rows.length > 0) {
            // Check if they have a client profile
            const clientProfile = await db.query(
                'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
                [userCheck.rows[0].user_id]
            );
            if (clientProfile.rows.length > 0) {
                clientId = clientProfile.rows[0].client_profile_id;
            }
        }

        // 2. Insert into service_requests table
        const query = `
            INSERT INTO service_requests (
                client_id, 
                payer_name, 
                payer_mobile, 
                patient_name, 
                patient_age, 
                relationship_to_client, 
                patient_condition, 
                service_type, 
                location_address, 
                gps_coordinates, 
                start_date, 
                remarks
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, 
                CASE WHEN $10::float IS NOT NULL AND $11::float IS NOT NULL 
                     THEN point($11::float, $10::float) 
                     ELSE NULL 
                END, 
                $12, $13
            )
            RETURNING *;
        `;

        const values = [
            clientId,           // $1
            payer_name,         // $2
            payer_mobile,       // $3
            patient_name,       // $4
            patient_age,        // $5
            relationship,       // $6
            patient_condition,  // $7
            service_type,       // $8
            home_address,       // $9
            latitude,           // $10
            longitude,          // $11
            start_date,         // $12
            remarks             // $13
        ];

        const result = await db.query(query, values);

        // 3. Phase 1 SMS: "Request Received" (Mockup)
        console.log(`SMS to ${payer_mobile}: Request Received. A VCare Agent will contact you shortly.`);

        res.status(201).json({
            status: 'success',
            message: 'Service request submitted successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Service Request Error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

// Admin Method to get all leads for the [🏠 HOME] tab
exports.getAllLeads = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM service_requests ORDER BY created_at DESC');
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Error fetching leads" });
    }
};