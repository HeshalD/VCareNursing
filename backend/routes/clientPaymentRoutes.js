const express = require('express');
const router = express.Router();
const clientPaymentController = require('../controllers/clientPaymentController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

const adminRoles = ['SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'];

// GET /api/client-payments/record/:record_id — must come before /:client_id
router.get(
  '/record/:record_id',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  clientPaymentController.getPaymentRecordDetail
);

// POST /api/client-payments/:client_id/record
router.post(
  '/:client_id/record',
  protect,
  requirePermission('CLIENT_RECORD_PAYMENT'),
  upload.single('payment_slip'),
  clientPaymentController.recordClientPayment
);

// GET /api/client-payments/:client_id
router.get(
  '/:client_id',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  clientPaymentController.getClientPaymentRecords
);

module.exports = router;
