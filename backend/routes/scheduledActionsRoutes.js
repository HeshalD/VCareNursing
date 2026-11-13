const express = require('express');
const router = express.Router();
const scheduledActionsController = require('../controllers/scheduledActionsController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

router.get(
    '/upcoming',
    protect,
    requirePermission('VIEW_UPCOMING_EVENTS'),
    scheduledActionsController.getUpcomingEvents
);

router.get(
    '/booking/:booking_id',
    protect,
    requirePermission('VIEW_UPCOMING_EVENTS'),
    scheduledActionsController.getBookingScheduledEvents
);

router.post(
    '/:action_id/cancel',
    protect,
    requirePermission('SCHEDULED_ACTION_CANCEL'),
    scheduledActionsController.cancelScheduledAction
);

// Permission is checked in the handler (BOOKING_SWAP_STAFF for a live-in swap,
// ASSIGNMENT_UPDATE for a shift reassignment).
router.post(
    '/:action_id/assign-replacement',
    protect,
    scheduledActionsController.assignReplacement
);

router.post(
    '/:action_id/execute-now',
    protect,
    requirePermission('SCHEDULED_ACTION_EXECUTE_NOW'),
    scheduledActionsController.executeScheduledActionNow
);

module.exports = router;
