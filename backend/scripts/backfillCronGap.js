// scripts/backfillCronGap.js
//
// One-off backfill for nightly cron runs whose work was silently rolled back (the
// ON CONFLICT / aborted-transaction bug in cron/dailyInvoicing.js). Re-creates what
// the cron would have written for each given business date, using the same rules and
// the same billing helpers, then backdates the records to when the cron really ran.
//
//   node scripts/backfillCronGap.js --dates 2026-10-02,2026-10-03          (DRY RUN)
//   node scripts/backfillCronGap.js --dates 2026-10-02,2026-10-03 --apply  (writes)
//
// Dry run executes the whole thing (including wallet draws) and then ROLLS BACK, so the
// report is exactly what --apply would do. Rows that already exist for a day are never
// touched. Items the cron wouldn't auto-process (first/last day, concurrent swap) get
// PENDING invoice rows only. Anything ambiguous is listed under REVIEW and not written.
//
// Run it from inside the backend container (needs the DB env), ideally off-hours.

const fs = require('fs');
const db = require('../config/db');
const {
  getBillingCharge,
  creditStaffSalary,
  checkAndFlagBookingOverdue
} = require('../services/billingService');
const { drawWalletForBooking } = require('../services/walletService');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const datesArg = args[args.indexOf('--dates') + 1];
if (!datesArg || !/^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})*$/.test(datesArg)) {
  console.error('Usage: node scripts/backfillCronGap.js --dates YYYY-MM-DD[,YYYY-MM-DD...] [--apply]');
  process.exit(1);
}
const DATES = datesArg.split(',').sort();

const report = { salary: [], invoice: [], pending: [], review: [], errors: [] };

// The real cron ran at 23:58 UTC the evening before the business date it processes.
const runTimestamp = (dateISO) => {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.toISOString().slice(0, 10)}T23:58:30Z`;
};

// Same numbering scheme as billingService.generateInvoiceNumber, but for the backdated
// day (the stock helper numbers by "today", which would collide with today's invoices).
const nextInvoiceNumber = async (client, tsISO) => {
  const day = tsISO.slice(0, 10);
  const res = await client.query(
    `SELECT COUNT(*) AS count FROM transactions
     WHERE category IN ('SERVICE_INVOICE', 'REGISTRATION_FEE') AND DATE(created_at) = $1::date`,
    [day]
  );
  let seq = parseInt(res.rows[0].count) + 1;
  for (;;) {
    const num = `INV-${day.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
    const clash = await client.query(`SELECT 1 FROM transactions WHERE notes LIKE $1 LIMIT 1`, [`${num} %`]);
    if (clash.rows.length === 0) return num;
    seq++;
  }
};

const withSavepoint = async (client, fn) => {
  await client.query('SAVEPOINT bf_item');
  try {
    await fn();
    await client.query('RELEASE SAVEPOINT bf_item');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT bf_item');
    throw err;
  }
};

