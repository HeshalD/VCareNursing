const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
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
router.get('/advances', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), getAllAdvances);
router.post('/approve-advance/:advanceId', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), approveAdvance);
router.post('/reject-advance/:advanceId', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), rejectAdvance);
router.patch('/threshold/:staffProfileId', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), updateAdvanceThreshold);
router.get('/advances/pending', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), getPendingAdvances);

module.exports = router;