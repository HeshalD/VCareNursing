const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Route to manually add a patient (Admin Only)
router.post(
    '/create', 
    protect, 
    patientController.createPatientProfile
);

// Route to get list of patients for a client (e.g. when Mr. Perera calls)
router.get(
    '/client/:client_id', 
    protect, 
    patientController.getPatientsByClient
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
    patientController.deletePatientProfile
);

module.exports = router;