const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route: POST /api/auth/register
router.post('/register', authController.registerClient);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyOtp);

// Admin routes
router.get('/users', authController.getAllUsers);
router.get('/clients', authController.getAllClients);
router.get('/staff', authController.getAllStaff);
router.get('/overview', authController.getUnifiedOverview);

module.exports = router;