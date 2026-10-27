// Admin WhatsApp inbox API: list conversations, read a thread, reply, mark read.
// Inbound messages arrive via whatsappWebhookController; sending goes through utils/metaWhatsapp.

const crypto = require('crypto');
const db = require('../config/db');
const { uploadBufferToS3 } = require('../config/s3Config');
const { sendText, sendMedia, sendAdminTemplate, mediaTypeFor } = require('../utils/metaWhatsapp');
const { markConversationRead, normalizePhone } = require('../utils/waStore');
const { logActivity } = require('../utils/activityLogger');
const { toE164 } = require('../utils/phone');
const waTemplates = require('../services/waTemplates');

const MAX_TEXT = 4096;
const MB = 1024 * 1024;
// Meta's per-type size limits (document is 100 MB there, but the proxy caps uploads at 20 MB).
const SIZE_LIMIT = { image: 5 * MB, video: 16 * MB, audio: 16 * MB, document: 16 * MB };
const DOCUMENT_MIMES = new Set([
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

// Meta's free-form reply window: 24 hours from the customer's last message.
const CONVERSATION_COLUMNS = `
  c.conversation_id, c.phone_e164, c.contact_type, c.contact_id, c.display_name, c.wa_profile_name,
  c.last_message_at, c.last_message_preview, c.last_message_direction, c.last_inbound_at, c.unread_count,
  (c.last_inbound_at IS NOT NULL AND c.last_inbound_at > NOW() - INTERVAL '24 hours') AS window_open,
  (c.last_inbound_at + INTERVAL '24 hours') AS window_expires_at`;

exports.listConversations = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const params = [];
    const where = ['c.last_message_at IS NOT NULL'];

    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      where.push(`(c.phone_e164 ILIKE $${params.length} OR c.display_name ILIKE $${params.length} OR c.wa_profile_name ILIKE $${params.length})`);
    }
    if (req.query.unread === 'true') where.push('c.unread_count > 0');
    if (req.query.before) {
      params.push(req.query.before);
      where.push(`c.last_message_at < $${params.length}`);
    }
    params.push(limit);

    const [list, unread] = await Promise.all([
      db.query(
        `SELECT ${CONVERSATION_COLUMNS} FROM wa_conversations c
         WHERE ${where.join(' AND ')}
         ORDER BY c.last_message_at DESC LIMIT $${params.length}`,
        params
      ),
      db.query('SELECT COALESCE(SUM(unread_count), 0)::int AS total FROM wa_conversations'),
    ]);
    res.json({ conversations: list.rows, total_unread: unread.rows[0].total });
  } catch (err) {
    console.error('listConversations error:', err);
    res.status(500).json({ message: 'Failed to load conversations' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COALESCE(SUM(unread_count), 0)::int AS total FROM wa_conversations');
    res.json({ total_unread: rows[0].total });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    res.status(500).json({ message: 'Failed to load unread count' });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${CONVERSATION_COLUMNS} FROM wa_conversations c WHERE c.conversation_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Conversation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getConversation error:', err);
    res.status(500).json({ message: 'Failed to load conversation' });
  }
};

// Newest page first from the DB, returned oldest -> newest so the UI can render it as-is.
// Pass the oldest loaded message's created_at as `before` to load the page above it.
exports.getMessages = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const params = [req.params.id];
    let beforeClause = '';
    if (req.query.before) {
      params.push(req.query.before);
      beforeClause = `AND m.created_at < $${params.length}`;
    }
    params.push(limit + 1);

    const { rows } = await db.query(
      `SELECT m.message_id, m.wamid, m.direction, m.msg_type, m.body, m.template_name, m.template_params,
              m.media_url, m.media_mime, m.media_filename, m.status, m.error_code, m.error_message,
              m.created_at, m.sent_by_user_id,
              COALESCE(ist.full_name, sp.full_name) AS sent_by_name
       FROM wa_messages m
       LEFT JOIN internal_staff ist ON ist.user_id = m.sent_by_user_id
       LEFT JOIN staff_profiles sp ON sp.user_id = m.sent_by_user_id
       WHERE m.conversation_id = $1 ${beforeClause}
       ORDER BY m.created_at DESC LIMIT $${params.length}`,
      params
    );
    const hasMore = rows.length > limit;
    res.json({ messages: rows.slice(0, limit).reverse(), has_more: hasMore });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Failed to load messages' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const conversation = await markConversationRead(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('markRead error:', err);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
};

// Validates an uploaded file against WhatsApp's limits and copies it to S3.
// Returns { url, mime, filename, mediaType } or throws an Error with a user-facing message.
const storeOutgoingFile = async (file) => {
  const mediaType = mediaTypeFor(file.mimetype);
  if (mediaType === 'document' && !DOCUMENT_MIMES.has(file.mimetype)) throw new Error('This file type is not supported on WhatsApp.');
  if (file.size > SIZE_LIMIT[mediaType]) {
    throw new Error(`${mediaType[0].toUpperCase() + mediaType.slice(1)} files can be at most ${SIZE_LIMIT[mediaType] / MB} MB.`);
  }
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const url = await uploadBufferToS3(file.buffer, `whatsapp-media/out/${crypto.randomUUID()}_${safeName}`, file.mimetype);
  return { url, mime: file.mimetype, filename: file.originalname, mediaType };
};

