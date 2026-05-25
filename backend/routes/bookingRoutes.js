const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const paymentTrackingController = require('../controllers/paymentTrackingController');
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

router.get('/',protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    bookingController.getAllBookings
);

router.get('/active-bookings', protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    bookingController.getActiveBookings);

router.get(
    '/:booking_id/invoice-progress',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    paymentTrackingController.getBookingInvoiceProgress
);

router.get('/:booking_id', protect,  
    bookingController.getByBookingID);

// Client-specific routes
router.get('/client/:client_id', protect, bookingController.getClientBookings);

// Staff-specific routes
router.get('/staff/:staff_id', protect, bookingController.getStaffBookings);

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

router.patch('/:booking_id/extend', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'), bookingController.extendBooking);

router.post('/:booking_id/swap-staff', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), bookingController.swapStaff);
router.get('/:booking_id/swap-history', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingController.getSwapHistory);

module.exports = router;