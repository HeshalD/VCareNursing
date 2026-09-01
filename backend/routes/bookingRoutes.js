const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const paymentTrackingController = require('../controllers/paymentTrackingController');
const bookingNotesController = require('../controllers/bookingNotesController');
const dailyAttendanceController = require('../controllers/dailyAttendanceController');
const dailyDraftController = require('../controllers/dailyDraftController');
const shiftPatternController = require('../controllers/shiftPatternController');
const { protect, restrictTo, attachSalesScope, requireOwnSalesRecord, requirePermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

router.post(
    '/admin-direct',
    protect,
    requirePermission('BOOKING_CREATE_DIRECT'),
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
    requirePermission('BOOKING_CONVERT_FROM_LEAD'),
    bookingController.uploadPaymentSlip,
    bookingController.convertToBooking
);

router.get('/',protect,
    requirePermission('VIEW_BOOKINGS'),
    attachSalesScope,
    bookingController.getAllBookings
);

router.get('/active-bookings', protect,
    requirePermission('VIEW_BOOKINGS'),
    bookingController.getActiveBookings);

router.get(
    '/:booking_id/admin-detail',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    requireOwnSalesRecord('booking_id', 'booking_salesperson_assignments'),
    bookingController.getAdminBookingDetail
);

router.get(
    '/:booking_id/termination-requests',
    protect,
    requirePermission('VIEW_TERMINATION_REQUESTS'),
    bookingController.getBookingTerminationRequests
);

router.get(
    '/:booking_id/invoice-breakdown',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    bookingController.getBookingInvoiceBreakdown
);

router.get(
    '/:booking_id/staff-allocation-history',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    bookingController.getBookingStaffAllocationHistory
);

router.post(
    '/:booking_id/complete',
    protect,
    requirePermission('BOOKING_COMPLETE'),
    bookingController.completeBooking
);

router.post(
    '/:booking_id/admin-terminate',
    protect,
    requirePermission('BOOKING_TERMINATE'),
    bookingController.adminTerminateBooking
);

router.post(
    '/:booking_id/pause',
    protect,
    requirePermission('BOOKING_PAUSE'),
    bookingController.pauseBooking
);

router.post(
    '/:booking_id/resume',
    protect,
    requirePermission('BOOKING_RESUME'),
    bookingController.resumeBooking
);

router.get(
    '/:booking_id/pauses',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    bookingController.getBookingPauses
);

router.get(
    '/:booking_id/invoice-progress',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    paymentTrackingController.getBookingInvoiceProgress
);

router.post(
    '/:booking_id/record-payment',
    protect,
    requirePermission('BOOKING_RECORD_PAYMENT'),
    upload.single('payment_slip'),
    paymentTrackingController.recordBookingPayment
);

router.post(
    '/:booking_id/wallet-payoff',
    protect,
    requirePermission('BOOKING_WALLET_PAYOFF'),
    paymentTrackingController.walletPayoffBooking
);

router.get(
    '/:booking_id/payments',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    paymentTrackingController.getPaymentsByBooking
);

router.get('/:booking_id', protect,  
    bookingController.getByBookingID);

// Client-specific routes
router.get('/client/:client_id', protect, bookingController.getClientBookings);
router.get(
    '/client/:client_id/overdue-bookings',
    protect,
    requirePermission('VIEW_BOOKINGS'),
    paymentTrackingController.getClientOverdueBookings
);

// Staff-specific routes
router.get('/staff/:staff_id', protect, bookingController.getStaffBookings);

router.post(
    '/terminate/:booking_id', 
    protect,
    bookingController.requestTermination
);

// GET /api/admin/terminations/pending
router.get('/terminations/pending', protect, requirePermission('VIEW_TERMINATION_REQUESTS'), bookingController.getPendingTerminationRequests);

// GET /api/admin/terminations/history
router.get('/terminations/history', protect, requirePermission('VIEW_TERMINATION_REQUESTS'), bookingController.getTerminationHistory);

// POST /api/admin/terminations/:termination_id/approve
router.post('/terminations/approve/:termination_id', protect, requirePermission('TERMINATION_APPROVE'), bookingController.approveTerminationRequest);

// POST /api/admin/terminations/:termination_id/reject
router.post('/terminations/reject/:termination_id', protect, requirePermission('TERMINATION_REJECT'), bookingController.rejectTerminationRequest);

// POST /api/admin/terminations/:booking_id/force-stop
router.post(
    '/terminations/force-stop/:booking_id',
    protect,
    requirePermission('BOOKING_FORCE_STOP'),
    bookingController.forceStopBooking
);

router.patch('/:booking_id/extend', protect, requirePermission('BOOKING_EXTEND'), bookingController.extendBooking);

// Manual overdue flag/clear for SHIFT_BASED bookings (no automatic cron detection for this model)
router.post('/:booking_id/mark-overdue', protect, requirePermission('BOOKING_MARK_OVERDUE'), bookingController.markShiftBookingOverdue);
router.post('/:booking_id/resolve-overdue', protect, requirePermission('BOOKING_RESOLVE_OVERDUE'), bookingController.resolveShiftBookingOverdue);

router.post('/:booking_id/swap-staff', protect, requirePermission('BOOKING_SWAP_STAFF'), bookingController.swapStaff);
router.get('/:booking_id/swap-history', protect, requirePermission('VIEW_BOOKINGS'), bookingController.getSwapHistory);
// Share a (replacement) staff member's profile with the booking's client on WhatsApp.
router.post('/:booking_id/send-staff-profile', protect, requirePermission('BOOKING_SEND_STAFF_PROFILE'), bookingController.sendStaffProfileToClient);

// Daily attendance (staff in/out time + manual salary confirmation)
router.get('/:booking_id/attendance', protect, requirePermission('VIEW_BOOKINGS'), dailyAttendanceController.getBookingAttendance);
router.get('/:booking_id/attendance/history', protect, requirePermission('VIEW_BOOKINGS'), dailyAttendanceController.getAttendanceHistory);
router.post('/:booking_id/attendance', protect, requirePermission('ATTENDANCE_RECORD'), dailyAttendanceController.upsertAttendance);
router.post('/:booking_id/attendance/absent', protect, requirePermission('ATTENDANCE_MARK_ABSENT'), dailyAttendanceController.markAbsent);
// Set/edit just the in_time and/or out_time on one assignment's day (used by the
// staff-swap out/in time capture and by editing a past swap's recorded times).
router.patch('/:booking_id/attendance/time', protect, requirePermission('ATTENDANCE_RECORD'), dailyAttendanceController.setAttendanceTime);
router.post('/attendance/:attendance_id/confirm-salary', protect, requirePermission('ATTENDANCE_CONFIRM_SALARY'), dailyAttendanceController.confirmSalary);
// Revoke a wrongly auto-paid/invoiced LIVE_IN day.
router.post('/:booking_id/attendance/revoke', protect, requirePermission('ATTENDANCE_REVOKE'), dailyAttendanceController.revokeDays);

// Day-draft staging (Draft -> Preview -> Confirm): everything entered in the Day
// Detail modal is cached here until explicitly confirmed — see dailyDraftController.js.
router.get('/:booking_id/day-drafts', protect, requirePermission('VIEW_BOOKINGS'), dailyDraftController.listDayDrafts);
router.get('/:booking_id/day-draft', protect, requirePermission('VIEW_BOOKINGS'), dailyDraftController.getDayDraft);
router.put('/:booking_id/day-draft', protect, requirePermission('ATTENDANCE_RECORD'), dailyDraftController.upsertDayDraft);
router.delete('/:booking_id/day-draft', protect, requirePermission('ATTENDANCE_RECORD'), dailyDraftController.discardDayDraft);
router.post('/:booking_id/day-draft/confirm', protect, requirePermission('ATTENDANCE_CONFIRM_DAY'), dailyDraftController.confirmDayDraft);

// Shift patterns + per-shift staff assignment (SHIFT_BASED only)
router.get('/:booking_id/shift-pattern', protect, requirePermission('VIEW_BOOKINGS'), shiftPatternController.getShiftPattern);
router.get('/:booking_id/shift-pattern/history', protect, requirePermission('VIEW_BOOKINGS'), shiftPatternController.getShiftPatternHistory);
router.post('/:booking_id/shift-pattern', protect, requirePermission('BOOKING_MANAGE_SHIFT_PATTERN'), shiftPatternController.createOrChangeShiftPattern);
router.get('/:booking_id/shift-slots', protect, requirePermission('VIEW_BOOKINGS'), shiftPatternController.getShiftSlots);
router.post('/:booking_id/shift-slots/:shift_slot_id/assign-staff', protect, requirePermission('ASSIGNMENT_ASSIGN'), shiftPatternController.assignStaffToSlot);
router.post('/:booking_id/shift-slots/:shift_slot_id/reassign-staff', protect, requirePermission('ASSIGNMENT_UPDATE'), shiftPatternController.reassignSlotStaff);

// Manual daily client invoicing (SHIFT_BASED/VISITING always, LIVE_IN when invoicing_mode = MANUAL)
router.get('/:booking_id/daily-invoices', protect, requirePermission('VIEW_BOOKINGS'), bookingController.getBookingDailyInvoices);
router.post('/:booking_id/daily-invoices', protect, requirePermission('BOOKING_CONFIRM_DAILY_INVOICE'), bookingController.confirmDailyInvoice);
router.patch('/:booking_id/invoicing-mode', protect, requirePermission('BOOKING_UPDATE_INVOICING_MODE'), bookingController.updateInvoicingMode);
router.patch('/:booking_id/rates', protect, requirePermission('BOOKING_UPDATE_RATE'), bookingController.updateBookingRates);

// Hospitalization status (any service model — patient may be admitted mid-booking)
router.patch('/:booking_id/hospitalization', protect, requirePermission('BOOKING_UPDATE_HOSPITALIZATION'), bookingController.updateHospitalizationStatus);

// Per-shift schedule (derived, manual — no cron) + waive/reschedule for SHIFT_BASED bookings
router.get('/:booking_id/shift-schedule', protect, requirePermission('VIEW_BOOKINGS'), bookingController.getShiftSchedule);
router.get('/:booking_id/shift-reschedules', protect, requirePermission('VIEW_BOOKINGS'), bookingController.getShiftReschedules);
router.post('/:booking_id/shift-occurrences/waive', protect, requirePermission('BOOKING_WAIVE_SHIFT'), bookingController.waiveShiftOccurrence);
router.post('/:booking_id/shift-occurrences/reschedule', protect, requirePermission('BOOKING_RESCHEDULE_SHIFT'), bookingController.rescheduleShiftOccurrence);
router.post('/:booking_id/shift-occurrences/:reschedule_id/cancel', protect, requirePermission('BOOKING_CANCEL_RESCHEDULE'), bookingController.cancelShiftReschedule);

// Notes CRUD
router.post('/:booking_id/notes', protect, requirePermission('BOOKING_ADD_NOTE'), bookingNotesController.addNote);
router.get('/:booking_id/notes', protect, requirePermission('VIEW_BOOKINGS'), bookingNotesController.getBookingNotes);
router.patch('/:booking_id/notes/:note_id', protect, requirePermission('BOOKING_EDIT_NOTE'), bookingNotesController.updateNote);
router.delete('/:booking_id/notes/:note_id', protect, requirePermission('BOOKING_DELETE_NOTE'), bookingNotesController.deleteNote);

// Permanently deletes the booking and every related record. Not a delegable
// permission — SUPER_ADMIN only, on purpose, so it can never be granted via
// Custom Roles.
router.delete('/:booking_id/hard-delete', protect, restrictTo('SUPER_ADMIN'), bookingController.hardDeleteBooking);

module.exports = router;