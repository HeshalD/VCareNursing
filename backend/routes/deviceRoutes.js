const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/deviceController');

// Public: staff member has no session yet when activating a freshly assigned device
router.post('/activate', ctrl.activate);

router.use(protect);

// Any device-bound staff member can end their own session - not gated by permission.
router.post('/logout', ctrl.logout);

router.post('/assign', requirePermission('DEVICE_ASSIGN'), ctrl.assign);
router.delete('/:id', requirePermission('DEVICE_REVOKE'), ctrl.revoke);
router.get('/user/:userId', requirePermission('VIEW_ACTIVE_SESSIONS'), ctrl.listForUser);
router.get('/sessions', requirePermission('VIEW_ACTIVE_SESSIONS'), ctrl.listAllSessions);
router.post('/sessions/:id/force-logout', requirePermission('SESSION_FORCE_LOGOUT'), ctrl.forceLogout);

module.exports = router;
