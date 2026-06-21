const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const paymentTrackingController = require('../controllers/paymentTrackingController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// POST /api/statements/:client_id/pay
router.post(
    '/statements/:client_id/pay', 
    protect,
    paymentController.recordManualPayment
);

// ==================== PAYMENT VERIFICATION ROUTES ====================

/**
 * @route   POST /api/payments/:payment_id/verify
 * @desc    Verify/approve a pending payment
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 * @body    verification_notes (optional)
 */
router.post(
    '/:payment_id/verify',
    protect,
    restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
    paymentTrackingController.verifyPayment
);

/**
 * @route   POST /api/payments/:payment_id/reject
 * @desc    Reject a payment with reason
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 * @body    rejection_reason (required)
 */
router.post(
    '/:payment_id/reject',
    protect,
    restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
    paymentTrackingController.rejectPayment
);

module.exports = router;