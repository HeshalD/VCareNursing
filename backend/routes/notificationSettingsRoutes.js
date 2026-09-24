const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationSettingsController');
const { protect, requirePermission } = require('../middleware/authMiddleware');

router.get('/', protect, requirePermission('VIEW_NOTIFICATIONS'), controller.getSettings);
router.put('/', protect, requirePermission('NOTIFICATION_SETTINGS_EDIT'), controller.updateSettings);

module.exports = router;
