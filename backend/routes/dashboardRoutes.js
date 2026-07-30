const express = require('express');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const { getDashboardOverview } = require('../controllers/dashboardController');

const router = express.Router();

router.use(protect);
router.use(requirePermission('VIEW_DASHBOARD'));

// GET /api/dashboard/overview?tab=HOME_NURSING|ELDERLY_CARE|CHILD_CARE
router.get('/overview', getDashboardOverview);

module.exports = router;
