const express = require('express');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { getOverview, getAdvancesSummary, getStaffWalletsSummary, getCreditAlertsSummary, getRevenueChart, getPaymentMethodsChart, getTransactionCategoriesChart, getReceivablesAging, getPayablesAging, getProfitLoss, getProfitLossPdf, getBalanceSheet, getBalanceSheetPdf, getSalesByCustomer, getSalesByCustomerPdf, getCashFlowSummary, getIncomeExpenseChart, getTopExpenses } = require('../controllers/financesController');

const router = express.Router();

// Protect all routes and restrict to SUPER_ADMIN only
router.use(protect);
router.use(restrictTo('SUPER_ADMIN'));

// GET /api/finances/overview - Get financial overview
router.get('/overview', getOverview);

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

// GET /api/finances/receivables-aging - Get overdue receivables broken out by age bucket
router.get('/receivables-aging', getReceivablesAging);

// GET /api/finances/payables-aging - Get unpaid staff wallet balances broken out by age bucket
router.get('/payables-aging', getPayablesAging);

// GET /api/finances/profit-loss - Get the Profit & Loss report (monthly/6-month/yearly)
router.get('/profit-loss', getProfitLoss);

// GET /api/finances/profit-loss/pdf - Get the Profit & Loss report as a downloadable PDF
router.get('/profit-loss/pdf', getProfitLossPdf);

// GET /api/finances/balance-sheet - Get the Balance Sheet as of a date
router.get('/balance-sheet', getBalanceSheet);

// GET /api/finances/balance-sheet/pdf - Get the Balance Sheet as a downloadable PDF
router.get('/balance-sheet/pdf', getBalanceSheetPdf);

// GET /api/finances/sales-by-customer - Get sales grouped by customer for a date range
router.get('/sales-by-customer', getSalesByCustomer);

// GET /api/finances/sales-by-customer/pdf - Get the Sales by Customer report as a downloadable PDF
router.get('/sales-by-customer/pdf', getSalesByCustomerPdf);

// GET /api/finances/cash-flow - Get the dashboard Cash Flow chart for a period
router.get('/cash-flow', getCashFlowSummary);

// GET /api/finances/income-expense-chart - Get the dashboard Income & Expense chart for a period
router.get('/income-expense-chart', getIncomeExpenseChart);

// GET /api/finances/top-expenses - Get the dashboard Top Expenses breakdown for a period
router.get('/top-expenses', getTopExpenses);

module.exports = router;