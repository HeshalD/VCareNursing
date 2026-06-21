const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendSms } = require('../utils/sms');
const { sendServiceRequestConfirmed, sendCandidateProfile } = require('../utils/metaWhatsapp');

const formatServiceType = (type) => {
    if (!type) return 'our services';
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
};

const formatDate = (dateStr) => {
    if (!dateStr) return 'the requested date';
    return new Date(dateStr).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' });
};

const sendServiceRequestNotifications = async (mobileNumber, payerName, serviceType, startDate) => {
    const formattedType = formatServiceType(serviceType);
    const formattedDate = formatDate(startDate);
    const smsBody = `Hi ${payerName},\n\nWe have received your service request for ${formattedType} on ${formattedDate}.\n\nOur team is reviewing your request and will get back to you with a quote shortly.\n\nThank you for choosing VCare Nursing.`;

    const [smsRes, waRes] = await Promise.allSettled([
        sendSms(mobileNumber, smsBody),
        sendServiceRequestConfirmed(mobileNumber, payerName, formattedType, formattedDate),
    ]);

    if (smsRes.status === 'rejected') console.error('[ServiceRequest] SMS failed:', smsRes.reason?.message);
    if (waRes.status === 'rejected')  console.error('[ServiceRequest] WhatsApp failed:', waRes.reason?.message);
};

function extractActorRole(role) {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
    const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
    return result.rows[0]?.full_name || 'Admin';
}

