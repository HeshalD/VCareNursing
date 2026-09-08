const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/activityLogController');

router.get('/', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLog);
router.get('/actor/:user_id', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLogByActor);
router.get('/client/:client_id', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLogByClient);
router.get('/booking/:booking_id', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLogByBooking);
router.get('/staff/:staff_profile_id', protect, requirePermission('VIEW_ACTIVITY_LOG'), ctrl.getActivityLogByStaff);

module.exports = router;
