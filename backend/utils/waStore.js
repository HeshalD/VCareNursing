// Persistence for the WhatsApp admin inbox (wa_conversations / wa_messages).
// The webhook writes inbound messages and delivery statuses through here; waEvents
// lets the realtime layer (socket.io) subscribe without this file knowing about it.

const { EventEmitter } = require('events');
const db = require('../config/db');
const { toE164 } = require('./phone');

const waEvents = new EventEmitter();

// Meta sends numbers as bare digits ("94771234567"). Normalise to E.164, and fall back
// to "+digits" so a number libphonenumber can't validate never causes a dropped message.
const normalizePhone = (waId) => {
  const digits = String(waId || '').replace(/\D/g, '');
  if (!digits) return null;
  return toE164(`+${digits}`) || `+${digits}`;
};

// Digits-only comparison on the last 9 digits is tolerant of the legacy local-format
// numbers ("0771234567") that may still sit in older rows.
const LAST9_SQL = (col) => `RIGHT(regexp_replace(${col}, '\\D', '', 'g'), 9)`;
const SECONDARY_SQL = (alias) => `
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(${alias}.secondary_phone_numbers, '[]'::jsonb)) e
    WHERE ${LAST9_SQL(`COALESCE(e->>'number', e#>>'{}')`)} = $1
  )`;

// Finds who a phone number belongs to. First hit wins: client, worker, internal staff, applicant.
const resolveContact = async (phoneE164) => {
  const last9 = phoneE164.replace(/\D/g, '').slice(-9);
  const lookups = [
    ['CLIENT', `SELECT cp.client_profile_id AS id, cp.full_name AS name
                FROM client_profiles cp JOIN users u ON u.user_id = cp.user_id
                WHERE ${LAST9_SQL('u.mobile_number')} = $1 OR ${SECONDARY_SQL('cp')} LIMIT 1`],
    ['STAFF', `SELECT sp.staff_profile_id AS id, sp.full_name AS name
               FROM staff_profiles sp JOIN users u ON u.user_id = sp.user_id
               WHERE ${LAST9_SQL('u.mobile_number')} = $1 OR ${SECONDARY_SQL('sp')} LIMIT 1`],
    ['INTERNAL_STAFF', `SELECT id, full_name AS name FROM internal_staff
                        WHERE ${LAST9_SQL('phone')} = $1 LIMIT 1`],
    ['APPLICANT', `SELECT application_id AS id, full_name AS name FROM staff_applications
                   WHERE ${LAST9_SQL('mobile_number')} = $1 ORDER BY applied_at DESC LIMIT 1`],
  ];
  for (const [type, sql] of lookups) {
    try {
      const { rows } = await db.query(sql, [last9]);
      if (rows[0]) return { contactType: type, contactId: rows[0].id, displayName: rows[0].name };
    } catch (err) {
      // A lookup failing (e.g. a column not migrated yet) must not stop the message being stored.
      console.error(`[WA] contact lookup (${type}) failed:`, err.message);
    }
  }
  return null;
};

// Links a conversation to a known client/worker/applicant by its number. Re-tried on every
// message while the contact is UNKNOWN, so a number registered later gets picked up.
const linkContact = async (conversation) => {
  if (conversation.contact_type !== 'UNKNOWN') return conversation;
  const contact = await resolveContact(conversation.phone_e164);
  if (!contact) return conversation;
  const linked = await db.query(
    `UPDATE wa_conversations SET contact_type = $2, contact_id = $3, display_name = $4
     WHERE conversation_id = $1 RETURNING *`,
    [conversation.conversation_id, contact.contactType, contact.contactId, contact.displayName]
  );
  return linked.rows[0];
};

// Stores one inbound message. Returns the saved row, or null if Meta re-delivered a wamid we already have.
const saveInboundMessage = async ({ from, profileName, wamid, msgType, body, mediaId, mediaUrl, mediaMime, mediaFilename, timestamp }) => {
  const phone = normalizePhone(from);
  if (!phone) return null;
  const sentAt = timestamp ? new Date(Number(timestamp) * 1000) : new Date();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const convRes = await client.query(
      `INSERT INTO wa_conversations (phone_e164, wa_profile_name, last_inbound_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone_e164) DO UPDATE SET
         wa_profile_name = COALESCE(EXCLUDED.wa_profile_name, wa_conversations.wa_profile_name),
         last_inbound_at = GREATEST(EXCLUDED.last_inbound_at, wa_conversations.last_inbound_at)
       RETURNING *`,
      [phone, profileName || null, sentAt]
    );
    let conversation = convRes.rows[0];

    const msgRes = await client.query(
      `INSERT INTO wa_messages
         (conversation_id, wamid, direction, msg_type, body, media_id, media_url, media_mime, media_filename, status, created_at)
       VALUES ($1, $2, 'IN', $3, $4, $5, $6, $7, $8, 'received', $9)
       ON CONFLICT (wamid) DO NOTHING
       RETURNING *`,
      [conversation.conversation_id, wamid, msgType, body || null, mediaId || null, mediaUrl || null, mediaMime || null, mediaFilename || null, sentAt]
    );
    if (!msgRes.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const preview = (body && body.trim()) ? body.trim().slice(0, 140) : `[${msgType}]`;
    const updRes = await client.query(
      `UPDATE wa_conversations
       SET last_message_at = $2, last_message_preview = $3, last_message_direction = 'IN',
           unread_count = unread_count + 1
       WHERE conversation_id = $1 RETURNING *`,
      [conversation.conversation_id, sentAt, preview]
    );
    conversation = updRes.rows[0];
    await client.query('COMMIT');

    conversation = await linkContact(conversation);
    waEvents.emit('message', { conversation, message: msgRes.rows[0] });
    return msgRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// Records a message we sent (template, document, or an admin's free-form reply), including
// failed attempts so the admin can see why something never arrived. Never throws: a logging
// problem must not turn a delivered WhatsApp message into a failed API call.
const logOutbound = async ({ to, wamid, msgType, body, templateName, templateParams, mediaUrl, mediaMime, mediaFilename, status = 'sent', errorCode, errorMessage, sentByUserId }) => {
  try {
    const phone = normalizePhone(to);
    if (!phone) return null;

    const client = await db.pool.connect();
    let conversation;
    let message;
    try {
      await client.query('BEGIN');
      // The no-op update is what lets RETURNING hand back the row when it already exists.
      const convRes = await client.query(
        `INSERT INTO wa_conversations (phone_e164) VALUES ($1)
         ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
         RETURNING *`,
        [phone]
      );
      conversation = convRes.rows[0];

      const msgRes = await client.query(
        `INSERT INTO wa_messages
           (conversation_id, wamid, direction, msg_type, body, template_name, template_params,
            media_url, media_mime, media_filename, status, error_code, error_message, sent_by_user_id)
         VALUES ($1, $2, 'OUT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (wamid) DO NOTHING
         RETURNING *`,
        [conversation.conversation_id, wamid || null, msgType, body || null, templateName || null,
         templateParams ? JSON.stringify(templateParams) : null, mediaUrl || null, mediaMime || null,
         mediaFilename || null, status, errorCode ? String(errorCode) : null, errorMessage || null,
         sentByUserId || null]
      );
      message = msgRes.rows[0];
      if (!message) {
        await client.query('ROLLBACK');
        return null;
      }

      const preview = (body && body.trim())
        ? body.trim().slice(0, 140)
        : (templateName ? `[template: ${templateName}]` : `[${msgType}]`);
      const updRes = await client.query(
        `UPDATE wa_conversations
         SET last_message_at = NOW(), last_message_preview = $2, last_message_direction = 'OUT'
         WHERE conversation_id = $1 RETURNING *`,
        [conversation.conversation_id, preview]
      );
      conversation = updRes.rows[0];
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    conversation = await linkContact(conversation);
    waEvents.emit('message', { conversation, message });
    return message;
  } catch (err) {
    console.error('[WA] failed to log outbound message:', err.message);
    return null;
  }
};

// Clears the unread badge when an admin opens a conversation.
const markConversationRead = async (conversationId) => {
  const { rows } = await db.query(
    'UPDATE wa_conversations SET unread_count = 0 WHERE conversation_id = $1 RETURNING *',
    [conversationId]
  );
  if (rows[0]) waEvents.emit('read', { conversation: rows[0] });
  return rows[0] || null;
};

// Applies a delivery/read/failed receipt to an outbound message. Receipts can arrive out of
// order, so status only moves forward (sent -> delivered -> read), and a failure is final.
const updateMessageStatus = async ({ wamid, status, errorCode, errorMessage }) => {
  const { rows } = await db.query(
    `UPDATE wa_messages
     SET status = $2::text, error_code = $3, error_message = $4, status_updated_at = NOW()
     WHERE wamid = $1 AND direction = 'OUT' AND status <> 'failed'
       AND ($2::text = 'failed'
            OR array_position(ARRAY['sent','delivered','read'], status)
               < array_position(ARRAY['sent','delivered','read'], $2::text))
     RETURNING message_id, conversation_id, wamid, status, error_code, error_message`,
    [wamid, status, errorCode || null, errorMessage || null]
  );
  if (rows[0]) waEvents.emit('status', rows[0]);
  return rows[0] || null;
};

module.exports = { waEvents, normalizePhone, resolveContact, saveInboundMessage, logOutbound, markConversationRead, updateMessageStatus };
