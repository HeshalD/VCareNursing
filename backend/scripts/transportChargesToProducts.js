#!/usr/bin/env node
// scripts/transportChargesToProducts.js
//
// One-off (2026-11-19). Two parts, run in ONE database transaction:
//
//  1. Back-fill: every existing product/rental invoice gets the ledger charge new
//     invoices now post (services/invoiceCharges.js), dated when it was issued, so
//     it counts in the client's Total Invoiced and shows on statements.
//
//  2. Transport: each transport custom charge on the quotation a live booking
//     (ACTIVE / OVERDUE / COMPLETED) was made from becomes a product sale:
//       - a linked PRODUCT quotation holding the "Transport Charges" product
//         (the line is moved off the service quotation, whose totals are re-derived),
//       - a PRODUCT invoice tied to the booking — an existing "Extra charge"
//         (LINE_ITEM) invoice for the line is converted in place so its INV number
//         stays the same,
//       - its ledger charge on the booking, dated the booking's start,
//       - settled per the agreed rules (see SETTLE below).
//
// Usage (dry run is the default — everything is rolled back and a report printed):
//   node scripts/transportChargesToProducts.js            # dry run
//   node scripts/transportChargesToProducts.js --apply    # commit
//   --json <file>  also writes the report as JSON
//
// Needs `npm run migrate` first (PRODUCT_INVOICE category + invoices.booking_id /
// charge_transaction_id).

const fs = require('fs');
const db = require('../config/db');
const { ensureInvoiceCharge, payInvoiceFromWallet, CHARGEABLE_CATEGORIES } = require('../services/invoiceCharges');
const { getClientFinancialTotals, bookingChargeSql, bookingSettledSql } = require('../services/clientFinancials');

const APPLY = process.argv.includes('--apply');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

// How each booking's transport is settled (agreed 2026-11-19):
//  WALLET       — the wallet still holds the money: draw it, client balance unchanged.
//  PAID_EARLIER — the client paid for transport, but that money already went on care
//                 days: the invoice is shown Paid and the booking's balance rises.
//  UNPAID       — never paid: the invoice stays unpaid and is owed on the booking.
//  COVERED      — the booking is already in credit from direct payments: shown Paid,
//                 no money moves (checked below; falls back to UNPAID if not true).
//  REVERSE_THEN_WALLET — a hand-made wallet adjustment already took the money
//                 (2026-11-13); it is reversed and replaced by a normal wallet draw.
const PLAN = [
  ['BK-00278', 'EST-5950', 'WALLET'],
  ['BK-00291', 'EST-7838', 'WALLET'],
  ['BK-00295', 'EST-4342', 'WALLET'],
  ['BK-00303', 'EST-3140', 'WALLET'],
  ['BK-00306', 'EST-5529', 'WALLET'],
  ['BK-00308', 'EST-6171', 'WALLET'],
  ['BK-00314', 'EST-2733', 'WALLET'],
  ['BK-00315', 'EST-7246', 'WALLET'],
  ['BK-00317', 'EST-3367', 'WALLET'],
  ['BK-00318', 'EST-9816', 'WALLET'],
  ['BK-00319', 'EST-3673', 'WALLET'],
  ['BK-00326', 'EST-5303', 'WALLET'],
  ['BK-00330', 'EST-3224', 'WALLET'],
  ['BK-00332', 'EST-6643', 'WALLET'],
  ['BK-00223', 'EST-5231', 'PAID_EARLIER'],
  ['BK-00232', 'EST-7045', 'PAID_EARLIER'],
  ['BK-00239', 'EST-1260', 'PAID_EARLIER'],
  ['BK-00292', 'EST-7373', 'PAID_EARLIER'],
  ['BK-00298', 'EST-4598', 'PAID_EARLIER'],
  ['BK-00305', 'EST-3156', 'PAID_EARLIER'],
  ['BK-00321', 'EST-1543', 'PAID_EARLIER'],
  ['BK-00280', 'EST-4987', 'UNPAID'],
  ['BK-00281', 'EST-3653', 'UNPAID'],
  ['BK-00299', 'EST-5809', 'UNPAID'],
  ['BK-00304', 'EST-2951', 'UNPAID'],
  // BK-00338 / EST-4753 (Rs.2,000) deliberately left out: completed before its
  // 27 Nov start with no care days billed, so the transport most likely never happened.
  ['BK-00285', 'EST-5270', 'COVERED'],
  ['BK-00313', 'EST-9108', 'COVERED'],
  ['BK-00289', 'EST-2698', 'REVERSE_THEN_WALLET'],
];
// The 2026-11-13 hand fix for BK-00289 (EST-2698 / INV-000041).
const KAREN_ADJUSTMENT_TX = 'f6df8e81-f078-46a5-a859-c0c340a7e94e';

