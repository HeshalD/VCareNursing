const db = require('../config/db');
const { sendWhatsAppMessage } = require('../utils/whatsapp');

// Get staff member by ID
exports.getStaffByID = async (req, res) => {
    const { staff_id } = req.params;

    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                sp.total_reviews,
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

// Get staff member by user_id
exports.getStaffByUserID = async (req, res) => {
    const { user_id } = req.params;

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
                sp.advance_threshold_amount,
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
            WHERE sp.user_id = $1
        `;

        const result = await db.query(query, [user_id]);

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
        console.error('Get Staff by User ID Error:', error);
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
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
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

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
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

// Get all staff members with current_status as 'available'
exports.getAvailableStaff = async (req, res) => {
    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.current_status = 'AVAILABLE'
            ORDER BY sp.created_at DESC
        `;

        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get Available Staff Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while fetching available staff members'
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
                CAST(sp.average_rating AS FLOAT) as average_rating,
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

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
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

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
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

// Get staff members who are willing to live in with clients
exports.getStaffWillingToLiveIn = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, verification_status, role } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = ' AND sp.willing_to_live_in = TRUE';
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

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
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
        console.error('Get Staff Willing to Live In Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members willing to live in' 
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

// Delete a staff profile
exports.deleteStaffProfile = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        // First check if staff member exists
        const checkQuery = `
            SELECT staff_profile_id, full_name, user_id
            FROM staff_profiles 
            WHERE staff_profile_id = $1
        `;

        const checkResult = await db.query(checkQuery, [staff_profile_id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        const staffMember = checkResult.rows[0];

        // Check if staff member has active bookings
        const activeBookingsQuery = `
            SELECT COUNT(*) as active_bookings
            FROM bookings 
            WHERE assigned_staff_id = $1 AND status IN ('ACTIVE', 'PENDING')
        `;

        const activeBookingsResult = await db.query(activeBookingsQuery, [staff_profile_id]);
        const activeBookingsCount = parseInt(activeBookingsResult.rows[0].active_bookings);

        if (activeBookingsCount > 0) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Cannot delete staff member with active bookings' 
            });
        }

        // Delete staff profile (this will cascade delete related records if properly set up)
        const deleteQuery = `
            DELETE FROM staff_profiles 
            WHERE staff_profile_id = $1
            RETURNING staff_profile_id, full_name
        `;

        const deleteResult = await db.query(deleteQuery, [staff_profile_id]);

        // Delete the associated user account entirely
        const deleteUserQuery = `
            DELETE FROM users 
            WHERE user_id = $1
        `;

        await db.query(deleteUserQuery, [staffMember.user_id]);

        res.status(200).json({
            status: 'success',
            message: 'Staff profile and associated user account deleted successfully',
            data: deleteResult.rows[0]
        });

    } catch (error) {
        console.error('Delete Staff Profile Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while deleting staff profile' 
        });
    }
};