exports.submitServiceRequest = async (req, res) => {
    try {
        const {
            payer_name,
            payer_mobile,
            patient_name,
            patient_age,
            patient_gender, // Care profile's own gender (MALE/FEMALE/OTHER)
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
                preferred_staff_id,
                gender
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::service_model_enum, $10,
                CASE WHEN $11::double precision IS NOT NULL AND $12::double precision IS NOT NULL
                     THEN point($12::double precision, $11::double precision)
                     ELSE NULL
                END,
                $13, $14, $15::gender_preference_enum, $16, $17::gender_enum
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
            preferred_staff_id || null,  // $16 (optional preferred staff)
            patient_gender || null  // $17 (care profile's own gender, optional)
        ];

        const result = await db.query(query, values);

        // 3. Send SMS + WhatsApp confirmation (non-fatal)
        sendServiceRequestNotifications(payer_mobile, payer_name, service_type, start_date).catch(() => {});

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
        const result = await db.query(`
            SELECT sr.*, b.status AS booking_status, b.booking_id
            FROM service_requests sr
            LEFT JOIN bookings b ON b.request_id = sr.request_id
            ORDER BY sr.created_at DESC
        `);
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

// Admin Method to manually create a service request
exports.createServiceRequest = async (req, res) => {
    const {
        client_id,
        payer_name,
        payer_mobile,
        patient_name,
        patient_age,
        patient_gender, // Care profile's own gender (MALE/FEMALE/OTHER)
        relationship_to_client,
        patient_condition,
        service_type,
        service_model,
        location_address,
        latitude,
        longitude,
        start_date,
        remarks,
        preferred_gender,
        preferred_staff_id,
        status
    } = req.body;

    try {
        // Validate required fields
        if (!payer_name || !payer_mobile || !patient_name || !patient_age || !service_type) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: payer_name, payer_mobile, patient_name, patient_age, service_type'
            });
        }

        // Validate service_model
        const validServiceModels = ['LIVE_IN', 'SHIFT_BASED', 'VISITING'];
        const finalServiceModel = service_model || 'SHIFT_BASED';
        
        if (!validServiceModels.includes(finalServiceModel)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid service model. Must be one of: LIVE_IN, SHIFT_BASED, VISITING'
            });
        }

        // Validate preferred_gender
        const validGenders = ['MALE', 'FEMALE', 'ANY'];
        const finalPreferredGender = preferred_gender || 'ANY';
        
        if (!validGenders.includes(finalPreferredGender.toUpperCase())) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid preferred gender. Must be MALE, FEMALE, or ANY'
            });
        }

        // Validate status
        const validStatuses = ['NEW_LEAD', 'PENDING', 'CONFIRMED', 'ASSIGNED', 'COMPLETED', 'CANCELLED'];
        const finalStatus = status || 'NEW_LEAD';
        
        if (!validStatuses.includes(finalStatus)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid status. Must be one of: NEW_LEAD, PENDING, CONFIRMED, ASSIGNED, COMPLETED, CANCELLED'
            });
        }

        // Validate patient age
        if (isNaN(patient_age) || patient_age <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Patient age must be a positive number'
            });
        }

        // Validate coordinates if provided
        let finalLatitude = null;
        let finalLongitude = null;
        
        if (latitude && longitude) {
            finalLatitude = parseFloat(latitude);
            finalLongitude = parseFloat(longitude);
            
            if (isNaN(finalLatitude) || isNaN(finalLongitude)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Latitude and longitude must be valid numbers'
                });
            }
        }

        // Insert new service request
        const insertQuery = `
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
                preferred_staff_id,
                status,
                gender,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::service_model_enum, $10,
                CASE WHEN $11::double precision IS NOT NULL AND $12::double precision IS NOT NULL
                     THEN point($12::double precision, $11::double precision)
                     ELSE NULL
                END,
                $13, $14, $15::gender_preference_enum, $16, $17, $18::gender_enum, NOW()
            )
            RETURNING
                request_id,
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
                preferred_staff_id,
                status,
                gender,
                created_at
        `;

        const insertValues = [
            client_id || null,
            payer_name,
            payer_mobile,
            patient_name,
            parseInt(patient_age),
            relationship_to_client || null,
            patient_condition || null,
            service_type,
            finalServiceModel,
            location_address || null,
            finalLatitude,
            finalLongitude,
            start_date || null,
            remarks || null,
            finalPreferredGender.toUpperCase(),
            preferred_staff_id || null,
            finalStatus,
            patient_gender || null
        ];

        const result = await db.query(insertQuery, insertValues);
        const newRequest = result.rows[0];

        // Log activity (non-fatal)
        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'SERVICE_REQUEST_CREATED',
                entityType: 'SERVICE_REQUEST',
                entityId: newRequest.request_id,
                details: {
                    payer_name,
                    payer_mobile,
                    patient_name,
                    service_type,
                    client_id: client_id || null,
                    proxy: true
                }
            });
        } catch (logErr) {
            console.error('Activity log error (non-fatal):', logErr);
        }

        // Send SMS + WhatsApp confirmation (non-fatal)
        sendServiceRequestNotifications(payer_mobile, payer_name, service_type, start_date).catch(() => {});

        res.status(201).json({
            status: 'success',
            message: 'Service request created successfully',
            data: newRequest
        });

    } catch (error) {
        console.error('Create Service Request Error:', error);
        
        // Handle specific database errors
        if (error.code === '23503') {
            return res.status(400).json({
                status: 'error',
                message: 'Foreign key violation: client_id or preferred_staff_id does not exist'
            });
        }

        if (error.code === '23505') {
            return res.status(400).json({
                status: 'error',
                message: 'Duplicate entry: service request already exists'
            });
        }

        if (error.code === '23514') {
            return res.status(400).json({
                status: 'error',
                message: 'Check constraint violation: Invalid value for enum field'
            });
        }

        res.status(500).json({
            status: 'error',
            message: 'Server error while creating service request'
        });
    }
};

// Client-specific methods

exports.getClientServiceRequests = async (req, res) => {
    try {
        const { client_id } = req.params;
        
        const result = await db.query(`
            SELECT sr.*, 
                   cp.full_name as client_name,
                   u.mobile_number as client_mobile
            FROM service_requests sr
            LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            WHERE sr.client_id = $1
            ORDER BY sr.created_at DESC
        `, [client_id]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching client service requests:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch service requests'
        });
    }
};