const TRANSPORT_PRODUCT_NAME = 'Transport Charges';
const NOTE_TAG = 'transport-to-product 2026-11-19';
const num = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100;

async function uniqueEstimateNumber(pg) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const digits = attempt < 25 ? 4 : 5;
    const min = Math.pow(10, digits - 1);
    const candidate = `EST-${Math.floor(min + Math.random() * 9 * min)}`;
    const { rows } = await pg.query('SELECT 1 FROM quotations WHERE estimate_number = $1', [candidate]);
    if (rows.length === 0) return candidate;
  }
  throw new Error('Could not generate a unique estimate number');
}

async function bookingBalance(pg, bookingId) {
  const r = await pg.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE ${bookingChargeSql()}), 0) AS charged,
            COALESCE(SUM(amount) FILTER (WHERE ${bookingSettledSql()}), 0) AS settled
     FROM transactions WHERE booking_id = $1`,
    [bookingId]
  );
  return { charged: num(r.rows[0].charged), settled: num(r.rows[0].settled), owed: num(r.rows[0].charged - r.rows[0].settled) };
}

async function clientSnapshot(pg, clientId) {
  const t = await getClientFinancialTotals(clientId);
  const w = await pg.query(`SELECT COALESCE(wallet_balance, 0) AS w FROM client_profiles WHERE client_profile_id = $1`, [clientId]);
  return { invoiced: num(t.totalInvoiced), paid: num(t.totalPaid), balance_due: num(t.balanceDue), wallet: num(w.rows[0]?.w) };
}

async function main() {
  const pg = await db.pool.connect();
  // Everything below — including getClientFinancialTotals, which uses db.query —
  // runs on this one connection, so the dry run sees its own uncommitted work.
  const realQuery = db.query;
  db.query = (text, params) => pg.query(text, params);

  const report = { mode: APPLY ? 'APPLY' : 'DRY RUN', backfill: [], transport: [], problems: [] };
  try {
    await pg.query('BEGIN');
    // Labels the wallet-movement audit rows this script causes (trg_log_client_wallet_change).
    await pg.query(`SET LOCAL application_name = 'transport-invoicing'`);

    const cat = await pg.query(`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'transaction_category' AND e.enumlabel = 'PRODUCT_INVOICE'`);
    const col = await pg.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'charge_transaction_id'`);
    if (!cat.rows.length || !col.rows.length) throw new Error('Run `npm run migrate` first (PRODUCT_INVOICE / invoices.charge_transaction_id missing).');

    const productRes = await pg.query(`SELECT product_id, name, price, cost_price FROM products WHERE name = $1`, [TRANSPORT_PRODUCT_NAME]);
    if (productRes.rows.length !== 1) throw new Error(`Expected exactly one "${TRANSPORT_PRODUCT_NAME}" product, found ${productRes.rows.length}`);
    const product = productRes.rows[0];

    // Clients touched, for the before/after table.
    const clientIds = new Set();
    const bookingRows = {};
    for (const [code] of PLAN) {
      const b = await pg.query(`SELECT * FROM bookings WHERE booking_code = $1`, [code]);
      if (!b.rows[0]) throw new Error(`Booking ${code} not found`);
      bookingRows[code] = b.rows[0];
      clientIds.add(b.rows[0].client_id);
    }
    const backfillTargets = await pg.query(
      `SELECT invoice_id, invoice_code, client_id, category, amount, created_at FROM invoices
       WHERE client_id IS NOT NULL AND category = ANY($1::text[]) AND charge_transaction_id IS NULL
       ORDER BY created_at`,
      [CHARGEABLE_CATEGORIES]
    );
    backfillTargets.rows.forEach((r) => clientIds.add(r.client_id));

    const before = {};
    for (const id of clientIds) before[id] = await clientSnapshot(pg, id);

    // ── Part 1: back-fill existing product/rental invoices ──────────────────────
    for (const inv of backfillTargets.rows) {
      const chargeId = await ensureInvoiceCharge(pg, inv.invoice_id);
      report.backfill.push({ invoice: inv.invoice_code, category: inv.category, amount: num(inv.amount), dated: inv.created_at, charge_tx: chargeId });
    }

    // ── Part 2: transport charges → product invoices ────────────────────────────
    for (const [bookingCode, estimate, mode] of PLAN) {
      const booking = bookingRows[bookingCode];
      const row = { booking: bookingCode, estimate, mode, status: booking.status };
      try {
        await pg.query('SAVEPOINT one_booking');
        if (!['ACTIVE', 'OVERDUE', 'COMPLETED'].includes(booking.status)) throw new Error(`booking is ${booking.status}`);

        const sqRes = await pg.query(`SELECT * FROM quotations WHERE estimate_number = $1 AND quote_type = 'SERVICE' FOR UPDATE`, [estimate]);
        const sq = sqRes.rows[0];
        if (!sq) throw new Error(`service quotation ${estimate} not found`);

        const liRes = await pg.query(
          `SELECT * FROM quote_line_items
           WHERE quote_id = $1 AND item_type = 'CHARGE' AND is_registration_fee = false AND item_subtype IS NULL
             AND (description ILIKE '%trans%' OR description ILIKE '%trasport%')`,
          [sq.quote_id]
        );
        if (liRes.rows.length !== 1) throw new Error(`expected 1 transport line on ${estimate}, found ${liRes.rows.length}`);
        const line = liRes.rows[0];
        const amount = num(line.amount);
        row.amount = amount;
        row.client_id = booking.client_id;

        const owedBefore = await bookingBalance(pg, booking.booking_id);
        row.booking_owed_before = owedBefore.owed;

        // Paid toward this line through the quotation's payment form, and when.
        const allocRes = await pg.query(
          `SELECT COALESCE(SUM(a.amount), 0) AS paid, MAX(COALESCE(p.payment_date, p.verified_at)) AS last_paid_at
           FROM quote_line_item_payments a JOIN payment_tracking p ON p.payment_id = a.payment_id
           WHERE a.line_item_id = $1`,
          [line.line_item_id]
        );
        row.allocated_paid = num(allocRes.rows[0].paid);

        // The booking's start (09:00 Sri Lanka time), built in SQL so the DATE isn't
        // shifted by the server's timezone, and never later than now.
        const dateRes = await pg.query(
          `SELECT LEAST(COALESCE((start_date::text || ' 09:00:00+05:30')::timestamptz, created_at), NOW()) AS d
           FROM bookings WHERE booking_id = $1`,
          [booking.booking_id]
        );
        const chargeDate = dateRes.rows[0].d.toISOString();

        // 1. The product quotation. Linked to the service quotation (so the payment form
        //    and combined invoice pick it up) unless that one already has a product quote.
        const linkedRes = await pg.query(`SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`, [sq.quote_id]);
        const linkTo = linkedRes.rows.length === 0 ? sq.quote_id : null;
        const pqRes = await pg.query(
          `INSERT INTO quotations (
             estimate_number, daily_rate, qty_days, transport_fee, sub_total, total_amount, status, quote_type,
             client_id, booking_id, linked_quote_id, terms_conditions, estimate_date, created_at
           ) VALUES ($1, 0, 1, 0, $2, $2, 'ACCEPTED', 'PRODUCT', $3, $4, $5, $6, ($7::timestamptz AT TIME ZONE 'Asia/Colombo')::date, $7::timestamptz)
           RETURNING quote_id, estimate_number`,
          [await uniqueEstimateNumber(pg), amount, booking.client_id, booking.booking_id, linkTo,
            `Transport for booking ${bookingCode} (from quotation ${estimate}).`, chargeDate]
        );
        const pq = pqRes.rows[0];
        row.product_quote = pq.estimate_number;
        row.linked = Boolean(linkTo);

        // 2. Move the line onto it as the Transport Charges product. Same row, so its
        //    payment history (quote_line_item_payments) stays attached.
        await pg.query(
          `UPDATE quote_line_items
           SET quote_id = $2, item_type = 'PRODUCT', product_id = $3, description = $4,
               cost_price_snapshot = $5, sort_order = 0
           WHERE line_item_id = $1`,
          [line.line_item_id, pq.quote_id, product.product_id, product.name, product.cost_price]
        );

        // 3. Re-derive the service quotation's totals without it (as removing a custom charge does).
        await pg.query(
          `UPDATE quotations q
           SET sub_total = t.total, total_amount = t.total, transport_fee = t.transport, updated_at = CURRENT_TIMESTAMP
           FROM (
             SELECT COALESCE(SUM(amount), 0) AS total,
                    COALESCE((SELECT amount FROM quote_line_items
                              WHERE quote_id = $1 AND LOWER(description) LIKE '%transport%'
                              ORDER BY sort_order LIMIT 1), 0) AS transport
             FROM quote_line_items WHERE quote_id = $1
           ) t
           WHERE q.quote_id = $1`,
          [sq.quote_id]
        );

        // 4. The product invoice — convert the line's "Extra charge" invoice if it has one.
        const existingInv = await pg.query(`SELECT * FROM invoices WHERE line_item_id = $1 FOR UPDATE`, [line.line_item_id]);
        let invoice;
        if (existingInv.rows[0]) {
          const r = await pg.query(
            `UPDATE invoices
             SET category = 'PRODUCT', quote_id = $2, line_item_id = NULL, booking_id = $3,
                 client_id = $4, amount = $5, pdf_url = NULL
             WHERE invoice_id = $1 RETURNING *`,
            [existingInv.rows[0].invoice_id, pq.quote_id, booking.booking_id, booking.client_id, amount]
          );
          invoice = r.rows[0];
          row.invoice_action = 'converted';
        } else {
          const r = await pg.query(
            `INSERT INTO invoices (category, client_id, quote_id, booking_id, amount, status, created_at)
             VALUES ('PRODUCT', $1, $2, $3, $4, 'PENDING', $5::timestamptz) RETURNING *`,
            [booking.client_id, pq.quote_id, booking.booking_id, amount, chargeDate]
          );
          invoice = r.rows[0];
          row.invoice_action = 'created';
        }
        row.invoice = invoice.invoice_code;

        // 5. Its charge on the booking.
        await ensureInvoiceCharge(pg, invoice.invoice_id, { chargeDate });

        // 6. Settle.
        let settleMode = mode;
        if (mode === 'COVERED') {
          const after = await bookingBalance(pg, booking.booking_id);
          if (after.owed > 0.005) {
            settleMode = 'UNPAID';
            report.problems.push(`${bookingCode}: expected the booking's credit to cover transport, but it now owes ${after.owed} — left unpaid.`);
          }
        }
        if (mode === 'REVERSE_THEN_WALLET') {
          const adj = await pg.query(`SELECT * FROM transactions WHERE transaction_id = $1`, [KAREN_ADJUSTMENT_TX]);
          const a = adj.rows[0];
          if (!a || a.category !== 'WALLET_ADJUSTMENT' || a.transaction_type !== 'DEBIT' || num(a.amount) !== amount) {
            throw new Error('the 2026-11-13 wallet adjustment was not found as expected');
          }
          await pg.query(
            `UPDATE client_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE client_profile_id = $2`,
            [amount, booking.client_id]
          );
          await pg.query(
            `INSERT INTO transactions (client_id, quote_id, category, transaction_type, amount, status, notes, created_at)
             VALUES ($1, $2, 'WALLET_ADJUSTMENT', 'CREDIT', $3, 'COMPLETED', $4, NOW())`,
            [booking.client_id, sq.quote_id, amount,
              `Reverses the 2026-11-13 transport wallet adjustment — transport is now invoice ${invoice.invoice_code}, paid from the wallet below (${NOTE_TAG})`]
          );
          settleMode = 'WALLET';
        }

        if (settleMode === 'WALLET') {
          const drawn = await payInvoiceFromWallet(pg, {
            invoiceId: invoice.invoice_id,
            notes: `${invoice.invoice_code} — Transport (${bookingCode}) paid from client wallet balance`,
          });
          row.drawn_from_wallet = drawn;
          if (drawn < amount - 0.005) report.problems.push(`${bookingCode}: wallet covered only ${drawn} of ${amount}; the rest is left unpaid.`);
        } else if (settleMode === 'PAID_EARLIER' || settleMode === 'COVERED') {
          const paidAt = settleMode === 'PAID_EARLIER' && allocRes.rows[0].last_paid_at ? allocRes.rows[0].last_paid_at : chargeDate;
          await pg.query(`UPDATE invoices SET status = 'PAID', paid_at = $2::timestamptz WHERE invoice_id = $1`, [invoice.invoice_id, paidAt]);
          if (settleMode === 'PAID_EARLIER' && row.allocated_paid < amount - 0.005) {
            report.problems.push(`${bookingCode}: marked Paid but only ${row.allocated_paid} of ${amount} was allocated to transport on the quotation.`);
          }
        }
        row.settled_as = settleMode;

        const inv = await pg.query(`SELECT status FROM invoices WHERE invoice_id = $1`, [invoice.invoice_id]);
        row.invoice_status = inv.rows[0].status;
        row.booking_owed_after = (await bookingBalance(pg, booking.booking_id)).owed;
        await pg.query('RELEASE SAVEPOINT one_booking');
      } catch (err) {
        await pg.query('ROLLBACK TO SAVEPOINT one_booking');
        row.error = err.message;
        report.problems.push(`${bookingCode}: skipped — ${err.message}`);
      }
      report.transport.push(row);
    }

    // ── Before / after per client ───────────────────────────────────────────────
    const names = await pg.query(
      `SELECT client_profile_id, client_code, full_name FROM client_profiles WHERE client_profile_id = ANY($1::uuid[])`,
      [[...clientIds]]
    );
    report.clients = [];
    for (const c of names.rows) {
      const after = await clientSnapshot(pg, c.client_profile_id);
      report.clients.push({ client: `${c.client_code || ''} ${c.full_name || ''}`.trim(), before: before[c.client_profile_id], after });
    }

    if (APPLY && report.transport.every((r) => !r.error)) {
      await pg.query('COMMIT');
      report.result = 'COMMITTED';
    } else {
      await pg.query('ROLLBACK');
      report.result = APPLY ? 'ROLLED BACK — a booking failed, nothing was written' : 'ROLLED BACK (dry run)';
    }
  } catch (err) {
    await pg.query('ROLLBACK').catch(() => {});
    report.result = `ROLLED BACK — ${err.message}`;
  } finally {
    db.query = realQuery;
    pg.release();
  }

  printReport(report);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  await db.pool.end();
}

