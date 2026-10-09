// services/invoiceAmountEdits.js
// Restates the amount on a client invoice DOCUMENT — product/rental invoices,
// extra-charge (per line item) invoices and the combined quotation invoice — and
// marks it as edited (original_amount, edited_at, edited_by, edited_by_name,
// edit_reason, edit_count; same marker as transactions — see utils/editedAmount.js).
// Care-day invoices go through services/amountCorrections.js instead, and the
// registration fee through clientController.updateRegFeeAmount.
//
// None of these invoices is a ledger entry: raising one posts nothing to
// `transactions` — only the payments against it do. So an edit changes what the
// client owes, never money already received, and is refused below what has
// already been paid (that difference would be a refund, which is its own flow).
//
// ─── Which figure is edited ──────────────────────────────────────────────────
// • Product/rental invoice — the invoice's own amount. Its PDF lists the
//   quotation's items, so ensureInvoicePdf adds an "Amount adjustment" line for
//   the difference once an invoice carries an edit.
// • Extra charge / combined — the quotation's line items themselves, so the
//   quotation's total, its payment form, balances and every invoice built from it
//   stay consistent. A line item's own invoice follows its line; the combined
//   invoice PDF is regenerated (same invoice number) after commit.
//
// Registration-fee and rental lines on a quotation are not editable here — each
// has its own invoice with its own edit path.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const badRequest = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const parseAmount = (raw) => {
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) throw badRequest('Amount must be a number of 0 or more');
  return round2(n);
};

const requireReason = (reason) => {
  if (!reason || !String(reason).trim()) throw badRequest('A reason is required');
  return String(reason).trim();
};

const rs = (n) => `Rs.${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Stamps the edit marker on one invoice row. original_amount is captured only on
// the first edit, so it always holds the figure first invoiced.
const stampInvoice = async (client, invoice_id, { newAmount, fullyPaid, reason, actorUserId, actorName }) => {
  await client.query(
    `UPDATE invoices
     SET original_amount = COALESCE(original_amount, amount),
         amount          = $2,
         -- Settled by the new figure → PAID; a raised figure reopens a PAID invoice.
         status          = CASE WHEN $3::boolean THEN 'PAID'
                                WHEN status = 'PAID' THEN 'PENDING'
                                ELSE status END,
         paid_at         = CASE WHEN $3::boolean THEN COALESCE(paid_at, NOW()) ELSE NULL END,
         pdf_url         = NULL,
         edited_at       = NOW(),
         edited_by       = $4,
         edited_by_name  = $5,
         edit_reason     = $6,
         edit_count      = COALESCE(edit_count, 0) + 1
     WHERE invoice_id = $1`,
    [invoice_id, newAmount, fullyPaid, actorUserId, actorName, reason]
  );
};

// ─── Product / rental invoice ────────────────────────────────────────────────

/**
 * Must be called inside the caller's open transaction. Extra-charge invoices
 * (line_item_id set) are routed to editQuoteLineAmounts — their amount is the
 * quotation line item's.
 */
const editInvoiceAmount = async (client, { invoice_id, new_amount, reason, actorUserId = null, actorName = null }) => {
  const why = requireReason(reason);
  const newAmount = parseAmount(new_amount);

  const invRes = await client.query(`SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE`, [invoice_id]);
  if (invRes.rows.length === 0) throw badRequest('Invoice not found', 404);
  const invoice = invRes.rows[0];

  if (invoice.line_item_id) {
    const result = await editQuoteLineAmounts(client, {
      quote_id: invoice.quote_id,
      items: [{ line_item_id: invoice.line_item_id, new_amount: newAmount }],
      reason: why, actorUserId, actorName,
    });
    return { ...result, kind: 'EXTRA', invoice_id };
  }

  if (newAmount <= 0) throw badRequest('An invoice amount must be more than 0');

  const oldAmount = round2(invoice.amount);
  if (newAmount === oldAmount) return { changed: false, kind: 'PRODUCT', invoice_id, amount: oldAmount };

  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = $1`,
    [invoice_id]
  );
  const paid = round2(paidRes.rows[0].paid);
  if (newAmount < paid - 0.01) {
    throw badRequest(`${rs(paid)} has already been paid on this invoice, so the amount can't go below that. Refund the difference first.`, 409);
  }

  // A rental agreement's first invoice bundles its refundable deposit.
  if (invoice.rental_agreement_id) {
    const depRes = await client.query(
      `SELECT COALESCE(deposit_amount, 0) AS deposit FROM rental_agreements WHERE rental_agreement_id = $1`,
      [invoice.rental_agreement_id]
    );
    const deposit = round2(depRes.rows[0]?.deposit || 0);
    const firstRes = await client.query(
      `SELECT invoice_id FROM invoices WHERE rental_agreement_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [invoice.rental_agreement_id]
    );
    const bundlesDeposit = deposit > 0 && firstRes.rows[0]?.invoice_id === invoice_id;
    if (bundlesDeposit && newAmount < deposit) {
      throw badRequest(`This invoice includes a ${rs(deposit)} refundable deposit, so the amount can't go below that.`, 409);
    }
  }

  await stampInvoice(client, invoice_id, {
    newAmount, fullyPaid: paid >= newAmount - 0.01, reason: why, actorUserId, actorName,
  });

  return {
    changed: true, kind: 'PRODUCT', invoice_id, invoice_code: invoice.invoice_code,
    old_amount: oldAmount, new_amount: newAmount, delta: round2(newAmount - oldAmount),
    affected_invoice_ids: [invoice_id], combined_quote_id: null,
  };
};

