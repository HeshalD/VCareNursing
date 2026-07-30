const express = require('express');
const router = express.Router();
const statementController = require('../controllers/statementController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

router.get('/saved', protect, requirePermission('VIEW_STATEMENTS'), statementController.getSavedStatements);
router.get('/transactions/:client_id', protect, requirePermission('VIEW_STATEMENTS'), statementController.getClientTransactions);
router.get('/:client_id', protect, requirePermission('VIEW_STATEMENTS'), statementController.getClientStatement);

router.post('/download/:client_id', protect, requirePermission('VIEW_STATEMENTS'), statementController.downloadClientStatement);
router.post('/whatsapp/:client_id', protect, requirePermission('STATEMENT_SEND'), statementController.sendClientStatementToWhatsApp);
router.post('/whatsapp-resend/:statement_id', protect, requirePermission('STATEMENT_SEND'), statementController.resendStatementFromHistory);
router.delete('/:statement_id', protect, requirePermission('STATEMENT_DELETE'), statementController.deleteStatement);

module.exports = router;