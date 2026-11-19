const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/ledgerHealthController');

router.get('/summary', protect, requirePermission('VIEW_LEDGER_HEALTH'), ctrl.getSummary);
router.get('/findings', protect, requirePermission('VIEW_LEDGER_HEALTH'), ctrl.getFindings);
router.post('/run', protect, requirePermission('LEDGER_HEALTH_MANAGE'), ctrl.runNow);
router.post('/findings/:id/acknowledge', protect, requirePermission('LEDGER_HEALTH_MANAGE'), ctrl.acknowledge);
router.post('/findings/:id/unacknowledge', protect, requirePermission('LEDGER_HEALTH_MANAGE'), ctrl.unacknowledge);

module.exports = router;
