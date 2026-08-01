const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const {
  RecruiterError,
  creditRecruiterForStaff,
  switchStaffRecruiter,
  getStaffRecruiter,
} = require('../services/recruiterService');

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

// Map service-layer error codes to HTTP statuses.
const ERROR_STATUS = {
  INVALID_ID: 400,
  RECRUITER_NOT_FOUND: 404,
  STAFF_NOT_FOUND: 404,
  NO_CURRENT: 400,
  SAME_RECRUITER: 400,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/recruiters
 * List recruiter-eligible internal staff with their permanent recruiting aggregate.
 * Recruiters are internal_staff whose role contains "recruit" (case-insensitive).
 * Pass ?all=true to return every internal_staff member instead.
 */
exports.listRecruiters = async (req, res) => {
  try {
    const includeAll = String(req.query.all || '').toLowerCase() === 'true';
    const where = includeAll ? '' : `WHERE EXISTS (SELECT 1 FROM internal_staff_roles isr WHERE isr.staff_id = internal_staff.id AND isr.role ILIKE '%recruit%')`;
    const result = await db.query(
      `SELECT id, full_name, role, email, phone, status, staff_recruited_count
       FROM internal_staff
       ${where}
       ORDER BY staff_recruited_count DESC, full_name ASC`
    );
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows.map((r) => ({
        ...r,
        staff_recruited_count: parseInt(r.staff_recruited_count || 0, 10),
      })),
    });
  } catch (err) {
    console.error('listRecruiters error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to list recruiters' });
  }
};

/**
 * GET /api/recruiters/:recruiter_id/staff
 * Audit view: every staff-recruiter assignment row for one recruiter,
 * plus their current aggregate total.
 */
exports.getRecruiterStaff = async (req, res) => {
  const { recruiter_id } = req.params;
  if (!UUID_RE.test(recruiter_id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid recruiter ID format' });
  }
  try {
    const recruiterRes = await db.query(
      `SELECT id, full_name, role, email, phone, status, joined_date, staff_recruited_count
       FROM internal_staff WHERE id = $1`,
      [recruiter_id]
    );
    if (recruiterRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Recruiter not found' });
    }

    const rowsRes = await db.query(
      `SELECT sra.id, sra.staff_profile_id, sp.full_name AS staff_name, sp.designation,
              sp.onboarding_status, sra.is_current, sra.is_origin, sra.action,
              sra.switch_reason, sra.assigned_at
       FROM staff_recruiter_assignments sra
       JOIN staff_profiles sp ON sra.staff_profile_id = sp.staff_profile_id
       WHERE sra.recruiter_id = $1
       ORDER BY sra.assigned_at DESC`,
      [recruiter_id]
    );

    const recruiter = recruiterRes.rows[0];
    res.json({
      status: 'success',
      data: {
        recruiter: {
          id: recruiter.id,
          full_name: recruiter.full_name,
          role: recruiter.role,
          email: recruiter.email,
          phone: recruiter.phone,
          status: recruiter.status,
          joined_date: recruiter.joined_date,
          staff_recruited_count: parseInt(recruiter.staff_recruited_count || 0, 10),
        },
        assignments: rowsRes.rows,
      },
    });
  } catch (err) {
    console.error('getRecruiterStaff error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch recruiter staff' });
  }
};

/**
 * GET /api/recruiters/staff/:staff_profile_id
 * Current + origin recruiter and full history for one staff member.
 */
exports.getStaffRecruiterHandler = async (req, res) => {
  const { staff_profile_id } = req.params;
  try {
    const data = await getStaffRecruiter(db, staff_profile_id);
    res.json({
      status: 'success',
      data,
    });
  } catch (err) {
    if (err instanceof RecruiterError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('getStaffRecruiterHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch staff recruiter' });
  }
};

/**
 * POST /api/recruiters/staff/:staff_profile_id/credit
 * Credit a recruiter for a staff hire (initial assignment).
 * @body { recruiter_id }
 */
exports.creditHandler = async (req, res) => {
  const { staff_profile_id } = req.params;
  const { recruiter_id } = req.body;
  const assigned_by = req.user?.user_id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await creditRecruiterForStaff(client, { staff_profile_id, recruiter_id, assigned_by });
    await client.query('COMMIT');

    if (!result.credited && result.alreadyCredited) {
      return res.status(409).json({
        status: 'error',
        message: 'This staff member already has a credited (origin) recruiter. Use switch to change the current one.',
      });
    }

    logActivity({
      actorUserId: assigned_by,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'RECRUITER_CREDITED',
      entityType: 'staff_profile',
      entityId: String(staff_profile_id),
      details: { staff_profile_id, recruiter_id },
    }).catch((e) => console.error('[Recruiter] activity log error:', e.message));

    res.status(201).json({
      status: 'success',
      message: `${result.recruiter_name} credited with this hire`,
      data: result.assignment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof RecruiterError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('creditHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to credit recruiter' });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/recruiters/staff/:staff_profile_id/switch
 * Switch the recruiter currently associated with a staff member (pointer only).
 * @body { recruiter_id, switch_reason (optional) }
 */
exports.switchHandler = async (req, res) => {
  const { staff_profile_id } = req.params;
  const { recruiter_id, switch_reason } = req.body;
  const assigned_by = req.user?.user_id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await switchStaffRecruiter(client, {
      staff_profile_id,
      new_recruiter_id: recruiter_id,
      assigned_by,
      switch_reason,
    });
    await client.query('COMMIT');

    logActivity({
      actorUserId: assigned_by,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'RECRUITER_SWITCHED',
      entityType: 'staff_profile',
      entityId: String(staff_profile_id),
      details: { staff_profile_id, from: result.from, to: result.to, switch_reason: switch_reason || null },
    }).catch((e) => console.error('[Recruiter] activity log error:', e.message));

    res.json({
      status: 'success',
      message: `Staff member is now credited to ${result.recruiter_name}`,
      data: result.assignment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof RecruiterError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('switchHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to switch recruiter' });
  } finally {
    client.release();
  }
};
