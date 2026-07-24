const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { protect, requirePermission } = require('../middleware/authMiddleware');

/**
 * Vendor Routes
 * All routes require authentication via protect middleware
 */

/**
 * @route   GET /api/vendors
 * @desc    Get all vendors (with computed outstanding balance)
 * @access  Private (VIEW_VENDORS)
 */
router.get('/', protect, requirePermission('VIEW_VENDORS'), vendorController.getAllVendors);

/**
 * @route   POST /api/vendors
 * @desc    Create a new vendor
 * @access  Private (VENDOR_CREATE)
 */
router.post('/', protect, requirePermission('VENDOR_CREATE'), vendorController.createVendor);

/**
 * @route   GET /api/vendors/:id
 * @desc    Get a single vendor with balance summary
 * @access  Private (VIEW_VENDORS)
 */
router.get('/:id', protect, requirePermission('VIEW_VENDORS'), vendorController.getVendor);

/**
 * @route   PUT /api/vendors/:id
 * @desc    Update a vendor
 * @access  Private (VENDOR_EDIT)
 */
router.put('/:id', protect, requirePermission('VENDOR_EDIT'), vendorController.updateVendor);

/**
 * @route   DELETE /api/vendors/:id
 * @desc    Deactivate a vendor (soft delete)
 * @access  Private (VENDOR_EDIT)
 */
router.delete('/:id', protect, requirePermission('VENDOR_EDIT'), vendorController.deactivateVendor);

/**
 * @route   GET /api/vendors/:id/bills
 * @desc    Get all bills for a vendor
 * @access  Private (VIEW_VENDORS)
 */
router.get('/:id/bills', protect, requirePermission('VIEW_VENDORS'), vendorController.getVendorBills);

/**
 * @route   POST /api/vendors/:id/bills
 * @desc    Manually record a bill against a vendor (utilities/expenses, no linked sale)
 * @access  Private (VENDOR_RECORD_BILL)
 */
router.post('/:id/bills', protect, requirePermission('VENDOR_RECORD_BILL'), vendorController.createVendorBill);

/**
 * @route   GET /api/vendors/bills/:billId/payments
 * @desc    Get payment history for a specific vendor bill
 * @access  Private (VIEW_VENDORS)
 */
router.get('/bills/:billId/payments', protect, requirePermission('VIEW_VENDORS'), vendorController.getVendorBillPayments);

/**
 * @route   POST /api/vendors/bills/:billId/payments
 * @desc    Record a payment (full or partial) against a vendor bill
 * @access  Private (VENDOR_PAY_BILL)
 */
router.post('/bills/:billId/payments', protect, requirePermission('VENDOR_PAY_BILL'), vendorController.recordVendorBillPayment);

module.exports = router;
