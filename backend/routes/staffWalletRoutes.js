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
  getMyCurrentEarningsBreakdown,
} = require('../controllers/staffWalletController');

// Staff routes
router.get('/my-wallet', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyWallet);
router.get('/my-advances', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyAdvances);
router.get('/my-earnings-breakdown', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), getMyCurrentEarningsBreakdown);
router.post('/request-advance', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'), requestAdvance);

// Admin routes
router.get('/advances', protect, requirePermission('VIEW_ADVANCE_REQUESTS'), getAllAdvances);
router.post('/approve-advance/:advanceId', protect, requirePermission('ADVANCE_APPROVE'), approveAdvance);
router.post('/reject-advance/:advanceId', protect, requirePermission('ADVANCE_REJECT'), rejectAdvance);
router.patch('/threshold/:staffProfileId', protect, requirePermission('ADVANCE_UPDATE_THRESHOLD'), updateAdvanceThreshold);
router.get('/advances/pending', protect, requirePermission('VIEW_ADVANCE_REQUESTS'), getPendingAdvances);

module.exports = router;