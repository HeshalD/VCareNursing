// scripts/backfillDayAllocations.js
// Builds the per-day payment tracking (daily_invoice_payments) for bookings that existed before
// it. For each booking it runs the same reconcile the app runs after every payment: the booking's
// service pool is allocated oldest billed day first. Nothing is written unless --apply is given
// (dry run rolls every booking back). Take a database dump before --apply.
//
//   node scripts/backfillDayAllocations.js                 # report, whole database
//   node scripts/backfillDayAllocations.js --booking BK-00322
//   node scripts/backfillDayAllocations.js --apply
//
// Per booking the report shows the pool, how much it settles, what is left unpaid on the days, and
// what the booking ledger says is owed. When the two disagree (a charge with no day row, e.g. an
// old correction, or a registration fee / product still unpaid) the booking is flagged so it can
// be looked at — the allocation itself is still correct for the days.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');
const { reconcileBookingDays, getPoolDetail } = require('../services/dayAllocation');
const { bookingChargeSql, bookingSettledSql } = require('../services/clientFinancials');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = args.includes('--booking') ? args[args.indexOf('--booking') + 1] : null;
const money = (n) => Number(n || 0).toFixed(2);

(async () => {
  const res = await db.query(
    `SELECT DISTINCT b.booking_id, b.booking_code
     FROM bookings b JOIN booking_daily_invoices d ON d.booking_id = b.booking_id
     WHERE d.status IN ('INVOICED', 'REVOKED') ${only ? 'AND b.booking_code = $1' : ''}
     ORDER BY b.booking_code`,
    only ? [only] : []
  );
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — ${res.rows.length} booking(s) with billed days\n`);

  let flagged = 0;
  let changed = 0;
  for (const { booking_id, booking_code } of res.rows) {
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      const before = await getPoolDetail(c, booking_id);
      const r = await reconcileBookingDays(c, booking_id);
      const days = await c.query(
        `SELECT COALESCE(SUM(d.amount - LEAST(d.amount, COALESCE((SELECT SUM(p.amount) FROM daily_invoice_payments p WHERE p.daily_invoice_id = d.daily_invoice_id), 0))), 0) AS unpaid
         FROM booking_daily_invoices d WHERE d.booking_id = $1 AND d.status = 'INVOICED' AND d.amount IS NOT NULL`,
        [booking_id]
      );
      const owed = await c.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE ${bookingChargeSql()}), 0) - COALESCE(SUM(amount) FILTER (WHERE ${bookingSettledSql()}), 0) AS owed
         FROM transactions WHERE booking_id = $1`,
        [booking_id]
      );
      const unpaidDays = parseFloat(days.rows[0].unpaid);
      const ledgerOwed = Math.max(parseFloat(owed.rows[0].owed), 0);
      const mismatch = Math.abs(ledgerOwed - unpaidDays) > 0.01;
      if (r.added > 0.005 || r.released > 0.005) changed++;
      if (mismatch) flagged++;
      console.log(`${booking_code}: pool ${money(before.pool)} → allocated ${money(r.allocated)} (+${money(r.added)} −${money(r.released)}) | unpaid on days ${money(unpaidDays)} | ledger owes ${money(ledgerOwed)}${mismatch ? '   <-- differs (non-day charge or ledger quirk)' : ''}`);
      await c.query(apply ? 'COMMIT' : 'ROLLBACK');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      console.error(`${booking_code}: FAILED — ${err.message}`);
    } finally {
      c.release();
    }
  }
  console.log(`\n${changed} booking(s) ${apply ? 'updated' : 'would change'}; ${flagged} flagged for a look.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
