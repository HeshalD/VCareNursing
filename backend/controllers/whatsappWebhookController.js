// Meta WhatsApp Cloud API webhook: the GET handshake, plus inbound messages and delivery
// receipts. Registered in Meta under WhatsApp > Configuration > Webhook.
//
// Env: META_WA_VERIFY_TOKEN (handshake), META_APP_SECRET (signature check),
//      META_WA_PHONE_NUMBER_ID / META_WHATSAPP_TOKEN (already used for sending; reused for media).

const crypto = require('crypto');
const axios = require('axios');
const { uploadBufferToS3 } = require('../config/s3Config');
const { saveInboundMessage, updateMessageStatus } = require('../utils/waStore');

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

// GET: Meta calls this once when the webhook is saved. Echo the challenge back if the token matches.
exports.verify = (req, res) => {
  const expected = process.env.META_WA_VERIFY_TOKEN;
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

  if (!expected) {
    console.error('[WA webhook] META_WA_VERIFY_TOKEN is not set; refusing verification');
    return res.sendStatus(403);
  }
  if (mode === 'subscribe' && token === expected) {
    console.log('[WA webhook] verified');
    return res.status(200).send(challenge);
  }
  console.warn('[WA webhook] verification failed (bad mode or token)');
  return res.sendStatus(403);
};

// Meta signs every POST with HMAC-SHA256 of the raw body, keyed by the app secret.
const hasValidSignature = (req) => {
  const secret = process.env.META_APP_SECRET;
  const header = req.get('x-hub-signature-256');
  if (!secret || !header || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// POST: acknowledge straight away (Meta retries anything that isn't a fast 200), then process.
exports.receive = (req, res) => {
  if (!hasValidSignature(req)) {
    console.warn('[WA webhook] rejected POST: missing/invalid signature or META_APP_SECRET not set');
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  processPayload(req.body).catch((err) => console.error('[WA webhook] processing failed:', err));
};

async function processPayload(payload) {
  if (payload?.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      // Only our own number: an app can have several, and the dashboard's "Test" button sends a dummy one.
      if (value.metadata?.phone_number_id !== process.env.META_WA_PHONE_NUMBER_ID) {
        console.log(`[WA webhook] ignored event for phone_number_id ${value.metadata?.phone_number_id}`);
        continue;
      }

      const profileNames = {};
      for (const c of value.contacts || []) profileNames[c.wa_id] = c.profile?.name;

      for (const msg of value.messages || []) {
        try {
          await handleInboundMessage(msg, profileNames[msg.from]);
        } catch (err) {
          console.error(`[WA webhook] failed to store inbound ${msg.id}:`, err);
        }
      }
      for (const st of value.statuses || []) {
        try {
          await updateMessageStatus({
            wamid: st.id,
            status: st.status,
            errorCode: st.errors?.[0]?.code,
            errorMessage: st.errors?.[0]?.title || st.errors?.[0]?.message,
          });
        } catch (err) {
          console.error(`[WA webhook] failed to apply status for ${st.id}:`, err);
        }
      }
    }
  }
}

// Reduces Meta's per-type message shapes to { msgType, body, media }.
function describeMessage(msg) {
  const type = msg.type;
  if (type === 'text') return { msgType: 'text', body: msg.text?.body };
  if (MEDIA_TYPES.includes(type)) {
    const m = msg[type] || {};
    return { msgType: type, body: m.caption || null, media: { id: m.id, mime: m.mime_type, filename: m.filename } };
  }
  if (type === 'location') {
    const l = msg.location || {};
    return { msgType: 'location', body: [l.name, l.address, `${l.latitude}, ${l.longitude}`].filter(Boolean).join(' - ') };
  }
  if (type === 'button') return { msgType: 'text', body: msg.button?.text };
  if (type === 'interactive') {
    const r = msg.interactive?.button_reply || msg.interactive?.list_reply;
    return { msgType: 'text', body: r?.title };
  }
  if (type === 'contacts') {
    return { msgType: 'contacts', body: (msg.contacts || []).map((c) => c.name?.formatted_name).filter(Boolean).join(', ') };
  }
  if (type === 'reaction') return { msgType: 'reaction', body: msg.reaction?.emoji };
  return { msgType: 'other', body: null };
}

// Meta only hands out a short-lived media id, so copy the file to S3 now.
async function downloadMediaToS3(media, wamid) {
  const auth = { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` };
  const meta = await axios.get(`${GRAPH_URL}/${media.id}`, { headers: auth });
  const file = await axios.get(meta.data.url, { headers: auth, responseType: 'arraybuffer' });

  const mime = meta.data.mime_type || media.mime || 'application/octet-stream';
  const ext = EXT_BY_MIME[mime.split(';')[0]] || 'bin';
  const safeId = wamid.replace(/[^A-Za-z0-9]/g, '');
  const key = `whatsapp-media/${safeId}.${ext}`;
  const url = await uploadBufferToS3(Buffer.from(file.data), key, mime);
  return { url, mime };
}

async function handleInboundMessage(msg, profileName) {
  const { msgType, body, media } = describeMessage(msg);
  const record = {
    from: msg.from,
    profileName,
    wamid: msg.id,
    msgType,
    body,
    timestamp: msg.timestamp,
    mediaId: media?.id,
    mediaMime: media?.mime,
    mediaFilename: media?.filename,
  };

  if (media?.id) {
    try {
      const saved = await downloadMediaToS3(media, msg.id);
      record.mediaUrl = saved.url;
      record.mediaMime = saved.mime;
    } catch (err) {
      // Keep the message (and media_id for a later retry) even if the file couldn't be fetched.
      console.error(`[WA webhook] media download failed for ${msg.id}:`, err.response?.data || err.message);
    }
  }

  await saveInboundMessage(record);
}
