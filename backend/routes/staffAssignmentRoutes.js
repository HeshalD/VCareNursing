const express = require('express');
const router = express.Router();
const staffAssignmentController = require('../controllers/staffAssignmentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

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
  restrictTo('SUPER_ADMIN', 'COORDINATOR'),
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
  restrictTo('SUPER_ADMIN', 'COORDINATOR'),
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
  restrictTo('SUPER_ADMIN', 'COORDINATOR'),
  staffAssignmentController.getBookingAssignments
);

/**
 * @route   GET /api/assignments/staff/:staff_profile_id/bookings
 * @desc    Get assignment-based bookings for a staff profile
 * @access  Private (staff and admin roles)
 */
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
  restrictTo('SUPER_ADMIN', 'COORDINATOR'),
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
  restrictTo('SUPER_ADMIN', 'COORDINATOR'),
  staffAssignmentController.completeAssignment
);

module.exports = router;
