const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const paymentTrackingController = require('../controllers/paymentTrackingController');
const bookingNotesController = require('../controllers/bookingNotesController');
const dailyAttendanceController = require('../controllers/dailyAttendanceController');
const shiftPatternController = require('../controllers/shiftPatternController');
const { protect, restrictTo, attachSalesScope, requireOwnSalesRecord } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

router.post(
    '/admin-direct',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    bookingController.adminDirectBooking
);

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
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'SALES'),
    attachSalesScope,
    bookingController.getAllBookings
);

router.get('/active-bookings', protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    bookingController.getActiveBookings);

router.get(
    '/:booking_id/admin-detail',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'ACCOUNTS', 'SALES'),
    requireOwnSalesRecord('booking_id', 'booking_salesperson_assignments'),
    bookingController.getAdminBookingDetail
);

router.get(
    '/:booking_id/termination-requests',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    bookingController.getBookingTerminationRequests
);

router.get(
    '/:booking_id/invoice-breakdown',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    bookingController.getBookingInvoiceBreakdown
);

router.get(
    '/:booking_id/staff-allocation-history',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    bookingController.getBookingStaffAllocationHistory
);

router.post(
    '/:booking_id/complete',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR'),
    bookingController.completeBooking
);

router.post(
    '/:booking_id/admin-terminate',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR'),
    bookingController.adminTerminateBooking
);

router.get(
    '/:booking_id/invoice-progress',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    paymentTrackingController.getBookingInvoiceProgress
);

router.post(
    '/:booking_id/record-payment',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    upload.single('payment_slip'),
    paymentTrackingController.recordBookingPayment
);

router.post(
    '/:booking_id/wallet-payoff',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    paymentTrackingController.walletPayoffBooking
);

router.get(
    '/:booking_id/payments',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    paymentTrackingController.getPaymentsByBooking
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

// GET /api/admin/terminations/history
router.get('/terminations/history', protect, restrictTo('SUPER_ADMIN', 'ADMIN'), bookingController.getTerminationHistory);

// POST /api/admin/terminations/:termination_id/approve
router.post('/terminations/approve/:termination_id', protect, restrictTo('SUPER_ADMIN', 'ADMIN'), bookingController.approveTerminationRequest);

// POST /api/admin/terminations/:termination_id/reject
router.post('/terminations/reject/:termination_id', protect, restrictTo('SUPER_ADMIN', 'ADMIN'), bookingController.rejectTerminationRequest);

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

// Daily attendance (staff in/out time + manual salary confirmation)
router.get('/:booking_id/attendance', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), dailyAttendanceController.getBookingAttendance);
router.post('/:booking_id/attendance', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), dailyAttendanceController.upsertAttendance);
router.post('/attendance/:attendance_id/confirm-salary', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), dailyAttendanceController.confirmSalary);

// Shift patterns + per-shift staff assignment (SHIFT_BASED only)
router.get('/:booking_id/shift-pattern', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), shiftPatternController.getShiftPattern);
router.get('/:booking_id/shift-pattern/history', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), shiftPatternController.getShiftPatternHistory);
router.post('/:booking_id/shift-pattern', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), shiftPatternController.createOrChangeShiftPattern);
router.get('/:booking_id/shift-slots', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), shiftPatternController.getShiftSlots);
router.post('/:booking_id/shift-slots/:shift_slot_id/assign-staff', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), shiftPatternController.assignStaffToSlot);
router.post('/:booking_id/shift-slots/:shift_slot_id/reassign-staff', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), shiftPatternController.reassignSlotStaff);

// Manual daily client invoicing (SHIFT_BASED/VISITING always, LIVE_IN when invoicing_mode = MANUAL)
router.get('/:booking_id/daily-invoices', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingController.getBookingDailyInvoices);
router.post('/:booking_id/daily-invoices', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingController.confirmDailyInvoice);
router.patch('/:booking_id/invoicing-mode', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingController.updateInvoicingMode);

// Notes CRUD
router.post('/:booking_id/notes', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingNotesController.addNote);
router.get('/:booking_id/notes', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingNotesController.getBookingNotes);
router.patch('/:booking_id/notes/:note_id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingNotesController.updateNote);
router.delete('/:booking_id/notes/:note_id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), bookingNotesController.deleteNote);

module.exports = router;