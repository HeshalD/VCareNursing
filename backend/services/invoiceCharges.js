// services/invoiceCharges.js
// Puts product and rental invoices on the client's ledger.
//
// A client's Total Invoiced, overdue figures and statements are built only from
// ledger DEBITs in `transactions` (services/clientFinancials.js,
// statementController.buildStatementPayload). Before this, issuing a product or
// rental invoice posted nothing there; only its payments (PRODUCT_SALE /
// RENTAL_PAYMENT credits) reached the ledger, so statements showed money in with no
// matching charge. Every chargeable invoice now carries one PRODUCT_INVOICE DEBIT,
// linked from invoices.charge_transaction_id.
//
// PRODUCT_INVOICE is an accrual record, not money moving: it is NEUTRAL for cash
// flow (utils/transactionFlow.js) and is not part of the P&L, which keeps counting
// product revenue on collection (PRODUCT_SALE / RENTAL_PAYMENT credits).
//
// When the invoice belongs to a booking (invoices.booking_id), the charge carries
// that booking too, so it counts towards the booking's own invoiced / overdue
// figures exactly like a care day.
//
// Deleting an invoice removes its charge (trigger trg_invoice_charge_cleanup in
// migrate.js), so no code path can leave an orphaned charge behind.
//
// Every function here must run inside the caller's open transaction.

const { getEarmarkedTotal, takeFromWallet } = require('./walletService');

