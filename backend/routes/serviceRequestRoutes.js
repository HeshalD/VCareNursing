const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware'); // Adjust path as needed

// Public route for Phase 1
router.post('/submit-request', serviceRequestController.submitServiceRequest);

// Protected admin route for Phase 2 (Home Tab)
router.get('/all-leads', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getAllLeads);

router.get('/new_leads', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getNewLeads);

router.get('/pending_leads', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getPendingLeads);

// Protected admin route to get service request by ID
router.get('/:id', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getServiceRequestById);

// Protected admin route to update service request status
router.put('/:id/status', protect, requirePermission('SERVICE_REQUEST_EDIT'), serviceRequestController.updateServiceRequestStatus);

// Protected admin route to update full service request details
router.put('/:id', protect, requirePermission('SERVICE_REQUEST_EDIT'), serviceRequestController.updateServiceRequest);

// Candidate profiles sent to the client for a service request (one-time per staff)
router.get('/:id/sent-candidates', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getSentCandidates);
router.post('/:id/send-candidate', protect, requirePermission('SERVICE_REQUEST_SEND_CANDIDATE'), serviceRequestController.sendCandidateProfile);

// Admin route to create service request manually
router.post('/proxy-service-request', protect, requirePermission('SERVICE_REQUEST_CREATE'), serviceRequestController.createServiceRequest);

// Client-specific routes
router.get('/client/:client_id', protect, serviceRequestController.getClientServiceRequests);

router.get('/client/:client_id/with-quotes', protect, serviceRequestController.getClientServiceRequestsWithQuotes);

router.get('/client/:client_id/with-payments', protect, serviceRequestController.getClientServiceRequestsWithPayments);

module.exports = router;