const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect } = require('../middleware/authMiddleware');

// All routes below require login
router.use(protect);

// client profile endpoints
router.patch('/update-me', clientController.updateMe);
router.delete('/delete-me', clientController.deleteMe);

// bookings endpoints
router.get('/active-bookings/:client_id', clientController.getActiveBookingByClientID);
router.get('/active-bookings', clientController.getActiveBookingByClientID);

module.exports = router;