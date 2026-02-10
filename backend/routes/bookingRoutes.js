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
    bookingController.convertToBooking
);

module.exports = router;