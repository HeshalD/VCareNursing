const express = require('express');
const router = express.Router();
const statementController = require('../controllers/statementController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get('/:client_id', statementController.getClientStatement);

router.post('/download/:client_id', statementController.downloadClientStatement);

module.exports = router;