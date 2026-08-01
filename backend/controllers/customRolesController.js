const db = require('../config/db');
const { VALID_KEYS } = require('../config/permissions');
const { invalidateAllPermissionCache } = require('../middleware/authMiddleware');
const { logActivity } = require('../utils/activityLogger');

// GET /api/custom-roles
exports.list = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cr.id, cr.name, cr.description, cr.created_at, cr.updated_at,
              COUNT(DISTINCT crp.permission_key)::int AS permission_count,
              COUNT(DISTINCT isr.staff_id)::int AS assigned_count
       FROM custom_roles cr
       LEFT JOIN custom_role_permissions crp ON crp.role_id = cr.id
       LEFT JOIN internal_staff_roles isr ON isr.custom_role_id = cr.id AND isr.role = 'CUSTOM_ROLE'
       GROUP BY cr.id
       ORDER BY cr.name`
    );
    res.json({ roles: result.rows });
  } catch (err) {
    console.error('customRoles.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/custom-roles/:id
exports.get = async (req, res) => {
  try {
    const { id } = req.params;
    const roleRes = await db.query('SELECT id, name, description FROM custom_roles WHERE id = $1', [id]);
    if (!roleRes.rows.length) {
      return res.status(404).json({ message: 'Role not found' });
    }
    const permsRes = await db.query(
      'SELECT permission_key FROM custom_role_permissions WHERE role_id = $1',
      [id]
    );
    res.json({ role: roleRes.rows[0], permissions: permsRes.rows.map(r => r.permission_key) });
  } catch (err) {
    console.error('customRoles.get error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/custom-roles
// Body: { name, description, permissions: string[] }
exports.create = async (req, res) => {
  const { name, description, permissions } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Role name is required' });
  }
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ message: 'permissions must be an array of strings' });
  }
  const invalid = permissions.filter(k => !VALID_KEYS.has(k));
  if (invalid.length) {
    return res.status(400).json({ message: `Unknown permission keys: ${invalid.join(', ')}` });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const roleRes = await client.query(
      `INSERT INTO custom_roles (name, description) VALUES ($1, $2) RETURNING id, name, description`,
      [name.trim(), description?.trim() || null]
    );
    const role = roleRes.rows[0];

    if (permissions.length > 0) {
      const placeholders = permissions.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO custom_role_permissions (role_id, permission_key) VALUES ${placeholders}`,
        [role.id, ...permissions]
      );
    }

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'CUSTOM_ROLE_CREATED',
      entityType: 'CUSTOM_ROLE',
      entityId: role.id,
      details: { name: role.name, permissions },
    }).catch(err => console.error('Activity log failed:', err));

    res.status(201).json({ role, permissions });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A role with this name already exists' });
    }
    console.error('customRoles.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

// PUT /api/custom-roles/:id
// Body: { name, description, permissions: string[] }
exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, description, permissions } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Role name is required' });
  }
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ message: 'permissions must be an array of strings' });
  }
  const invalid = permissions.filter(k => !VALID_KEYS.has(k));
  if (invalid.length) {
    return res.status(400).json({ message: `Unknown permission keys: ${invalid.join(', ')}` });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const roleRes = await client.query(
      `UPDATE custom_roles SET name = $1, description = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id, name, description`,
      [name.trim(), description?.trim() || null, id]
    );
    if (!roleRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Role not found' });
    }

    await client.query('DELETE FROM custom_role_permissions WHERE role_id = $1', [id]);
    if (permissions.length > 0) {
      const placeholders = permissions.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO custom_role_permissions (role_id, permission_key) VALUES ${placeholders}`,
        [id, ...permissions]
      );
    }

    await client.query('COMMIT');
    invalidateAllPermissionCache();

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'CUSTOM_ROLE_UPDATED',
      entityType: 'CUSTOM_ROLE',
      entityId: id,
      details: { name: roleRes.rows[0].name, permissions },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ role: roleRes.rows[0], permissions });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A role with this name already exists' });
    }
    console.error('customRoles.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

// DELETE /api/custom-roles/:id
exports.remove = async (req, res) => {
  const { id } = req.params;
  try {
    const assigned = await db.query(
      `SELECT COUNT(*)::int AS count FROM internal_staff_roles WHERE custom_role_id = $1 AND role = 'CUSTOM_ROLE'`,
      [id]
    );
    if (assigned.rows[0].count > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${assigned.rows[0].count} staff member(s) still have this role assigned. Reassign them first.`,
      });
    }

    const result = await db.query('DELETE FROM custom_roles WHERE id = $1 RETURNING name', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Role not found' });
    }

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'CUSTOM_ROLE_DELETED',
      entityType: 'CUSTOM_ROLE',
      entityId: id,
      details: { name: result.rows[0].name },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ message: `Role "${result.rows[0].name}" deleted` });
  } catch (err) {
    console.error('customRoles.remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
