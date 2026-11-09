const express = require('express');
const router = express.Router();
const cashRegisterController = require('../controllers/cashRegisterController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

// Frontdesk cash register. Reading needs the page permission; everything that changes
// the till needs CASH_REGISTER_OPERATE. Taking the payments themselves goes through the
// existing payment endpoints (client-payments, quotes, product-invoices, bookings) with an
// X-Register-Session header - see middleware/registerSession.js.

// GET /api/cash-register/current — the open day (totals + entries), today's closed day, suggested float
router.get('/current', protect, requirePermission('VIEW_CASH_REGISTER'), cashRegisterController.getCurrent);

// POST /api/cash-register/open — open today's till with a float
router.post('/open', protect, requirePermission('CASH_REGISTER_OPERATE'), cashRegisterController.openDay);

// POST /api/cash-register/cash-out — petty cash / client refund / cash banked
router.post('/cash-out', protect, requirePermission('CASH_REGISTER_OPERATE'), cashRegisterController.cashOut);

// POST /api/cash-register/cash-outs/:transaction_id/void
router.post('/cash-outs/:transaction_id/void', protect, requirePermission('CASH_REGISTER_OPERATE'), cashRegisterController.voidCashOut);

// Payments taken at the desk: edit (re-issues the receipt) or void, open day only
router.post('/payments/:receipt_id/void', protect, requirePermission('CASH_REGISTER_OPERATE'), cashRegisterController.voidPayment);
router.get(
  '/payments/:receipt_id/edit-context',
  protect,
  requirePermission('CASH_REGISTER_OPERATE'),
  cashRegisterController.assertCanEditPayment,
  cashRegisterController.getEditContext
);
router.patch(
  '/payments/:receipt_id/edit',
  protect,
  requirePermission('CASH_REGISTER_OPERATE'),
  upload.single('payment_slip'),
  cashRegisterController.assertCanEditPayment,
  cashRegisterController.editPayment
);

// History across days (manager view)
router.get('/sessions', protect, requirePermission('CASH_REGISTER_VIEW_ALL'), cashRegisterController.listSessions);
router.get('/sessions/:session_id', protect, requirePermission('VIEW_CASH_REGISTER'), cashRegisterController.getSession);
router.post('/sessions/:session_id/close', protect, requirePermission('CASH_REGISTER_OPERATE'), cashRegisterController.closeDay);
router.post('/sessions/:session_id/reopen', protect, requirePermission('CASH_REGISTER_REOPEN'), cashRegisterController.reopenDay);
router.post('/sessions/:session_id/review', protect, requirePermission('CASH_REGISTER_REVIEW'), cashRegisterController.reviewSession);

module.exports = router;
