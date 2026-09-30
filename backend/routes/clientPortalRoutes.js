const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientPortalDocsController');
const { protect } = require('../middleware/authMiddleware');

// Client-facing, read-only document endpoints. Scoped to the logged-in
// client's own profile inside the controller.
router.use(protect);

router.get('/quotations', ctrl.listQuotations);
router.get('/quotations/:quote_id/pdf', ctrl.getQuotationPdf);
router.get('/receipts', ctrl.listReceipts);
router.get('/receipts/:receipt_id/pdf', ctrl.getReceiptPdf);
router.get('/invoices', ctrl.listInvoices);
router.get('/invoices/:kind/:id/pdf', ctrl.getInvoicePdf);
router.get('/statements', ctrl.listStatements);
router.get('/statements/download', ctrl.downloadStatement);
router.get('/staff-log', ctrl.listStaffLog);

module.exports = router;
