const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../utils/activityLogger');

const LOGIN_ROLES = new Set(['COORDINATOR', 'ACCOUNTS', 'SALES', 'SUPER_ADMIN']);
const SELECTABLE = 'id, user_id, full_name, role, email, phone, base_salary, joined_date, status, address, total_sales_amount, bookings_brought_count, created_at, updated_at';

exports.list = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${SELECTABLE} FROM internal_staff ORDER BY full_name`
    );
    res.json({ staff: result.rows });
  } catch (err) {
    console.error('internalStaff.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const { full_name, role, email, phone, base_salary, joined_date, status, address, password } = req.body;

  if (!full_name?.trim() || !role?.trim() || !email?.trim()) {
    return res.status(400).json({ message: 'full_name, role, and email are required' });
  }

  const needsLogin = LOGIN_ROLES.has(role.trim().toUpperCase());
  if (needsLogin) {
    if (!phone?.trim()) return res.status(400).json({ message: 'Phone is required for COORDINATOR, ACCOUNTS, SALES, and SUPER_ADMIN roles' });
    if (!password?.trim()) return res.status(400).json({ message: 'Password is required for COORDINATOR, ACCOUNTS, SALES, and SUPER_ADMIN roles' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let userId = null;
    if (needsLogin) {
      const hash = await bcrypt.hash(password.trim(), 10);
      const roleEnum = role.trim().toUpperCase();
      const userResult = await client.query(
        `INSERT INTO users (mobile_number, password_hash, email, role, is_active)
         VALUES ($1, $2, $3, ARRAY[$4::user_role_enum], true)
         RETURNING user_id`,
        [phone.trim(), hash, email.trim(), roleEnum]
      );
      userId = userResult.rows[0].user_id;
    }

    const result = await client.query(
      `INSERT INTO internal_staff (full_name, role, email, phone, base_salary, joined_date, status, address, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECTABLE}`,
      [
        full_name.trim(),
        role.trim(),
        email.trim(),
        phone?.trim() || null,
        base_salary != null && base_salary !== '' ? parseFloat(base_salary) : 0,
        joined_date || null,
        status || 'Active',
        address?.trim() || null,
        userId,
      ]
    );

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_CREATED',
      entityType: 'STAFF',
      entityId: String(result.rows[0].id),
      details: { full_name: full_name.trim(), role: role.trim() },
    }).catch(err => console.error('Activity log failed:', err));

    res.status(201).json({ staff: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A staff member or user with this email/phone already exists' });
    }
    console.error('internalStaff.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const allowed = ['full_name', 'role', 'email', 'phone', 'base_salary', 'joined_date', 'status', 'address'];
  const body = req.body;

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      setClauses.push(`${key} = $${idx++}`);
      const val = body[key];
      values.push(val === '' ? null : key === 'base_salary' && val != null ? parseFloat(val) : val);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  try {
    const result = await db.query(
      `UPDATE internal_staff SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING ${SELECTABLE}`,
      values
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_UPDATED',
      entityType: 'STAFF',
      entityId: String(id),
      details: { updated_fields: allowed.filter(k => Object.prototype.hasOwnProperty.call(body, k)) },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ staff: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A staff member with this email already exists' });
    }
    console.error('internalStaff.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const staffResult = await client.query(
      'SELECT full_name, user_id FROM internal_staff WHERE id = $1',
      [id]
    );
    if (!staffResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff member not found' });
    }
    const { full_name, user_id } = staffResult.rows[0];

    await client.query('DELETE FROM internal_staff WHERE id = $1', [id]);

    if (user_id) {
      // Deactivate rather than delete: the user may still be referenced by
      // activity_log (as actor) or other audit records.
      await client.query('UPDATE users SET is_active = false WHERE user_id = $1', [user_id]);
    }

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_REMOVED',
      entityType: 'STAFF',
      entityId: String(id),
      details: { full_name },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ message: `${full_name} has been removed` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('internalStaff.remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};
