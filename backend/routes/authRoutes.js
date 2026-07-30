const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

// Route: POST /api/auth/register
router.post('/register', authController.registerClient);
router.post('/login', authController.login);
router.post('/resend-otp', authController.resendOtp);
router.post('/verify-otp', authController.verifyOtp);

// Forgot password flow
router.post('/forgot-password/request-otp', authController.requestForgotPasswordOtp);
router.post('/forgot-password/verify-otp', authController.verifyForgotPasswordOtp);
router.post('/forgot-password/reset', authController.resetPassword);

// Admin routes
router.use(protect);
router.get('/unified-overview', authController.getUnifiedOverview);
router.get('/users', requirePermission('VIEW_USER_MANAGEMENT'), authController.getAllUsers);

// Self-service: let an already-authenticated user (e.g. staff without a client
// profile) fetch their known account details and create a linked client profile.
router.get('/me', authController.getMyAccountInfo);
router.post('/create-client-profile', authController.createClientProfileForExistingUser);

module.exports = router;