const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

exports.createPatientProfile = async (req, res) => {
    const { 
        client_id,             // The "Payer" (Mr. Perera)
        full_name,             // "Mr. Sunil"
        age,
        relationship_to_client, // "Friend"
        medical_condition,
        residential_address,    // "Mount Lavinia" (Crucial for Sponsored Booking)
        emergency_contact_name, // "Sunil's Wife"
        emergency_contact_number
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
                is_registration_fee_paid 
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
            RETURNING *;
        `;
        
        // Note: is_registration_fee_paid defaults to FALSE for manually added patients 
        // until a quote is generated and paid.

        const values = [
            client_id, full_name, age, relationship_to_client, 
            medical_condition, residential_address, 
            emergency_contact_name, emergency_contact_number
        ];

        const result = await db.query(query, values);
        const newPatient = result.rows[0];

        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'PATIENT_CREATED',
                entityType: 'PATIENT',
                entityId: newPatient.patient_id,
                details: { patient_name: full_name, client_id }
            });
        } catch (logErr) {
            console.error('Activity log error (non-fatal):', logErr);
        }

        res.status(201).json({
            status: 'success',
            message: 'Patient profile created successfully',
            data: newPatient
        });

    } catch (error) {
        console.error("Create Patient Error:", error);
        res.status(500).json({ message: "Error creating patient profile" });
    }
};

// Update patient profile
exports.updatePatientProfile = async (req, res) => {
    const { patient_id } = req.params;
    const { 
        full_name,
        age,
        relationship_to_client,
        medical_condition,
        residential_address,
        emergency_contact_name,
        emergency_contact_number
    } = req.body;

    try {
        const query = `
            UPDATE patient_profiles 
            SET 
                full_name = $1,
                age = $2,
                relationship_to_client = $3,
                medical_condition = $4,
                residential_address = $5,
                emergency_contact_name = $6,
                emergency_contact_number = $7
            WHERE patient_id = $8
            RETURNING *;
        `;
        
        const values = [
            full_name, age, relationship_to_client, 
            medical_condition, residential_address, 
            emergency_contact_name, emergency_contact_number, 
            patient_id
        ];

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        res.status(200).json({
            status: 'success',
            message: 'Patient profile updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Update Patient Error:", error);
        res.status(500).json({ message: "Error updating patient profile" });
    }
};

// Delete patient profile
exports.deletePatientProfile = async (req, res) => {
    const { patient_id } = req.params;

    try {
        // Check if patient has any active bookings
        const bookingCheck = await db.query(
            'SELECT COUNT(*) as count FROM bookings WHERE patient_id = $1 AND status IN (\'ACTIVE\', \'PENDING\')',
            [patient_id]
        );

        if (parseInt(bookingCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                message: 'Cannot delete patient with active bookings' 
            });
        }

        const result = await db.query(
            'DELETE FROM patient_profiles WHERE patient_id = $1 RETURNING *',
            [patient_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        res.status(200).json({
            status: 'success',
            message: 'Patient profile deleted successfully'
        });

    } catch (error) {
        console.error("Delete Patient Error:", error);
        res.status(500).json({ message: "Error deleting patient profile" });
    }
};

// Get patient by ID
exports.getPatientById = async (req, res) => {
    const { patient_id } = req.params;

    try {
        const query = `
            SELECT 
                p.*, 
                c.full_name as client_name,
                c.primary_address as client_address,
                u.mobile_number as client_mobile
            FROM patient_profiles p
            LEFT JOIN client_profiles c ON p.client_id = c.client_profile_id
            LEFT JOIN users u ON c.user_id = u.user_id
            WHERE p.patient_id = $1
        `;
        
        const result = await db.query(query, [patient_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Get Patient by ID Error:", error);
        res.status(500).json({ message: "Error fetching patient details" });
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