const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { getRecipientEmails, notifyNewServiceRequest } = require('../services/serviceRequestEmail');

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_RECIPIENTS = 20;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actorOf = async (req) => {
  const r = await db.query(
    `SELECT COALESCE(sp.full_name, ist.full_name) AS full_name
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
     LEFT JOIN internal_staff ist ON ist.user_id = u.user_id
     WHERE u.user_id = $1`,
    [req.user.user_id]
  );
  const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
  return { name: r.rows[0]?.full_name || 'Admin', role: String(role || '').replace(/[{}]/g, '').split(',')[0].trim() };
};

const log = async (req, actionType, details) => {
  try {
    const actor = await actorOf(req);
    await logActivity({
      actorUserId: req.user.user_id, actorName: actor.name, actorRole: actor.role,
      actionType, entityType: 'service_request_notifications', entityId: null, details,
    });
  } catch (e) {
    console.error('[ServiceRequestNotifications] Activity log failed:', e.message);
  }
};

// GET /api/service-requests/notification-recipients
exports.listRecipients = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT recipient_id, email, added_by_name, created_at
       FROM service_request_notification_recipients ORDER BY created_at`
    );
    res.json({ success: true, data: result.rows, max: MAX_RECIPIENTS });
  } catch (err) {
    console.error('listRecipients error:', err);
    res.status(500).json({ success: false, message: 'Failed to load the recipients' });
  }
};

// POST /api/service-requests/notification-recipients   { email }
exports.addRecipient = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    const count = await db.query('SELECT COUNT(*)::int AS n FROM service_request_notification_recipients');
    if (count.rows[0].n >= MAX_RECIPIENTS) {
      return res.status(400).json({ success: false, message: `You can add up to ${MAX_RECIPIENTS} recipients.` });
    }
    const actor = await actorOf(req);
    const result = await db.query(
      `INSERT INTO service_request_notification_recipients (email, added_by, added_by_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (LOWER(email)) DO NOTHING
       RETURNING recipient_id, email, added_by_name, created_at`,
      [email, req.user.user_id, actor.name]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'That email is already on the list.' });
    }
    await log(req, 'SERVICE_REQUEST_NOTIFICATION_RECIPIENT_ADDED', { email });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('addRecipient error:', err);
    res.status(500).json({ success: false, message: 'Failed to add the recipient' });
  }
};

// DELETE /api/service-requests/notification-recipients/:id
exports.removeRecipient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRegex.test(id)) return res.status(400).json({ success: false, message: 'Invalid recipient id' });
    const result = await db.query(
      'DELETE FROM service_request_notification_recipients WHERE recipient_id = $1 RETURNING email',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Recipient not found' });
    await log(req, 'SERVICE_REQUEST_NOTIFICATION_RECIPIENT_REMOVED', { email: result.rows[0].email });
    res.json({ success: true });
  } catch (err) {
    console.error('removeRecipient error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove the recipient' });
  }
};

// POST /api/service-requests/notification-recipients/test
// Emails the newest real service request to the configured list so admins can see exactly what
// the notification looks like (and confirm email works) without waiting for a new submission.
exports.sendTest = async (req, res) => {
  try {
    const recipients = await getRecipientEmails();
    if (recipients.length === 0) return res.status(400).json({ success: false, message: 'Add at least one recipient first.' });
    const latest = await db.query('SELECT request_id FROM service_requests ORDER BY created_at DESC LIMIT 1');
    if (latest.rows.length === 0) return res.status(400).json({ success: false, message: 'There is no service request yet to use as a sample.' });
    const result = await notifyNewServiceRequest(latest.rows[0].request_id);
    if (result?.skipped) {
      return res.status(502).json({ success: false, message: `The email could not be sent (${result.reason || result.error || 'email service unavailable'}).` });
    }
    await log(req, 'SERVICE_REQUEST_NOTIFICATION_TEST_SENT', { recipients: recipients.length });
    res.json({ success: true, message: `Sample email sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}.` });
  } catch (err) {
    console.error('sendTest error:', err);
    res.status(500).json({ success: false, message: 'Failed to send the sample email' });
  }
};
