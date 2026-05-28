const express = require('express');
const router = express.Router();
const statementController = require('../controllers/statementController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get('/transactions/:client_id', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'), statementController.getClientTransactions);
router.get('/:client_id', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'), statementController.getClientStatement);

router.post('/download/:client_id', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'), statementController.downloadClientStatement);
router.post('/whatsapp/:client_id', protect, restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'), statementController.sendClientStatementToWhatsApp);

module.exports = router;