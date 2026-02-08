const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const { protect, restrictTo } = require('../middleware/authMiddleware'); // Adjust path as needed

// Public route for Phase 1
router.post('/submit-request', serviceRequestController.submitServiceRequest);

// Protected admin route for Phase 2 (Home Tab)
router.get('/all-leads', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getAllLeads);

module.exports = router;