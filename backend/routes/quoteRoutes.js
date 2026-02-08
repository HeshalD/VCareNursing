const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

/**
 * @route   POST /api/quotes/create
 * @desc    Phase 2: Admin reviews lead and creates an internal quotation
 * @access  Private (Admin/Coordinator)
 */
router.post(
    '/create', 
    protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    quoteController.createQuotation
);

/**
 * @route   POST /api/quotes/send-pdf/:quote_id
 * @desc    Phase 2: Generate PDF, upload to Cloudinary, and send via WhatsApp
 * @access  Private (Admin/Coordinator)
 */
router.post(
    '/send-pdf/:quote_id', 
    protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    quoteController.generateAndSendPDF
);

module.exports = router;