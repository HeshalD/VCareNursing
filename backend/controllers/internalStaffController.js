const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../utils/activityLogger');
const { toE164, isValidPhone } = require('../utils/phone');
const { invalidatePermissionCache } = require('../middleware/authMiddleware');

const LOGIN_ROLES = new Set(['COORDINATOR', 'ACCOUNTS', 'SALES', 'SUPER_ADMIN', 'CUSTOM_ROLE', 'RECRUITER']);
const SELECTABLE = 's.id, s.user_id, s.full_name, s.role, s.email, s.phone, s.base_salary, s.joined_date, s.status, s.address, s.total_sales_amount, s.bookings_brought_count, s.registrations_brought_count, s.registrations_total_amount, s.custom_role_id, s.epf_applicable, s.etf_applicable, s.created_at, s.updated_at';

// A staff member can hold multiple roles. `roles` (the source of truth) lives in
// internal_staff_roles; internal_staff.role/custom_role_id mirror the first role
// in that set as a "primary" role for legacy display (salesperson/recruiter list
// columns, activity log labels, etc).
const ROLES_SUBQUERY = `
  COALESCE(
    (SELECT json_agg(json_build_object('role', isr.role, 'custom_role_id', isr.custom_role_id, 'custom_role_name', cr.name) ORDER BY isr.created_at)
     FROM internal_staff_roles isr
     LEFT JOIN custom_roles cr ON cr.id = isr.custom_role_id
     WHERE isr.staff_id = s.id),
    '[]'::json
  ) AS roles
`;

// Normalizes the `roles` array from the request body: dedupes, uppercases role
// codes, and strips custom_role_id from non-CUSTOM_ROLE entries.
function normalizeRoles(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    if (!item) continue;
    const role = String(item.role || '').trim().toUpperCase();
    if (!role) continue;
    const custom_role_id = role === 'CUSTOM_ROLE' ? (item.custom_role_id || null) : null;
    const key = role === 'CUSTOM_ROLE' ? `CUSTOM_ROLE:${custom_role_id}` : role;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, custom_role_id });
  }
  return out;
}

function validateRoles(roles) {
  if (roles.length === 0) return 'Select at least one role';
  if (roles.some((r) => r.role === 'CUSTOM_ROLE' && !r.custom_role_id)) {
    return 'Select a custom role for each Custom Role entry';
  }
  return null;
}

async function replaceStaffRoles(client, staffId, roles) {
  await client.query('DELETE FROM internal_staff_roles WHERE staff_id = $1', [staffId]);
  for (const r of roles) {
    await client.query(
      'INSERT INTO internal_staff_roles (staff_id, role, custom_role_id) VALUES ($1, $2, $3)',
      [staffId, r.role, r.custom_role_id]
    );
  }
}

