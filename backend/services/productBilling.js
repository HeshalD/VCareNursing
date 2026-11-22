// services/productBilling.js
// The one definition of "what is still waiting to be invoiced" on a product quotation, shared by the
// quotation code (controllers/quoteController.js) and the Ledger Health check, so they cannot disagree.
//
// Every non-rental product line (and every standalone refundable deposit) is billed by its OWN invoice;
// a rental line is billed by its rental agreement. Older quotations were billed with ONE combined
// invoice covering all their non-rental lines (invoices.line_item_id is NULL); that still counts as
// billing every such line. A document-only invoice (category LINE_ITEM) never counts as billing.

// SQL listing the line_item_ids still unbilled on the quotation `quoteRef` (a SQL expression: a
// parameter like '$1' or a column like 'pq.quote_id').
const unbilledLinesSql = (quoteRef) => (`
    SELECT li.line_item_id
    FROM quote_line_items li
    LEFT JOIN products p ON p.product_id = li.product_id
    WHERE li.quote_id = QUOTE_REF AND li.item_type IN ('PRODUCT', 'DEPOSIT') AND COALESCE(li.amount, 0) > 0
      AND COALESCE(p.product_type::text, '') <> 'RENTAL' AND li.rental_billing_type IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.category <> 'LINE_ITEM'
          AND (i.line_item_id = li.line_item_id
               OR (i.line_item_id IS NULL AND i.category = 'PRODUCT' AND i.quote_id = li.quote_id)))
    UNION ALL
    SELECT li.line_item_id
    FROM quote_line_items li
    JOIN products p ON p.product_id = li.product_id AND p.product_type::text = 'RENTAL'
    WHERE li.quote_id = QUOTE_REF AND NOT EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.quote_id = li.quote_id)`).split('QUOTE_REF').join(quoteRef);

// The status of a product sale (one product quotation), worked out from its invoices. Both the Products
// page and the client page read it from the server so they always agree.
//   PENDING_ACCEPTANCE  nothing invoiced yet            PARTLY_INVOICED  some lines still have no invoice
//   UNPAID / PART_PAID / PAID  by what has been paid against the invoiced amount
//   REJECTED            rejected (or its service quotation was) and never invoiced
// `row` carries status, service_status, invoice_count, unbilled_line_count, invoiced_total, paid_total.
const saleStatusOf = (row) => {
  const invoices = Number(row.invoice_count) || 0;
  if (invoices === 0) return row.status === 'REJECTED' || row.service_status === 'REJECTED' ? 'REJECTED' : 'PENDING_ACCEPTANCE';
  if (Number(row.unbilled_line_count) > 0) return 'PARTLY_INVOICED';
  const owing = (Number(row.invoiced_total) || 0) - (Number(row.paid_total) || 0);
  if (owing <= 0.005) return 'PAID';
  return (Number(row.paid_total) || 0) > 0.005 ? 'PART_PAID' : 'UNPAID';
};

module.exports = { unbilledLinesSql, saleStatusOf };
