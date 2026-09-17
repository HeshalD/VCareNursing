// cron/staffLeaveStatus.js
// Keeps staff_profiles.current_status in sync with staff_leave_requests, catching the
// cases that only depend on the calendar date turning over (not on an admin action):
//   1. A leave approved in advance whose start_date has now arrived — the staff member
//      is AVAILABLE today but their leave has started, so they flip to ON_LEAVE.
//   2. A leave that has run past its end_date without anyone reporting the staff member
//      back — this is what "leaves expire" means: the staff member automatically
//      reverts to AVAILABLE the day after, same as an on-time report-back would do.
// The report-back and admin-create endpoints already flip current_status immediately
// for the same-day case; this cron is the safety net for the future-dated / forgotten
// cases that no request touches on the day it matters.
//
// Only ever moves AVAILABLE <-> ON_LEAVE — a staff member who is ASSIGNED or
// UNAVAILABLE for some other reason is left alone (current_status is a live snapshot
// elsewhere in the app and this cron shouldn't clobber a state it doesn't own).
const cron = require('node-cron');
const db = require('../config/db');

const runStaffLeaveStatus = async () => {
  console.log('─── Staff Leave Status Cron Started ───');
  const client = await db.pool.connect();

  try {
    const startedRes = await client.query(
      `UPDATE staff_profiles sp
       SET current_status = 'ON_LEAVE'
       FROM staff_leave_requests lr
       WHERE lr.staff_profile_id = sp.staff_profile_id
         AND lr.status = 'APPROVED'
         AND lr.actual_return_date IS NULL
         AND lr.start_date <= CURRENT_DATE AND lr.end_date >= CURRENT_DATE
         AND sp.current_status = 'AVAILABLE'
       RETURNING sp.staff_profile_id, sp.full_name`
    );
    if (startedRes.rows.length) {
      console.log(`Marked ON_LEAVE: ${startedRes.rows.map(r => r.full_name).join(', ')}`);
    }

    const endedRes = await client.query(
      `UPDATE staff_profiles sp
       SET current_status = 'AVAILABLE'
       WHERE sp.current_status = 'ON_LEAVE'
         AND NOT EXISTS (
           SELECT 1 FROM staff_leave_requests lr
           WHERE lr.staff_profile_id = sp.staff_profile_id
             AND lr.status = 'APPROVED'
             AND lr.actual_return_date IS NULL
             AND lr.start_date <= CURRENT_DATE AND lr.end_date >= CURRENT_DATE
         )
       RETURNING sp.staff_profile_id, sp.full_name`
    );
    if (endedRes.rows.length) {
      console.log(`Leave expired, reverted to AVAILABLE: ${endedRes.rows.map(r => r.full_name).join(', ')}`);
    }

    console.log(`─── Staff Leave Status Cron Finished — ${startedRes.rows.length} started, ${endedRes.rows.length} ended ───`);
  } catch (error) {
    console.error('Staff leave status cron error:', error);
  } finally {
    client.release();
  }
};

const startStaffLeaveStatus = () => {
  // Runs once daily, just after midnight.
  cron.schedule('5 0 * * *', runStaffLeaveStatus);
};

module.exports = startStaffLeaveStatus;
module.exports.runStaffLeaveStatus = runStaffLeaveStatus;