// ─── Quotation line items (extra charges / combined invoice) ─────────────────

/**
 * Lines of a SERVICE quotation with what has already been paid against each,
 * for the combined-invoice editor. Read-only lines carry `locked` + why.
 */
const getQuoteLinesForEdit = async (client, quote_id) => {
  const quoteRes = await client.query(
    `SELECT quote_id, quote_type, estimate_number, total_amount, invoice_code,
            original_amount, edited_at, edited_by_name, edit_reason, edit_count
     FROM quotations WHERE quote_id = $1`,
    [quote_id]
  );
  if (quoteRes.rows.length === 0) throw badRequest('Quotation not found', 404);
  const quote = quoteRes.rows[0];
  if (quote.quote_type !== 'SERVICE') throw badRequest('Only service quotations are edited this way — edit the product invoice instead.', 409);

  const linesRes = await client.query(
    `SELECT li.line_item_id, li.item_type, li.description, li.quantity, li.unit_price, li.amount,
            li.is_registration_fee, li.rental_billing_type, li.sort_order,
            inv.invoice_id, inv.invoice_code,
            COALESCE((SELECT SUM(a.amount) FROM quote_line_item_payments a WHERE a.line_item_id = li.line_item_id), 0)
              + COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = inv.invoice_id), 0) AS allocated
     FROM quote_line_items li
     LEFT JOIN invoices inv ON inv.line_item_id = li.line_item_id
     WHERE li.quote_id = $1
     ORDER BY li.sort_order, li.created_at`,
    [quote_id]
  );
  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount_received), 0) AS paid FROM payment_tracking WHERE quote_id = $1 AND status = 'VERIFIED'`,
    [quote_id]
  );

  return {
    quote: { ...quote, total_amount: round2(quote.total_amount), amount_paid: round2(paidRes.rows[0].paid) },
    lines: linesRes.rows.map((l) => ({
      ...l,
      amount: round2(l.amount),
      allocated: round2(l.allocated),
      locked: l.is_registration_fee
        ? 'Registration fee — edit it from the registration invoice'
        : l.rental_billing_type ? 'Rental — edit its rental invoice' : null,
    })),
  };
};

/**
 * Restates one or more line items on a SERVICE quotation by amount and moves the
 * quotation's total by the net difference. `new_amount` is always the size of the
 * line — a DISCOUNT is entered as a positive figure and stored negative, as
 * quoteController.updateQuoteLineItems does. Must be called inside the caller's
 * open transaction.
 */
const editQuoteLineAmounts = async (client, { quote_id, items, reason, actorUserId = null, actorName = null }) => {
  const why = requireReason(reason);
  if (!Array.isArray(items) || items.length === 0) throw badRequest('No line items to change');

  const quoteRes = await client.query(`SELECT * FROM quotations WHERE quote_id = $1 FOR UPDATE`, [quote_id]);
  if (quoteRes.rows.length === 0) throw badRequest('Quotation not found', 404);
  const quote = quoteRes.rows[0];
  if (quote.quote_type !== 'SERVICE') {
    throw badRequest('This item belongs to a product quotation — edit its product invoice instead.', 409);
  }

  // Lock the lines + their invoices before reading what's been paid on them.
  await client.query(`SELECT 1 FROM quote_line_items WHERE quote_id = $1 FOR UPDATE`, [quote_id]);
  await client.query(
    `SELECT 1 FROM invoices WHERE line_item_id IN (SELECT line_item_id FROM quote_line_items WHERE quote_id = $1) FOR UPDATE`,
    [quote_id]
  );
  const { lines } = await getQuoteLinesForEdit(client, quote_id);
  const byId = new Map(lines.map((l) => [l.line_item_id, l]));

  let delta = 0;
  const changedLines = [];
  const affectedInvoiceIds = [];

  for (const item of items) {
    const line = byId.get(item.line_item_id);
    if (!line) throw badRequest('A line item does not belong to this quotation', 404);
    if (line.locked) throw badRequest(`"${line.description}": ${line.locked}.`, 409);

    const size = parseAmount(item.new_amount);
    const isDiscount = line.item_type === 'DISCOUNT';
    const newSigned = isDiscount ? -size : size;
    if (round2(newSigned) === line.amount) continue;
    if (!isDiscount && newSigned < line.allocated - 0.01) {
      throw badRequest(`"${line.description}": ${rs(line.allocated)} has already been paid towards it, so it can't go below that.`, 409);
    }

    const quantity = Number(line.quantity) || 1;
    await client.query(
      `UPDATE quote_line_items SET amount = $2, unit_price = $3 WHERE line_item_id = $1`,
      [line.line_item_id, newSigned, round2(Math.abs(newSigned) / quantity)]
    );
    delta = round2(delta + newSigned - line.amount);
    changedLines.push({ line_item_id: line.line_item_id, description: line.description, old_amount: line.amount, new_amount: newSigned });

    // The line's own extra-charge invoice follows it.
    if (line.invoice_id && !isDiscount) {
      await stampInvoice(client, line.invoice_id, {
        newAmount: newSigned, fullyPaid: line.allocated >= newSigned - 0.01, reason: why, actorUserId, actorName,
      });
      affectedInvoiceIds.push(line.invoice_id);
    }
  }

  if (changedLines.length === 0) return { changed: false, kind: 'COMBINED', quote_id };

  const oldTotal = round2(quote.total_amount);
  const newTotal = round2(oldTotal + delta);
  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount_received), 0) AS paid FROM payment_tracking WHERE quote_id = $1 AND status = 'VERIFIED'`,
    [quote_id]
  );
  const paid = round2(paidRes.rows[0].paid);
  if (newTotal < paid - 0.01) {
    throw badRequest(`${rs(paid)} has already been paid on this quotation, so its total can't go below that (this change would make it ${rs(newTotal)}).`, 409);
  }

  await client.query(
    `UPDATE quotations
     SET original_amount = COALESCE(original_amount, total_amount),
         sub_total       = sub_total + $2,
         total_amount    = $3,
         edited_at       = NOW(),
         edited_by       = $4,
         edited_by_name  = $5,
         edit_reason     = $6,
         edit_count      = COALESCE(edit_count, 0) + 1
     WHERE quote_id = $1`,
    [quote_id, delta, newTotal, actorUserId, actorName, why]
  );

  // Same sync paymentTrackingController.recordPayment does: the booking's
  // "quoted" figure follows the quotation's total.
  if (quote.booking_id) {
    await client.query(`UPDATE bookings SET amount_quotated = $2 WHERE booking_id = $1`, [quote.booking_id, newTotal]);
  } else if (quote.request_id) {
    await client.query(`UPDATE bookings SET amount_quotated = $2 WHERE request_id = $1`, [quote.request_id, newTotal]);
  }

  return {
    changed: true, kind: 'COMBINED', quote_id, estimate_number: quote.estimate_number,
    old_amount: oldTotal, new_amount: newTotal, delta,
    changed_lines: changedLines,
    affected_invoice_ids: affectedInvoiceIds,
    combined_quote_id: quote.invoice_code ? quote_id : null,
  };
};

module.exports = {
  editInvoiceAmount,
  editQuoteLineAmounts,
  getQuoteLinesForEdit,
  _internal: { round2, parseAmount },
};
