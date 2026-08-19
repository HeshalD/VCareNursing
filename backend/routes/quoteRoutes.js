const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const paymentTrackingController = require('../controllers/paymentTrackingController');
const invoiceController = require('../controllers/invoiceController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

/**
 * @route   POST /api/quotes/create
 * @desc    Phase 2: Admin reviews lead and creates an internal quotation
 * @access  Private (Admin/Coordinator)
 */
router.post(
    '/create',
    protect,
    requirePermission('QUOTATION_CREATE'),
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
    requirePermission('VIEW_QUOTATIONS'),
    quoteController.getQuoteByRequest
);

router.get(
    '/request/:requestId/list',
    protect,
    requirePermission('VIEW_QUOTATIONS'),
    quoteController.getQuotesByRequest
);

/**
 * @route   POST /api/quotes/send-pdf/:quote_id
 * @desc    Phase 2: Generate PDF, upload to Cloudinary, and send via WhatsApp
 * @access  Private (Admin/Coordinator)
 */
router.post(
    '/send-pdf/:quote_id',
    protect,
    requirePermission('QUOTATION_SEND'),
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
    requirePermission('PRESET_CREATE'),
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
    requirePermission('PRESET_EDIT'),
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
    requirePermission('PRESET_DELETE'),
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
    requirePermission('QUOTATION_CREATE'),
    quoteController.createModularQuotation
);

/**
 * @route   POST /api/quotes/:quote_id/generate-pdf
 * @desc    Generate quote PDF and return the URL (no WhatsApp send)
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.post(
    '/:quote_id/generate-pdf',
    protect,
    requirePermission('QUOTATION_SEND'),
    quoteController.generatePdfOnly
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
    requirePermission('QUOTATION_EDIT'),
    quoteController.updateQuoteLineItems
);

// ==================== PRODUCT QUOTE ROUTES ====================
// quote_type = 'PRODUCT' quotes target a client_id/walk_in_customer_id
// directly instead of a service_request lead — see createModularQuotation.

/**
 * @route   POST /api/quotes/product/request
 * @desc    Client-portal: express interest in a catalog product (creates a DRAFT quote)
 * @access  Private (any authenticated client) — must be registered before
 *          GET /product/:quote_id below, or "request" would be swallowed as a quote_id.
 */
router.post('/product/request', protect, quoteController.submitProductInterest);

/**
 * @route   GET /api/quotes/product/list
 * @desc    List PRODUCT-type quotations, optionally filtered by client/walk-in/status
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.get(
    '/product/list',
    protect,
    requirePermission('VIEW_QUOTATIONS'),
    quoteController.listProductQuotes
);

/**
 * @route   GET /api/quotes/product/:quote_id
 * @desc    Get a PRODUCT-type quotation with its line items
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.get(
    '/product/:quote_id',
    protect,
    requirePermission('VIEW_QUOTATIONS'),
    quoteController.getProductQuoteWithLineItems
);

/**
 * @route   POST /api/quotes/product/:quote_id/generate-pdf
 * @desc    Generate a product quote PDF and return its URL (no WhatsApp send)
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.post(
    '/product/:quote_id/generate-pdf',
    protect,
    requirePermission('QUOTATION_SEND'),
    quoteController.generateProductQuotePdf
);

/**
 * @route   POST /api/quotes/product/:quote_id/send
 * @desc    Generate a product quote PDF and send it to the client/walk-in via WhatsApp
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.post(
    '/product/:quote_id/send',
    protect,
    requirePermission('QUOTATION_SEND'),
    quoteController.sendProductQuotePDF
);

/**
 * @route   POST /api/quotes/product/:quote_id/accept
 * @desc    Accept a product quote — creates a rental_agreement + invoice for
 *          each rental line item (using its own quoted billing terms) and a
 *          single generic invoice for any remaining non-rental items. This is
 *          the one accept action for any PRODUCT quote, rental or not.
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.post(
    '/product/:quote_id/accept',
    protect,
    requirePermission('QUOTATION_ACCEPT'),
    quoteController.acceptProductQuote
);

// ==================== COMBINED INVOICE ROUTES ====================
// The merged Invoice (SERVICE quote + any linked PRODUCT quote) generated
// once either portion is paid in full — see quoteController.ensureCombinedInvoice.

/**
 * @route   GET /api/quotes/invoices/list
 * @desc    List every SERVICE quote that has had a combined Invoice generated
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.get(
    '/invoices/list',
    protect,
    requirePermission('VIEW_INVOICES'),
    quoteController.listCombinedInvoices
);

/**
 * @route   POST /api/quotes/:quote_id/send-invoice
 * @desc    (Re)send the combined Invoice PDF to the client/payer via WhatsApp
 * @access  Private (Admin/Coordinator/Accounts)
 */
router.post(
    '/:quote_id/send-invoice',
    protect,
    requirePermission('INVOICE_RESEND'),
    quoteController.sendCombinedInvoice
);

// ==================== PAYMENT TRACKING ROUTES ====================

/**
 * @route   POST /api/quotes/:quote_id/record-payment
 * @desc    Record a new payment for a quotation
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 * @body    amount_received, payment_method, bank_account_id (conditional), cheque_number (optional), cheque_date (optional), reference_number (optional), slip_url (optional), notes (optional)
 */
router.post(
    '/:quote_id/record-payment',
    protect,
    requirePermission('QUOTATION_RECORD_PAYMENT'),
    upload.single('payment_slip'),
    paymentTrackingController.recordPayment
);

/**
 * @route   POST /api/quotes/:quote_id/record-payment-allocated
 * @desc    Record one payment and split it across Registration Fee / Service
 *          Charges / Products & Rentals buckets in a single action
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 * @body    amount_received, allocations ({ reg_fee, service, products } as JSON), payment_method,
 *          bank_account_id (conditional), cheque_number (optional), cheque_date (optional),
 *          reference_number (optional), slip_url (optional), notes (optional)
 */
router.post(
    '/:quote_id/record-payment-allocated',
    protect,
    requirePermission('QUOTATION_RECORD_PAYMENT'),
    upload.single('payment_slip'),
    paymentTrackingController.recordAllocatedPayment
);

/**
 * @route   POST /api/quotes/:quote_id/line-item-invoices
 * @desc    Generate a standalone invoice for one or more individual quote
 *          line items (independent of the combined invoice and of payment
 *          allocation) — shown as an admin-triggered picker after recording
 *          a payment
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 * @body    line_item_ids (array of UUIDs)
 */
router.post(
    '/:quote_id/line-item-invoices',
    protect,
    requirePermission('QUOTATION_RECORD_PAYMENT'),
    invoiceController.createLineItemInvoices
);

/**
 * @route   GET /api/quotes/:quote_id/payments
 * @desc    Get all payments for a quotation
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 */
router.get(
    '/:quote_id/payments',
    protect,
    requirePermission('VIEW_QUOTATIONS'),
    paymentTrackingController.getPaymentsByQuote
);

/**
 * @route   GET /api/quotes/:quote_id/payment-progress
 * @desc    Get payment progress overview for a quotation
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 */
router.get(
    '/:quote_id/payment-progress',
    protect,
    requirePermission('VIEW_QUOTATIONS'),
    paymentTrackingController.getPaymentProgress
);

/**
 * @route   PATCH /api/quotes/:quote_id/status
 * @desc    Manually update the status of a quotation (ACCEPTED, REJECTED, SENT)
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
router.patch(
    '/:quote_id/status',
    protect,
    requirePermission('QUOTATION_EDIT'),
    quoteController.updateQuoteStatus
);

/**
 * @route   GET /api/quotes/:quote_id/check-booking
 * @desc    Check if a quote has an associated booking
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
router.get(
    '/:quote_id/check-booking',
    protect,
    requirePermission('VIEW_QUOTATIONS'),
    quoteController.checkQuoteBooking
);

module.exports = router;