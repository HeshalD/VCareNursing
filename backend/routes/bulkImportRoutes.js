const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/bulkImportController');

// Transient spreadsheet buffer only — never persisted to S3, unlike the
// document-upload middleware in uploadMiddleware.js.
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);
router.use(restrictTo('SUPER_ADMIN', 'COORDINATOR'));

router.get('/template', ctrl.downloadTemplate);
router.post('/preview', upload.single('file'), ctrl.previewImport);
router.post('/commit', requirePermission('BULK_IMPORT_COMMIT'), upload.single('file'), ctrl.commitImport);
router.get('/batches', ctrl.listBatches);
router.get('/batches/:id', ctrl.getBatch);

module.exports = router;
