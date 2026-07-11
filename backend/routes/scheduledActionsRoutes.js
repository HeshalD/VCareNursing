const express = require('express');
const router = express.Router();
const scheduledActionsController = require('../controllers/scheduledActionsController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get(
    '/upcoming',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    scheduledActionsController.getUpcomingEvents
);

router.get(
    '/booking/:booking_id',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'ACCOUNTS'),
    scheduledActionsController.getBookingScheduledEvents
);

router.post(
    '/:action_id/cancel',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR'),
    scheduledActionsController.cancelScheduledAction
);

router.post(
    '/:action_id/execute-now',
    protect,
    restrictTo('SUPER_ADMIN', 'ADMIN', 'COORDINATOR'),
    scheduledActionsController.executeScheduledActionNow
);

module.exports = router;