exports.list = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${SELECTABLE}, ${ROLES_SUBQUERY} FROM internal_staff s ORDER BY s.full_name`
    );
    res.json({ staff: result.rows });
  } catch (err) {
    console.error('internalStaff.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getOne = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT ${SELECTABLE}, ${ROLES_SUBQUERY} FROM internal_staff s WHERE s.id = $1`,
      [id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    res.json({ staff: result.rows[0] });
  } catch (err) {
    console.error('internalStaff.getOne error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const { full_name, email, base_salary, joined_date, status, address, password } = req.body;
  const rawPhone = req.body.phone;
  const roles = normalizeRoles(req.body.roles);

  if (!full_name?.trim() || !email?.trim()) {
    return res.status(400).json({ message: 'full_name, email, and at least one role are required' });
  }
  const rolesError = validateRoles(roles);
  if (rolesError) {
    return res.status(400).json({ message: rolesError });
  }

  const needsLogin = roles.some((r) => LOGIN_ROLES.has(r.role));
  if (needsLogin) {
    if (!rawPhone?.trim()) return res.status(400).json({ message: 'Phone is required for this role (used as login mobile number)' });
    if (!password?.trim()) return res.status(400).json({ message: 'Password is required for this role' });
  }
  if (rawPhone?.trim() && !isValidPhone(rawPhone)) {
    return res.status(400).json({ message: 'Enter a valid phone number.' });
  }
  const phone = rawPhone?.trim() ? toE164(rawPhone) : null;

  const primary = roles[0];
  const userRoleArray = [...new Set(roles.map((r) => r.role))];

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let userId = null;
    if (needsLogin) {
      const hash = await bcrypt.hash(password.trim(), 10);
      const userResult = await client.query(
        `INSERT INTO users (mobile_number, password_hash, email, role, is_active)
         VALUES ($1, $2, $3, $4::user_role_enum[], true)
         RETURNING user_id`,
        [phone, hash, email.trim(), userRoleArray]
      );
      userId = userResult.rows[0].user_id;
    }

    const inserted = await client.query(
      `INSERT INTO internal_staff (full_name, role, email, phone, base_salary, joined_date, status, address, user_id, custom_role_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        full_name.trim(),
        primary.role,
        email.trim(),
        phone,
        base_salary != null && base_salary !== '' ? parseFloat(base_salary) : 0,
        joined_date || null,
        status || 'Active',
        address?.trim() || null,
        userId,
        primary.custom_role_id,
      ]
    );
    const staffId = inserted.rows[0].id;
    await replaceStaffRoles(client, staffId, roles);

    const result = await client.query(
      `SELECT ${SELECTABLE}, ${ROLES_SUBQUERY} FROM internal_staff s WHERE s.id = $1`,
      [staffId]
    );

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_CREATED',
      entityType: 'STAFF',
      entityId: String(staffId),
      details: { full_name: full_name.trim(), roles: roles.map((r) => r.role) },
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
  const allowed = ['full_name', 'email', 'phone', 'base_salary', 'joined_date', 'status', 'address', 'epf_applicable', 'etf_applicable'];
  const body = req.body;
  const rolesProvided = Object.prototype.hasOwnProperty.call(body, 'roles');
  const roles = rolesProvided ? normalizeRoles(body.roles) : null;

  if (body.phone && String(body.phone).trim() && !isValidPhone(body.phone)) {
    return res.status(400).json({ message: 'Enter a valid phone number.' });
  }
  if (rolesProvided) {
    const rolesError = validateRoles(roles);
    if (rolesError) return res.status(400).json({ message: rolesError });
  }

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      setClauses.push(`${key} = $${idx++}`);
      const val = body[key];
      values.push(
        val === '' ? null
          : key === 'base_salary' && val != null ? parseFloat(val)
          : key === 'phone' && val ? toE164(val)
          : val
      );
    }
  }

  if (rolesProvided) {
    const primary = roles[0];
    setClauses.push(`role = $${idx++}`);
    values.push(primary.role);
    setClauses.push(`custom_role_id = $${idx++}`);
    values.push(primary.custom_role_id);
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE internal_staff SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING user_id`,
      values
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff member not found' });
    }
    const { user_id: userId } = result.rows[0];

    if (rolesProvided) {
      await replaceStaffRoles(client, id, roles);
      if (userId) {
        const userRoleArray = [...new Set(roles.map((r) => r.role))];
        await client.query(
          `UPDATE users SET role = $1::user_role_enum[] WHERE user_id = $2`,
          [userRoleArray, userId]
        );
      }
    }

    const staffRow = await client.query(
      `SELECT ${SELECTABLE}, ${ROLES_SUBQUERY} FROM internal_staff s WHERE s.id = $1`,
      [id]
    );

    await client.query('COMMIT');

    if (rolesProvided && userId) {
      invalidatePermissionCache(userId);
    }

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_UPDATED',
      entityType: 'STAFF',
      entityId: String(id),
      details: {
        updated_fields: allowed.filter(k => Object.prototype.hasOwnProperty.call(body, k)),
        ...(rolesProvided ? { roles: roles.map((r) => r.role) } : {}),
      },
    }).catch(err => console.error('Activity log failed:', err));

    res.json({ staff: staffRow.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A staff member with this email already exists' });
    }
    console.error('internalStaff.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
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
