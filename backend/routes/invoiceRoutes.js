const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

router.get('/', protect, requirePermission('VIEW_INVOICES'), invoiceController.listInvoices);
router.get('/:invoice_id', protect, requirePermission('VIEW_INVOICES'), invoiceController.getInvoice);
router.get('/:invoice_id/pdf', protect, requirePermission('VIEW_INVOICES'), invoiceController.getInvoicePdf);

router.post(
  '/from-quote/:quote_id',
  protect,
  requirePermission('INVOICE_CREATE_FROM_QUOTE'),
  invoiceController.createInvoiceFromQuote
);

router.post(
  '/:invoice_id/resend',
  protect,
  requirePermission('INVOICE_RESEND'),
  invoiceController.resendInvoice
);

router.post(
  '/:invoice_id/record-payment',
  protect,
  requirePermission('INVOICE_RECORD_PAYMENT'),
  upload.single('payment_slip'),
  invoiceController.recordInvoicePayment
);

module.exports = router;
