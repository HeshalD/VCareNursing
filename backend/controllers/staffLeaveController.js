// backend/controllers/staffLeaveController.js

const { pool } = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendStaffLeaveApproved, sendStaffLeaveRejected } = require('../utils/metaWhatsapp');
const { sendStaffLeaveApprovedSms, sendStaffLeaveRejectedSms } = require('../utils/sms');

async function getReviewerName(userId) {
  const result = await pool.query(
    'SELECT full_name FROM staff_profiles WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.full_name || 'Admin';
}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

// Inclusive day count between two ISO date strings
function dayCount(start, end) {
  const ms = new Date(end) - new Date(start);
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// Flips current_status to ON_LEAVE the moment an approved leave already covers today
// (a future-dated leave is caught later by the daily cron, once its start_date arrives).
// Only moves AVAILABLE -> ON_LEAVE — never overwrites ASSIGNED/UNAVAILABLE, which belong
// to other flows.
async function markOnLeaveIfActiveToday(staffProfileId, startDate, endDate) {
  try {
    await pool.query(
      `UPDATE staff_profiles
       SET current_status = 'ON_LEAVE'
       WHERE staff_profile_id = $1
         AND current_status = 'AVAILABLE'
         AND $2::date <= CURRENT_DATE AND $3::date >= CURRENT_DATE`,
      [staffProfileId, startDate, endDate]
    );
  } catch (err) {
    console.error('markOnLeaveIfActiveToday error:', err.message);
  }
}

// Restores the staff dashboard access the leave cron revoked when a leave expired
// (report-back or extension both resolve the expiry). Only an automatic LEAVE_EXPIRED
// lock is undone — a manual admin lock stays — and only if no other expired,
// unreturned leave is still keeping them locked out.
async function restorePortalAccessAfterLeave(req, adminName, leave, reason) {
  try {
    const restored = await pool.query(
      `UPDATE staff_profiles sp
       SET portal_access_disabled = false, portal_access_disabled_reason = NULL
       WHERE sp.staff_profile_id = $1
         AND sp.portal_access_disabled = true
         AND sp.portal_access_disabled_reason = 'LEAVE_EXPIRED'
         AND NOT EXISTS (
           SELECT 1 FROM staff_leave_requests lr
           WHERE lr.staff_profile_id = sp.staff_profile_id
             AND lr.status = 'APPROVED' AND lr.actual_return_date IS NULL
             AND lr.end_date < CURRENT_DATE AND lr.expiry_handled_at IS NOT NULL
             AND lr.leave_id <> $2
         )
       RETURNING sp.full_name`,
      [leave.staff_profile_id, leave.leave_id]
    );
    if (restored.rows.length) {
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: adminName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'STAFF_PORTAL_ACCESS_ENABLED',
        entityType: 'STAFF',
        entityId: String(leave.staff_profile_id),
        details: { staff_name: restored.rows[0].full_name, reason, leave_id: leave.leave_id },
      });
    }
  } catch (err) {
    console.error('restorePortalAccessAfterLeave error:', err.message);
  }
}

// Flips current_status back to AVAILABLE on a report-back. Only moves ON_LEAVE ->
// AVAILABLE — if the staff member somehow isn't ON_LEAVE (e.g. cron already reset a
// long-overdue leave), there's nothing to undo.
async function markAvailableAfterLeave(staffProfileId) {
  try {
    await pool.query(
      `UPDATE staff_profiles SET current_status = 'AVAILABLE'
       WHERE staff_profile_id = $1 AND current_status = 'ON_LEAVE'`,
      [staffProfileId]
    );
  } catch (err) {
    console.error('markAvailableAfterLeave error:', err.message);
  }
}

// Blocks overlapping PENDING/APPROVED leaves for the same staff member — a leave the
// staff already reported back from early (actual_return_date set) no longer occupies
// its original end_date, so it's excluded past that return date.
const OVERLAP_CHECK_SQL = `
  SELECT leave_id FROM staff_leave_requests
  WHERE staff_profile_id = $1
    AND status IN ('PENDING', 'APPROVED')
    AND start_date <= $3
    AND COALESCE(actual_return_date - 1, end_date) >= $2`;

