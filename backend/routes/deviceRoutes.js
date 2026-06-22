const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/deviceController');

// Public: staff member has no session yet when activating a freshly assigned device
router.post('/activate', ctrl.activate);

router.use(protect);

// Any device-bound staff member can end their own session - not SUPER_ADMIN only.
router.post('/logout', ctrl.logout);

router.use(restrictTo('SUPER_ADMIN'));

router.post('/assign', ctrl.assign);
router.delete('/:id', ctrl.revoke);
router.get('/user/:userId', ctrl.listForUser);
router.get('/sessions', ctrl.listAllSessions);
router.post('/sessions/:id/force-logout', ctrl.forceLogout);

module.exports = router;
