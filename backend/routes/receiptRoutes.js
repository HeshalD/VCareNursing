const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

const adminRoles = ['SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'];

// GET /api/payment-receipts — paginated list of all receipts (sorted by client)
router.get(
  '/',
  protect,
  requirePermission('VIEW_RECEIPTS'),
  receiptController.getAllReceipts
);

// GET /api/payment-receipts/client/:client_id — list a client's receipts
router.get(
  '/client/:client_id',
  protect,
  requirePermission('VIEW_RECEIPTS'),
  receiptController.getClientReceipts
);

// GET /api/payment-receipts/booking/:booking_id — receipts mapped to a booking's payments
router.get(
  '/booking/:booking_id',
  protect,
  requirePermission('VIEW_RECEIPTS'),
  receiptController.getBookingReceipts
);

// POST /api/payment-receipts/:receipt_id/send — send/resend over WhatsApp
router.post(
  '/:receipt_id/send',
  protect,
  requirePermission('RECEIPT_SEND'),
  receiptController.sendReceiptWhatsApp
);

// GET /api/payment-receipts/:receipt_id/edit-context — current values + what is editable
router.get(
  '/:receipt_id/edit-context',
  protect,
  requirePermission('RECEIPT_EDIT_PAYMENT'),
  receiptController.getEditContext
);

// PATCH /api/payment-receipts/:receipt_id/edit — edits the payment behind a
// receipt; the receipt is voided and re-issued
router.patch(
  '/:receipt_id/edit',
  protect,
  requirePermission('RECEIPT_EDIT_PAYMENT'),
  upload.single('payment_slip'),
  receiptController.editReceiptPayment
);

// GET /api/payment-receipts/:receipt_id — receipt detail
router.get(
  '/:receipt_id',
  protect,
  requirePermission('VIEW_RECEIPTS'),
  receiptController.getReceipt
);

module.exports = router;
