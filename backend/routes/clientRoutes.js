const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const bookingNotesController = require('../controllers/bookingNotesController');
const { protect, restrictTo, requirePermission, attachSalesScope, requireOwnSalesRecord } = require('../middleware/authMiddleware');
const { uploadPaymentReceipt } = require('../middleware/uploadMiddleware');

// All routes below require login
router.use(protect);

// client profile endpoints
router.get('/profile/user/:user_id', clientController.getClientProfileByUserId);
router.get('/active-bookings/:client_id', clientController.getActiveBookingByClientID);
router.get('/active-bookings', clientController.getActiveBookingByClientID);
router.get('/all-bookings/:client_id', clientController.getAllBookingsForClient);
router.get('/all-bookings', clientController.getAllBookingsForClient);
router.get('/service-history/:client_id', clientController.getClientServiceHistory);
// Admin: enriched booking history for dashboard
router.get('/:client_id/bookings', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getAdminClientBookings);
router.get('/:client_id/bookings-paginated', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getAdminClientBookingsPaginated);
router.get('/:client_id/notes', protect, requirePermission('VIEW_USER_MANAGEMENT'), requireOwnSalesRecord('client_id', 'client_salesperson_assignments'), bookingNotesController.getClientNotes);
router.post('/:client_id/notes', protect, requirePermission('CLIENT_ADD_NOTE'), requireOwnSalesRecord('client_id', 'client_salesperson_assignments'), bookingNotesController.addClientNote);
router.patch('/:client_id/notes/:note_id', protect, requirePermission('CLIENT_EDIT_NOTE'), bookingNotesController.updateClientNote);
router.delete('/:client_id/notes/:note_id', protect, requirePermission('CLIENT_DELETE_NOTE'), bookingNotesController.deleteClientNote);
// Admin consolidated client detail - keep before generic '/:client_id' route
router.get('/:client_id/detail', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getAdminClientDetail);
router.patch('/:client_id/deactivate', protect, requirePermission('CLIENT_DEACTIVATE'), clientController.deactivateClientProfile);
router.patch('/:client_id/reactivate', protect, requirePermission('CLIENT_DEACTIVATE'), clientController.reactivateClientProfile);
router.delete('/:client_id', protect, requirePermission('CLIENT_DELETE'), clientController.deleteClientProfile);
router.patch('/:client_id/billing', protect, requirePermission('CLIENT_EDIT'), clientController.updateClientCompanyName);
router.patch('/:client_id/profile', protect, requirePermission('CLIENT_EDIT'), clientController.updateClientProfile);
router.post('/:client_id/send-reg-fee-invoice', protect, requirePermission('CLIENT_SEND_REG_FEE_INVOICE'), clientController.sendRegFeeInvoice);
router.patch('/:client_id/reg-fee-status', protect, requirePermission('CLIENT_EDIT'), clientController.updateRegFeeStatus);
router.post('/:client_id/verify-reg-fee-payment', protect, requirePermission('CLIENT_RECORD_PAYMENT'), clientController.verifyRegFeePayment);
router.post('/:client_id/admin-upload-reg-fee-receipt', protect, requirePermission('CLIENT_RECORD_PAYMENT'), uploadPaymentReceipt, clientController.adminUploadRegFeeReceipt);
router.get('/:client_id/invoices', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getClientInvoices);
// Registration fee invoices — must stay above the generic '/:client_id' catch-all route below.
router.get('/all-reg-fee-invoices', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getAllRegFeeInvoices);
router.get('/:client_id/reg-fee-invoices', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getClientRegFeeInvoices);
router.post('/reg-fee-invoices/:invoice_id/resend', protect, requirePermission('INVOICE_RESEND'), clientController.resendRegFeeInvoice);

// On-demand daily invoice PDF download / resend (must be before /:client_id catch-all)
router.get('/invoice-pdf/:daily_invoice_id', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.downloadDailyInvoicePdf);
router.post('/invoice/:daily_invoice_id/resend', protect, requirePermission('INVOICE_RESEND'), clientController.resendDailyInvoice);

// Payment and financial endpoints
router.get('/payment-history/:client_id', clientController.getClientPaymentHistory);
router.get('/payment-history', clientController.getClientPaymentHistory);
router.get('/wallet-balance/:client_id', clientController.getClientWalletBalance);
router.get('/wallet-balance', clientController.getClientWalletBalance);
router.get('/overdue-payments/:client_id', clientController.getOverduePayments);
router.get('/overdue-payments', clientController.getOverduePayments);

// Admin proxy-create client (bypasses OTP)
router.post('/proxy-create', protect, requirePermission('CLIENT_PROXY_CREATE'), clientController.proxyCreateClient);

// Global admin invoices list (must be before /:client_id catch-all)
router.get('/all-invoices', protect, requirePermission('VIEW_USER_MANAGEMENT'), clientController.getAdminInvoices);

// Generic client profile route - MUST come after specific routes
router.get('/:client_id', clientController.getClientProfile);
router.patch('/update-me', clientController.updateMe);
router.delete('/delete-me', clientController.deleteMe);

// bookings endpoints
router.get('/', protect, requirePermission('VIEW_USER_MANAGEMENT'), attachSalesScope, clientController.getAllClients);

module.exports = router;