const parseList = (raw) => {
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const actorRole = (req) => (Array.isArray(req.user.role) ? req.user.role[0] : req.user.role);

// Approved templates from Meta, shaped for the picker form.
exports.listTemplates = async (req, res) => {
  try {
    if (!waTemplates.isConfigured()) {
      return res.json({ configured: false, templates: [] });
    }
    const templates = await waTemplates.listTemplates({ force: req.query.refresh === 'true' });
    res.json({ configured: true, templates });
  } catch (err) {
    const metaError = err.response?.data?.error;
    console.error('listTemplates error:', metaError || err.message);
    res.status(502).json({ message: metaError?.message || 'Could not load templates from WhatsApp.' });
  }
};

// Send an approved template to an existing conversation (conversation_id) or to a brand-new
// number (phone). Works at any time, including outside the 24-hour window.
// Multipart: name, language, bodyParams/headerParams/buttonParams (JSON arrays), optional `file` for a media header.
exports.sendTemplateMessage = async (req, res) => {
  try {
    const { name, language, conversation_id: conversationId, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Choose a template.' });

    let to;
    if (conversationId) {
      const { rows } = await db.query('SELECT phone_e164 FROM wa_conversations WHERE conversation_id = $1', [conversationId]);
      if (!rows[0]) return res.status(404).json({ message: 'Conversation not found' });
      to = rows[0].phone_e164;
    } else {
      to = toE164(phone);
      if (!to) return res.status(400).json({ message: 'Enter a valid phone number, e.g. 077 123 4567 or +94 77 123 4567.' });
    }

    const def = await waTemplates.findTemplate(name, language);
    if (!def) return res.status(404).json({ message: 'That template is not available (it may have been removed or is not approved).' });

    let headerMedia = null;
    if (req.file) {
      const stored = await storeOutgoingFile(req.file);
      if (def.header && stored.mediaType.toUpperCase() !== def.header.format) {
        return res.status(400).json({ message: `This template needs a ${def.header.format.toLowerCase()}, but a ${stored.mediaType} was attached.` });
      }
      headerMedia = { url: stored.url, filename: stored.filename };
    }

    const built = waTemplates.buildSend(def, {
      bodyParams: parseList(req.body.bodyParams),
      headerParams: parseList(req.body.headerParams),
      buttonParams: parseList(req.body.buttonParams),
      headerMedia,
    });

    const result = await sendAdminTemplate(to, def, built, { sentByUserId: req.user.user_id });
    if (result?.blocked) {
      return res.status(409).json({ code: 'WHATSAPP_DISABLED', message: 'WhatsApp sending is switched off in Notification settings.' });
    }

    logActivity({
      actorUserId: req.user.user_id,
      actorName: 'Admin',
      actorRole: actorRole(req),
      actionType: 'WHATSAPP_TEMPLATE_SENT',
      entityType: 'wa_conversation',
      entityId: conversationId || null,
      details: { phone: to, template: def.name },
    }).catch((e) => console.error('Activity log failed (whatsapp):', e.message));

    const conv = await db.query('SELECT conversation_id FROM wa_conversations WHERE phone_e164 = $1', [normalizePhone(to)]);
    res.status(201).json({ success: true, conversation_id: conv.rows[0]?.conversation_id, wamid: result?.messages?.[0]?.id });
  } catch (err) {
    const metaError = err.response?.data?.error;
    console.error('sendTemplateMessage error:', metaError || err.message);
    // buildSend/storeOutgoingFile throw plain Errors with a message meant for the admin.
    const status = metaError ? 502 : (err.response ? 500 : 400);
    res.status(status).json({ message: metaError?.message || err.message || 'Failed to send template' });
  }
};

// Reply to a conversation: JSON {text}, or multipart with a `file` (and optional `text` as caption).
exports.sendMessage = async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    const file = req.file;
    if (!text && !file) return res.status(400).json({ message: 'Type a message or attach a file.' });
    if (text.length > MAX_TEXT) return res.status(400).json({ message: `Message is too long (max ${MAX_TEXT} characters).` });

    const convRes = await db.query(
      `SELECT c.phone_e164, (c.last_inbound_at IS NOT NULL AND c.last_inbound_at > NOW() - INTERVAL '24 hours') AS window_open
       FROM wa_conversations c WHERE c.conversation_id = $1`,
      [req.params.id]
    );
    const conv = convRes.rows[0];
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    if (!conv.window_open) {
      return res.status(409).json({
        code: 'WINDOW_CLOSED',
        message: 'The 24-hour reply window has closed. WhatsApp only allows an approved template message now.',
      });
    }

    const sentByUserId = req.user.user_id;
    let result;
    let mediaType = 'text';

    if (file) {
      let stored;
      try {
        stored = await storeOutgoingFile(file);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
      mediaType = stored.mediaType;
      result = await sendMedia(conv.phone_e164, stored, text, { sentByUserId });
    } else {
      result = await sendText(conv.phone_e164, text, { sentByUserId });
    }

    if (result?.blocked) {
      return res.status(409).json({ code: 'WHATSAPP_DISABLED', message: 'WhatsApp sending is switched off in Notification settings.' });
    }

    logActivity({
      actorUserId: sentByUserId,
      actorName: 'Admin',
      actorRole: actorRole(req),
      actionType: 'WHATSAPP_MESSAGE_SENT',
      entityType: 'wa_conversation',
      entityId: req.params.id,
      details: { phone: conv.phone_e164, type: mediaType },
    }).catch((e) => console.error('Activity log failed (whatsapp):', e.message));

    res.status(201).json({ success: true, wamid: result?.messages?.[0]?.id });
  } catch (err) {
    // Meta's own error text is the useful part (e.g. "Re-engagement message", invalid media).
    const metaError = err.response?.data?.error;
    console.error('sendMessage error:', metaError || err);
    res.status(metaError ? 502 : 500).json({ message: metaError?.message || 'Failed to send message' });
  }
};
