const db = require('../config/db');

// Get staff member by ID
exports.getStaffByID = async (req, res) => {
    const { staff_id } = req.params;

    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.staff_profile_id = $1
        `;

        const result = await db.query(query, [staff_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get Staff by ID Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff member' 
        });
    }
};

// Get all staff members with optional filtering
exports.getAllStaff = async (req, res) => {
    try {
        // Optional query parameters for filtering
        const { status, verification_status, role, page = 1, limit = 10 } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = '';
        const queryParams = [];
        let paramIndex = 1;

        if (status) {
            whereClause += ` AND sp.current_status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        if (role) {
            whereClause += ` AND u.role @> ARRAY[$${paramIndex}]::user_role_enum[]`;
            queryParams.push(role);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get All Staff Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members' 
        });
    }
};

// Update staff member status to unavailable
exports.updateStaffToUnavailable = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const query = `
            UPDATE staff_profiles 
            SET current_status = 'UNAVAILABLE'
            WHERE staff_profile_id = $1
            RETURNING staff_profile_id, full_name, current_status
        `;

        const result = await db.query(query, [staff_profile_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Staff member status updated to unavailable',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update Staff to Unavailable Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while updating staff member status' 
        });
    }
};

// Update staff member status (general method)
exports.updateStaffStatus = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { current_status } = req.body;

    try {
        const query = `
            UPDATE staff_profiles 
            SET current_status = $1
            WHERE staff_profile_id = $2
            RETURNING staff_profile_id, full_name, current_status
        `;

        const result = await db.query(query, [current_status, staff_profile_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            message: `Staff member status updated to ${current_status}`,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update Staff Status Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while updating staff member status' 
        });
    }
};

// Get staff members by their role
exports.getStaffByRole = async (req, res) => {
    try {
        const { role } = req.params;
        const { page = 1, limit = 10, status, verification_status } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = ' AND u.role @> ARRAY[$1]::user_role_enum[]';
        const queryParams = [role];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND sp.current_status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get Staff by Role Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members by role' 
        });
    }
};

// Get staff members by their gender
exports.getStaffByGender = async (req, res) => {
    try {
        const { gender } = req.params;
        const { page = 1, limit = 10, status, verification_status } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = ' AND sp.gender = $1';
        const queryParams = [gender];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND sp.current_status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get Staff by Gender Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members by gender' 
        });
    }
};

// Get all bookings assigned to a specific staff member
exports.getStaffAssignments = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { status } = req.query; // Optional: Filter by 'ACTIVE', 'COMPLETED', 'CANCELLED'

    try {
        let query = `
            SELECT 
                b.booking_id,
                b.start_date,
                b.status as booking_status,
                b.created_at as booking_date,
                p.full_name as patient_name,
                p.age as patient_age,
                p.medical_condition,
                p.residential_address as patient_address,
                p.emergency_contact_name,
                p.emergency_contact_number,
                c.primary_address as client_address,
                c.full_name as client_name,
                u.mobile_number as client_mobile
            FROM bookings b
            JOIN patient_profiles p ON b.patient_id = p.patient_id
            JOIN client_profiles c ON b.client_id = c.client_profile_id
            JOIN users u ON c.user_id = u.user_id
            WHERE b.assigned_staff_id = $1
        `;

        const queryParams = [staff_profile_id];

        // Add Status Filter if provided
        if (status) {
            query += ` AND b.status = $2`;
            queryParams.push(status);
        }

        // Sort by newest first
        query += ` ORDER BY b.start_date DESC`;

        const result = await db.query(query, queryParams);

        // Logic Check: If patient address is null (Standard Mode), use Client Address
        const assignments = result.rows.map(row => ({
            ...row,
            final_location: row.patient_address || row.client_address // Proxy Mode vs Standard Mode
        }));

        res.status(200).json({
            status: 'success',
            count: assignments.length,
            data: assignments
        });

    } catch (error) {
        console.error('Get Staff Assignments Error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while fetching assignments' 
        });
    }
};
