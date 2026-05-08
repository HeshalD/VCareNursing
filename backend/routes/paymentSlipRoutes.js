const express = require('express');
const router = express.Router();
const paymentSlipController = require('../controllers/paymentSlipController');
const { protect } = require('../middleware/authMiddleware');

// Client-specific routes
router.get('/client/:client_id', protect, paymentSlipController.getClientPaymentSlips);

module.exports = router;
