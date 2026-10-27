// Pushes WhatsApp inbox changes to admins the moment they happen (new message, delivery tick,
// unread cleared). Fed by waEvents in utils/waStore; consumed by the admin inbox page.
//
// Auth mirrors middleware/authMiddleware.protect: the same JWT, a still-existing user, a still-active
// device session, and the VIEW_WHATSAPP permission. Anyone failing that never joins the room.

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('../config/db');
const { userHasPermission } = require('../middleware/authMiddleware');
const { waEvents } = require('../utils/waStore');
const { resolveActorName } = require('../utils/activityLogger');

const ROOM = 'whatsapp-admins';
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Same shape the REST API returns, so the UI can merge socket and fetched data without special cases.
const withWindow = (c) => {
  const lastInbound = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : null;
  return {
    conversation_id: c.conversation_id,
    phone_e164: c.phone_e164,
    contact_type: c.contact_type,
    contact_id: c.contact_id,
    display_name: c.display_name,
    wa_profile_name: c.wa_profile_name,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview,
    last_message_direction: c.last_message_direction,
    last_inbound_at: c.last_inbound_at,
    unread_count: c.unread_count,
    window_open: !!lastInbound && Date.now() - lastInbound < WINDOW_MS,
    window_expires_at: lastInbound ? new Date(lastInbound + WINDOW_MS).toISOString() : null,
  };
};

const authenticate = async (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) throw new Error('Not logged in');

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const { rows } = await db.query('SELECT user_id, role FROM users WHERE user_id = $1', [decoded.id]);
  if (!rows[0]) throw new Error('User no longer exists');

  if (decoded.jti) {
    const session = await db.query('SELECT is_active FROM staff_sessions WHERE jti = $1', [decoded.jti]);
    if (!session.rows[0]?.is_active) throw new Error('Session ended');
  }
  if (!(await userHasPermission(rows[0], 'VIEW_WHATSAPP'))) throw new Error('Permission denied');
  return rows[0];
};

// isAllowedOrigin: the same predicate the REST API's CORS uses.
const initWhatsappSocket = (httpServer, isAllowedOrigin) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => (!origin || isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('Origin not allowed'))),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      socket.user = await authenticate(socket);
      next();
    } catch (err) {
      next(new Error(err.message === 'Permission denied' ? 'Permission denied' : 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(ROOM);
  });

  waEvents.on('message', async ({ conversation, message }) => {
    try {
      const sent_by_name = message.sent_by_user_id ? await resolveActorName(message.sent_by_user_id) : null;
      io.to(ROOM).emit('wa:message', { conversation: withWindow(conversation), message: { ...message, sent_by_name } });
    } catch (err) {
      console.error('[WA socket] emit message failed:', err.message);
    }
  });
  waEvents.on('status', (status) => io.to(ROOM).emit('wa:status', status));
  waEvents.on('read', ({ conversation }) => io.to(ROOM).emit('wa:read', { conversation: withWindow(conversation) }));

  return io;
};

module.exports = { initWhatsappSocket };