const processDate = async (client, today) => {
  const ts = runTimestamp(today);
  console.log(`\n=== ${today} (backdating to ${ts}) ===`);

  const bookingsRes = await client.query(
    `SELECT booking_id, status FROM bookings WHERE status IN ('ACTIVE', 'OVERDUE') AND service_model = 'LIVE_IN'`
  );
  const liveBookingIds = bookingsRes.rows.map(r => r.booking_id);

  // Same selection as the cron (plus the assignment must have started by this date).
  const asgRes = await client.query(
    `SELECT
       bsa.assignment_id, bsa.booking_id, bsa.staff_profile_id, bsa.daily_rate,
       bsa.service_start_date::text AS service_start_date, bsa.service_end_date,
       b.client_id, b.service_model, b.ot_rate, b.scheduled_end_time, b.actual_end_time, b.invoicing_mode,
       q.daily_rate AS quote_daily_rate, b.daily_rate AS booking_daily_rate,
       sp.full_name AS staff_name, sp.staff_code,
       NULLIF(CONCAT_WS(' ', NULLIF(c.honorific, ''), c.full_name), '') AS client_name,
       b.booking_code
     FROM booking_staff_assignments bsa
     JOIN bookings b ON bsa.booking_id = b.booking_id
     LEFT JOIN service_requests sr ON b.request_id = sr.request_id
     LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
     JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
     JOIN client_profiles c ON b.client_id = c.client_profile_id
     WHERE bsa.status = 'ACTIVE'
       AND bsa.service_start_date <= $2::date
       AND bsa.booking_id = ANY($1::uuid[])
     ORDER BY b.created_at DESC, bsa.assigned_on`,
    [liveBookingIds, today]
  );
  const assignments = asgRes.rows;

  const countByBooking = new Map();
  for (const a of assignments) countByBooking.set(a.booking_id, (countByBooking.get(a.booking_id) || 0) + 1);

  // ── REVIEW: LIVE_IN coverage the script will not touch ──────────────────────
  const reviewRes = await client.query(
    `SELECT b.booking_code, b.status AS booking_status, bsa.status AS asg_status, sp.staff_code,
            bsa.service_start_date::text AS s, bsa.service_end_date::text AS e
     FROM booking_staff_assignments bsa
     JOIN bookings b USING (booking_id)
     JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
     WHERE b.service_model = 'LIVE_IN'
       AND bsa.service_start_date < $1::date
       AND (bsa.service_end_date IS NULL OR bsa.service_end_date >= $1::date)
       AND NOT (bsa.status = 'ACTIVE' AND b.status IN ('ACTIVE', 'OVERDUE'))
       AND NOT EXISTS (SELECT 1 FROM staff_daily_attendance s
                       WHERE s.assignment_id = bsa.assignment_id AND s.service_date = $1::date AND s.shift_slot_id IS NULL)`,
    [today]
  );
  for (const r of reviewRes.rows) {
    report.review.push({ date: today, booking: r.booking_code, staff: r.staff_code, why: `assignment ${r.asg_status} (${r.s}→${r.e || 'open'}), booking ${r.booking_status}` });
  }

  // Bookings with a pause covering this date are not billed — report, don't touch.
  const pausedRes = await client.query(
    `SELECT DISTINCT booking_id FROM booking_pauses
     WHERE paused_date <= $1::date AND (resumed_at IS NULL OR resumed_at::date > $1::date)`,
    [today]
  );
  const pausedIds = new Set(pausedRes.rows.map(r => r.booking_id));

  // ── Staff salaries ──────────────────────────────────────────────────────────
  for (const a of assignments) {
    if (pausedIds.has(a.booking_id)) continue;
    const isFirstDay = a.service_start_date === today;
    const isConcurrent = (countByBooking.get(a.booking_id) || 0) > 1;
    if (isFirstDay || isConcurrent) continue;

    const exists = await client.query(
      `SELECT 1 FROM staff_daily_attendance
       WHERE assignment_id = $1 AND service_date = $2::date AND shift_slot_id IS NULL AND reschedule_id IS NULL`,
      [a.assignment_id, today]
    );
    if (exists.rows.length > 0) continue;

    try {
      await withSavepoint(client, async () => {
        const amount = parseFloat(a.daily_rate);
        const txId = await creditStaffSalary(client, {
          staff_profile_id: a.staff_profile_id,
          booking_id: a.booking_id,
          amount,
          notes: `Daily earnings from booking ${a.booking_id} for ${a.staff_name} (${today})`
        });
        await client.query(`UPDATE transactions SET created_at = $2 WHERE transaction_id = $1`, [txId, ts]);
        await client.query(`UPDATE staff_wallet_transactions SET created_at = $2 WHERE reference_id = $1`, [txId, ts]);
        await client.query(
          `INSERT INTO staff_daily_attendance (
             booking_id, assignment_id, staff_profile_id, service_date,
             hours_served, entry_mode, salary_status, salary_amount,
             salary_transaction_id, decided_by_name, decided_at
           ) VALUES ($1, $2, $3, $4, 24, 'AUTO', 'PAID', $5, $6, 'SYSTEM (auto — LIVE_IN, backfill)', $7)`,
          [a.booking_id, a.assignment_id, a.staff_profile_id, today, amount, txId, ts]
        );
        report.salary.push({ date: today, booking: a.booking_code, staff: a.staff_code, name: a.staff_name, amount });
      });
    } catch (e) {
      report.errors.push({ date: today, kind: 'salary', booking: a.booking_code, staff: a.staff_code, error: e.message });
    }
  }

  // ── Client invoices (AUTO) + PENDING seeds (MANUAL / boundary days) ─────────
  const bookingMap = new Map();
  for (const a of assignments) {
    if (!bookingMap.has(a.booking_id)) {
      bookingMap.set(a.booking_id, {
        booking_id: a.booking_id, booking_code: a.booking_code, client_id: a.client_id, client_name: a.client_name,
        service_model: a.service_model, invoicing_mode: a.invoicing_mode,
        daily_rate: parseFloat(a.booking_daily_rate || a.quote_daily_rate), ot_rate: a.ot_rate,
        scheduled_end_time: a.scheduled_end_time, actual_end_time: a.actual_end_time, total_daily_rate: 0
      });
    }
    bookingMap.get(a.booking_id).total_daily_rate += parseFloat(a.daily_rate);
  }
  const startingToday = new Set(assignments.filter(a => a.service_start_date === today).map(a => a.booking_id));

  for (const [bookingId, b] of bookingMap.entries()) {
    if (pausedIds.has(bookingId)) continue;

    const exists = await client.query(
      `SELECT 1 FROM booking_daily_invoices
       WHERE booking_id = $1 AND service_date = $2::date AND shift_slot_id IS NULL AND assignment_id IS NULL`,
      [bookingId, today]
    );
    if (exists.rows.length > 0) continue;

    const isAuto = b.invoicing_mode !== 'MANUAL' && !startingToday.has(bookingId);

    try {
      await withSavepoint(client, async () => {
        if (!isAuto) {
          await client.query(
            `INSERT INTO booking_daily_invoices (booking_id, service_date, entry_mode, status, amount)
             VALUES ($1, $2, 'MANUAL', 'PENDING', $3)
             ON CONFLICT (booking_id, service_date) WHERE shift_slot_id IS NULL AND assignment_id IS NULL DO NOTHING`,
            [bookingId, today, b.daily_rate]
          );
          report.pending.push({ date: today, booking: b.booking_code, amount: b.daily_rate });
          return;
        }

        const { amount, notes } = getBillingCharge(b);
        const invNo = await nextInvoiceNumber(client, ts);
        const staffCount = assignments.filter(x => x.booking_id === bookingId).length;
        const txRes = await client.query(
          `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, status, notes, created_at)
           VALUES ($1, $2, 'SERVICE_INVOICE', 'DEBIT', $3, 'COMPLETED', $4, $5)
           RETURNING transaction_id`,
          [b.client_id, bookingId, amount, `${invNo} — ${notes} (${staffCount} staff member(s))`, ts]
        );
        const txId = txRes.rows[0].transaction_id;

        // The wallet draw writes with NOW(); backdate whatever it created for this booking.
        const drawn = await drawWalletForBooking(client, { booking_id: bookingId, client_id: b.client_id, maxAmount: amount });
        if (drawn > 0) {
          await client.query(`UPDATE transactions SET created_at = $2 WHERE booking_id = $1 AND created_at = NOW()`, [bookingId, ts]);
          await client.query(`UPDATE booking_payment_tracking SET created_at = $2, payment_date = $2, verified_at = $2 WHERE booking_id = $1 AND created_at = NOW()`, [bookingId, ts]);
          await client.query(`UPDATE bookings SET last_payment_date = $2 WHERE booking_id = $1`, [bookingId, ts]);
        }
        await checkAndFlagBookingOverdue(client, bookingId);

        await client.query(
          `INSERT INTO booking_daily_invoices (booking_id, service_date, entry_mode, status, amount, transaction_id, decided_by_name, decided_at)
           VALUES ($1, $2, 'AUTO', 'INVOICED', $3, $4, 'SYSTEM (auto — LIVE_IN, backfill)', $5)
           ON CONFLICT (booking_id, service_date) WHERE shift_slot_id IS NULL AND assignment_id IS NULL DO NOTHING`,
          [bookingId, today, amount, txId, ts]
        );
        report.invoice.push({
          date: today, booking: b.booking_code, client: b.client_name, amount, wallet_drawn: drawn,
          note: b.actual_end_time ? 'has actual_end_time (overrun rules applied)' : ''
        });
      });
    } catch (e) {
      report.errors.push({ date: today, kind: 'invoice', booking: b.booking_code, error: e.message });
    }
  }
};

