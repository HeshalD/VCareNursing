const express = require('express');
const router = express.Router();
const walkInCustomerController = require('../controllers/walkInCustomerController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

router.get('/', protect, requirePermission('VIEW_USER_MANAGEMENT'), walkInCustomerController.searchWalkInCustomers);
router.post('/', protect, requirePermission('WALKIN_CUSTOMER_CREATE'), walkInCustomerController.createWalkInCustomer);

module.exports = router;
