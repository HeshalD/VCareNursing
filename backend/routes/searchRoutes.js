const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { protect } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/admin-search?q=
 * @desc    Admin-wide search across people, bookings and finance records
 * @access  Private - each result group is filtered by its own VIEW_* permission
 */
router.get('/', protect, searchController.adminSearch);

module.exports = router;
