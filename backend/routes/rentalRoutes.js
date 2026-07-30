const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

// Rental units (inventory)
router.get('/units', protect, requirePermission('VIEW_RENTALS'), rentalController.getRentalUnits);
router.post('/units', protect, requirePermission('RENTAL_UNIT_CREATE'), rentalController.createRentalUnit);
router.patch('/units/:unit_id/status', protect, requirePermission('RENTAL_UNIT_EDIT'), rentalController.updateRentalUnitStatus);

// Rental agreements
router.get('/agreements', protect, requirePermission('VIEW_RENTALS'), rentalController.listRentalAgreements);
router.get('/agreements/:rental_agreement_id', protect, requirePermission('VIEW_RENTALS'), rentalController.getRentalAgreement);
router.post('/agreements', protect, requirePermission('RENTAL_AGREEMENT_CREATE'), rentalController.createRentalAgreement);
router.post('/agreements/:rental_agreement_id/return', protect, requirePermission('RENTAL_UNIT_RETURN'), rentalController.returnRentalUnit);

// Deposits
router.get('/deposits', protect, requirePermission('VIEW_RENTALS'), rentalController.listDeposits);
router.post('/deposits/:deposit_id/refund', protect, requirePermission('RENTAL_DEPOSIT_REFUND'), rentalController.refundDeposit);
router.post('/deposits/:deposit_id/forfeit', protect, requirePermission('RENTAL_DEPOSIT_FORFEIT'), rentalController.forfeitDeposit);

module.exports = router;