(async () => {
  const client = await db.pool.connect();
  try {
    console.log(APPLY ? '*** APPLY MODE — changes will be committed ***' : '--- DRY RUN — everything is rolled back ---');
    await client.query('BEGIN');
    for (const d of DATES) await processDate(client, d);

    // Safety net the nightly sweep would have run: any ACTIVE booking now in debit -> OVERDUE.
    const flagged = await client.query(
      `UPDATE bookings b SET status = 'OVERDUE'
       WHERE b.status = 'ACTIVE' AND service_model = 'LIVE_IN'
         AND (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount END), 0) FROM transactions t WHERE t.booking_id = b.booking_id)
           > (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount END), 0) FROM transactions t WHERE t.booking_id = b.booking_id)
       RETURNING booking_code`
    );

    const sum = (rows, k) => rows.reduce((s, r) => s + (parseFloat(r[k]) || 0), 0);
    console.log('\n──────── SUMMARY ────────');
    for (const d of DATES) {
      const s = report.salary.filter(r => r.date === d), i = report.invoice.filter(r => r.date === d), p = report.pending.filter(r => r.date === d);
      console.log(`${d}: salaries ${s.length} (Rs.${sum(s, 'amount')}) | invoices ${i.length} (Rs.${sum(i, 'amount')}, wallet-drawn Rs.${sum(i, 'wallet_drawn')}) | pending rows ${p.length}`);
    }
    console.log(`Bookings newly flagged OVERDUE: ${flagged.rows.length}`);
    console.log(`Review items (not written): ${report.review.length} | Errors: ${report.errors.length}`);

    const file = `backfill-report-${APPLY ? 'applied' : 'dryrun'}-${Date.now()}.json`;
    fs.writeFileSync(file, JSON.stringify({ dates: DATES, report, newly_overdue: flagged.rows.map(r => r.booking_code) }, null, 2));
    console.log(`Full report: ${file}`);

    if (report.errors.length > 0 && APPLY) {
      console.log('Errors present — rolling back instead of committing. Fix and re-run.');
      await client.query('ROLLBACK');
    } else {
      await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
      console.log(APPLY ? 'COMMITTED.' : 'Rolled back (dry run).');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Backfill failed, rolled back:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    process.exit();
  }
})();
