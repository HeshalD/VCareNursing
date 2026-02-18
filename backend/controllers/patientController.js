const db = require('../config/db');

exports.createPatientProfile = async (req, res) => {
    const { 
        client_id,             // The "Payer" (Mr. Perera)
        full_name,             // "Mr. Sunil"
        age,
        relationship_to_client, // "Friend"
        medical_condition,
        residential_address,    // "Mount Lavinia" (Crucial for Sponsored Booking)
        emergency_contact_name, // "Sunil's Wife"
        emergency_contact_number,
        gender                  // New gender field
    } = req.body;

    try {
        // 1. Insert the new patient
        const query = `
            INSERT INTO patient_profiles (
                client_id, 
                full_name, 
                age, 
                relationship_to_client, 
                medical_condition, 
                residential_address, 
                emergency_contact_name, 
                emergency_contact_number,
                gender,
                is_registration_fee_paid 
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::gender_enum, false)
            RETURNING *;
        `;
        
        // Note: is_registration_fee_paid defaults to FALSE for manually added patients 
        // until a quote is generated and paid.

        const values = [
            client_id, full_name, age, relationship_to_client, 
            medical_condition, residential_address, 
            emergency_contact_name, emergency_contact_number, gender
        ];

        const result = await db.query(query, values);

        res.status(201).json({
            status: 'success',
            message: 'Patient profile created successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Create Patient Error:", error);
        res.status(500).json({ message: "Error creating patient profile" });
    }
};

// Bonus: Get all patients for a specific client (To populate the dropdown)
exports.getPatientsByClient = async (req, res) => {
    const { client_id } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM patient_profiles WHERE client_id = $1 ORDER BY created_at DESC', 
            [client_id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Error fetching patients" });
    }
};