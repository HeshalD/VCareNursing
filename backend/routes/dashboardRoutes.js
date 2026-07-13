const express = require('express');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { getDashboardOverview } = require('../controllers/dashboardController');

const router = express.Router();

router.use(protect);
router.use(restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR', 'SALES'));

// GET /api/dashboard/overview?tab=HOME_NURSING|ELDERLY_CARE|CHILD_CARE
router.get('/overview', getDashboardOverview);

module.exports = router;
