const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware'); // Your auth middleware

// POST /api/statements/:client_id/pay
router.post(
    '/statements/:client_id/pay', 
    protect, // Make sure only logged in Admins can record payments!
    paymentController.recordManualPayment
);

module.exports = router;