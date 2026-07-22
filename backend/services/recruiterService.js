/**
 * STAFF RECRUITER CREDITING SERVICE
 *
 * Recruiters are internal_staff (role 'RECRUITER'). When a caregiver
 * (staff_profiles row) is hired, the recruiter who brought them in is
 * credited ONCE, and their "staff recruited" count is incremented by 1.
 * This count is PERMANENT — it stays with the original (origin) recruiter
 * forever and never moves, even if the staff member's recruiter is later
 * reassigned.
 *
 * The "currently assigned recruiter" is a separate, mutable pointer
 * (is_current) — this is who is considered responsible for the hire until
 * someone with higher authority reassigns them. Switching only moves the
 * pointer; it does NOT touch staff_recruited_count for anyone.
 *
 * staff_recruiter_assignments holds the full audit trail:
 *   - is_origin  → the recruiter who originally brought the hire in (holds credit)
 *   - is_current → the recruiter currently associated with the staff member
 *   - action     → 'CREDITED' (initial) | 'SWITCHED'
 *
 * Mirrors services/clientSalespersonService.js exactly, at the staff-hire
 * level instead of the client-registration level.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RecruiterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RecruiterError';
    this.code = code; // e.g. 'INVALID_ID', 'RECRUITER_NOT_FOUND', 'STAFF_NOT_FOUND', 'NO_CURRENT', 'SAME_RECRUITER'
  }
}

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Credit a recruiter for a staff hire and mark them current + origin.
 * Idempotent: if the staff member already has an origin recruiter, nothing
 * changes and { credited: false, alreadyCredited: true } is returned.
 *
 * @returns {Promise<{credited: boolean, alreadyCredited?: boolean, assignment?: object}>}
 */
async function creditRecruiterForStaff(executor, { staff_profile_id, recruiter_id, assigned_by }) {
  if (!isUuid(staff_profile_id) || !isUuid(recruiter_id)) {
    throw new RecruiterError('INVALID_ID', 'Invalid staff or recruiter ID format');
  }

  const recruiterRes = await executor.query(
    `SELECT id, full_name, status FROM internal_staff WHERE id = $1`,
    [recruiter_id]
  );
  if (recruiterRes.rows.length === 0) {
    throw new RecruiterError('RECRUITER_NOT_FOUND', 'Recruiter not found');
  }

  // Already credited? Keep idempotent so retries / double submits don't double-count.
  const originRes = await executor.query(
    `SELECT id, recruiter_id FROM staff_recruiter_assignments
     WHERE staff_profile_id = $1 AND is_origin = true`,
    [staff_profile_id]
  );
  if (originRes.rows.length > 0) {
    return { credited: false, alreadyCredited: true, origin: originRes.rows[0] };
  }

  const staffRes = await executor.query(
    `SELECT staff_profile_id FROM staff_profiles WHERE staff_profile_id = $1`,
    [staff_profile_id]
  );
  if (staffRes.rows.length === 0) {
    throw new RecruiterError('STAFF_NOT_FOUND', 'Staff profile not found');
  }

  const insertRes = await executor.query(
    `INSERT INTO staff_recruiter_assignments
       (staff_profile_id, recruiter_id, is_current, is_origin, action, assigned_by)
     VALUES ($1, $2, true, true, 'CREDITED', $3)
     RETURNING id, staff_profile_id, recruiter_id, is_current, is_origin, action, assigned_at`,
    [staff_profile_id, recruiter_id, assigned_by || null]
  );

  await executor.query(
    `UPDATE internal_staff
     SET staff_recruited_count = staff_recruited_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [recruiter_id]
  );

  return {
    credited: true,
    assignment: insertRes.rows[0],
    recruiter_name: recruiterRes.rows[0].full_name,
  };
}

/**
 * Switch the currently associated recruiter for a staff member. Pointer-only
 * change: does NOT alter staff_recruited_count for anyone.
 *
 * @returns {Promise<{switched: boolean, from: string, to: string, assignment: object}>}
 */
async function switchStaffRecruiter(executor, { staff_profile_id, new_recruiter_id, assigned_by, switch_reason }) {
  if (!isUuid(staff_profile_id) || !isUuid(new_recruiter_id)) {
    throw new RecruiterError('INVALID_ID', 'Invalid staff or recruiter ID format');
  }

  const recruiterRes = await executor.query(
    `SELECT id, full_name FROM internal_staff WHERE id = $1`,
    [new_recruiter_id]
  );
  if (recruiterRes.rows.length === 0) {
    throw new RecruiterError('RECRUITER_NOT_FOUND', 'Recruiter not found');
  }

  const currentRes = await executor.query(
    `SELECT id, recruiter_id FROM staff_recruiter_assignments
     WHERE staff_profile_id = $1 AND is_current = true`,
    [staff_profile_id]
  );
  if (currentRes.rows.length === 0) {
    throw new RecruiterError('NO_CURRENT', 'This staff member has no credited recruiter yet. Credit one first.');
  }

  const current = currentRes.rows[0];
  if (current.recruiter_id === new_recruiter_id) {
    throw new RecruiterError('SAME_RECRUITER', 'That recruiter is already associated with this staff member');
  }

  // Demote the existing current pointer first (partial unique index allows only one).
  await executor.query(
    `UPDATE staff_recruiter_assignments SET is_current = false WHERE id = $1`,
    [current.id]
  );

  // New current pointer. Not an origin row, so no credit and no count.
  const insertRes = await executor.query(
    `INSERT INTO staff_recruiter_assignments
       (staff_profile_id, recruiter_id, is_current, is_origin, action, switch_reason, assigned_by)
     VALUES ($1, $2, true, false, 'SWITCHED', $3, $4)
     RETURNING id, staff_profile_id, recruiter_id, is_current, is_origin, action, switch_reason, assigned_at`,
    [staff_profile_id, new_recruiter_id, switch_reason || null, assigned_by || null]
  );

  return {
    switched: true,
    from: current.recruiter_id,
    to: new_recruiter_id,
    assignment: insertRes.rows[0],
    recruiter_name: recruiterRes.rows[0].full_name,
  };
}

/**
 * Get the current + origin recruiter and full assignment history for a staff member.
 */
async function getStaffRecruiter(executor, staff_profile_id) {
  if (!isUuid(staff_profile_id)) {
    throw new RecruiterError('INVALID_ID', 'Invalid staff ID format');
  }

  const historyRes = await executor.query(
    `SELECT sra.id, sra.recruiter_id, ist.full_name AS recruiter_name, ist.role AS recruiter_role,
            sra.is_current, sra.is_origin, sra.action, sra.switch_reason,
            sra.assigned_by, sra.assigned_at
     FROM staff_recruiter_assignments sra
     JOIN internal_staff ist ON sra.recruiter_id = ist.id
     WHERE sra.staff_profile_id = $1
     ORDER BY sra.assigned_at ASC`,
    [staff_profile_id]
  );

  const rows = historyRes.rows;
  return {
    current: rows.find((r) => r.is_current) || null,
    origin: rows.find((r) => r.is_origin) || null,
    history: rows,
  };
}

module.exports = {
  RecruiterError,
  creditRecruiterForStaff,
  switchStaffRecruiter,
  getStaffRecruiter,
};
