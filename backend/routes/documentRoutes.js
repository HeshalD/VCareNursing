const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentController');
const { uploadManagedDocument } = require('../middleware/uploadMiddleware');
const { protect, requirePermission } = require('../middleware/authMiddleware');

// Public: current agreement links for the worker registration page
router.get('/public/agreements', controller.getPublicAgreements);

router.get('/', protect, requirePermission('VIEW_DOCUMENTS'), controller.listDocuments);
router.post('/:key/replace', protect, requirePermission('DOCUMENT_REPLACE'), uploadManagedDocument, controller.replaceDocument);
router.post('/:key/restore/:version', protect, requirePermission('DOCUMENT_REPLACE'), controller.restoreVersion);

module.exports = router;
