const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/activityLogController');

router.get('/', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), ctrl.getActivityLog);
router.get('/actor/:user_id', protect, restrictTo('SUPER_ADMIN'), ctrl.getActivityLogByActor);

module.exports = router;
