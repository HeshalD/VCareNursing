const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

// Route to get all patients (admin view)
router.get(
    '/all',
    protect,
    requirePermission('VIEW_PATIENTS'),
    patientController.getAllPatients
);

// Route to add a patient (Admin / Internal Staff, or a Client adding their own care profile).
// NOTE: shared with CLIENT self-service — deliberately NOT gated by requirePermission,
// since a client account has no staff_permissions row and would always be denied.
router.post(
    '/create',
    protect,
    restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'CLIENT'),
    patientController.createPatientProfile
);

// Route to get list of patients for a client (e.g. when Mr. Perera calls)
router.get(
    '/client/:client_id', 
    protect, 
    patientController.getPatientsByClient
);

// Route to get full patient detail (profile page)
router.get(
    '/:patient_id/detail',
    protect,
    requirePermission('VIEW_PATIENTS'),
    patientController.getPatientDetail
);

// Route to get patient by ID
router.get(
    '/:patient_id',
    protect,
    patientController.getPatientById
);

// Route to update patient profile
router.put(
    '/:patient_id', 
    protect, 
    patientController.updatePatientProfile
);

// Route to delete patient profile
router.delete(
    '/:patient_id',
    protect,
    requirePermission('PATIENT_DELETE'),
    patientController.deletePatientProfile
);

module.exports = router;