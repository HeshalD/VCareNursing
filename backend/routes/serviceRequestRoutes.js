const express = require('express');
const router = express.Router();
const { normalizeHonorificBody } = require('../utils/honorific');
const serviceRequestController = require('../controllers/serviceRequestController');
const notificationController = require('../controllers/serviceRequestNotificationController');
const { protect, optionalAuth, restrictTo, requirePermission, requireOwnCoordinatorRecord } = require('../middleware/authMiddleware'); // Adjust path as needed

// Public route for Phase 1
// optionalAuth: a logged-in client is attached to their own account; guests with a known number must pass OTP.
router.post('/submit-request', optionalAuth, serviceRequestController.submitServiceRequest);
router.post('/otp/send', serviceRequestController.sendRequestOtp);
router.post('/otp/verify', serviceRequestController.verifyRequestOtp);

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

// WhatsApp-ready plain text of a request (for the "Copy for WhatsApp" button)
router.get('/:id/whatsapp-text', protect, requirePermission('VIEW_SERVICE_REQUESTS'), async (req, res) => {
  try {
    const text = await require('../services/serviceRequestEmail').getWhatsappTextForRequest(req.params.id);
    if (!text) return res.status(404).json({ success: false, message: 'Service request not found' });
    res.json({ success: true, data: { text } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not build the WhatsApp text' });
  }
});

// Protected admin route to get service request by ID
router.get('/:id', protect, requirePermission('VIEW_SERVICE_REQUESTS'), serviceRequestController.getServiceRequestById);

// Select the salesperson; once selected, changing it needs SERVICE_REQUEST_REASSIGN_SALESPERSON (checked in the handler)
router.put('/:id/coordinator', protect, requirePermission('SERVICE_REQUEST_ASSIGN_COORDINATOR'), serviceRequestController.assignCoordinator);

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