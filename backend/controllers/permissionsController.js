const db = require('../config/db');
const { PERMISSIONS, ROLE_TEMPLATES, VALID_KEYS } = require('../config/permissions');
const { invalidatePermissionCache } = require('../middleware/authMiddleware');

function parseRoles(rawRole) {
  if (Array.isArray(rawRole)) {
    return rawRole.map(r => (typeof r === 'string' ? r.replace(/\{|\}/g, '').trim() : String(r)));
  }
  if (typeof rawRole === 'string') {
    return rawRole.replace(/\{|\}/g, '').split(',').map(r => r.trim()).filter(Boolean);
  }
  return [];
}

// GET /api/permissions/registry
// Returns every permission key with its metadata, grouped by module, plus role templates.
exports.getRegistry = (req, res) => {
  const grouped = {};
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    if (!grouped[meta.module]) grouped[meta.module] = [];
    grouped[meta.module].push({ key, ...meta });
  }
  res.json({ registry: grouped, templates: ROLE_TEMPLATES });
};

// GET /api/permissions/my-permissions
// Called by the frontend on login to load the current user's permission set.
// SUPER_ADMIN receives every key so the frontend never hides anything for them.
exports.getMyPermissions = async (req, res) => {
  try {
    const roles = parseRoles(req.user.role);
    if (roles.includes('SUPER_ADMIN')) {
      return res.json({ permissions: Object.keys(PERMISSIONS) });
    }

    const result = await db.query(
      'SELECT permission_key FROM staff_permissions WHERE user_id = $1',
      [req.user.user_id]
    );
    res.json({ permissions: result.rows.map(r => r.permission_key) });
  } catch (err) {
    console.error('getMyPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/permissions/users/:userId
// Super admin view of a specific user's current permissions.
exports.getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    const userCheck = await db.query(
      'SELECT user_id FROM users WHERE user_id = $1',
      [userId]
    );
    if (!userCheck.rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await db.query(
      `SELECT permission_key, granted_by, granted_at
       FROM staff_permissions
       WHERE user_id = $1
       ORDER BY permission_key`,
      [userId]
    );
    res.json({ user_id: userId, permissions: result.rows });
  } catch (err) {
    console.error('getUserPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/permissions/users/:userId
// Bulk-replace a user's entire permission set (used by the Super Admin UI save button).
// Body: { permissions: string[] }
exports.setUserPermissions = async (req, res) => {
  const { userId } = req.params;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ message: 'permissions must be an array of strings' });
  }

  const invalid = permissions.filter(k => !VALID_KEYS.has(k));
  if (invalid.length) {
    return res.status(400).json({ message: `Unknown permission keys: ${invalid.join(', ')}` });
  }

  const userCheck = await db.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
  if (!userCheck.rows.length) {
    return res.status(404).json({ message: 'User not found' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM staff_permissions WHERE user_id = $1', [userId]);

    if (permissions.length > 0) {
      // Build a single multi-row INSERT: ($1, $2, $n+2), ($1, $3, $n+2), ...
      // where $1 = userId, $2..$n+1 = permission keys, $n+2 = grantorId
      const grantorId = req.user.user_id;
      const placeholders = permissions
        .map((_, i) => `($1, $${i + 2}, $${permissions.length + 2})`)
        .join(', ');

      await client.query(
        `INSERT INTO staff_permissions (user_id, permission_key, granted_by) VALUES ${placeholders}`,
        [userId, ...permissions, grantorId]
      );
    }

    await client.query('COMMIT');
    invalidatePermissionCache(userId);
    res.json({ message: 'Permissions updated', count: permissions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('setUserPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

// POST /api/permissions/users/:userId/:key
// Grant a single permission without touching the rest.
exports.grantPermission = async (req, res) => {
  const { userId, key } = req.params;

  if (!VALID_KEYS.has(key)) {
    return res.status(400).json({ message: `Unknown permission key: ${key}` });
  }

  const userCheck = await db.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
  if (!userCheck.rows.length) {
    return res.status(404).json({ message: 'User not found' });
  }

  try {
    await db.query(
      `INSERT INTO staff_permissions (user_id, permission_key, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, permission_key) DO NOTHING`,
      [userId, key, req.user.user_id]
    );
    invalidatePermissionCache(userId);
    res.json({ message: `Granted ${key} to ${userId}` });
  } catch (err) {
    console.error('grantPermission error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/permissions/admin-users
// Lists COORDINATOR / ACCOUNTS internal staff who have a linked login account.
// Joins internal_staff → users so we get full_name from the HR record.
exports.listAdminUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.user_id, ist.full_name, u.mobile_number, u.role,
              COUNT(sp.permission_key)::int AS permission_count
       FROM internal_staff ist
       JOIN users u ON u.user_id = ist.user_id
       LEFT JOIN staff_permissions sp ON sp.user_id = u.user_id
       WHERE ist.role IN ('COORDINATOR', 'ACCOUNTS')
       GROUP BY u.user_id, ist.full_name, u.mobile_number, u.role
       ORDER BY ist.full_name`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('listAdminUsers error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/permissions/users/:userId/:key
// Revoke a single permission.
exports.revokePermission = async (req, res) => {
  const { userId, key } = req.params;

  try {
    await db.query(
      'DELETE FROM staff_permissions WHERE user_id = $1 AND permission_key = $2',
      [userId, key]
    );
    invalidatePermissionCache(userId);
    res.json({ message: `Revoked ${key} from ${userId}` });
  } catch (err) {
    console.error('revokePermission error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
