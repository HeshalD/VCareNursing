const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const bookingNotesController = require('../controllers/bookingNotesController');
const { protect, restrictTo, attachSalesScope, requireOwnSalesRecord } = require('../middleware/authMiddleware');
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
router.get('/:client_id/bookings', protect, restrictTo('SUPER_ADMIN'), clientController.getAdminClientBookings);
router.get('/:client_id/bookings-paginated', protect, restrictTo('SUPER_ADMIN'), clientController.getAdminClientBookingsPaginated);
router.get('/:client_id/notes', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'SALES'), requireOwnSalesRecord('client_id', 'client_salesperson_assignments'), bookingNotesController.getClientNotes);
router.post('/:client_id/notes', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'SALES'), requireOwnSalesRecord('client_id', 'client_salesperson_assignments'), bookingNotesController.addClientNote);
router.patch('/:client_id/notes/:note_id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), bookingNotesController.updateClientNote);
router.delete('/:client_id/notes/:note_id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), bookingNotesController.deleteClientNote);
router.get('/:client_id/detail', restrictTo('SUPER_ADMIN'), clientController.getAdminClientDetail);
// Admin consolidated client detail (admin-only) - keep before generic '/:client_id' route
router.get('/:client_id/detail', restrictTo('SUPER_ADMIN'), clientController.getAdminClientDetail);
router.patch('/:client_id/deactivate', protect, restrictTo('SUPER_ADMIN'), clientController.deactivateClientProfile);
router.patch('/:client_id/reactivate', protect, restrictTo('SUPER_ADMIN'), clientController.reactivateClientProfile);
router.patch('/:client_id/billing', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.updateClientCompanyName);
router.patch('/:client_id/profile', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), clientController.updateClientProfile);
router.post('/:client_id/send-reg-fee-invoice', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.sendRegFeeInvoice);
router.patch('/:client_id/reg-fee-status', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.updateRegFeeStatus);
router.post('/:client_id/verify-reg-fee-payment', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.verifyRegFeePayment);
router.post('/:client_id/admin-upload-reg-fee-receipt', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), uploadPaymentReceipt, clientController.adminUploadRegFeeReceipt);
router.get('/:client_id/invoices', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.getClientInvoices);
// Registration fee invoices — must stay above the generic '/:client_id' catch-all route below.
router.get('/all-reg-fee-invoices', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.getAllRegFeeInvoices);
router.get('/:client_id/reg-fee-invoices', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.getClientRegFeeInvoices);
router.post('/reg-fee-invoices/:invoice_id/resend', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.resendRegFeeInvoice);

// On-demand daily invoice PDF download / resend (must be before /:client_id catch-all)
router.get('/invoice-pdf/:daily_invoice_id', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.downloadDailyInvoicePdf);
router.post('/invoice/:daily_invoice_id/resend', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.resendDailyInvoice);

// Payment and financial endpoints
router.get('/payment-history/:client_id', clientController.getClientPaymentHistory);
router.get('/payment-history', clientController.getClientPaymentHistory);
router.get('/wallet-balance/:client_id', clientController.getClientWalletBalance);
router.get('/wallet-balance', clientController.getClientWalletBalance);
router.get('/overdue-payments/:client_id', clientController.getOverduePayments);
router.get('/overdue-payments', clientController.getOverduePayments);

// Admin proxy-create client (bypasses OTP)
router.post('/proxy-create', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), clientController.proxyCreateClient);

// Global admin invoices list (must be before /:client_id catch-all)
router.get('/all-invoices', protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'), clientController.getAdminInvoices);

// Generic client profile route - MUST come after specific routes
router.get('/:client_id', clientController.getClientProfile);
router.patch('/update-me', clientController.updateMe);
router.delete('/delete-me', clientController.deleteMe);

// bookings endpoints
router.get('/', protect, restrictTo('SUPER_ADMIN', 'SALES'), attachSalesScope, clientController.getAllClients);

module.exports = router;