// Update staff profile (Admin only)
exports.updateStaffProfile = async (req, res) => {
    const { staff_profile_id } = req.params;
    const {
        full_name,
        designation,
        qualifications,
        home_address,
        location,
        gender,
        willing_to_live_in,
        date_of_birth,
        email,
        mobile_number,
        role
    } = req.body;

    // Extract file URLs from multer/Cloudinary
    const uploadedDocuments = req.files && req.files.documents ? req.files.documents.map(file => file.path) : [];
    const uploadedProfilePicture = req.files && req.files.profile_picture ? req.files.profile_picture[0].path : null;

    try {
        // Validate staff exists
        const existingQuery = `
            SELECT staff_profile_id, user_id, profile_picture_url, document_urls
            FROM staff_profiles 
            WHERE staff_profile_id = $1
        `;

        const existingResult = await db.query(existingQuery, [staff_profile_id]);

        if (existingResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Staff member not found'
            });
        }

        const existingStaff = existingResult.rows[0];

        // Security Check: Only the owner or an admin/coordinator can update
        const isOwner = existingStaff.user_id === req.user.user_id;
        const isAdmin = ['SUPER_ADMIN', 'COORDINATOR'].includes(req.user.role);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                status: 'error',
                message: 'You are not authorized to update this profile'
            });
        }

        // Validate required fields if provided
        if (full_name === '' || designation === '' || gender === '' || date_of_birth === '') {
            return res.status(400).json({
                status: 'error',
                message: 'Required fields cannot be empty'
            });
        }

        // Validate and set role if provided
        if (role) {
            const userRole = role.toUpperCase();
            const validRoles = ['NURSE', 'NANNY', 'CARETAKER', 'COORDINATOR'];
            
            if (!validRoles.includes(userRole)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid role. Must be one of: NURSE, NANNY, CARETAKER, COORDINATOR'
                });
            }

            // Update user role if provided
            const updateUserRoleQuery = `
                UPDATE users 
                SET role = $1::user_role_enum[]
                WHERE user_id = $2
            `;
            await db.query(updateUserRoleQuery, [[userRole], existingStaff.user_id]);
        }

        // Validate date format if provided
        if (date_of_birth) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date_of_birth)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid date format. Use YYYY-MM-DD'
                });
            }
        }

        // Validate gender if provided
        if (gender) {
            const validGenders = ['MALE', 'FEMALE', 'OTHER'];
            if (!validGenders.includes(gender.toUpperCase())) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid gender. Must be MALE, FEMALE, or OTHER'
                });
            }
        }

        // Prepare document URLs - keep existing if no new ones uploaded
        const finalDocumentUrls = uploadedDocuments.length > 0 ? uploadedDocuments : existingStaff.document_urls;

        // Prepare profile picture - use new one if uploaded, otherwise keep existing
        const finalProfilePicture = uploadedProfilePicture || existingStaff.profile_picture_url;

        // Update staff profile
        const updateQuery = `
            UPDATE staff_profiles 
            SET 
                full_name = COALESCE($2, full_name),
                designation = COALESCE($3, designation),
                qualifications = COALESCE($4, qualifications),
                document_urls = COALESCE($5, document_urls),
                home_address = COALESCE($6, home_address),
                location = COALESCE($7, location),
                profile_picture_url = COALESCE($8, profile_picture_url),
                gender = COALESCE($9, gender),
                willing_to_live_in = COALESCE($10, willing_to_live_in),
                date_of_birth = COALESCE($11, date_of_birth),
                updated_at = NOW()
            WHERE staff_profile_id = $1
            RETURNING 
                staff_profile_id,
                user_id,
                full_name,
                designation,
                qualifications,
                document_urls,
                home_address,
                location,
                profile_picture_url,
                gender,
                willing_to_live_in,
                date_of_birth,
                current_status,
                verification_status,
                created_at,
                updated_at
        `;

        const updateValues = [
            staff_profile_id,
            full_name || null,
            designation || null,
            qualifications || null,
            finalDocumentUrls || null,
            home_address || null,
            location || null,
            finalProfilePicture || null,
            gender ? gender.toUpperCase() : null,
            willing_to_live_in !== undefined ? willing_to_live_in : null,
            date_of_birth || null
        ];

        const result = await db.query(updateQuery, updateValues);

        // Get updated user info
        const userQuery = `
            SELECT user_id, email, mobile_number, role
            FROM users 
            WHERE user_id = $1
        `;

        const userResult = await db.query(userQuery, [existingStaff.user_id]);
        const user = userResult.rows[0];

        res.status(200).json({
            status: 'success',
            message: 'Staff profile updated successfully',
            data: {
                ...result.rows[0],
                user_info: {
                    user_id: user.user_id,
                    email: user.email,
                    mobile_number: user.mobile_number,
                    role: user.role
                }
            }
        });

    } catch (error) {
        console.error('Update Staff Profile Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while updating staff profile'
        });
    }
};

