const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/bulkImportController');

// Transient spreadsheet buffer only — never persisted to S3, unlike the
// document-upload middleware in uploadMiddleware.js.
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get('/template', requirePermission('VIEW_BULK_IMPORT'), ctrl.downloadTemplate);
router.post('/preview', requirePermission('VIEW_BULK_IMPORT'), upload.single('file'), ctrl.previewImport);
router.post('/commit', requirePermission('BULK_IMPORT_COMMIT'), upload.single('file'), ctrl.commitImport);
router.get('/jobs/:jobId', requirePermission('VIEW_BULK_IMPORT'), ctrl.getImportJobProgress);
router.get('/batches', requirePermission('VIEW_BULK_IMPORT'), ctrl.listBatches);
router.get('/batches/:id', requirePermission('VIEW_BULK_IMPORT'), ctrl.getBatch);

module.exports = router;
