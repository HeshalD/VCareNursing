// scripts/backfillLiveInStartInTime.js
//
// One-off backfill: LIVE_IN assignments that were bulk-entered without a start-day
// in-time. A later staff swap needs a start-day attendance row to hang the outgoing
// staff's out-time on, so give every such assignment a PENDING row with a placeholder
// in-time (00:01 Asia/Colombo, same as the other live-in rows).
//
//   node scripts/backfillLiveInStartInTime.js            (DRY RUN, rolls back)
//   node scripts/backfillLiveInStartInTime.js --apply    (writes)
//
// Only in_time is set. out_time / hours_served stay NULL so no fake hours are
// recorded. Rows are tagged in notes so they can be found and corrected later:
//   WHERE notes = 'BACKFILL: placeholder in-time (actual unknown)'
// Existing rows with a real in_time, or already decided (not PENDING), are never touched.

const db = require('../config/db');

const APPLY = process.argv.includes('--apply');
const NOTE = 'BACKFILL: placeholder in-time (actual unknown)';
const PLACEHOLDER = `(a.service_start_date + time '00:01') AT TIME ZONE 'Asia/Colombo'`;

const targetsSql = `
  FROM booking_staff_assignments a
  JOIN bookings b ON b.booking_id = a.booking_id
  WHERE b.service_model = 'LIVE_IN'
    AND a.status = 'ACTIVE'
    AND a.shift_slot_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM staff_daily_attendance d
      WHERE d.assignment_id = a.assignment_id AND d.service_date = a.service_start_date
        AND d.in_time IS NOT NULL
    )`;

(async () => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Existing start-day row with a NULL in_time: fill only if still undecided.
    const upd = await client.query(
      `UPDATE staff_daily_attendance d
          SET in_time = ${PLACEHOLDER}, notes = COALESCE(d.notes, $1), updated_at = NOW()
         FROM booking_staff_assignments a
         JOIN bookings b ON b.booking_id = a.booking_id
        WHERE d.assignment_id = a.assignment_id AND d.service_date = a.service_start_date
          AND d.in_time IS NULL AND d.salary_status = 'PENDING' AND d.attendance_status = 'PRESENT'
          AND b.service_model = 'LIVE_IN' AND a.status = 'ACTIVE' AND a.shift_slot_id IS NULL
        RETURNING d.attendance_id`,
      [NOTE]
    );

    const ins = await client.query(
      `INSERT INTO staff_daily_attendance
         (booking_id, assignment_id, staff_profile_id, service_date, in_time, entry_mode, notes)
       SELECT a.booking_id, a.assignment_id, a.staff_profile_id, a.service_start_date,
              ${PLACEHOLDER}, 'MANUAL', $1
       ${targetsSql}
         AND NOT EXISTS (
           SELECT 1 FROM staff_daily_attendance d
           WHERE d.assignment_id = a.assignment_id AND d.service_date = a.service_start_date
             AND d.shift_slot_id IS NULL)
       ON CONFLICT (assignment_id, service_date) WHERE shift_slot_id IS NULL DO NOTHING
       RETURNING attendance_id`,
      [NOTE]
    );

    const left = await client.query(`SELECT count(*)::int AS n ${targetsSql}`);
    console.log(`Updated existing null-in-time rows: ${upd.rowCount}`);
    console.log(`Inserted new start-day rows:        ${ins.rowCount}`);
    console.log(`LIVE_IN assignments still without start-day in-time (should be 0): ${left.rows[0].n}`);

    if (APPLY) {
      await client.query('COMMIT');
      console.log('COMMITTED.');
    } else {
      await client.query('ROLLBACK');
      console.log('DRY RUN — rolled back. Re-run with --apply to write.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end?.();
  }
})();
