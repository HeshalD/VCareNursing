const express = require('express');
const router = express.Router();
const walkInCustomerController = require('../controllers/walkInCustomerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

router.get('/', protect, restrictTo(...ADMIN_ROLES), walkInCustomerController.searchWalkInCustomers);
router.post('/', protect, restrictTo(...ADMIN_ROLES), walkInCustomerController.createWalkInCustomer);

module.exports = router;
