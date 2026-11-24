const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const {
  getMyWallet,
  getMyAdvances,
  requestAdvance,
  approveAdvance,
  rejectAdvance,
  getAllAdvances,
  updateAdvanceThreshold,
  getPendingAdvances,
  giveOverAdvance,
  getStaffOverAdvances,
  getMyCurrentEarningsBreakdown,
  getMySalarySheets,
  getMyCareHistory,
} = require('../controllers/staffWalletController');

// Staff routes
router.get('/my-wallet', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyWallet);
router.get('/my-advances', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyAdvances);
router.get('/my-earnings-breakdown', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyCurrentEarningsBreakdown);
router.get('/my-salary-sheets', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMySalarySheets);
router.get('/my-care-history', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyCareHistory);
router.post('/request-advance', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), requestAdvance);

// Admin routes
router.get('/advances', protect, requirePermission('VIEW_ADVANCE_REQUESTS'), getAllAdvances);
router.post('/approve-advance/:advanceId', protect, requirePermission('ADVANCE_APPROVE'), approveAdvance);
router.post('/reject-advance/:advanceId', protect, requirePermission('ADVANCE_REJECT'), rejectAdvance);
router.patch('/threshold/:staffProfileId', protect, requirePermission('ADVANCE_UPDATE_THRESHOLD'), updateAdvanceThreshold);
router.get('/advances/pending', protect, requirePermission('VIEW_ADVANCE_REQUESTS'), getPendingAdvances);
router.post('/give-over-advance/:staffProfileId', protect, requirePermission('ADVANCE_OVER_GIVE'), giveOverAdvance);
router.get('/over-advances/:staffProfileId', protect, requirePermission('VIEW_USER_MANAGEMENT'), getStaffOverAdvances);

module.exports = router;