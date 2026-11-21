#!/usr/bin/env node
// scripts/convertDocumentInvoices.js
//
// One-off. Product lines used to be given a document-only invoice (category LINE_ITEM) from the
// quotation payment form. Such an invoice has no charge on the client's ledger, so any money paid on
// it reached the books while Total Invoiced never saw the charge. Every product line now has a real
// invoice. This turns each remaining document-only invoice on a product quotation into the real one,
// in place: same invoice number, same payment, plus its ledger charge. A quotation that is already
// booked has the invoice tied to the booking, and any payment on it moves to the booking too.
//
// It converts only. It does not invoice other lines, take money from a wallet, or accept anything.
//
// Usage (dry run is the default: everything is rolled back and a report printed):
//   node scripts/convertDocumentInvoices.js
//   node scripts/convertDocumentInvoices.js --apply
//   --skip EST-1234,EST-5678   quotation numbers (product or service) to leave alone
//   --json <file>              also writes the report as JSON

const fs = require('fs');
const db = require('../config/db');
const { billProductLine, loadBillableLines, bookingOfProductQuote, unbilledLineIds } = require('../controllers/quoteController');
const { linkProductQuoteToBooking } = require('../services/invoiceCharges');
const { getClientFinancialTotals } = require('../services/clientFinancials');

const APPLY = process.argv.includes('--apply');
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : ''; };
const SKIP = new Set(arg('--skip').split(',').map((x) => x.trim()).filter(Boolean));
const JSON_OUT = arg('--json') || null;
const num = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100;

