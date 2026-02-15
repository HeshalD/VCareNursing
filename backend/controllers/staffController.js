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