const db = require('../config/db');

exports.getClientPaymentSlips = async (req, res) => {
    try {
        const { client_id } = req.params;
        
        const result = await db.query(`
            SELECT ps.*, 
                   q.estimate_number,
                   q.daily_rate,
                   q.total_amount,
                   sr.request_id,
                   sr.patient_name,
                   sr.service_type,
                   sr.payer_name,
                   sr.payer_mobile,
                   cp.full_name as client_name,
                   u.mobile_number as client_mobile
            FROM payment_slips ps
            JOIN quotations q ON ps.quote_id = q.quote_id
            JOIN service_requests sr ON q.request_id = sr.request_id
            LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            WHERE sr.client_id = $1
            ORDER BY ps.created_at DESC
        `, [client_id]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching client payment slips:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch payment slips'
        });
    }
};
