#!/usr/bin/env node
// scripts/convertLegacyTransportLines.js
//
// One-off (2026-11-19). Quotations made before free-form custom charges were removed can carry
// "Transport" as a custom charge line, which nothing ever invoices. This moves each such line, on
// a live quotation, onto a linked product quotation as the "Transport Charges" product, so it is
// invoiced like any other product:
//
//   no booking, nothing paid on the line -> only moved. It is invoiced when the client pays (the
//                                           payment form accepts the product quotation) or when the
//                                           booking is created.
//   no booking, money paid on the line   -> moved, invoiced now and paid from the client's wallet,
//                                           so the payment form does not ask for it a second time.
//   booking exists (any status)          -> moved, invoiced on the booking now, and paid from
//                                           whatever wallet money is available to the booking.
//
// Left alone on purpose: lines on rejected quotations and on quotations that were replaced by a
// newer one (they can never be paid), and any custom charge that is not transport.
//
// Usage (dry run is the default: everything is rolled back and a report printed):
//   node scripts/convertLegacyTransportLines.js
//   node scripts/convertLegacyTransportLines.js --apply
//   --json <file>   also writes the report as JSON

const fs = require('fs');
const db = require('../config/db');
const { convertLegacyTransportLines, acceptProductQuoteCore, attachLinkedProductsToBooking } = require('../controllers/quoteController');
const { payInvoiceFromWallet } = require('../services/invoiceCharges');
const { getClientFinancialTotals } = require('../services/clientFinancials');

const APPLY = process.argv.includes('--apply');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;
const num = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100;

