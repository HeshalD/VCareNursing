const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Route to manually add a patient (Admin Only)
router.post(
    '/create', 
    protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    patientController.createPatientProfile
);

// Route to get list of patients for a client (e.g. when Mr. Perera calls)
router.get(
    '/client/:client_id', 
    protect, 
    restrictTo('SUPER_ADMIN', 'COORDINATOR'), 
    patientController.getPatientsByClient
);

module.exports = router;