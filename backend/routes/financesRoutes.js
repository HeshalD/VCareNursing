const express = require('express');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { getOverview, getTransactions, getAdvancesSummary, getStaffWalletsSummary, getCreditAlertsSummary, getRevenueChart, getPaymentMethodsChart, getTransactionCategoriesChart } = require('../controllers/financesController');

const router = express.Router();

// Protect all routes and restrict to SUPER_ADMIN only
router.use(protect);
router.use(restrictTo('SUPER_ADMIN'));

// GET /api/finances/overview - Get financial overview
router.get('/overview', getOverview);

// GET /api/finances/transactions - Get paginated transactions with filters
router.get('/transactions', getTransactions);

// GET /api/finances/advances-summary - Get staff advances summary
router.get('/advances-summary', getAdvancesSummary);

// GET /api/finances/staff-wallets-summary - Get staff wallets summary
router.get('/staff-wallets-summary', getStaffWalletsSummary);

// GET /api/finances/credit-alerts-summary - Get credit alerts summary
router.get('/credit-alerts-summary', getCreditAlertsSummary);

// GET /api/finances/revenue-chart - Get revenue chart data
router.get('/revenue-chart', getRevenueChart);

// GET /api/finances/payment-methods-chart - Get payment methods chart data
router.get('/payment-methods-chart', getPaymentMethodsChart);

// GET /api/finances/transaction-categories-chart - Get transaction categories chart data
router.get('/transaction-categories-chart', getTransactionCategoriesChart);

module.exports = router;