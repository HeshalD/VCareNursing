const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/successStoryController');
const { protect, requirePermission } = require('../middleware/authMiddleware');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('image');

// Turns multer errors (e.g. file too large) into a readable 400.
const handleUpload = (req, res, next) =>
  imageUpload(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : 'Upload failed.';
    res.status(400).json({ success: false, message });
  });

// Reject non-numeric ids early (Express 5 has no regex params).
router.param('id', (req, res, next, id) =>
  /^\d+$/.test(id) ? next() : res.status(400).json({ success: false, message: 'Invalid story id.' }));

// Public (published, non-archived stories only)
router.get('/', controller.listPublic);
router.get('/featured', controller.listFeatured);

// Admin. These sit before '/:slug' so they are never mistaken for a slug.
router.get('/admin/list', protect, requirePermission('VIEW_SUCCESS_STORIES'), controller.listAdmin);
router.get('/admin/:id', protect, requirePermission('VIEW_SUCCESS_STORIES'), controller.getAdminById);
router.post('/', protect, requirePermission('STORY_CREATE_EDIT'), controller.create);
router.post('/upload-image', protect, requirePermission('STORY_CREATE_EDIT'), handleUpload, controller.uploadImage);
router.put('/featured-order', protect, requirePermission('STORY_FEATURE'), controller.setFeatured);
router.put('/:id', protect, requirePermission('STORY_CREATE_EDIT'), controller.update);
router.patch('/:id/publish', protect, requirePermission('STORY_PUBLISH'), controller.setPublished);
router.patch('/:id/feature', protect, requirePermission('STORY_FEATURE'), controller.toggleFeatured);
router.patch('/:id/archive', protect, requirePermission('STORY_ARCHIVE'), controller.setArchived);

router.get('/:slug', controller.getPublicBySlug);

module.exports = router;
