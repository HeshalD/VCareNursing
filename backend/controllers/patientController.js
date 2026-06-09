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

// Get all patients (admin view, sorted by client, with pagination + search)
exports.getAllPatients = async (req, res) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchParam = search ? `%${search}%` : null;

    try {
        const baseWhere = searchParam
            ? `WHERE (p.full_name ILIKE $1 OR c.full_name ILIKE $1 OR p.medical_condition ILIKE $1 OR p.residential_address ILIKE $1)`
            : '';

        const dataParams = searchParam
            ? [searchParam, parseInt(limit), offset]
            : [parseInt(limit), offset];

        const countParams = searchParam ? [searchParam] : [];

        const limitIdx  = searchParam ? 2 : 1;
        const offsetIdx = searchParam ? 3 : 2;

        const [dataResult, countResult] = await Promise.all([
            db.query(
                `SELECT
                    p.*,
                    c.full_name       AS client_name,
                    c.primary_address AS client_address,
                    u.mobile_number   AS client_mobile
                 FROM patient_profiles p
                 LEFT JOIN client_profiles c ON p.client_id = c.client_profile_id
                 LEFT JOIN users u ON c.user_id = u.user_id
                 ${baseWhere}
                 ORDER BY c.full_name ASC NULLS LAST, p.full_name ASC
                 LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
                dataParams
            ),
            db.query(
                `SELECT COUNT(*) FROM patient_profiles p
                 LEFT JOIN client_profiles c ON p.client_id = c.client_profile_id
                 ${baseWhere}`,
                countParams
            )
        ]);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error("Get All Patients Error:", error);
        res.status(500).json({ message: "Error fetching patients" });
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

        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'PATIENT_UPDATED',
                entityType: 'PATIENT',
                entityId: patient_id,
                details: { patient_name: full_name }
            });
        } catch (logErr) {
            console.error('Activity log error (non-fatal):', logErr);
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

        const deleted = result.rows[0];

        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'PATIENT_DELETED',
                entityType: 'PATIENT',
                entityId: patient_id,
                details: { patient_name: deleted.full_name, client_id: deleted.client_id }
            });
        } catch (logErr) {
            console.error('Activity log error (non-fatal):', logErr);
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

// Get full patient detail for profile page
exports.getPatientDetail = async (req, res) => {
    const { patient_id } = req.params;

    try {
        const [profileResult, bookingsResult, staffResult] = await Promise.all([
            db.query(
                `SELECT
                    p.*,
                    c.full_name       AS client_name,
                    c.primary_address AS client_address,
                    c.client_profile_id,
                    u.mobile_number   AS client_mobile,
                    u.email           AS client_email
                 FROM patient_profiles p
                 LEFT JOIN client_profiles c ON p.client_id = c.client_profile_id
                 LEFT JOIN users u ON c.user_id = u.user_id
                 WHERE p.patient_id = $1`,
                [patient_id]
            ),
            db.query(
                `SELECT
                    b.booking_id,
                    b.service_type,
                    b.start_date,
                    b.scheduled_end_time,
                    b.actual_end_time,
                    b.status,
                    b.service_model,
                    b.amount_quotated,
                    b.amount_paid,
                    b.daily_rate,
                    b.created_at,
                    sp.full_name   AS assigned_staff_name,
                    sp.designation AS assigned_staff_designation
                 FROM bookings b
                 LEFT JOIN staff_profiles sp ON b.assigned_staff_id = sp.staff_profile_id
                 WHERE b.patient_id = $1
                 ORDER BY b.created_at DESC`,
                [patient_id]
            ),
            db.query(
                `SELECT
                    sp.staff_profile_id,
                    sp.full_name  AS staff_name,
                    sp.designation,
                    COUNT(bsa.assignment_id)::int                                    AS total_assignments,
                    SUM(COALESCE(bsa.service_end_date, CURRENT_DATE)
                        - bsa.service_start_date + 1)::int                          AS total_days,
                    MIN(bsa.service_start_date)                                      AS first_worked,
                    MAX(COALESCE(bsa.service_end_date, CURRENT_DATE))               AS last_worked,
                    BOOL_OR(bsa.status = 'ACTIVE')                                  AS is_currently_active
                 FROM booking_staff_assignments bsa
                 JOIN bookings b ON bsa.booking_id = b.booking_id
                 JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
                 WHERE b.patient_id = $1
                 GROUP BY sp.staff_profile_id, sp.full_name, sp.designation
                 ORDER BY total_days DESC`,
                [patient_id]
            )
        ]);

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        const bookings = bookingsResult.rows;
        const activeBookings = bookings.filter(
            (b) => ['ACTIVE', 'PENDING'].includes((b.status || '').toUpperCase())
        );

        res.status(200).json({
            status: 'success',
            data: {
                patient: profileResult.rows[0],
                bookings,
                active_bookings: activeBookings,
                staff_history: staffResult.rows,
                summary: {
                    total_bookings: bookings.length,
                    active_bookings: activeBookings.length,
                    total_staff: staffResult.rows.length
                }
            }
        });
    } catch (error) {
        console.error("Get Patient Detail Error:", error);
        res.status(500).json({ message: "Error fetching patient detail" });
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