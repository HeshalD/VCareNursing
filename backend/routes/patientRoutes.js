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

// Route to add a patient (Internal Staff with PATIENT_CREATE, or a Client adding their own care profile).
// Shared with CLIENT self-service, so clients bypass the permission check (they have no
// staff_permissions row). Everyone else must hold PATIENT_CREATE — a hard-coded role list
// here wrongly denied SALES / CUSTOM_ROLE staff who had been granted the permission.
const clientOrPatientCreate = async (req, res, next) => {
    const raw = req.user.role;
    const roles = (Array.isArray(raw) ? raw : String(raw || '').split(','))
        .map(r => String(r).replace(/\{|\}/g, '').trim());
    if (roles.includes('CLIENT')) return next();
    return requirePermission('PATIENT_CREATE')(req, res, next);
};

router.post(
    '/create',
    protect,
    clientOrPatientCreate,
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