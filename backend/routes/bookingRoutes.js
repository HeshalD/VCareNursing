const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

/**
 * @route   POST /api/bookings/convert
 * @desc    Phase 3: Verify payment and convert Lead to permanent Client/Patient/Booking
 * @access  Private (Admin/Coordinator)
 */
router.post(
    '/convert', 
    protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    bookingController.uploadPaymentSlip,
    bookingController.convertToBooking
);

router.get('/active-bookings', protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    bookingController.getActiveBookings);

router.post(
    '/terminate/:booking_id', 
    protect,
    bookingController.requestTermination
);

// GET /api/admin/terminations/pending
router.get('/terminations/pending', protect, restrictTo('SUPER_ADMIN', 'ADMIN'), bookingController.getPendingTerminationRequests);

// POST /api/admin/terminations/:termination_id/approve
router.post('/terminations/approve/:termination_id', protect, restrictTo('SUPER_ADMIN', 'ADMIN'), bookingController.approveTerminationRequest);

// POST /api/admin/terminations/:booking_id/force-stop
router.post(
    '/terminations/force-stop/:booking_id', 
    protect, 
    restrictTo('SUPER_ADMIN', 'ADMIN'), 
    bookingController.forceStopBooking
);

module.exports = router;