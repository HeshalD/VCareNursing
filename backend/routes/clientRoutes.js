const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All routes below require login
router.use(protect);

// client profile endpoints
router.get('/profile/user/:user_id', clientController.getClientProfileByUserId);
router.get('/active-bookings/:client_id', clientController.getActiveBookingByClientID);
router.get('/active-bookings', clientController.getActiveBookingByClientID);
router.get('/all-bookings/:client_id', clientController.getAllBookingsForClient);
router.get('/all-bookings', clientController.getAllBookingsForClient);
router.get('/service-history/:client_id', clientController.getClientServiceHistory);

// Payment and financial endpoints
router.get('/payment-history/:client_id', clientController.getClientPaymentHistory);
router.get('/payment-history', clientController.getClientPaymentHistory);
router.get('/wallet-balance/:client_id', clientController.getClientWalletBalance);
router.get('/wallet-balance', clientController.getClientWalletBalance);
router.get('/overdue-payments/:client_id', clientController.getOverduePayments);
router.get('/overdue-payments', clientController.getOverduePayments);

// Generic client profile route - MUST come after specific routes
router.get('/:client_id', clientController.getClientProfile);
router.patch('/update-me', clientController.updateMe);
router.delete('/delete-me', clientController.deleteMe);

// bookings endpoints
router.get('/', protect, restrictTo('SUPER_ADMIN'), clientController.getAllClients);

module.exports = router;