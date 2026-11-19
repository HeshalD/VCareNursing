#!/usr/bin/env node
// scripts/invoiceUnbilledProductQuotes.js
//
// One-off (2026-11-19). A product quotation linked to a service quotation (for example the
// transport added through the builder's Product / Rental section) is only invoiced once it is
// accepted, and until recently nothing accepted it unless the client paid through the quotation's
// payment form. So products on quotations whose client has a booking, or has paid, were never
// invoiced. This invoices them:
//
//   - the product quotation is accepted, which creates its product invoice and its charge on the
//     client's ledger (so it counts in Total Invoiced, shows in the client's Invoices section and
//     on their statement, and, while unpaid, in their Overdue amount);
//   - a booking's invoice is tied to that booking, dated the booking's start; one with no booking
//     stands on its own, dated today;
//   - if the client has wallet money available to it, the invoice is paid from the wallet, the same
//     way a care day is (the booking's own reserved money first, then unreserved money, never
//     another booking's reservation). Whatever the wallet cannot cover stays unpaid.
//
// This is the same list the Ledger Health check calls "Products on a quotation were never invoiced".
//
// Usage (dry run is the default: everything is rolled back and a report printed):
//   node scripts/invoiceUnbilledProductQuotes.js
//   node scripts/invoiceUnbilledProductQuotes.js --apply
//   --json <file>   also writes the report as JSON

const fs = require('fs');
const db = require('../config/db');
const { acceptProductQuoteCore, attachLinkedProductsToBooking, isProductQuoteAccepted } = require('../controllers/quoteController');
const { payInvoiceFromWallet, ensureInvoiceCharge } = require('../services/invoiceCharges');
const { getClientFinancialTotals } = require('../services/clientFinancials');

const APPLY = process.argv.includes('--apply');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;
const num = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100;

async function snapshot(pg, clientId) {
  const t = await getClientFinancialTotals(clientId);
  const w = await pg.query(`SELECT COALESCE(wallet_balance, 0) AS w FROM client_profiles WHERE client_profile_id = $1`, [clientId]);
  return { invoiced: num(t.totalInvoiced), overdue: num(t.balanceDue), wallet: num(w.rows[0]?.w) };
}

// A product quotation can be marked accepted and carry only a document-only "extra charge"
// (LINE_ITEM) invoice for its items. Acceptance then bills nothing, and any payment made on that
// document reached the ledger with no charge to match. When one document covers the whole
// quotation, it becomes the quotation's real product invoice, keeping its INV number and any
// payment on it. Returns how many were converted.
async function convertDocumentInvoice(pg, productQuoteId, clientId) {
  const docs = (await pg.query(`SELECT * FROM invoices WHERE category = 'LINE_ITEM' AND quote_id = $1 FOR UPDATE`, [productQuoteId])).rows;
  if (docs.length === 0) return 0;
  const total = num((await pg.query(`SELECT total_amount FROM quotations WHERE quote_id = $1`, [productQuoteId])).rows[0].total_amount);
  if (docs.length !== 1 || Math.abs(num(docs[0].amount) - total) > 0.01) {
    throw new Error(`its ${docs.length} item invoice(s) do not match the quotation total of ${total}, so it needs invoicing by hand`);
  }
  await pg.query(
    `UPDATE invoices SET category = 'PRODUCT', line_item_id = NULL, client_id = COALESCE(client_id, $2), pdf_url = NULL WHERE invoice_id = $1`,
    [docs[0].invoice_id, clientId]
  );
  await ensureInvoiceCharge(pg, docs[0].invoice_id);
  return 1;
}

