// controllers/statementController.js (or paymentController.js)
const db = require('../config/db');
const { resolveBankAccountId } = require('../utils/pettyCash');

const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

exports.recordManualPayment = async (req, res) => {
    const { client_id } = req.params;
    const {
        amount,
        payment_method, // 'BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'
        bank_account_id, // required for BANK_TRANSFER / CASH_DEPOSIT
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
        if (!payment_method || !VALID_PAYMENT_METHODS.includes(payment_method)) {
            return res.status(400).json({ message: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
        }
        if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bank_account_id) {
            return res.status(400).json({ message: `bank_account_id is required for ${payment_method}` });
        }

        // CASH payments have no client-supplied bank account — route them to Petty Cash instead.
        const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);

        // 2. Insert the CREDIT transaction into the ledger
        const newPaymentRes = await db.query(
            `INSERT INTO transactions (
                client_id,
                booking_id,
                category,
                transaction_type,
                amount,
                payment_method,
                bank_account_id,
                notes,
                receipt_url,
                verified_by,
                status
            ) VALUES ($1, $2, 'CLIENT_PAYMENT', 'CREDIT', $3, $4, $5, $6, $7, $8, 'COMPLETED')
            RETURNING *`,
            [
                client_id,
                booking_id || null,
                amount,
                payment_method,
                resolvedBankAccountId,
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