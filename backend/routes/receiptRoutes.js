const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const adminRoles = ['SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'];

// GET /api/payment-receipts — paginated list of all receipts (sorted by client)
router.get(
  '/',
  protect,
  restrictTo(...adminRoles),
  receiptController.getAllReceipts
);

// GET /api/payment-receipts/client/:client_id — list a client's receipts
router.get(
  '/client/:client_id',
  protect,
  restrictTo(...adminRoles),
  receiptController.getClientReceipts
);

// GET /api/payment-receipts/booking/:booking_id — receipts mapped to a booking's payments
router.get(
  '/booking/:booking_id',
  protect,
  restrictTo(...adminRoles),
  receiptController.getBookingReceipts
);

// POST /api/payment-receipts/:receipt_id/send — send/resend over WhatsApp
router.post(
  '/:receipt_id/send',
  protect,
  restrictTo(...adminRoles),
  receiptController.sendReceiptWhatsApp
);

// GET /api/payment-receipts/:receipt_id — receipt detail
router.get(
  '/:receipt_id',
  protect,
  restrictTo(...adminRoles),
  receiptController.getReceipt
);

module.exports = router;
