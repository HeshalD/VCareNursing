const express = require('express');
const router = express.Router();
const { normalizeHonorificBody } = require('../utils/honorific');
const serviceRequestController = require('../controllers/serviceRequestController');
const notificationController = require('../controllers/serviceRequestNotificationController');
const { protect, restrictTo, requirePermission, requireOwnCoordinatorRecord } = require('../middleware/authMiddleware'); // Adjust path as needed

// Public route for Phase 1
router.post('/submit-request', serviceRequestController.submitServiceRequest);

// Who is emailed when a client submits a request (must stay above '/:id')
router.get('/notification-recipients', protect, requirePermission('SERVICE_REQUEST_NOTIFICATIONS'), notificationController.listRecipients);
router.post('/notification-recipients/test', protect, requirePermission('SERVICE_REQUEST_NOTIFICATIONS'), notificationController.sendTest);
router.post('/notification-recipients', protect, requirePermission('SERVICE_REQUEST_NOTIFICATIONS'), notificationController.addRecipient);
router.delete('/notification-recipients/:id', protect, requirePermission('SERVICE_REQUEST_NOTIFICATIONS'), notificationController.removeRecipient);

// Protected admin route for Phase 2 (Home Tab)
router.get('/all-leads', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getAllLeads);

// Coordinators a request can be assigned to (must stay above '/:id')
router.get('/coordinators', protect, requirePermission('SERVICE_REQUEST_ASSIGN_COORDINATOR'), serviceRequestController.getAssignableCoordinators);

router.get('/new_leads', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getNewLeads);

router.get('/pending_leads', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getPendingLeads);

// Protected admin route to get service request by ID
router.get('/:id', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getServiceRequestById);

// Assign / change / clear the coordinator (locked to the current coordinator once assigned)
router.put('/:id/coordinator', protect, requirePermission('SERVICE_REQUEST_ASSIGN_COORDINATOR'), requireOwnCoordinatorRecord('id', 'service_requests', { idColumn: 'request_id' }), serviceRequestController.assignCoordinator);

// Protected admin route to update service request status
router.put('/:id/status', protect, requirePermission('SERVICE_REQUEST_EDIT'), requireOwnCoordinatorRecord('id', 'service_requests', { idColumn: 'request_id' }), serviceRequestController.updateServiceRequestStatus);

// Protected admin route to update full service request details
router.put('/:id', protect, requirePermission('SERVICE_REQUEST_EDIT'), normalizeHonorificBody, requireOwnCoordinatorRecord('id', 'service_requests', { idColumn: 'request_id' }), serviceRequestController.updateServiceRequest);

// Candidate profiles sent to the client for a service request (one-time per staff)
router.get('/:id/sent-candidates', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getSentCandidates);
router.post('/:id/send-candidate', protect, requirePermission('SERVICE_REQUEST_SEND_CANDIDATE'), requireOwnCoordinatorRecord('id', 'service_requests', { idColumn: 'request_id' }), serviceRequestController.sendCandidateProfile);

// Admin route to create service request manually
router.post('/proxy-service-request', protect, requirePermission('SERVICE_REQUEST_CREATE'), normalizeHonorificBody, serviceRequestController.createServiceRequest);

// Client-specific routes
router.get('/client/:client_id', protect, serviceRequestController.getClientServiceRequests);

router.get('/client/:client_id/with-quotes', protect, serviceRequestController.getClientServiceRequestsWithQuotes);

router.get('/client/:client_id/with-payments', protect, serviceRequestController.getClientServiceRequestsWithPayments);

module.exports = router;