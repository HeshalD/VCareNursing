const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const paymentTrackingController = require('../controllers/paymentTrackingController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

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
    requirePermission('BOOKING_VERIFY_PAYMENT'),
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
    requirePermission('BOOKING_REJECT_PAYMENT'),
    paymentTrackingController.rejectPayment
);

module.exports = router;