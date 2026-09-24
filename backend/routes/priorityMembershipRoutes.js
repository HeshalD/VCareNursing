const express = require('express');
const router = express.Router();
const controller = require('../controllers/priorityMembershipController');
const { protect } = require('../middleware/authMiddleware');

// Public: guests verify their mobile by OTP, then submit the registration request.
router.post('/otp/send', controller.sendOtp);
router.post('/otp/verify', controller.verifyOtp);
router.post('/register', controller.registerGuest);

// Logged-in client: details are read from their profile, no OTP needed.
router.post('/register/me', protect, controller.registerAuthenticated);

module.exports = router;
