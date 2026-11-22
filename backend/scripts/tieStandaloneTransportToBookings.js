#!/usr/bin/env node
// scripts/tieStandaloneTransportToBookings.js
//
// One-off. Transport / travel lines were sold as STAND-ALONE product quotations (no service quotation,
// no booking) for clients who have a live booking. Their invoices stand on their own on the client's
// account instead of counting on the booking they were really for. This ties each such quotation to
// the client's LATEST LIVE booking (active, overdue, paused, scheduled or pending), so its invoices
// join that booking's account (any payment on them moves too).
//
// Dry run by default: prints the list of what would be tied, changes nothing. Show the list to the
// admin and only then run with --apply (optionally --only EST-1,EST-2 to tie just those).
//
// Usage:
//   node scripts/tieStandaloneTransportToBookings.js
//   node scripts/tieStandaloneTransportToBookings.js --apply [--only EST-1,EST-2] [--skip EST-3]

const db = require('../config/db');
const { linkProductQuoteToBooking } = require('../services/invoiceCharges');
const { getClientFinancialTotals } = require('../services/clientFinancials');

const APPLY = process.argv.includes('--apply');
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : ''; };
const list = (name) => new Set(arg(name).split(',').map((x) => x.trim()).filter(Boolean));
const ONLY = list('--only');
const SKIP = list('--skip');
const num = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100;

async function main() {
  const pg = await db.pool.connect();
  const realQuery = db.query;
  db.query = (text, params) => pg.query(text, params);
  try {
    await pg.query('BEGIN');

    const rows = (await pg.query(`
      SELECT q.quote_id, q.estimate_number, q.client_id, q.total_amount, q.status, cp.full_name AS client_name,
             (SELECT string_agg(li.description, ', ' ORDER BY li.sort_order) FROM quote_line_items li WHERE li.quote_id = q.quote_id) AS lines,
             (SELECT COUNT(*)::int FROM invoices i WHERE i.quote_id = q.quote_id AND i.category = 'PRODUCT') AS invoices,
             (SELECT b.booking_id FROM bookings b JOIN service_requests sr ON sr.request_id = b.request_id
               WHERE sr.client_id = q.client_id AND b.status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')
               ORDER BY b.created_at DESC LIMIT 1) AS booking_id
      FROM quotations q
      JOIN client_profiles cp ON cp.client_profile_id = q.client_id
      WHERE q.quote_type = 'PRODUCT' AND q.linked_quote_id IS NULL AND q.booking_id IS NULL
        AND q.client_id IS NOT NULL AND COALESCE(q.status, '') <> 'REJECTED'
        AND EXISTS (SELECT 1 FROM quote_line_items li WHERE li.quote_id = q.quote_id
                    AND (li.description ILIKE '%trans%' OR li.description ILIKE '%travel%' OR li.description ILIKE '%trasport%'))
      ORDER BY q.created_at`)).rows;

    const targets = rows.filter((r) => r.booking_id && !SKIP.has(r.estimate_number) && (ONLY.size === 0 || ONLY.has(r.estimate_number)));
    const noBooking = rows.filter((r) => !r.booking_id);

    const code = async (id) => (await pg.query(`SELECT booking_code, status FROM bookings WHERE booking_id = $1`, [id])).rows[0];
    console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN (nothing changes)'} ===\n`);
    console.log(`Stand-alone transport/travel quotations: ${rows.length}; with a live booking to tie to: ${targets.length}; client has none: ${noBooking.length}\n`);

    const before = {};
    for (const r of targets) {
      const b = await code(r.booking_id);
      r.booking_code = b.booking_code; r.booking_status = b.status;
      if (!before[r.client_id]) { const t = await getClientFinancialTotals(r.client_id); before[r.client_id] = { invoiced: num(t.totalInvoiced), overdue: num(t.balanceDue) }; }
      console.log(`${r.estimate_number.padEnd(10)} ${String(r.client_name).slice(0, 26).padEnd(27)} Rs.${String(num(r.total_amount)).padEnd(8)} ${r.invoices} invoice(s)  ->  ${r.booking_code} (${r.booking_status})   [${String(r.lines).slice(0, 40)}]`);
    }
    if (noBooking.length) {
      console.log('\nLeft alone (client has no live booking):');
      noBooking.forEach((r) => console.log(`  ${r.estimate_number} ${r.client_name} Rs.${num(r.total_amount)}`));
    }

    for (const r of targets) await linkProductQuoteToBooking(pg, { productQuoteId: r.quote_id, bookingId: r.booking_id });

    console.log('\nClient totals before -> after (Total Invoiced / Overdue):');
    for (const id of Object.keys(before)) {
      const t = await getClientFinancialTotals(id);
      const name = rows.find((r) => r.client_id === id).client_name;
      console.log(`  ${String(name).padEnd(28)} ${before[id].invoiced} / ${before[id].overdue}  ->  ${num(t.totalInvoiced)} / ${num(t.balanceDue)}`);
    }

    if (APPLY) { await pg.query('COMMIT'); console.log('\nCOMMITTED.'); } else { await pg.query('ROLLBACK'); console.log('\nROLLED BACK (dry run).'); }
  } catch (err) {
    await pg.query('ROLLBACK').catch(() => {});
    console.error('FAILED, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    db.query = realQuery;
    pg.release();
    await db.pool.end().catch(() => {});
  }
}

main();
