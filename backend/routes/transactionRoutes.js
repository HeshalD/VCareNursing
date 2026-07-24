const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const adminRoles = ['SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'];

// GET /api/transactions/meta — enum values for dropdowns
router.get(
  '/meta',
  protect,
  restrictTo(...adminRoles),
  transactionController.getTransactionMeta
);

// POST /api/transactions/manual — record an off-platform transaction
router.post(
  '/manual',
  protect,
  restrictTo(...adminRoles),
  transactionController.createManualTransaction
);

// GET /api/transactions/manual-categories — custom OTHER_INCOME/OTHER_EXPENSE categories
router.get(
  '/manual-categories',
  protect,
  restrictTo(...adminRoles),
  transactionController.getManualCategories
);

// POST /api/transactions/manual-categories — create a reusable custom category
router.post(
  '/manual-categories',
  protect,
  restrictTo(...adminRoles),
  transactionController.createManualCategory
);

// GET /api/transactions/export/pdf — same filters, every matching row, as a landscape PDF
router.get(
  '/export/pdf',
  protect,
  restrictTo(...adminRoles),
  transactionController.exportTransactionsPdf
);

// GET /api/transactions — full ledger with filters
router.get(
  '/',
  protect,
  restrictTo(...adminRoles),
  transactionController.getAllTransactions
);

module.exports = router;
