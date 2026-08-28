// services/overdueInvoices.js
//
// Generic "invoiced but not yet paid" ledger shared across every invoice-
// producing flow in the system. Each row is created the moment an invoice is
// sent and resolved the moment that specific obligation is paid/waived.
// source_type identifies which flow created the row (currently only
// 'REGISTRATION_FEE'); source_id points at that flow's own invoice record
// (e.g. client_reg_fee_invoices.invoice_id) so future sources (daily/product/
// combined invoices) can plug in without changing this table.
//
// `client` is whatever has a .query(sql, params) method — either the shared
// db pool or a pg client mid-transaction — since callers span both (e.g.
// registrationFeeSplit.settleRegistrationFee runs inside a transaction).

async function createOverdueInvoice(client, { client_id, source_type, source_id = null, invoice_code = null, amount }) {
  await client.query(
    `INSERT INTO overdue_invoices (client_id, source_type, source_id, invoice_code, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [client_id, source_type, source_id, invoice_code, amount]
  );
}

// Resolves (marks RESOLVED) any still-OVERDUE rows matching client_id + source_type
// (and source_id, when given). Idempotent no-op if nothing matches.
async function resolveOverdueInvoices(client, { client_id, source_type, resolution, source_id = null }) {
  const params = [client_id, source_type, resolution];
  let query = `
    UPDATE overdue_invoices
    SET status = 'RESOLVED', resolution = $3, resolved_at = NOW()
    WHERE client_id = $1 AND source_type = $2 AND status = 'OVERDUE'`;
  if (source_id) {
    params.push(source_id);
    query += ` AND source_id = $${params.length}`;
  }
  await client.query(query, params);
}

module.exports = { createOverdueInvoice, resolveOverdueInvoices };
