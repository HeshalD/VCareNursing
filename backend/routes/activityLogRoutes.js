const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/activityLogController');

router.get('/', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLog);
router.get('/actor/:user_id', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLogByActor);

module.exports = router;