exports.getClientServiceRequestsWithQuotes = async (req, res) => {
    try {
        const { client_id } = req.params;
        
        const result = await db.query(`
            SELECT sr.*, 
                   cp.full_name as client_name,
                   u.mobile_number as client_mobile,
                   q.estimate_number,
                   q.daily_rate,
                   q.qty_days,
                   q.transport_fee,
                   q.registration_fee,
                   q.sub_total,
                   q.total_amount,
                   q.created_at as quote_created_at,
                   q.status as quote_status
            FROM service_requests sr
            LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            LEFT JOIN quotations q ON sr.request_id = q.request_id
            WHERE sr.client_id = $1
            ORDER BY sr.created_at DESC
        `, [client_id]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching client service requests with quotes:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch service requests with quotes'
        });
    }
};

exports.updateServiceRequest = async (req, res) => {
    const { id } = req.params;
    const {
        payer_name,
        payer_mobile,
        patient_name,
        patient_age,
        relationship_to_client,
        patient_condition,
        service_type,
        service_model,
        location_address,
        start_date,
        remarks,
        preferred_gender,
        status
    } = req.body;

    try {
        const existing = await db.query('SELECT * FROM service_requests WHERE request_id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Service request not found' });
        }
        const old = existing.rows[0];

        const result = await db.query(
            `UPDATE service_requests SET
                payer_name = COALESCE($1, payer_name),
                payer_mobile = COALESCE($2, payer_mobile),
                patient_name = COALESCE($3, patient_name),
                patient_age = COALESCE($4, patient_age),
                relationship_to_client = $5,
                patient_condition = $6,
                service_type = COALESCE($7, service_type),
                service_model = COALESCE($8::service_model_enum, service_model),
                location_address = $9,
                start_date = $10,
                remarks = $11,
                preferred_gender = COALESCE($12::gender_preference_enum, preferred_gender),
                status = COALESCE($13, status)
             WHERE request_id = $14
             RETURNING *`,
            [
                payer_name || null,
                payer_mobile || null,
                patient_name || null,
                patient_age != null ? parseInt(patient_age) : null,
                relationship_to_client !== undefined ? relationship_to_client : old.relationship_to_client,
                patient_condition !== undefined ? patient_condition : old.patient_condition,
                service_type || null,
                service_model || null,
                location_address !== undefined ? location_address : old.location_address,
                start_date !== undefined ? start_date : old.start_date,
                remarks !== undefined ? remarks : old.remarks,
                preferred_gender || null,
                status || null,
                id
            ]
        );

        const newServiceModel = result.rows[0].service_model;
        if (newServiceModel && newServiceModel !== old.service_model) {
            await db.query(
                `UPDATE bookings SET service_model = $1::service_model_enum WHERE request_id = $2`,
                [newServiceModel, id]
            );
        }

        const changes = {};
        const fields = [
            'payer_name', 'payer_mobile', 'patient_name', 'patient_age',
            'relationship_to_client', 'patient_condition', 'service_type',
            'service_model', 'location_address', 'start_date', 'remarks',
            'preferred_gender', 'status'
        ];
        for (const field of fields) {
            const oldVal = String(old[field] ?? '');
            const newVal = String(result.rows[0][field] ?? '');
            if (oldVal !== newVal) {
                changes[field] = { from: old[field], to: result.rows[0][field] };
            }
        }

        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'SERVICE_REQUEST_UPDATED',
                entityType: 'SERVICE_REQUEST',
                entityId: id,
                details: {
                    request_id: id,
                    payer_name: result.rows[0].payer_name,
                    changes
                }
            });
        } catch (logErr) {
            console.error('Activity log error:', logErr);
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Update Service Request Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update service request' });
    }
};

