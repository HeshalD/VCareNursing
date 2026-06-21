const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
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
router.get('/my-leaves', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY'), getMyLeaves);
router.post('/request', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY'), requestLeave);

// Admin routes
router.get('/all', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), getAllLeaves);
router.get('/pending', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), getPendingLeaves);
// Admins can view any staff member's leave summary; staff can only view their own (enforced in controller).
router.get('/summary/:staffProfileId', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'STAFF', 'NURSE', 'CARETAKER', 'NANNY'), getStaffLeaveSummary);
router.get('/:leaveId/conflicts', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), getLeaveConflicts);
router.get('/:leaveId/candidates', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), getReplacementCandidates);
router.post('/approve/:leaveId', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), approveLeave);
router.post('/reject/:leaveId', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), rejectLeave);

module.exports = router;