function printReport(r) {
  console.log(`\n=== ${r.mode} — ${r.result} ===\n`);
  console.log(`Back-filled product/rental invoice charges: ${r.backfill.length}`);
  r.backfill.forEach((b) => console.log(`  ${b.invoice} ${b.category} ${b.amount}`));
  console.log('\nTransport:');
  for (const t of r.transport) {
    if (t.error) { console.log(`  ${t.booking} ${t.estimate} ERROR ${t.error}`); continue; }
    console.log(`  ${t.booking} ${t.status.padEnd(9)} ${t.estimate} -> ${t.product_quote}${t.linked ? '' : ' (unlinked)'} ${t.invoice} ${t.invoice_action.padEnd(9)} `
      + `Rs.${t.amount} ${t.settled_as.padEnd(12)} invoice=${t.invoice_status} drawn=${t.drawn_from_wallet || 0} booking owed ${t.booking_owed_before} -> ${t.booking_owed_after}`);
  }
  console.log('\nClients (invoiced / paid / balance due / wallet):');
  for (const c of r.clients || []) {
    const f = (s) => `${s.invoiced} / ${s.paid} / ${s.balance_due} / ${s.wallet}`;
    console.log(`  ${c.client.padEnd(34)} ${f(c.before)}  ->  ${f(c.after)}`);
  }
  if (r.problems.length) {
    console.log('\nProblems:');
    r.problems.forEach((p) => console.log(`  - ${p}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
