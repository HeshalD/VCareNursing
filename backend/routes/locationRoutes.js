const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

/**
 * @route   GET /api/locations/cities
 * @desc    Master list of Sri Lankan cities (province > district > city, with coordinates)
 * @access  Public (used by the worker registration form)
 */
router.get('/cities', locationController.getCities);

module.exports = router;
