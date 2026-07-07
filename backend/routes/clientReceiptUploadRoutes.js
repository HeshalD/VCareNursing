const express = require('express');
const router = express.Router();
const clientReceiptUploadController = require('../controllers/clientReceiptUploadController');
const { uploadPaymentReceipt } = require('../middleware/uploadMiddleware');

// Public routes — no auth middleware. Token in URL acts as the credential.
router.get('/:token', clientReceiptUploadController.getReceiptUploadPortal);
router.post('/:token', uploadPaymentReceipt, clientReceiptUploadController.uploadPaymentReceipt);

module.exports = router;
