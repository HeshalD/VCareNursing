const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const { protect, restrictTo } = require('../middleware/authMiddleware'); // Adjust path as needed

// Public route for Phase 1
router.post('/submit-request', serviceRequestController.submitServiceRequest);

// Protected admin route for Phase 2 (Home Tab)
router.get('/all-leads', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getAllLeads);

router.get('/new_leads', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getNewLeads)

// Protected admin route to get service request by ID
router.get('/:id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getServiceRequestById);

module.exports = router;