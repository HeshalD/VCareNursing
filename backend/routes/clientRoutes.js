const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect } = require('../middleware/authMiddleware');

// All routes below require login
router.use(protect);

router.patch('/update-me', clientController.updateMe);
router.delete('/delete-me', clientController.deleteMe);

module.exports = router;