// GET /api/staff-leave/my-leaves — staff views their own leave history
const getMyLeaves = async (req, res) => {
  try {
    const staffResult = await pool.query(
      `SELECT staff_profile_id FROM staff_profiles WHERE user_id = $1`,
      [req.user.user_id]
    );
    if (!staffResult.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }
    const { staff_profile_id } = staffResult.rows[0];

    const result = await pool.query(
      `SELECT leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date,
              reason, status, requested_at, reviewed_at, reviewed_by_name, rejected_reason,
              source, actual_return_date::text AS actual_return_date, returned_by_name, returned_at
       FROM staff_leave_requests
       WHERE staff_profile_id = $1
       ORDER BY requested_at DESC`,
      [staff_profile_id]
    );

    return res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getMyLeaves error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-leave/request — staff requests leave
const requestLeave = async (req, res) => {
  const { start_date, end_date, reason } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ status: 'error', message: 'Start and end dates are required' });
  }
  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ status: 'error', message: 'End date cannot be before start date' });
  }

  try {
    const result = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, u.mobile_number
       FROM staff_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.user_id = $1`,
      [req.user.user_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }
    const { staff_profile_id } = result.rows[0];

    const overlap = await pool.query(OVERLAP_CHECK_SQL, [staff_profile_id, start_date, end_date]);
    if (overlap.rows.length) {
      return res.status(400).json({
        status: 'error',
        message: 'You already have a pending or approved leave overlapping these dates.'
      });
    }

    const inserted = await pool.query(
      `INSERT INTO staff_leave_requests (staff_profile_id, start_date, end_date, reason, status, requested_at, source)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW(), 'STAFF')
       RETURNING leave_id, start_date::text AS start_date, end_date::text AS end_date, reason, status, requested_at`,
      [staff_profile_id, start_date, end_date, reason || null]
    );

    return res.status(201).json({ status: 'success', data: inserted.rows[0] });
  } catch (err) {
    console.error('requestLeave error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/staff-options — active staff list for the admin "log leave" picker
const getStaffOptions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, sp.designation, sp.staff_code, sp.gender
       FROM staff_profiles sp
       WHERE sp.is_active = true
       ORDER BY sp.full_name ASC`
    );
    return res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getStaffOptions error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-leave/admin-create — admin logs leave directly for any staff member.
// Auto-approved: there's no separate approver for a leave the admin is themselves recording.
const adminCreateLeave = async (req, res) => {
  const { staff_profile_id, start_date, end_date, reason } = req.body;

  if (!staff_profile_id || !start_date || !end_date) {
    return res.status(400).json({ status: 'error', message: 'Staff member and start/end dates are required' });
  }
  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ status: 'error', message: 'End date cannot be before start date' });
  }

  try {
    const staffRes = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, u.mobile_number
       FROM staff_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.staff_profile_id = $1`,
      [staff_profile_id]
    );
    if (!staffRes.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }
    const { full_name, mobile_number } = staffRes.rows[0];

    const overlap = await pool.query(OVERLAP_CHECK_SQL, [staff_profile_id, start_date, end_date]);
    if (overlap.rows.length) {
      return res.status(400).json({
        status: 'error',
        message: 'This staff member already has a pending or approved leave overlapping these dates.'
      });
    }

    const adminName = await getReviewerName(req.user.user_id);
    const inserted = await pool.query(
      `INSERT INTO staff_leave_requests
         (staff_profile_id, start_date, end_date, reason, status, requested_at,
          source, created_by_user_id, created_by_name,
          reviewed_at, reviewed_by_user_id, reviewed_by_name)
       VALUES ($1, $2, $3, $4, 'APPROVED', NOW(),
               'ADMIN', $5, $6,
               NOW(), $5, $6)
       RETURNING leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date, reason, status, requested_at`,
      [staff_profile_id, start_date, end_date, reason || null, req.user.user_id, adminName]
    );
    const leave = inserted.rows[0];
    const days = dayCount(leave.start_date, leave.end_date);

    await markOnLeaveIfActiveToday(staff_profile_id, leave.start_date, leave.end_date);

    try {
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: adminName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'LEAVE_LOGGED_BY_ADMIN',
        entityType: 'STAFF_LEAVE',
        entityId: String(leave.leave_id),
        details: { staff_profile_id, start_date: leave.start_date, end_date: leave.end_date, days, reason: leave.reason || null }
      });
    } catch (logErr) {
      console.error('Activity log failed (adminCreateLeave):', logErr.message);
    }

    if (mobile_number) {
      const startTxt = fmtDate(leave.start_date);
      const endTxt = fmtDate(leave.end_date);
      sendStaffLeaveApproved(mobile_number, full_name, startTxt, endTxt, String(days))
        .catch((err) => console.error('[WA] sendStaffLeaveApproved failed:', err.message));
      sendStaffLeaveApprovedSms(mobile_number, full_name, startTxt, endTxt, days)
        .catch((err) => console.error('[SMS] sendStaffLeaveApprovedSms failed:', err.message));
    }

    return res.status(201).json({ status: 'success', data: leave });
  } catch (err) {
    console.error('adminCreateLeave error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/all?status= — admin lists all leave requests
const getAllLeaves = async (req, res) => {
  const { status } = req.query;
  try {
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE lr.status = $1`;
    }
    const result = await pool.query(
      `SELECT lr.leave_id, lr.staff_profile_id, lr.start_date::text AS start_date, lr.end_date::text AS end_date,
              lr.reason, lr.status, lr.requested_at, lr.reviewed_at, lr.reviewed_by_name, lr.rejected_reason,
              lr.source, lr.actual_return_date::text AS actual_return_date, lr.returned_by_name, lr.returned_at,
              sp.full_name, sp.staff_code, sp.designation, sp.gender
       FROM staff_leave_requests lr
       JOIN staff_profiles sp ON sp.staff_profile_id = lr.staff_profile_id
       ${where}
       ORDER BY lr.requested_at DESC`,
      params
    );
    return res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getAllLeaves error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/pending — admin lists pending leave requests
