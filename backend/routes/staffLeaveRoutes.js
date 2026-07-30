const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const {
  getMyLeaves,
  requestLeave,
  getAllLeaves,
  getPendingLeaves,
  getLeaveConflicts,
  getReplacementCandidates,
  approveLeave,
  rejectLeave,
  getStaffLeaveSummary,
} = require('../controllers/staffLeaveController');

// Staff routes
router.get('/my-leaves', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyLeaves);
router.post('/request', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), requestLeave);

// Admin routes
router.get('/all', protect, requirePermission('VIEW_STAFF_LEAVES'), getAllLeaves);
router.get('/pending', protect, requirePermission('VIEW_STAFF_LEAVES'), getPendingLeaves);
// Admins can view any staff member's leave summary; staff can only view their own (enforced in controller).
// NOTE: shared with staff self-service — deliberately NOT gated by requirePermission,
// since those roles have no staff_permissions row.
router.get('/summary/:staffProfileId', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getStaffLeaveSummary);
router.get('/:leaveId/conflicts', protect, requirePermission('VIEW_STAFF_LEAVES'), getLeaveConflicts);
router.get('/:leaveId/candidates', protect, requirePermission('VIEW_STAFF_LEAVES'), getReplacementCandidates);
router.post('/approve/:leaveId', protect, requirePermission('STAFF_LEAVE_APPROVE'), approveLeave);
router.post('/reject/:leaveId', protect, requirePermission('STAFF_LEAVE_REJECT'), rejectLeave);

module.exports = router;
