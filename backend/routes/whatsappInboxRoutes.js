const express = require('express');
const multer = require('multer');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const controller = require('../controllers/whatsappInboxController');

const router = express.Router();

// Attachments are held in memory just long enough to validate them and copy to S3 (16 MB max, under the proxy's 20 MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const attachment = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 16 MB).' : err.message });
    next();
  });

const canView = [protect, requirePermission('VIEW_WHATSAPP')];

router.get('/templates', canView, controller.listTemplates);
router.post('/send-template', protect, requirePermission('WHATSAPP_REPLY'), attachment, controller.sendTemplateMessage);
router.get('/conversations', canView, controller.listConversations);
router.get('/unread-count', canView, controller.getUnreadCount);
router.get('/conversations/:id', canView, controller.getConversation);
router.get('/conversations/:id/messages', canView, controller.getMessages);
router.post('/conversations/:id/read', canView, controller.markRead);
router.post('/conversations/:id/messages', protect, requirePermission('WHATSAPP_REPLY'), attachment, controller.sendMessage);

module.exports = router;
