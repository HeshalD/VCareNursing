const express = require('express');
const router = express.Router();
const staffAssignmentController = require('../controllers/staffAssignmentController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

/**
 * Staff Assignment Routes
 * Handles staff-to-booking assignments as part of the 3-step workflow
 * Step 2C: After payment is recorded (Step 2A) and booking is created (Step 2B)
 */

/**
 * @route   GET /api/bookings/:booking_id/assignment-form
 * @desc    Get form data for staff assignment (quotation details, payment info, available staff)
 * @access  Private (SUPER_ADMIN, COORDINATOR)
 */
router.get(
  '/:booking_id/assignment-form',
  protect,
  requirePermission('VIEW_BOOKINGS'),
  staffAssignmentController.getAssignmentFormData
);

/**
 * @route   POST /api/bookings/:booking_id/assign-staff
 * @desc    Assign a staff member to a booking with auto-calculated dates
 * @access  Private (SUPER_ADMIN, COORDINATOR)
 * @body    staff_profile_id, service_start_date, daily_rate (optional), notes (optional)
 */
router.post(
  '/:booking_id/assign-staff',
  protect,
  requirePermission('ASSIGNMENT_ASSIGN'),
  staffAssignmentController.assignStaffToBooking
);

/**
 * @route   GET /api/bookings/:booking_id/assignments
 * @desc    Get all staff assignments for a booking (history and current)
 * @access  Private (SUPER_ADMIN, COORDINATOR)
 */
router.get(
  '/:booking_id/assignments',
  protect,
  requirePermission('VIEW_BOOKINGS'),
  staffAssignmentController.getBookingAssignments
);

/**
 * @route   GET /api/assignments/staff/:staff_profile_id/bookings
 * @desc    Get assignment-based bookings for a staff profile
 * @access  Private (staff and admin roles)
 */
// NOTE: shared with staff self-service (a nurse/caretaker viewing their own bookings) —
// deliberately NOT gated by requirePermission, since those roles have no staff_permissions row.
router.get(
  '/staff/:staff_profile_id/bookings',
  protect,
  restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR', 'SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffAssignmentController.getStaffAssignmentBookings
);

/**
 * @route   PUT /api/assignments/:assignment_id
 * @desc    Update assignment details (dates, rate, notes)
 * @access  Private (SUPER_ADMIN, COORDINATOR only)
 * @body    service_start_date (optional), service_end_date (optional), daily_rate (optional), notes (optional)
 */
router.put(
  '/assignment/:assignment_id',
  protect,
  requirePermission('ASSIGNMENT_UPDATE'),
  staffAssignmentController.updateAssignment
);

/**
 * @route   DELETE /api/assignments/:assignment_id
 * @desc    Complete/deactivate a staff assignment (soft delete with status=COMPLETED)
 * @access  Private (SUPER_ADMIN, COORDINATOR only)
 */
router.delete(
  '/assignment/:assignment_id',
  protect,
  requirePermission('ASSIGNMENT_COMPLETE'),
  staffAssignmentController.completeAssignment
);

module.exports = router;
