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
            service_model, // New field: LIVE_IN, SHIFT_BASED, VISITING
            home_address,
            latitude,
            longitude,
            start_date,
            remarks,
            preferred_gender,
            preferred_staff_id
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
                service_model,
                location_address, 
                gps_coordinates, 
                start_date, 
                remarks,
                preferred_gender,
                preferred_staff_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::service_model_enum, $10, 
                CASE WHEN $11::double precision IS NOT NULL AND $12::double precision IS NOT NULL 
                     THEN point($12::double precision, $11::double precision)
                     ELSE NULL 
                END, 
                $13, $14, $15::gender_preference_enum, $16
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
            service_model || 'SHIFT_BASED', // $9 (default to SHIFT_BASED if not provided)
            home_address,       // $10
            latitude ? parseFloat(latitude) : null,           // $11 - ensure numeric or null
            longitude ? parseFloat(longitude) : null,          // $12 - ensure numeric or null
            start_date,         // $13
            remarks,            // $14
            preferred_gender || 'ANY', // $15 (default to ANY if not provided)
            preferred_staff_id || null  // $16 (optional preferred staff)
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

// Admin Method to get all requests with NEW_LEAD status
exports.getNewLeads = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM service_requests WHERE status = $1 ORDER BY created_at DESC',
            ['NEW_LEAD']
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Error fetching new leads" });
    }
};

// Admin Method to get service request by ID
exports.getServiceRequestById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'SELECT * FROM service_requests WHERE request_id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Service request not found" });
        }
        
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error("Error fetching service request:", error);
        res.status(500).json({ message: "Error fetching service request" });
    }
};

exports.getPendingLeads = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM service_requests WHERE status = $1 ORDER BY created_at DESC',
            ['PENDING']
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Error fetching new leads" });
    }
};

// Admin Method to update service request status
exports.updateServiceRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const result = await db.query(
            'UPDATE service_requests SET status = $1 WHERE request_id = $2 RETURNING *',
            [status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Service request not found" });
        }
        
        res.status(200).json({ 
            status: 'success', 
            message: `Service request status updated to ${status}`,
            data: result.rows[0] 
        });
    } catch (error) {
        console.error("Error updating service request status:", error);
        res.status(500).json({ message: "Error updating service request status" });
    }
};