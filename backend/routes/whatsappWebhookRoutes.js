const express = require('express');
const { verify, receive } = require('../controllers/whatsappWebhookController');

const router = express.Router();

// Public by design: Meta calls these. Authenticity comes from the verify token (GET)
// and the X-Hub-Signature-256 check (POST), not from a user login.
router.get('/', verify);
router.post('/', receive);

module.exports = router;