async function main() {
  const pg = await db.pool.connect();
  const realQuery = db.query;
  db.query = (text, params) => pg.query(text, params);

  const report = { mode: APPLY ? 'APPLY' : 'DRY RUN', rows: [], problems: [], clients: [] };
  try {
    await pg.query('BEGIN');
    await pg.query(`SET LOCAL application_name = 'convert-document-invoices'`);

    const docs = (await pg.query(`
      SELECT i.invoice_id, i.invoice_code, i.line_item_id, i.quote_id, i.status, i.amount, i.client_id,
             pq.estimate_number AS product_est, sq.estimate_number AS service_est
      FROM invoices i
      JOIN quotations pq ON pq.quote_id = i.quote_id AND pq.quote_type = 'PRODUCT'
      LEFT JOIN quotations sq ON sq.quote_id = pq.linked_quote_id
      WHERE i.category = 'LINE_ITEM' AND i.line_item_id IS NOT NULL
      ORDER BY i.created_at`)).rows;
    const targets = docs.filter((d) => !SKIP.has(d.product_est) && !SKIP.has(d.service_est));
    report.skipped = docs.filter((d) => !targets.includes(d)).map((d) => d.invoice_code);

    const owner = async (d) => (await pg.query(`SELECT client_id FROM quotations WHERE quote_id = $1`, [d.quote_id])).rows[0]?.client_id || d.client_id;
    const clientIds = new Set();
    for (const d of targets) { const c = await owner(d); if (c) clientIds.add(c); }
    const snap = async (id) => { const t = await getClientFinancialTotals(id); return { invoiced: num(t.totalInvoiced), paid: num(t.totalPaid), overdue: num(t.balanceDue) }; };
    const before = {};
    for (const id of clientIds) before[id] = await snap(id);

    for (const d of targets) {
      const row = { invoice: d.invoice_code, quote: d.product_est, service: d.service_est, amount: num(d.amount), status: d.status, booking: null };
      try {
        await pg.query('SAVEPOINT one_doc');
        const quote = (await pg.query(`SELECT * FROM quotations WHERE quote_id = $1 FOR UPDATE`, [d.quote_id])).rows[0];
        if (!quote.client_id && !quote.walk_in_customer_id && quote.linked_quote_id) {
          const rc = await pg.query(`SELECT sr.client_id FROM quotations sq JOIN service_requests sr ON sr.request_id = sq.request_id WHERE sq.quote_id = $1`, [quote.linked_quote_id]);
          if (rc.rows[0]?.client_id) quote.client_id = rc.rows[0].client_id;
        }
        const line = (await loadBillableLines(pg, d.quote_id)).find((l) => l.line_item_id === d.line_item_id);
        if (!line) throw new Error('its quotation line is missing');
        const billed = await billProductLine(pg, { quote, line, actorUserId: null });
        if (!billed) throw new Error('the line already has a real invoice');
        row.converted = true;

        const bookingId = await bookingOfProductQuote(pg, quote);
        if (bookingId) {
          row.booking = (await pg.query(`SELECT booking_code || '/' || status AS b FROM bookings WHERE booking_id = $1`, [bookingId])).rows[0].b;
          await linkProductQuoteToBooking(pg, { productQuoteId: d.quote_id, bookingId });
        }
        if ((await unbilledLineIds(pg, d.quote_id)).length === 0) await pg.query(`UPDATE quotations SET status = 'ACCEPTED' WHERE quote_id = $1`, [d.quote_id]);

        const after = (await pg.query(`SELECT i.category, i.charge_transaction_id IS NOT NULL AS charged FROM invoices i WHERE i.invoice_id = $1`, [d.invoice_id])).rows[0];
        if (after.category !== 'PRODUCT') throw new Error('it was not converted');
        row.charged = after.charged;
        if (!after.charged) report.problems.push(`${d.invoice_code}: converted but has no ledger charge because the quotation has no client yet. The charge posts when the client's account is created.`);
        await pg.query('RELEASE SAVEPOINT one_doc');
      } catch (err) {
        await pg.query('ROLLBACK TO SAVEPOINT one_doc');
        row.error = err.message;
        report.problems.push(`${d.invoice_code}: skipped, ${err.message}`);
      }
      report.rows.push(row);
    }

    const names = await pg.query(`SELECT client_profile_id, client_code, full_name FROM client_profiles WHERE client_profile_id = ANY($1::uuid[])`, [[...clientIds]]);
    for (const c of names.rows) report.clients.push({ client: `${c.client_code || ''} ${c.full_name || ''}`.trim(), before: before[c.client_profile_id], after: await snap(c.client_profile_id) });

    report.documents_left = (await pg.query(`SELECT count(*)::int n FROM invoices i JOIN quotations q ON q.quote_id = i.quote_id WHERE i.category = 'LINE_ITEM' AND q.quote_type = 'PRODUCT'`)).rows[0].n;

    if (APPLY && report.rows.every((r) => !r.error)) {
      await pg.query('COMMIT');
      report.result = 'COMMITTED';
    } else {
      await pg.query('ROLLBACK');
      report.result = APPLY ? 'ROLLED BACK, an invoice failed so nothing was written' : 'ROLLED BACK (dry run)';
    }
  } catch (err) {
    await pg.query('ROLLBACK').catch(() => {});
    report.result = `ROLLED BACK, ${err.message}`;
  } finally {
    db.query = realQuery;
    pg.release();
  }

  console.log(`\n=== ${report.mode}: ${report.result} ===\n`);
  report.rows.forEach((r) => console.log(`  ${r.invoice} ${r.quote} (service ${r.service || '-'}) Rs.${r.amount} ${r.status} ${r.booking || 'no booking'} ${r.error ? 'ERROR ' + r.error : `converted, ledger charge ${r.charged ? 'posted' : 'waiting'}`}`));
  console.log(`\nDocument-only invoices left on product quotations: ${report.documents_left}${report.skipped?.length ? ` (left alone on purpose: ${report.skipped.join(', ')})` : ''}`);
  if (report.clients.length) {
    console.log('\nClients (Total Invoiced / Payments Made / Overdue, before -> after):');
    report.clients.forEach((c) => console.log(`  ${c.client.padEnd(36)} ${c.before.invoiced} / ${c.before.paid} / ${c.before.overdue}  ->  ${c.after.invoiced} / ${c.after.paid} / ${c.after.overdue}`));
  }
  if (report.problems.length) { console.log('\nProblems:'); report.problems.forEach((p) => console.log('  - ' + p)); }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  await db.pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
