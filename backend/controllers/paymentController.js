// controllers/statementController.js (or paymentController.js)
const db = require('../config/db');

exports.recordManualPayment = async (req, res) => {
    const { client_id } = req.params;
    const { 
        amount, 
        payment_method, // e.g., 'BANK_TRANSFER', 'CASH', 'CARD'
        notes,          // e.g., 'Paid via Sampath Bank transfer'
        booking_id,     // (Optional) If they are paying for a specific active booking
        receipt_url     // (Optional) S3 or Cloudinary link to the uploaded bank slip
    } = req.body;

    // We assume you have a "protect" middleware that puts the logged-in admin's info into req.user
    const adminId = req.user ? req.user.user_id : null; 

    try {
        // 1. Basic Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "A valid payment amount is required." });
        }
        if (!payment_method) {
            return res.status(400).json({ message: "Payment method is required for manual payments." });
        }

        // 2. Insert the CREDIT transaction into the ledger
        const newPaymentRes = await db.query(
            `INSERT INTO transactions (
                client_id, 
                booking_id, 
                category, 
                transaction_type, 
                amount, 
                payment_method, 
                notes, 
                receipt_url, 
                verified_by, 
                status
            ) VALUES ($1, $2, 'CLIENT_PAYMENT', 'CREDIT', $3, $4, $5, $6, $7, 'COMPLETED') 
            RETURNING *`,
            [
                client_id, 
                booking_id || null, 
                amount, 
                payment_method, 
                notes || 'Manual payment recorded by admin', 
                receipt_url || null, 
                adminId
            ]
        );

        const newPayment = newPaymentRes.rows[0];

        res.status(201).json({
            message: "Payment successfully recorded. The client's balance has been updated.",
            payment: newPayment
        });

    } catch (error) {
        console.error("Error recording manual payment:", error);
        res.status(500).json({ message: "Failed to record payment. Please try again." });
    }
};