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
 * @route   GET /api/quotes/request/:requestId
 * @desc    Get quote by request ID
 * @access  Private (Admin/Coordinator)
 */
router.get(
    '/request/:requestId', 
    protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    quoteController.getQuoteByRequest
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

// Client-specific routes
router.get('/client/:client_id', protect, quoteController.getClientQuotes);

// ==================== MODULAR QUOTE ROUTES ====================

/**
 * @route   GET /api/quotes/presets
 * @desc    Get all active preset items for quick quote building
 * @access  Private (Any authenticated user)
 */
router.get('/presets', protect, quoteController.getPresetItems);

/**
 * @route   POST /api/quotes/presets
 * @desc    Create a new preset item (Admin only)
 * @access  Private (Admin only)
 */
router.post(
    '/presets',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    quoteController.createPresetItem
);

/**
 * @route   PUT /api/quotes/presets/:preset_id
 * @desc    Update a preset item (Admin only)
 * @access  Private (Admin only)
 */
router.put(
    '/presets/:preset_id',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    quoteController.updatePresetItem
);

/**
 * @route   DELETE /api/quotes/presets/:preset_id
 * @desc    Deactivate a preset item (Admin only)
 * @access  Private (Admin only)
 */
router.delete(
    '/presets/:preset_id',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    quoteController.deletePresetItem
);

/**
 * @route   POST /api/quotes/create-modular
 * @desc    Create a modular quotation with flexible line items
 * @access  Private (Admin/Coordinator)
 */
router.post(
    '/create-modular',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    quoteController.createModularQuotation
);

/**
 * @route   GET /api/quotes/:quote_id/details
 * @desc    Get quote with all line items
 * @access  Private
 */
router.get('/:quote_id/details', protect, quoteController.getQuoteWithLineItems);

/**
 * @route   PUT /api/quotes/:quote_id/line-items
 * @desc    Update quote line items and recalculate totals
 * @access  Private (Admin/Coordinator)
 */
router.put(
    '/:quote_id/line-items',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR'),
    quoteController.updateQuoteLineItems
);

module.exports = router;