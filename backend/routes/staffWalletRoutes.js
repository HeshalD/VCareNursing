const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
  getMyWallet,
  requestAdvance,
  approveAdvance,
  rejectAdvance,
  getAllAdvances,
  updateAdvanceThreshold,
  getPendingAdvances
} = require('../controllers/staffWalletController');

// Staff routes
router.get('/my-wallet', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY'), getMyWallet);
router.post('/request-advance', protect, restrictTo('STAFF', 'NURSE', 'CARETAKER', 'NANNY'), requestAdvance);

// Admin routes
router.get('/advances', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), getAllAdvances);
router.post('/approve-advance/:advanceId', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), approveAdvance);
router.post('/reject-advance/:advanceId', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), rejectAdvance);
router.patch('/threshold/:staffProfileId', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), updateAdvanceThreshold);
router.get('/advances/pending', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS'), getPendingAdvances);

module.exports = router;