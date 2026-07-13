const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

router.get('/', protect, restrictTo(...ADMIN_ROLES), invoiceController.listInvoices);
router.get('/:invoice_id', protect, restrictTo(...ADMIN_ROLES), invoiceController.getInvoice);
router.get('/:invoice_id/pdf', protect, restrictTo(...ADMIN_ROLES), invoiceController.getInvoicePdf);

router.post(
  '/from-quote/:quote_id',
  protect,
  restrictTo(...ADMIN_ROLES),
  invoiceController.createInvoiceFromQuote
);

router.post(
  '/:invoice_id/record-payment',
  protect,
  restrictTo(...ADMIN_ROLES),
  upload.single('payment_slip'),
  invoiceController.recordInvoicePayment
);

module.exports = router;
