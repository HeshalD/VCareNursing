// services/invoiceCancellation.js
// Cancels an UNPAID per-line product invoice (the Products page and the client's Invoices tab).
//
// What a cancel does, all in the caller's transaction:
//   - the invoice is removed, and its ledger charge goes with it (trigger trg_invoice_charge_cleanup),
//     so Total Invoiced, statements and Overdue drop by the amount;
//   - stock taken off when it was invoiced is put back;
//   - what was owed to the vendor for it is removed (refused if the vendor bill was already paid);
//   - the product line comes off its quotation, so nothing re-invoices it (a quotation left with no
//     lines is marked REJECTED);
//   - who / when / why is kept in invoice_cancellations.
// Anything that has money on it is refused: a paid or part-paid invoice must be refunded first. Rental
// invoices (cancel the rental agreement) and the older combined invoice are not cancelled here.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const refuse = (message, statusCode = 409) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const cancelProductInvoice = async (client, { invoice_id, reason, actorUserId = null, actorName = null }) => {
  const why = String(reason || '').trim();
  if (!why) throw refuse('A reason is required', 400);

  const invRes = await client.query(`SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE`, [invoice_id]);
  if (invRes.rows.length === 0) throw refuse('Invoice not found', 404);
  const invoice = invRes.rows[0];

  if (invoice.category !== 'PRODUCT') throw refuse('Only product invoices can be cancelled here. A rental is cancelled from its rental agreement.');
  if (!invoice.line_item_id) throw refuse('This older invoice covers several items together, so it cannot be cancelled on its own.');

  const paidRes = await client.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = $1`, [invoice_id]);
  const allocRes = await client.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM quote_line_item_payments WHERE line_item_id = $1`, [invoice.line_item_id]);
  const paid = round2(Number(paidRes.rows[0].paid) + Number(allocRes.rows[0].paid));
  if (invoice.status === 'PAID' || paid > 0.005) {
    throw refuse(`Rs.${paid.toLocaleString('en-LK', { minimumFractionDigits: 2 })} has already been paid on this invoice. Refund the client first, then cancel it.`);
  }

  const line = (await client.query(
    `SELECT li.*, p.vendor_id, p.name AS product_name FROM quote_line_items li LEFT JOIN products p ON p.product_id = li.product_id
     WHERE li.line_item_id = $1 FOR UPDATE OF li`,
    [invoice.line_item_id]
  )).rows[0];
  if (!line) throw refuse('The quotation line for this invoice is missing.');

  // What we owe the vendor for this sale: removed while unpaid, refused once any of it was paid.
  let removedVendorBills = 0;
  if (line.vendor_id) {
    const bills = (await client.query(
      `SELECT vb.vendor_bill_id, vb.status FROM vendor_bills vb
       WHERE vb.reference_id = $1 AND vb.product_id = $2 AND vb.source_type = 'PRODUCT_SALE'
       ORDER BY vb.created_at DESC`,
      [invoice.quote_id, line.product_id]
    )).rows;
    const unpaid = bills.find((b) => b.status === 'UNPAID');
    if (unpaid) {
      await client.query(`DELETE FROM vendor_bills WHERE vendor_bill_id = $1`, [unpaid.vendor_bill_id]);
      removedVendorBills = 1;
    } else if (bills.length > 0) {
      throw refuse('The vendor has already been paid for this item. Reverse that vendor payment first, then cancel the invoice.');
    }
  }

  // Stock back on the shelf (exactly what invoicing took off).
  const restored = Number(line.stock_deducted) || 0;
  if (restored > 0 && line.product_id) {
    await client.query(`UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + $2, updated_at = CURRENT_TIMESTAMP WHERE product_id = $1`, [line.product_id, restored]);
  }

  await client.query(
    `INSERT INTO invoice_cancellations (invoice_code, client_id, walk_in_customer_id, booking_id, quote_id, amount, description, reason, cancelled_by, cancelled_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [invoice.invoice_code, invoice.client_id, invoice.walk_in_customer_id, invoice.booking_id, invoice.quote_id,
      invoice.amount, line.description, why, actorUserId, actorName]
  );

  // The invoice (its ledger charge follows by trigger), then the line it billed.
  await client.query(`DELETE FROM invoices WHERE invoice_id = $1`, [invoice_id]);
  await client.query(`DELETE FROM quote_line_items WHERE line_item_id = $1`, [invoice.line_item_id]);

  const left = await client.query(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS n FROM quote_line_items WHERE quote_id = $1`, [invoice.quote_id]);
  await client.query(
    `UPDATE quotations SET sub_total = $2, total_amount = $2, updated_at = CURRENT_TIMESTAMP,
            status = CASE WHEN $3::int = 0 THEN 'REJECTED' ELSE status END
     WHERE quote_id = $1`,
    [invoice.quote_id, left.rows[0].total, left.rows[0].n]
  );

  return {
    invoice_id, invoice_code: invoice.invoice_code, quote_id: invoice.quote_id, client_id: invoice.client_id,
    amount: round2(invoice.amount), description: line.description, restored_stock: restored, removed_vendor_bills: removedVendorBills,
  };
};

module.exports = { cancelProductInvoice };
