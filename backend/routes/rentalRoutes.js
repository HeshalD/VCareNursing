const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

// Rental units (inventory)
router.get('/units', protect, restrictTo(...ADMIN_ROLES), rentalController.getRentalUnits);
router.post('/units', protect, restrictTo(...ADMIN_ROLES), rentalController.createRentalUnit);
router.patch('/units/:unit_id/status', protect, restrictTo(...ADMIN_ROLES), rentalController.updateRentalUnitStatus);

// Rental agreements
router.get('/agreements', protect, restrictTo(...ADMIN_ROLES), rentalController.listRentalAgreements);
router.get('/agreements/:rental_agreement_id', protect, restrictTo(...ADMIN_ROLES), rentalController.getRentalAgreement);
router.post('/agreements', protect, restrictTo(...ADMIN_ROLES), rentalController.createRentalAgreement);
router.post('/agreements/:rental_agreement_id/return', protect, restrictTo(...ADMIN_ROLES), rentalController.returnRentalUnit);

// Deposits
router.get('/deposits', protect, restrictTo(...ADMIN_ROLES), rentalController.listDeposits);
router.post('/deposits/:deposit_id/refund', protect, restrictTo(...ADMIN_ROLES), rentalController.refundDeposit);
router.post('/deposits/:deposit_id/forfeit', protect, restrictTo(...ADMIN_ROLES), rentalController.forfeitDeposit);

module.exports = router;