async function main() {
  const pg = await db.pool.connect();
  // getClientFinancialTotals and the controller helpers use db.query; keep everything on this
  // one connection so a dry run sees its own uncommitted work.
  const realQuery = db.query;
  db.query = (text, params) => pg.query(text, params);

  const report = { mode: APPLY ? 'APPLY' : 'DRY RUN', rows: [], problems: [], clients: [] };
  try {
    await pg.query('BEGIN');
    await pg.query(`SET LOCAL application_name = 'legacy-transport-conversion'`);

    const targets = (await pg.query(`
      SELECT q.quote_id, q.estimate_number, q.status, q.request_id, q.booking_id AS quote_booking_id,
             sr.client_id,
             (SELECT b.booking_id FROM bookings b WHERE b.booking_id = q.booking_id OR b.request_id = q.request_id ORDER BY b.created_at DESC LIMIT 1) AS booking_id,
             (SELECT COALESCE(SUM(li.amount), 0) FROM quote_line_items li WHERE li.quote_id = q.quote_id
                AND li.item_type = 'CHARGE' AND li.is_registration_fee = false AND li.item_subtype IS NULL
                AND (li.description ILIKE '%trans%' OR li.description ILIKE '%trasport%')) AS transport_amount,
             (SELECT COALESCE(SUM(a.amount), 0) FROM quote_line_item_payments a JOIN quote_line_items li ON li.line_item_id = a.line_item_id
                WHERE li.quote_id = q.quote_id AND li.item_type = 'CHARGE' AND li.is_registration_fee = false AND li.item_subtype IS NULL
                AND (li.description ILIKE '%trans%' OR li.description ILIKE '%trasport%')) AS allocated_paid
      FROM quotations q
      JOIN service_requests sr ON sr.request_id = q.request_id AND sr.active_quote_id = q.quote_id
      WHERE q.quote_type = 'SERVICE' AND COALESCE(q.status, '') <> 'REJECTED'
        AND EXISTS (SELECT 1 FROM quote_line_items li WHERE li.quote_id = q.quote_id
                    AND li.item_type = 'CHARGE' AND li.is_registration_fee = false AND li.item_subtype IS NULL
                    AND (li.description ILIKE '%trans%' OR li.description ILIKE '%trasport%'))
      ORDER BY q.created_at`)).rows;

    const clientIds = new Set(targets.map((t) => t.client_id).filter(Boolean));
    const before = {};
    for (const id of clientIds) before[id] = num((await getClientFinancialTotals(id)).balanceDue);

    for (const t of targets) {
      const row = {
        estimate: t.estimate_number, amount: num(t.transport_amount), allocated_paid: num(t.allocated_paid),
        has_client: Boolean(t.client_id), booking: null,
      };
      try {
        await pg.query('SAVEPOINT one_quote');
        if (t.booking_id) {
          const b = (await pg.query(`SELECT booking_code, status FROM bookings WHERE booking_id = $1`, [t.booking_id])).rows[0];
          row.booking = `${b.booking_code}/${b.status}`;
          // Convert, invoice on the booking, pay from the booking's wallet money.
          const r = await attachLinkedProductsToBooking(pg, { serviceQuoteId: t.quote_id, bookingId: t.booking_id, actorUserId: null });
          row.action = 'converted + invoiced on booking';
          row.drawn_from_wallet = r.drawn_from_wallet;
          if (r.warning) { row.warning = r.warning; report.problems.push(`${t.estimate_number}: ${r.warning}`); }
          if (num(t.allocated_paid) > 0 && r.drawn_from_wallet < num(t.allocated_paid) - 0.005) {
            report.problems.push(`${t.estimate_number}: ${num(t.allocated_paid)} was paid toward transport but the wallet covered only ${r.drawn_from_wallet}; the rest is left unpaid.`);
          }
        } else {
          const c = await convertLegacyTransportLines(pg, { serviceQuoteId: t.quote_id });
          row.converted = c.converted;
          if (c.warning) throw new Error(c.warning);
          if (num(t.allocated_paid) > 0.005 && t.client_id) {
            // Paid already: invoice it now and settle from the wallet, so the payment form
            // does not ask for it again.
            const accepted = await acceptProductQuoteCore(pg, c.quoteIds[0], { actorUserId: null });
            const drawn = await payInvoiceFromWallet(pg, {
              invoiceId: accepted.genericInvoice.invoice_id, maxAmount: num(t.allocated_paid),
              notes: `${accepted.genericInvoice.invoice_code} — Transport paid from client wallet balance`,
            });
            row.action = 'converted + invoiced + paid from wallet';
            row.drawn_from_wallet = drawn;
            if (drawn < num(t.allocated_paid) - 0.005) {
              report.problems.push(`${t.estimate_number}: ${num(t.allocated_paid)} was paid toward transport but the wallet covered only ${drawn}; the rest is left unpaid.`);
            }
          } else {
            row.action = 'converted only (invoiced when paid or booked)';
          }
        }
        await pg.query('RELEASE SAVEPOINT one_quote');
      } catch (err) {
        await pg.query('ROLLBACK TO SAVEPOINT one_quote');
        row.error = err.message;
        report.problems.push(`${t.estimate_number}: skipped, ${err.message}`);
      }
      report.rows.push(row);
    }

    const names = await pg.query(`SELECT client_profile_id, client_code, full_name FROM client_profiles WHERE client_profile_id = ANY($1::uuid[])`, [[...clientIds]]);
    for (const c of names.rows) {
      report.clients.push({ client: `${c.client_code || ''} ${c.full_name || ''}`.trim(), overdue_before: before[c.client_profile_id], overdue_after: num((await getClientFinancialTotals(c.client_profile_id)).balanceDue) });
    }

    // Nothing may be left behind that this script was meant to move.
    const left = (await pg.query(`
      SELECT count(*)::int AS n FROM quote_line_items li JOIN quotations q ON q.quote_id = li.quote_id
      JOIN service_requests sr ON sr.request_id = q.request_id AND sr.active_quote_id = q.quote_id
      WHERE q.quote_type = 'SERVICE' AND COALESCE(q.status, '') <> 'REJECTED'
        AND li.item_type = 'CHARGE' AND li.is_registration_fee = false AND li.item_subtype IS NULL
        AND (li.description ILIKE '%trans%' OR li.description ILIKE '%trasport%')`)).rows[0].n;
    report.remaining_on_live_quotes = left;

    if (APPLY && report.rows.every((r) => !r.error)) {
      await pg.query('COMMIT');
      report.result = 'COMMITTED';
    } else {
      await pg.query('ROLLBACK');
      report.result = APPLY ? 'ROLLED BACK, a quotation failed so nothing was written' : 'ROLLED BACK (dry run)';
    }
  } catch (err) {
    await pg.query('ROLLBACK').catch(() => {});
    report.result = `ROLLED BACK, ${err.message}`;
  } finally {
    db.query = realQuery;
    pg.release();
  }

  console.log(`\n=== ${report.mode}: ${report.result} ===\n`);
  const by = {};
  report.rows.forEach((r) => { const k = r.error ? 'ERROR' : r.action; by[k] = by[k] || { n: 0, amt: 0 }; by[k].n++; by[k].amt += r.amount; });
  console.table(by);
  report.rows.filter((r) => r.action !== 'converted only (invoiced when paid or booked)').forEach((r) =>
    console.log(`  ${r.estimate} ${r.booking || 'no booking'} Rs.${r.amount} paid=${r.allocated_paid} ${r.error ? 'ERROR ' + r.error : r.action + ' drawn=' + (r.drawn_from_wallet || 0)}`));
  console.log(`\nTransport lines still on live quotations: ${report.remaining_on_live_quotes}`);
  if (report.clients.length) {
    console.log('\nClient overdue before -> after (only changes shown):');
    report.clients.filter((c) => c.overdue_before !== c.overdue_after).forEach((c) => console.log(`  ${c.client.padEnd(36)} ${c.overdue_before} -> ${c.overdue_after}`));
  }
  if (report.problems.length) { console.log('\nProblems:'); report.problems.forEach((p) => console.log('  - ' + p)); }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  await db.pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
