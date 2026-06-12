const express = require('express');
const router = express.Router();
const clientPaymentController = require('../controllers/clientPaymentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinaryConfig');

const adminRoles = ['SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'];

// GET /api/client-payments/record/:record_id — must come before /:client_id
router.get(
  '/record/:record_id',
  protect,
  restrictTo(...adminRoles),
  clientPaymentController.getPaymentRecordDetail
);

// POST /api/client-payments/:client_id/record
router.post(
  '/:client_id/record',
  protect,
  restrictTo(...adminRoles),
  upload.single('payment_slip'),
  clientPaymentController.recordClientPayment
);

// GET /api/client-payments/:client_id
router.get(
  '/:client_id',
  protect,
  restrictTo(...adminRoles),
  clientPaymentController.getClientPaymentRecords
);

module.exports = router;