const getPendingLeaves = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lr.leave_id, lr.staff_profile_id, lr.start_date::text AS start_date, lr.end_date::text AS end_date,
              lr.reason, lr.status, lr.requested_at,
              sp.full_name, sp.staff_code, sp.designation, sp.gender
       FROM staff_leave_requests lr
       JOIN staff_profiles sp ON sp.staff_profile_id = lr.staff_profile_id
       WHERE lr.status = 'PENDING'
       ORDER BY lr.start_date ASC`
    );
    return res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getPendingLeaves error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/:leaveId/conflicts — assignments overlapping the requested range
const getLeaveConflicts = async (req, res) => {
  const { leaveId } = req.params;
  try {
    const leaveRes = await pool.query(
      `SELECT staff_profile_id, start_date::text AS start_date, end_date::text AS end_date
       FROM staff_leave_requests WHERE leave_id = $1`,
      [leaveId]
    );
    if (!leaveRes.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Leave request not found' });
    }
    const { staff_profile_id, start_date, end_date } = leaveRes.rows[0];

    // Active or scheduled assignments overlapping [start_date, end_date].
    // An assignment with no service_end_date is treated as open-ended.
    const conflictsRes = await pool.query(
      `SELECT bsa.assignment_id, bsa.booking_id, bsa.status,
              bsa.service_start_date::text AS service_start_date,
              bsa.service_end_date::text AS service_end_date,
              b.service_type,
              c.full_name AS client_name,
              p.full_name AS patient_name
       FROM booking_staff_assignments bsa
       JOIN bookings b ON b.booking_id = bsa.booking_id
       LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
       LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
       WHERE bsa.staff_profile_id = $1
         AND bsa.status IN ('ACTIVE', 'SCHEDULED')
         AND bsa.service_start_date <= $3
         AND (bsa.service_end_date IS NULL OR bsa.service_end_date >= $2)
       ORDER BY bsa.service_start_date ASC`,
      [staff_profile_id, start_date, end_date]
    );

    return res.json({ status: 'success', data: { start_date, end_date, conflicts: conflictsRes.rows } });
  } catch (err) {
    console.error('getLeaveConflicts error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/:leaveId/candidates — all staff as possible replacements,
// each flagged unavailable if they are assigned/scheduled to a booking (or on their
// own approved leave) overlapping the requested leave range.
const getReplacementCandidates = async (req, res) => {
  const { leaveId } = req.params;
  try {
    const leaveRes = await pool.query(
      `SELECT staff_profile_id, start_date::text AS start_date, end_date::text AS end_date
       FROM staff_leave_requests WHERE leave_id = $1`,
      [leaveId]
    );
    if (!leaveRes.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Leave request not found' });
    }
    const { staff_profile_id, start_date, end_date } = leaveRes.rows[0];

    const candidatesRes = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, sp.designation, sp.staff_code, sp.gender,
              sp.profile_picture_url, sp.current_status, u.mobile_number,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM booking_staff_assignments bsa
                  WHERE bsa.staff_profile_id = sp.staff_profile_id
                    AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                    AND bsa.service_start_date <= $3
                    AND (bsa.service_end_date IS NULL OR bsa.service_end_date >= $2)
                ) THEN 'Assigned to a booking in this date range'
                WHEN EXISTS (
                  SELECT 1 FROM staff_leave_requests lr2
                  WHERE lr2.staff_profile_id = sp.staff_profile_id
                    AND lr2.status = 'APPROVED'
                    AND lr2.start_date <= $3
                    AND COALESCE(lr2.actual_return_date - 1, lr2.end_date) >= $2
                ) THEN 'On approved leave in this date range'
                ELSE NULL
              END AS unavailable_reason
       FROM staff_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.is_active = true
         AND sp.staff_profile_id <> $1
       ORDER BY sp.full_name ASC`,
      [staff_profile_id, start_date, end_date]
    );

    const data = candidatesRes.rows.map((r) => ({
      ...r,
      unavailable: Boolean(r.unavailable_reason),
    }));

    return res.json({ status: 'success', data: { start_date, end_date, candidates: data } });
  } catch (err) {
    console.error('getReplacementCandidates error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-leave/approve/:leaveId — admin approves a pending leave
const approveLeave = async (req, res) => {
  const { leaveId } = req.params;
  try {
    const reviewerName = await getReviewerName(req.user.user_id);

    const result = await pool.query(
      `UPDATE staff_leave_requests
       SET status = 'APPROVED', reviewed_at = NOW(),
           reviewed_by_user_id = $1, reviewed_by_name = $2
       WHERE leave_id = $3 AND status = 'PENDING'
       RETURNING leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date, reason`,
      [req.user.user_id, reviewerName, leaveId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Pending leave request not found' });
    }
    const leave = result.rows[0];
    const days = dayCount(leave.start_date, leave.end_date);

    await markOnLeaveIfActiveToday(leave.staff_profile_id, leave.start_date, leave.end_date);

    // Activity log (non-fatal)
    try {
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: reviewerName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'LEAVE_APPROVED',
        entityType: 'STAFF_LEAVE',
        entityId: String(leave.leave_id),
        details: {
          staff_profile_id: leave.staff_profile_id,
          start_date: leave.start_date,
          end_date: leave.end_date,
          days,
          reason: leave.reason || null,
        }
      });
    } catch (logErr) {
      console.error('Activity log failed (approveLeave):', logErr.message);
    }

    // Notify staff via WhatsApp + SMS (non-blocking)
    const contactRes = await pool.query(
      `SELECT sp.full_name, u.mobile_number
       FROM staff_profiles sp JOIN users u ON u.user_id = sp.user_id
       WHERE sp.staff_profile_id = $1`,
      [leave.staff_profile_id]
    );
    if (contactRes.rows.length && contactRes.rows[0].mobile_number) {
      const { full_name, mobile_number } = contactRes.rows[0];
      const startTxt = fmtDate(leave.start_date);
      const endTxt = fmtDate(leave.end_date);
      sendStaffLeaveApproved(mobile_number, full_name, startTxt, endTxt, String(days))
        .catch((err) => console.error('[WA] sendStaffLeaveApproved failed:', err.message));
      sendStaffLeaveApprovedSms(mobile_number, full_name, startTxt, endTxt, days)
        .catch((err) => console.error('[SMS] sendStaffLeaveApprovedSms failed:', err.message));
    }

    return res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('approveLeave error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-leave/reject/:leaveId — admin rejects a pending leave
const rejectLeave = async (req, res) => {
  const { leaveId } = req.params;
  const { reason } = req.body;
  try {
    const reviewerName = await getReviewerName(req.user.user_id);

    const result = await pool.query(
      `UPDATE staff_leave_requests
       SET status = 'REJECTED', reviewed_at = NOW(),
           reviewed_by_user_id = $1, reviewed_by_name = $2, rejected_reason = $3
       WHERE leave_id = $4 AND status = 'PENDING'
       RETURNING leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date, reason`,
      [req.user.user_id, reviewerName, reason || null, leaveId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Pending leave request not found' });
    }
    const leave = result.rows[0];
    const days = dayCount(leave.start_date, leave.end_date);

    try {
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: reviewerName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'LEAVE_REJECTED',
        entityType: 'STAFF_LEAVE',
        entityId: String(leave.leave_id),
        details: {
          staff_profile_id: leave.staff_profile_id,
          start_date: leave.start_date,
          end_date: leave.end_date,
          days,
          reason: reason || null,
        }
      });
    } catch (logErr) {
      console.error('Activity log failed (rejectLeave):', logErr.message);
    }

    const contactRes = await pool.query(
      `SELECT sp.full_name, u.mobile_number
       FROM staff_profiles sp JOIN users u ON u.user_id = sp.user_id
       WHERE sp.staff_profile_id = $1`,
      [leave.staff_profile_id]
    );
    if (contactRes.rows.length && contactRes.rows[0].mobile_number) {
      const { full_name, mobile_number } = contactRes.rows[0];
      const startTxt = fmtDate(leave.start_date);
      const endTxt = fmtDate(leave.end_date);
      sendStaffLeaveRejected(mobile_number, full_name, startTxt, endTxt, reason || 'No reason provided')
        .catch((err) => console.error('[WA] sendStaffLeaveRejected failed:', err.message));
      sendStaffLeaveRejectedSms(mobile_number, full_name, startTxt, endTxt, reason)
        .catch((err) => console.error('[SMS] sendStaffLeaveRejectedSms failed:', err.message));
    }

    return res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('rejectLeave error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/on-leave — admin lists staff currently on leave (today falls
// within an APPROVED leave that hasn't been reported back from early)
const getOnLeaveStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lr.leave_id, lr.staff_profile_id, lr.start_date::text AS start_date, lr.end_date::text AS end_date,
              lr.reason, lr.source, lr.requested_at,
              sp.full_name, sp.staff_code, sp.designation, sp.gender, sp.profile_picture_url,
              (lr.end_date - CURRENT_DATE) AS days_remaining
       FROM staff_leave_requests lr
       JOIN staff_profiles sp ON sp.staff_profile_id = lr.staff_profile_id
       WHERE lr.status = 'APPROVED'
         AND lr.actual_return_date IS NULL
         AND lr.start_date <= CURRENT_DATE
         AND lr.end_date >= CURRENT_DATE
       ORDER BY lr.end_date ASC`
    );
    return res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getOnLeaveStaff error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-leave/:leaveId/report-back — admin reports a staff member back from
// leave, either on schedule or early. Does not delete/alter the original start/end_date
// (kept for the record); actual_return_date is what everything else checks against.
const reportBack = async (req, res) => {
  const { leaveId } = req.params;
  const { return_date } = req.body;
  try {
    const adminName = await getReviewerName(req.user.user_id);
    const returnDate = return_date || new Date().toISOString().slice(0, 10);

    const result = await pool.query(
      `UPDATE staff_leave_requests
       SET actual_return_date = $1, returned_by_user_id = $2, returned_by_name = $3, returned_at = NOW()
       WHERE leave_id = $4 AND status = 'APPROVED' AND actual_return_date IS NULL
       RETURNING leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date,
                 actual_return_date::text AS actual_return_date`,
      [returnDate, req.user.user_id, adminName, leaveId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Active approved leave not found' });
    }
    const leave = result.rows[0];

    await markAvailableAfterLeave(leave.staff_profile_id);

    await restorePortalAccessAfterLeave(req, adminName, leave, 'REPORTED_BACK_FROM_LEAVE');

    try {
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: adminName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'LEAVE_STAFF_REPORTED_BACK',
        entityType: 'STAFF_LEAVE',
        entityId: String(leave.leave_id),
        details: {
          staff_profile_id: leave.staff_profile_id,
          scheduled_end_date: leave.end_date,
          actual_return_date: leave.actual_return_date,
        }
      });
    } catch (logErr) {
      console.error('Activity log failed (reportBack):', logErr.message);
    }

    return res.json({ status: 'success', data: leave });
  } catch (err) {
    console.error('reportBack error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-leave/:leaveId/extend — admin extends an approved, not-yet-returned leave
// (typically one that just expired) to a new end date. The leave is live again, so it can
// expire again later (expiry_handled_at reset) and the staff member's dashboard access
// is restored if the expiry cron had revoked it.
const extendLeave = async (req, res) => {
  const { leaveId } = req.params;
  const { new_end_date } = req.body;

  if (!new_end_date) {
    return res.status(400).json({ status: 'error', message: 'New end date is required' });
  }

  try {
    const leaveRes = await pool.query(
      `SELECT leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date,
              (CURRENT_DATE)::text AS today
       FROM staff_leave_requests
       WHERE leave_id = $1 AND status = 'APPROVED' AND actual_return_date IS NULL`,
      [leaveId]
    );
    if (!leaveRes.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Active approved leave not found' });
    }
    const { staff_profile_id, start_date, end_date: oldEnd, today } = leaveRes.rows[0];

    if (new_end_date <= oldEnd) {
      return res.status(400).json({ status: 'error', message: 'New end date must be after the current end date' });
    }
    if (new_end_date < today) {
      return res.status(400).json({ status: 'error', message: 'New end date cannot be in the past' });
    }

    const overlap = await pool.query(
      `${OVERLAP_CHECK_SQL} AND leave_id <> $4`,
      [staff_profile_id, oldEnd, new_end_date, leaveId]
    );
    if (overlap.rows.length) {
      return res.status(400).json({
        status: 'error',
        message: 'This staff member has another pending or approved leave overlapping the extended dates.'
      });
    }

    const adminName = await getReviewerName(req.user.user_id);
    const result = await pool.query(
      `UPDATE staff_leave_requests
       SET end_date = $1, expiry_handled_at = NULL
       WHERE leave_id = $2
       RETURNING leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date`,
      [new_end_date, leaveId]
    );
    const leave = result.rows[0];

    await markOnLeaveIfActiveToday(staff_profile_id, leave.start_date, leave.end_date);
    await restorePortalAccessAfterLeave(req, adminName, leave, 'LEAVE_EXTENDED');

    try {
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: adminName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'LEAVE_EXTENDED',
        entityType: 'STAFF_LEAVE',
        entityId: String(leave.leave_id),
        details: { staff_profile_id, start_date, previous_end_date: oldEnd, new_end_date: leave.end_date },
      });
    } catch (logErr) {
      console.error('Activity log failed (extendLeave):', logErr.message);
    }

    return res.json({ status: 'success', data: leave });
  } catch (err) {
    console.error('extendLeave error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-leave/summary/:staffProfileId — total + monthly approved leave days,
// plus approved leave ranges (for calendar marking)
const getStaffLeaveSummary = async (req, res) => {
  const { staffProfileId } = req.params;
  try {
    const actorRole = extractActorRole(req.user.role);
    if (!['SUPER_ADMIN', 'COORDINATOR'].includes(actorRole)) {
      const ownProfile = await pool.query(
        'SELECT staff_profile_id FROM staff_profiles WHERE user_id = $1',
        [req.user.user_id]
      );
      if (!ownProfile.rows.length || String(ownProfile.rows[0].staff_profile_id) !== String(staffProfileId)) {
        return res.status(403).json({ status: 'error', message: 'Not authorized to view this leave summary' });
      }
    }

    const approvedRes = await pool.query(
      `SELECT leave_id, start_date::text AS start_date, end_date::text AS end_date, reason
       FROM staff_leave_requests
       WHERE staff_profile_id = $1 AND status = 'APPROVED'
       ORDER BY start_date DESC`,
      [staffProfileId]
    );

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;

    let totalDays = 0;
    let monthDays = 0;
    for (const r of approvedRes.rows) {
      totalDays += dayCount(r.start_date, r.end_date);
      // Count only the portion of this leave that overlaps the current month
      // (ISO date strings compare lexicographically)
      const overlapStart = r.start_date > monthStart ? r.start_date : monthStart;
      const overlapEnd = r.end_date < monthEnd ? r.end_date : monthEnd;
      if (overlapStart <= overlapEnd) {
        monthDays += dayCount(overlapStart, overlapEnd);
      }
    }

    return res.json({
      status: 'success',
      data: {
        total_leave_days: totalDays,
        month_leave_days: monthDays,
        approved_leaves: approvedRes.rows,
      },
    });
  } catch (err) {
    console.error('getStaffLeaveSummary error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

module.exports = {
  getMyLeaves,
  requestLeave,
  getAllLeaves,
  getPendingLeaves,
  getLeaveConflicts,
  getReplacementCandidates,
  approveLeave,
  rejectLeave,
  getStaffLeaveSummary,
  getStaffOptions,
  adminCreateLeave,
  getOnLeaveStaff,
  reportBack,
  extendLeave,
};