const CHARGE_CATEGORY = 'PRODUCT_INVOICE';
// Invoice categories that bill the client. LINE_ITEM invoices are documents for
// one line of a quotation; the money for those is handled through the quotation.
const CHARGEABLE_CATEGORIES = ['PRODUCT', 'RENTAL_ONE_TIME', 'RENTAL_RECURRING'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// What the invoice is for, in a few words, for the statement's Details column.
// Mirrors invoiceController.listInvoices' item_summary.
async function describeInvoice(client, invoice) {
  if (invoice.rental_agreement_id) {
    const res = await client.query(
      `SELECT p.name, ru.unit_code
       FROM rental_agreements ra
       JOIN products p ON p.product_id = ra.product_id
       LEFT JOIN rental_units ru ON ru.unit_id = ra.unit_id
       WHERE ra.rental_agreement_id = $1`,
      [invoice.rental_agreement_id]
    );
    const r = res.rows[0];
    if (r) return r.unit_code ? `${r.name} (Unit ${r.unit_code}) rental` : `${r.name} rental`;
    return 'Rental';
  }
  // An invoice for one product line is described by that line alone.
  if (invoice.line_item_id) {
    const own = await client.query(`SELECT description FROM quote_line_items WHERE line_item_id = $1`, [invoice.line_item_id]);
    if (own.rows[0]?.description) return own.rows[0].description;
  }
  if (invoice.quote_id) {
    const res = await client.query(
      `SELECT STRING_AGG(li.description, ', ' ORDER BY li.sort_order) AS items
       FROM quote_line_items li
       WHERE li.quote_id = $1 AND li.is_registration_fee = false AND li.rental_billing_type IS NULL
         -- Items invoiced on their own are billed by that invoice, not this one.
         AND NOT EXISTS (SELECT 1 FROM invoices x WHERE x.line_item_id = li.line_item_id AND x.category = 'LINE_ITEM')`,
      [invoice.quote_id]
    );
    if (res.rows[0]?.items) return res.rows[0].items;
  }
  return 'Products';
}

const chargeNotes = (invoice, summary) => `${invoice.invoice_code} — ${summary}`;

/**
 * Makes sure an invoice has exactly the ledger charge it should have.
 *  - Chargeable invoice for a client, no charge yet → posts one, dated `chargeDate`
 *    (default: when the invoice was issued).
 *  - Charge already there → keeps its amount and booking in step with the invoice.
 *  - Not chargeable (walk-in customer, LINE_ITEM document) → removes any charge.
 * Returns the charge transaction id, or null.
 */
async function ensureInvoiceCharge(client, invoiceId, { chargeDate = null } = {}) {
  const invRes = await client.query(`SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE`, [invoiceId]);
  const invoice = invRes.rows[0];
  if (!invoice) return null;

  const chargeable = Boolean(invoice.client_id) && CHARGEABLE_CATEGORIES.includes(invoice.category);

  if (!chargeable) {
    if (invoice.charge_transaction_id) {
      await client.query(`UPDATE invoices SET charge_transaction_id = NULL WHERE invoice_id = $1`, [invoiceId]);
      await client.query(`DELETE FROM transactions WHERE transaction_id = $1`, [invoice.charge_transaction_id]);
    }
    return null;
  }

  if (invoice.charge_transaction_id) {
    await client.query(
      `UPDATE transactions
       SET amount = $2, booking_id = $3, client_id = $4
       WHERE transaction_id = $1 AND (amount <> $2 OR booking_id IS DISTINCT FROM $3 OR client_id IS DISTINCT FROM $4)`,
      [invoice.charge_transaction_id, invoice.amount, invoice.booking_id || null, invoice.client_id]
    );
    return invoice.charge_transaction_id;
  }

  const summary = await describeInvoice(client, invoice);
  const txRes = await client.query(
    `INSERT INTO transactions (
       client_id, booking_id, quote_id, category, transaction_type, amount,
       status, notes, verified_by, created_at
     ) VALUES ($1, $2, $3, $4, 'DEBIT', $5, 'COMPLETED', $6, $7, COALESCE($8::timestamptz, $9::timestamptz, NOW()))
     RETURNING transaction_id`,
    [
      invoice.client_id, invoice.booking_id || null, invoice.quote_id || null, CHARGE_CATEGORY,
      invoice.amount, chargeNotes(invoice, summary), invoice.created_by || null,
      chargeDate, invoice.created_at,
    ]
  );
  const chargeId = txRes.rows[0].transaction_id;
  await client.query(`UPDATE invoices SET charge_transaction_id = $1 WHERE invoice_id = $2`, [chargeId, invoiceId]);
  return chargeId;
}

/**
 * Restates an invoice's charge after an amount edit, carrying the same "edited"
 * marker care-day corrections use (services/amountCorrections.js), so the statement
 * shows the change. Posts the charge first if the invoice somehow has none.
 */
async function restateInvoiceCharge(client, invoiceId, { reason = null, actorUserId = null, actorName = null } = {}) {
  const invRes = await client.query(`SELECT invoice_id, amount, charge_transaction_id FROM invoices WHERE invoice_id = $1`, [invoiceId]);
  const invoice = invRes.rows[0];
  if (!invoice) return null;
  if (!invoice.charge_transaction_id) return ensureInvoiceCharge(client, invoiceId);

  await client.query(
    `UPDATE transactions
     SET original_amount = COALESCE(original_amount, amount),
         amount          = $2,
         edited_at       = NOW(),
         edited_by       = $3,
         edited_by_name  = $4,
         edit_reason     = $5,
         edit_count      = COALESCE(edit_count, 0) + 1
     WHERE transaction_id = $1 AND amount <> $2`,
    [invoice.charge_transaction_id, invoice.amount, actorUserId, actorName, reason]
  );
  return invoice.charge_transaction_id;
}

/**
 * Pays an invoice out of the client's wallet, the way a care day is paid: the
 * booking's own reserved money first, then unreserved money, never another
 * booking's reservation (see services/walletService.js). Posts a PRODUCT_SALE
 * CREDIT with payment_method WALLET (a wallet draw, not new money — Payments Made
 * already excludes WALLET), records it against the invoice and marks the invoice
 * PAID once covered. Returns the amount drawn (0 when the wallet has nothing free).
 */
async function payInvoiceFromWallet(client, { invoiceId, maxAmount = null, verified_by = null, notes = null, ledgerTimestamp = null, allowOtherEarmarks = false, outcome = null }) {
  const invRes = await client.query(`SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE`, [invoiceId]);
  const invoice = invRes.rows[0];
  if (!invoice || !invoice.client_id || invoice.status === 'PAID') return 0;

  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = $1`, [invoiceId]
  );
  const due = round2(parseFloat(invoice.amount) - parseFloat(paidRes.rows[0].paid));
  const wanted = round2(Math.min(due, maxAmount == null ? due : maxAmount));
  if (wanted <= 0.005) return 0;

  // Which money is spent (own reservation, unreserved, and only with the override other bookings')
  // is decided in one place — see walletService.takeFromWallet.
  const taken = await takeFromWallet(client, {
    client_id: invoice.client_id, booking_id: invoice.booking_id || null, amount: wanted, allowOtherEarmarks,
  });
  if (outcome) Object.assign(outcome, taken);
  const draw = taken.drawn;
  if (draw <= 0.005) return 0;


  const finalNotes = notes || `${invoice.invoice_code} — paid from client wallet balance`;
  const txRes = await client.query(
    `INSERT INTO transactions (
       client_id, booking_id, quote_id, category, transaction_type, amount, payment_method,
       status, notes, verified_by, created_at
     ) VALUES ($1, $2, $3, 'PRODUCT_SALE', 'CREDIT', $4, 'WALLET', 'COMPLETED', $5, $6, COALESCE($7::timestamptz, NOW()))
     RETURNING transaction_id`,
    [invoice.client_id, invoice.booking_id || null, invoice.quote_id || null, draw, finalNotes, verified_by, ledgerTimestamp]
  );
  const transaction_id = txRes.rows[0].transaction_id;
  if (outcome) outcome.transaction_id = transaction_id;

  await client.query(
    `INSERT INTO invoice_payments (invoice_id, transaction_id, amount, payment_method, notes, verified_by)
     VALUES ($1, $2, $3, 'WALLET', $4, $5)`,
    [invoiceId, transaction_id, draw, finalNotes, verified_by]
  );

  // A booking-linked invoice is part of the booking's account, so its payment counts
  // towards the booking's amount_paid like any other draw.
  if (invoice.booking_id) {
    await client.query(
      `INSERT INTO booking_payment_tracking (
         booking_id, client_id, amount_received, payment_method, notes, status, verified_at, verified_by
       ) VALUES ($1, $2, $3, 'WALLET', $4, 'VERIFIED', NOW(), $5)`,
      [invoice.booking_id, invoice.client_id, draw, finalNotes, verified_by]
    );
    await client.query(
      `UPDATE bookings
       SET amount_paid = (SELECT COALESCE(SUM(amount_received), 0) FROM booking_payment_tracking
                          WHERE booking_id = $1 AND status = 'VERIFIED')
       WHERE booking_id = $1`,
      [invoice.booking_id]
    );
  }

  if (draw >= due - 0.01) {
    await client.query(
      `UPDATE invoices SET status = 'PAID', transaction_id = $1, paid_at = COALESCE($3::timestamptz, NOW()) WHERE invoice_id = $2`,
      [transaction_id, invoiceId, ledgerTimestamp]
    );
  }
  return draw;
}

/**
 * Ties a product quotation (typically the companion of a service quotation, e.g.
 * its transport) and its PRODUCT invoice to a booking, so the invoice's charge
 * counts on that booking's account. Rental invoices stay client-level: a rental
 * runs on its own schedule, independent of the care booking.
 * Returns the ids of the invoices it tied.
 */
async function linkProductQuoteToBooking(client, { productQuoteId, bookingId }) {
  await client.query(
    `UPDATE quotations SET booking_id = $2 WHERE quote_id = $1 AND booking_id IS NULL`,
    [productQuoteId, bookingId]
  );
  const res = await client.query(
    `UPDATE invoices SET booking_id = $2
     WHERE quote_id = $1 AND category = 'PRODUCT' AND booking_id IS NULL
     RETURNING invoice_id, client_id`,
    [productQuoteId, bookingId]
  );
  for (const { invoice_id, client_id } of res.rows) {
    await ensureInvoiceCharge(client, invoice_id);
    // Money already paid on the invoice moves with it, so the booking is credited for what its
    // charge now debits. Otherwise a paid invoice would make the booking look unpaid.
    const paid = await client.query(
      `SELECT ip.transaction_id, ip.amount, ip.payment_method, ip.notes
       FROM invoice_payments ip JOIN transactions t ON t.transaction_id = ip.transaction_id
       WHERE ip.invoice_id = $1 AND t.booking_id IS NULL`,
      [invoice_id]
    );
    for (const pmt of paid.rows) {
      await client.query(`UPDATE transactions SET booking_id = $2 WHERE transaction_id = $1`, [pmt.transaction_id, bookingId]);
      await client.query(
        `INSERT INTO booking_payment_tracking (booking_id, client_id, amount_received, payment_method, notes, status, verified_at)
         VALUES ($1, $2, $3, $4, $5, 'VERIFIED', NOW())`,
        [bookingId, client_id, pmt.amount, pmt.payment_method, pmt.notes]
      );
    }
    if (paid.rows.length > 0) {
      await client.query(
        `UPDATE bookings SET amount_paid = (SELECT COALESCE(SUM(amount_received), 0) FROM booking_payment_tracking
                                            WHERE booking_id = $1 AND status = 'VERIFIED') WHERE booking_id = $1`,
        [bookingId]
      );
    }
  }
  return res.rows.map((r) => r.invoice_id);
}

/**
 * Pays a booking's unpaid product invoices (oldest first) out of the wallet money
 * available to that booking. Called before the booking's other outstanding charges
 * are settled from the wallet, so a product invoice (e.g. transport) is shown paid
 * rather than its charge being covered anonymously. Returns the amount drawn.
 */
async function payBookingProductInvoicesFromWallet(client, { booking_id, verified_by = null }) {
  if (!booking_id) return 0;
  const res = await client.query(
    `SELECT invoice_id FROM invoices
     WHERE booking_id = $1 AND category = ANY($2::text[]) AND status <> 'PAID' AND charge_transaction_id IS NOT NULL
     ORDER BY created_at`,
    [booking_id, CHARGEABLE_CATEGORIES]
  );
  let drawn = 0;
  for (const { invoice_id } of res.rows) {
    drawn += await payInvoiceFromWallet(client, { invoiceId: invoice_id, verified_by });
  }
  return round2(drawn);
}

module.exports = {
  CHARGE_CATEGORY,
  CHARGEABLE_CATEGORIES,
  describeInvoice,
  ensureInvoiceCharge,
  restateInvoiceCharge,
  payInvoiceFromWallet,
  linkProductQuoteToBooking,
  payBookingProductInvoicesFromWallet,
};
