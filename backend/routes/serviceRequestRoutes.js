const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const { protect, restrictTo } = require('../middleware/authMiddleware'); // Adjust path as needed

// Public route for Phase 1
router.post('/submit-request', serviceRequestController.submitServiceRequest);

// Protected admin route for Phase 2 (Home Tab)
router.get('/all-leads', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getAllLeads);

router.get('/new_leads', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getNewLeads);

router.get('/pending_leads', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getPendingLeads);

// Protected admin route to get service request by ID
router.get('/:id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.getServiceRequestById);

// Protected admin route to update service request status
router.put('/:id/status', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.updateServiceRequestStatus);

// Protected admin route to update full service request details
router.put('/:id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.updateServiceRequest);

// Admin route to create service request manually
router.post('/proxy-service-request', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), serviceRequestController.createServiceRequest);

// Client-specific routes
router.get('/client/:client_id', protect, serviceRequestController.getClientServiceRequests);

router.get('/client/:client_id/with-quotes', protect, serviceRequestController.getClientServiceRequestsWithQuotes);

router.get('/client/:client_id/with-payments', protect, serviceRequestController.getClientServiceRequestsWithPayments);

module.exports = router;