async function main() {
  const pg = await db.pool.connect();
  // The controller helpers and getClientFinancialTotals use db.query; keep everything on this one
  // connection so a dry run sees its own uncommitted work.
  const realQuery = db.query;
  db.query = (text, params) => pg.query(text, params);

  const report = { mode: APPLY ? 'APPLY' : 'DRY RUN', rows: [], problems: [], clients: [] };
  try {
    await pg.query('BEGIN');
    await pg.query(`SET LOCAL application_name = 'invoice-unbilled-products'`);

    // The same rule as the Ledger Health check, grouped per service quotation.
    const targets = (await pg.query(`
      SELECT sq.quote_id AS service_quote_id, sq.estimate_number AS service_est,
             COALESCE(sr.client_id, sq.client_id) AS client_id,
             (SELECT b.booking_id FROM bookings b WHERE b.booking_id = sq.booking_id OR b.request_id = sq.request_id ORDER BY b.created_at DESC LIMIT 1) AS booking_id,
             ARRAY_AGG(pq.quote_id ORDER BY pq.created_at) AS product_quote_ids,
             STRING_AGG(pq.estimate_number, ', ' ORDER BY pq.created_at) AS product_ests,
             SUM(pq.total_amount) AS amount
      FROM quotations pq
      JOIN quotations sq ON sq.quote_id = pq.linked_quote_id AND sq.quote_type = 'SERVICE'
      LEFT JOIN service_requests sr ON sr.request_id = sq.request_id
      WHERE pq.quote_type = 'PRODUCT' AND COALESCE(pq.status, '') <> 'REJECTED'
        AND EXISTS (SELECT 1 FROM quote_line_items li WHERE li.quote_id = pq.quote_id)
        AND (EXISTS (SELECT 1 FROM bookings b WHERE b.booking_id = sq.booking_id OR b.request_id = sq.request_id)
             OR EXISTS (SELECT 1 FROM payment_tracking p WHERE p.quote_id = sq.quote_id AND p.status = 'VERIFIED'))
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id = pq.quote_id AND i.category <> 'LINE_ITEM')
        AND NOT EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.quote_id = pq.quote_id)
      GROUP BY sq.quote_id, sq.estimate_number, sr.client_id, sq.client_id, sq.booking_id, sq.request_id
      ORDER BY MIN(pq.created_at)`)).rows;

    // Before figures for every client touched (a booking's client can differ from the request's).
    const bookingClient = {};
    for (const t of targets) {
      if (t.booking_id) bookingClient[t.service_quote_id] = (await pg.query(`SELECT client_id FROM bookings WHERE booking_id = $1`, [t.booking_id])).rows[0]?.client_id;
    }
    const clientOf = (t) => bookingClient[t.service_quote_id] || t.client_id;
    const clientIds = new Set(targets.map(clientOf).filter(Boolean));
    const before = {};
    for (const id of clientIds) before[id] = await snapshot(pg, id);

    for (const t of targets) {
      const row = { service: t.service_est, products: t.product_ests, amount: num(t.amount), booking: null, client_id: clientOf(t) };
      try {
        await pg.query('SAVEPOINT one_quote');
        const invoiceIds = [];
        row.documents_converted = 0;
        for (const pqId of t.product_quote_ids) row.documents_converted += await convertDocumentInvoice(pg, pqId, clientOf(t));

        if (t.booking_id) {
          const b = (await pg.query(`SELECT booking_code, status FROM bookings WHERE booking_id = $1`, [t.booking_id])).rows[0];
          row.booking = `${b.booking_code}/${b.status}`;
          // Accept, tie to the booking, pay from the booking's wallet money.
          const r = await attachLinkedProductsToBooking(pg, { serviceQuoteId: t.service_quote_id, bookingId: t.booking_id, actorUserId: null });
          if (r.warning) throw new Error(r.warning);
          row.drawn = r.drawn_from_wallet;
          const inv = await pg.query(`SELECT invoice_id FROM invoices WHERE quote_id = ANY($1::uuid[]) AND category = 'PRODUCT'`, [t.product_quote_ids]);
          inv.rows.forEach((x) => invoiceIds.push(x.invoice_id));

          // Date the charge when the booking started (never later than now), so the statement reads in order.
          const d = (await pg.query(
            `SELECT LEAST(COALESCE((start_date::text || ' 09:00:00+05:30')::timestamptz, created_at), NOW()) AS d FROM bookings WHERE booking_id = $1`,
            [t.booking_id]
          )).rows[0].d;
          await pg.query(`UPDATE invoices SET created_at = $2 WHERE invoice_id = ANY($1::uuid[])`, [invoiceIds, d]);
          await pg.query(
            `UPDATE transactions SET created_at = $2 WHERE transaction_id IN (SELECT charge_transaction_id FROM invoices WHERE invoice_id = ANY($1::uuid[]))`,
            [invoiceIds, d]
          );
        } else {
          // Not booked, but the client paid on the quotation. Invoice each product quotation on its own,
          // then pay from the wallet.
          let drawn = 0;
          for (const pqId of t.product_quote_ids) {
            if (!(await isProductQuoteAccepted(pg, pqId))) await acceptProductQuoteCore(pg, pqId, { actorUserId: null });
            const inv = await pg.query(`SELECT invoice_id, invoice_code FROM invoices WHERE quote_id = $1 AND category = 'PRODUCT'`, [pqId]);
            for (const i of inv.rows) {
              invoiceIds.push(i.invoice_id);
              drawn += await payInvoiceFromWallet(pg, { invoiceId: i.invoice_id, notes: `${i.invoice_code} — Products paid from client wallet balance` });
            }
          }
          row.drawn = num(drawn);
        }

        const st = await pg.query(`SELECT status FROM invoices WHERE invoice_id = ANY($1::uuid[])`, [invoiceIds]);
        row.invoices = invoiceIds.length;
        row.paid = st.rows.filter((x) => x.status === 'PAID').length;
        row.unpaid = st.rows.length - row.paid;
        await pg.query('RELEASE SAVEPOINT one_quote');
      } catch (err) {
        await pg.query('ROLLBACK TO SAVEPOINT one_quote');
        row.error = err.message;
        report.problems.push(`${t.service_est}: skipped, ${err.message}`);
      }
      report.rows.push(row);
    }

    const names = await pg.query(`SELECT client_profile_id, client_code, full_name FROM client_profiles WHERE client_profile_id = ANY($1::uuid[])`, [[...clientIds]]);
    for (const c of names.rows) {
      report.clients.push({ client: `${c.client_code || ''} ${c.full_name || ''}`.trim(), before: before[c.client_profile_id], after: await snapshot(pg, c.client_profile_id) });
    }

    // Nothing from this list may be left uninvoiced.
    report.still_uninvoiced = (await pg.query(`
      SELECT count(*)::int AS n FROM quotations pq JOIN quotations sq ON sq.quote_id = pq.linked_quote_id AND sq.quote_type = 'SERVICE'
      WHERE pq.quote_type = 'PRODUCT' AND COALESCE(pq.status, '') <> 'REJECTED'
        AND EXISTS (SELECT 1 FROM quote_line_items li WHERE li.quote_id = pq.quote_id)
        AND (EXISTS (SELECT 1 FROM bookings b WHERE b.booking_id = sq.booking_id OR b.request_id = sq.request_id)
             OR EXISTS (SELECT 1 FROM payment_tracking p WHERE p.quote_id = sq.quote_id AND p.status = 'VERIFIED'))
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id = pq.quote_id AND i.category <> 'LINE_ITEM')
        AND NOT EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.quote_id = pq.quote_id)`)).rows[0].n;

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
  report.rows.forEach((r) => {
    const k = r.error ? 'ERROR' : (r.booking ? `booking ${r.booking.split('/')[1]}` : 'no booking');
    by[k] = by[k] || { quotations: 0, rs: 0, paid_from_wallet: 0, invoices_paid: 0, invoices_unpaid: 0 };
    by[k].quotations++; by[k].rs += r.amount; by[k].paid_from_wallet += r.drawn || 0; by[k].invoices_paid += r.paid || 0; by[k].invoices_unpaid += r.unpaid || 0;
  });
  console.table(by);
  console.log('Per quotation:');
  report.rows.forEach((r) => console.log(`  ${r.service} ${(r.booking || 'no booking').padEnd(20)} Rs.${String(r.amount).padEnd(7)} ${r.error ? 'ERROR ' + r.error : `paid ${r.paid}, unpaid ${r.unpaid}, from wallet ${r.drawn || 0}`}`));
  console.log(`\nStill uninvoiced after this: ${report.still_uninvoiced}`);
  console.log('\nClients (Total Invoiced / Overdue / Wallet, before -> after):');
  report.clients.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after)).forEach((c) => {
    const f = (s) => `${s.invoiced} / ${s.overdue} / ${s.wallet}`;
    console.log(`  ${c.client.padEnd(36)} ${f(c.before)}  ->  ${f(c.after)}`);
  });
  if (report.problems.length) { console.log('\nProblems:'); report.problems.forEach((p) => console.log('  - ' + p)); }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  await db.pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
