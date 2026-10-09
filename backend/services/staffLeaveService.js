// services/staffLeaveService.js
// Logging an admin-approved leave from inside another flow's transaction (a staff swap
// that sends the outgoing staff member on leave). Mirrors staffLeaveController's
// adminCreateLeave — same table, same overlap rule, same auto-approval and the same
// WhatsApp/SMS to the staff member — but runs on the caller's `client` so the leave
// commits or rolls back together with the rest of the swap.

const { sendStaffLeaveApproved } = require('../utils/metaWhatsapp');
const { sendStaffLeaveApprovedSms } = require('../utils/sms');

const dayCount = (start, end) => Math.floor((new Date(end) - new Date(start)) / 86400000) + 1;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Same rule as staffLeaveController.OVERLAP_CHECK_SQL: a leave already reported back from
// early no longer occupies its original end date.
const OVERLAP_CHECK_SQL = `
  SELECT leave_id FROM staff_leave_requests
  WHERE staff_profile_id = $1
    AND status IN ('PENDING', 'APPROVED')
    AND start_date <= $3
    AND COALESCE(actual_return_date - 1, end_date) >= $2`;

// Flips AVAILABLE -> ON_LEAVE when the leave already covers today. Never overwrites
// ASSIGNED/UNAVAILABLE — the daily leave cron catches a future start date.
const markOnLeaveIfActiveToday = (client, staffProfileId, startDate, endDate) => client.query(
  `UPDATE staff_profiles
   SET current_status = 'ON_LEAVE'
   WHERE staff_profile_id = $1
     AND current_status = 'AVAILABLE'
     AND $2::date <= CURRENT_DATE AND $3::date >= CURRENT_DATE`,
  [staffProfileId, startDate, endDate]
);

/**
 * @returns {{leave: object, contact: {full_name: string, mobile_number: ?string}, days: number}}
 */
const createApprovedLeave = async (client, { staff_profile_id, start_date, end_date, reason, actorUserId, actorName }) => {
  if (!start_date || !end_date) throw badRequest('The leave needs a start and an end date.');
  if (new Date(end_date) < new Date(start_date)) throw badRequest('Leave end date cannot be before its start date.');

  const staffRes = await client.query(
    `SELECT sp.full_name, u.mobile_number
     FROM staff_profiles sp JOIN users u ON u.user_id = sp.user_id
     WHERE sp.staff_profile_id = $1`,
    [staff_profile_id]
  );
  if (!staffRes.rows.length) throw badRequest('Staff member not found.');

  const overlap = await client.query(OVERLAP_CHECK_SQL, [staff_profile_id, start_date, end_date]);
  if (overlap.rows.length) throw badRequest('This staff member already has a pending or approved leave overlapping these dates.');

  const inserted = await client.query(
    `INSERT INTO staff_leave_requests
       (staff_profile_id, start_date, end_date, reason, status, requested_at,
        source, created_by_user_id, created_by_name,
        reviewed_at, reviewed_by_user_id, reviewed_by_name)
     VALUES ($1, $2, $3, $4, 'APPROVED', NOW(),
             'ADMIN', $5, $6,
             NOW(), $5, $6)
     RETURNING leave_id, staff_profile_id, start_date::text AS start_date, end_date::text AS end_date, reason, status`,
    [staff_profile_id, start_date, end_date, reason || null, actorUserId, actorName]
  );
  const leave = inserted.rows[0];
  return { leave, contact: staffRes.rows[0], days: dayCount(leave.start_date, leave.end_date) };
};

// Fire-and-forget; call only after the transaction has committed.
const notifyLeaveApproved = ({ leave, contact, days }) => {
  if (!contact?.mobile_number) return;
  const startTxt = fmtDate(leave.start_date);
  const endTxt = fmtDate(leave.end_date);
  sendStaffLeaveApproved(contact.mobile_number, contact.full_name, startTxt, endTxt, String(days))
    .catch((err) => console.error('[WA] sendStaffLeaveApproved failed:', err.message));
  sendStaffLeaveApprovedSms(contact.mobile_number, contact.full_name, startTxt, endTxt, days)
    .catch((err) => console.error('[SMS] sendStaffLeaveApprovedSms failed:', err.message));
};

// Other bookings the staff member is committed to during the leave. A normal leave only
// warns about these (see staffLeaveController.getLeaveConflicts) — it never moves anyone.
const findLeaveConflicts = async (client, { staff_profile_id, start_date, end_date, exclude_booking_id }) => {
  const res = await client.query(
    `SELECT bsa.booking_id, b.booking_code, bsa.service_start_date::text AS service_start_date,
            bsa.service_end_date::text AS service_end_date
     FROM booking_staff_assignments bsa
     JOIN bookings b ON b.booking_id = bsa.booking_id
     WHERE bsa.staff_profile_id = $1
       AND bsa.booking_id <> $4
       AND bsa.status IN ('ACTIVE', 'SCHEDULED')
       AND bsa.service_start_date <= $3
       AND (bsa.service_end_date IS NULL OR bsa.service_end_date >= $2)`,
    [staff_profile_id, start_date, end_date, exclude_booking_id]
  );
  return res.rows;
};

module.exports = { createApprovedLeave, notifyLeaveApproved, markOnLeaveIfActiveToday, findLeaveConflicts };
