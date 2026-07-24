const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

const DEVICE_RESTRICTED_ROLES = new Set(['COORDINATOR', 'ACCOUNTS']);

function generateActivationCode() {
  // 8-char, unambiguous alphabet (no 0/O/1/I) so it's easy to read off a handoff slip
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
}

// SUPER_ADMIN assigns a new device slot to a staff member
exports.assign = async (req, res) => {
  const { user_id, label } = req.body;

  if (!user_id?.trim() || !label?.trim()) {
    return res.status(400).json({ message: 'user_id and label are required' });
  }

  try {
    const userResult = await db.query('SELECT role FROM users WHERE user_id = $1', [user_id]);
    if (!userResult.rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const code = generateActivationCode();
    const result = await db.query(
      `INSERT INTO staff_devices (user_id, activation_code, label, status, assigned_by)
       VALUES ($1, $2, $3, 'PENDING', $4)
       RETURNING id, user_id, label, status, activation_code, assigned_at`,
      [user_id, code, label.trim(), req.user.user_id]
    );

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'DEVICE_ASSIGNED',
      entityType: 'STAFF',
      entityId: String(user_id),
      details: { label: label.trim() },
    }).catch(err => console.error('Activity log failed:', err));

    res.status(201).json({ device: result.rows[0] });
  } catch (err) {
    console.error('device.assign error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Staff member activates a device they were assigned, using the activation code + their password.
// No JWT required yet - this is how a brand new device gets bound in the first place.
exports.activate = async (req, res) => {
  const { activation_code, device_id, password } = req.body;

  if (!activation_code?.trim() || !device_id?.trim() || !password) {
    return res.status(400).json({ message: 'activation_code, device_id, and password are required' });
  }

  try {
    const deviceResult = await db.query(
      `SELECT id, user_id, status FROM staff_devices WHERE activation_code = $1`,
      [activation_code.trim().toUpperCase()]
    );

    if (!deviceResult.rows.length) {
      return res.status(404).json({ message: 'Invalid activation code' });
    }

    const device = deviceResult.rows[0];
    if (device.status !== 'PENDING') {
      return res.status(409).json({ message: 'This activation code has already been used' });
    }

    const userResult = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [device.user_id]);
    const isMatch = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const result = await db.query(
      `UPDATE staff_devices
       SET device_id = $1, status = 'ACTIVE', activated_at = NOW(), activation_code = NULL
       WHERE id = $2
       RETURNING id, label, status, activated_at`,
      [device_id.trim(), device.id]
    );

    res.json({ device: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This device is already registered to another account' });
    }
    console.error('device.activate error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// SUPER_ADMIN revokes a device - kills any active sessions on it too
exports.revoke = async (req, res) => {
  const { id } = req.params;

  try {
    const deviceResult = await db.query(
      `UPDATE staff_devices SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1 RETURNING device_id, user_id, label`,
      [id]
    );

    if (!deviceResult.rows.length) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const { device_id, user_id, label } = deviceResult.rows[0];
    if (device_id) {
      await db.query(
        `UPDATE staff_sessions SET is_active = false, logout_at = NOW() WHERE device_id = $1 AND is_active = true`,
        [device_id]
      );
    }

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'DEVICE_REVOKED',
      entityType: 'STAFF',
      entityId: String(user_id),
      details: { label },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ message: 'Device revoked' });
  } catch (err) {
    console.error('device.revoke error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// List devices assigned to a given staff member
exports.listForUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await db.query(
      `SELECT id, label, status, activation_code, assigned_at, activated_at, revoked_at
       FROM staff_devices WHERE user_id = $1 ORDER BY assigned_at DESC`,
      [userId]
    );
    res.json({ devices: result.rows });
  } catch (err) {
    console.error('device.listForUser error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// SUPER_ADMIN view of every assigned device, each tagged with its most recent
// session so the UI can show who's currently logged in vs who isn't.
exports.listAllSessions = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id AS device_row_id,
              d.user_id,
              d.label AS device_label,
              d.status AS device_status,
              COALESCE(i.full_name, u.email) AS staff_name,
              s.id AS session_id,
              s.ip_address,
              s.login_at,
              s.last_seen_at,
              COALESCE(s.is_active, false) AS is_active
       FROM staff_devices d
       JOIN users u ON u.user_id = d.user_id
       LEFT JOIN internal_staff i ON i.user_id = d.user_id
       LEFT JOIN LATERAL (
         SELECT id, ip_address, login_at, last_seen_at, is_active
         FROM staff_sessions ss
         WHERE ss.device_id = d.device_id
         ORDER BY ss.login_at DESC
         LIMIT 1
       ) s ON d.device_id IS NOT NULL
       WHERE d.status <> 'REVOKED'
       ORDER BY is_active DESC, s.last_seen_at DESC NULLS LAST, d.assigned_at DESC`
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('device.listAllSessions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// SUPER_ADMIN forces a single session to log out
exports.forceLogout = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `UPDATE staff_sessions SET is_active = false, logout_at = NOW() WHERE id = $1 RETURNING id, user_id`,
      [id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Session not found' });
    }

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'SESSION_FORCE_LOGOUT',
      entityType: 'STAFF',
      entityId: String(result.rows[0].user_id),
      details: { session_id: id },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ message: 'Session logged out' });
  } catch (err) {
    console.error('device.forceLogout error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Any logged-in device-bound staff member ends their own session on logout,
// so it stops showing as "active" in the SUPER_ADMIN sessions view.
exports.logout = async (req, res) => {
  try {
    if (req.user.jti) {
      await db.query(
        `UPDATE staff_sessions SET is_active = false, logout_at = NOW() WHERE jti = $1`,
        [req.user.jti]
      );
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('device.logout error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.DEVICE_RESTRICTED_ROLES = DEVICE_RESTRICTED_ROLES;