exports.getClientServiceRequestsWithPayments = async (req, res) => {
    try {
        const { client_id } = req.params;
        
        const result = await db.query(`
            SELECT sr.*, 
                   cp.full_name as client_name,
                   u.mobile_number as client_mobile,
                   ps.slip_id,
                   ps.slip_url,
                   ps.verified_at,
                   ps.created_at as payment_uploaded_at,
                   q.estimate_number,
                   q.total_amount
            FROM service_requests sr
            LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            LEFT JOIN quotations q ON sr.request_id = q.request_id
            LEFT JOIN payment_slips ps ON q.quote_id = ps.quote_id
            WHERE sr.client_id = $1
            ORDER BY sr.created_at DESC
        `, [client_id]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching client service requests with payments:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch service requests with payments'
        });
    }
};

// List staff profiles already sent to the client as candidates for a service request.
exports.getSentCandidates = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `SELECT staff_profile_id, sent_at FROM service_request_sent_candidates WHERE request_id = $1`,
            [id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Error fetching sent candidates:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch sent candidates' });
    }
};

// Send a staff member's profile to the client as a candidate for a service request, via WhatsApp.
// A given staff profile can be sent only once per service request (enforced by a UNIQUE constraint).
exports.sendCandidateProfile = async (req, res) => {
    const { id } = req.params; // service request id
    const { staff_profile_id } = req.body;

    if (!staff_profile_id) {
        return res.status(400).json({ status: 'error', message: 'staff_profile_id is required' });
    }

    try {
        const srRes = await db.query(
            `SELECT request_id, payer_name, payer_mobile, patient_name FROM service_requests WHERE request_id = $1`,
            [id]
        );
        if (!srRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Service request not found' });
        }
        const sr = srRes.rows[0];

        if (!sr.payer_mobile) {
            return res.status(400).json({ status: 'error', message: 'This service request has no client mobile number on file.' });
        }

        const staffRes = await db.query(
            `SELECT staff_profile_id, full_name, designation, profile_picture_url FROM staff_profiles WHERE staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (!staffRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
        }
        const staff = staffRes.rows[0];

        // Enforce one-time send per (service request, staff) before hitting WhatsApp.
        const dup = await db.query(
            `SELECT 1 FROM service_request_sent_candidates WHERE request_id = $1 AND staff_profile_id = $2`,
            [id, staff_profile_id]
        );
        if (dup.rows.length) {
            return res.status(409).json({ status: 'error', message: `${staff.full_name}'s profile has already been sent to this client for this request.` });
        }

        // The profile link is delivered via the template's dynamic URL button — we pass only the
        // staff_profile_id suffix; the base URL is configured on the Meta template.
        await sendCandidateProfile(
            sr.payer_mobile,
            sr.payer_name || 'there',
            sr.patient_name || 'your patient',
            staff.full_name,
            staff.designation,
            staff.staff_profile_id
        );

        // Record the send only after WhatsApp succeeds.
        const inserted = await db.query(
            `INSERT INTO service_request_sent_candidates (request_id, staff_profile_id, sent_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (request_id, staff_profile_id) DO NOTHING
             RETURNING staff_profile_id, sent_at`,
            [id, staff_profile_id, req.user.user_id]
        );

        try {
            const actorName = await getActorName(req.user.user_id);
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: extractActorRole(req.user.role),
                actionType: 'CANDIDATE_PROFILE_SENT',
                entityType: 'SERVICE_REQUEST',
                entityId: String(id),
                details: { staff_name: staff.full_name, staff_profile_id, client_name: sr.payer_name },
            });
        } catch (logErr) {
            console.error('Activity log failed (send candidate):', logErr.message);
        }

        res.status(200).json({
            status: 'success',
            message: `${staff.full_name}'s profile sent to ${sr.payer_name || 'the client'} on WhatsApp.`,
            data: inserted.rows[0] || { staff_profile_id, sent_at: new Date().toISOString() },
        });
    } catch (error) {
        console.error('Send Candidate Profile Error:', error.response?.data || error.message);
        res.status(500).json({ status: 'error', message: 'Failed to send the candidate profile via WhatsApp.' });
    }
};