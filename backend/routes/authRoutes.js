const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

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
router.get('/unified-overview', restrictTo('SUPER_ADMIN', 'ACCOUNTS'), authController.getUnifiedOverview);
router.get('/users', restrictTo('SUPER_ADMIN'), authController.getAllUsers);

module.exports = router;