// Create staff profile manually (Admin only)
exports.createStaffProfile = async (req, res) => {
    const {
        user_id,
        full_name,
        designation,
        qualifications,
        document_urls,
        home_address,
        location,
        gps_coordinates,
        gender,
        willing_to_live_in,
        date_of_birth,
        email,
        mobile_number,
        role
    } = req.body;

    // Extract file URLs from multer/Cloudinary
    const uploadedDocuments = req.files && req.files.documents ? req.files.documents.map(file => file.path) : [];
    const uploadedProfilePicture = req.files && req.files.profile_picture ? req.files.profile_picture[0].path : null;

    try {
        // Validate required fields
        if (!full_name || !designation || !gender || !date_of_birth) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: full_name, designation, gender, date_of_birth'
            });
        }

        // Validate and set role (default to NURSE if not provided)
        const userRole = role ? [role.toUpperCase()] : ['NURSE'];
        const validRoles = ['NURSE', 'NANNY', 'CARETAKER', 'COORDINATOR'];
        
        if (!validRoles.includes(userRole[0])) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid role. Must be one of: NURSE, NANNY, CARETAKER, COORDINATOR'
            });
        }

        // Always create new user for staff profile creation (Admin only)
        if (!email || !mobile_number) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and mobile number are required for staff profile creation'
            });
        }

        // Check if user already exists by email or mobile
        const existingUserQuery = `
            SELECT user_id, email, mobile_number
            FROM users 
            WHERE email = $1 OR mobile_number = $2
        `;

        const userCheckResult = await db.query(existingUserQuery, [email, mobile_number]);

        if (userCheckResult.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'User with this email or mobile number already exists'
            });
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        // Create new user
        const createUserQuery = `
            INSERT INTO users (email, password_hash, mobile_number, role, is_email_verified)
            VALUES ($1, $2, $3, $4::user_role_enum[], true)
            RETURNING user_id, email, mobile_number, role
        `;

        const userResult = await db.query(createUserQuery, [email, hashedPassword, mobile_number, userRole]);
        const user = userResult.rows[0];
        const finalUserId = user.user_id;

        // Check if staff profile already exists for this user
        const existingProfileQuery = `
            SELECT staff_profile_id
            FROM staff_profiles 
            WHERE user_id = $1
        `;

        const existingResult = await db.query(existingProfileQuery, [finalUserId]);

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Staff profile already exists for this user'
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date_of_birth)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Validate gender
        const validGenders = ['MALE', 'FEMALE', 'OTHER'];
        if (!validGenders.includes(gender.toUpperCase())) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid gender. Must be MALE, FEMALE, or OTHER'
            });
        }

        // Use uploaded documents if available, otherwise use empty array
        const finalDocumentUrls = uploadedDocuments.length > 0 ? uploadedDocuments : [];

        // Insert new staff profile
        const insertQuery = `
            INSERT INTO staff_profiles (
                user_id,
                full_name,
                designation,
                qualifications,
                document_urls,
                home_address,
                location,
                profile_picture_url,
                gender,
                willing_to_live_in,
                date_of_birth,
                current_status,
                verification_status,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'AVAILABLE', 'VERIFIED', NOW()
            )
            RETURNING 
                staff_profile_id,
                user_id,
                full_name,
                designation,
                qualifications,
                document_urls,
                home_address,
                location,
                profile_picture_url,
                gender,
                willing_to_live_in,
                date_of_birth,
                current_status,
                verification_status,
                created_at
        `;

        const insertValues = [
            finalUserId,
            full_name,
            designation,
            qualifications || null,
            finalDocumentUrls.length > 0 ? finalDocumentUrls : null,
            home_address || null,
            location || null,
            uploadedProfilePicture || null,
            gender.toUpperCase(),
            willing_to_live_in || false,
            date_of_birth
        ];

        const result = await db.query(insertQuery, insertValues);

        // Send WhatsApp notification with temporary password and email
        const messageBody = `Hello ${full_name}!

Great news! Your staff account has been created by the administrator!

Here are your login details:

EMAIL: ${email}
TEMPORARY PASSWORD: ${tempPassword}

STEP 1: Go to VCare website
STEP 2: Click "Login" 
STEP 3: Enter your EMAIL: ${email}
STEP 4: Enter your temporary password: ${tempPassword}
STEP 5: You'll be automatically prompted to set your own permanent password

IMPORTANT: Use your EMAIL address (not phone number) to login the first time!

We're excited to have you join our team of dedicated healthcare professionals!

With love,
The VCare Team`;

        Promise.allSettled([
            sendWhatsAppMessage(mobile_number, messageBody)
        ]);

        res.status(201).json({
            status: 'success',
            message: 'Staff profile created successfully',
            data: {
                ...result.rows[0],
                user_info: {
                    user_id: user.user_id,
                    email: user.email,
                    mobile_number: user.mobile_number,
                    role: user.role
                }
            }
        });

    } catch (error) {
        console.error('Create Staff Profile Error:', error);
        
        // Handle specific database errors
        if (error.code === '23503') {
            return res.status(400).json({
                status: 'error',
                message: 'Foreign key violation: user_id does not exist'
            });
        }

        if (error.code === '23505') {
            return res.status(400).json({
                status: 'error',
                message: 'Duplicate entry: staff profile already exists for this user'
            });
        }

        res.status(500).json({
            status: 'error',
            message: 'Server error while creating staff profile'
        });
    }
};

// Get top 5 staff members by highest average ratings
exports.getTopRatedStaff = async (req, res) => {
    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.average_rating IS NOT NULL AND sp.average_rating > 0
            ORDER BY sp.average_rating DESC
            LIMIT 5
        `;

        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get Top Rated Staff Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching top rated staff members' 
        });
    }
};

