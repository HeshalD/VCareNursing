// One definition of how a product invoice and a product sale are labelled, shared by the Products page
// and the client page so they always say the same thing about the same invoice.

const num = (v) => Number(v || 0);

// Paid / part paid / unpaid for ONE invoice, from its amount and what has been paid on it.
// `storedPaid` is true when the invoice itself is marked PAID (it may predate the payments ledger).
export const invoicePaymentState = (amount, paid, storedPaid) => {
  const due = Math.max(num(amount) - num(paid), 0);
  if (storedPaid || due <= 0.01) return { key: 'PAID', label: 'Paid', tone: 'green', due: 0, settled: true };
  if (num(paid) > 0.01) return { key: 'PART_PAID', label: 'Part paid', tone: 'blue', due, settled: false };
  return { key: 'UNPAID', label: 'Unpaid', tone: 'amber', due, settled: false };
};

// The status of a whole product sale (one product quotation). It is worked out on the server
// (services/productBilling.js saleStatusOf) and arrives as sale_status; this only names and colours it.
export const SALE_STATUS = {
  PENDING_ACCEPTANCE: { label: 'Pending acceptance', tone: 'slate' },
  PARTLY_INVOICED: { label: 'Partly invoiced', tone: 'slate' },
  UNPAID: { label: 'Unpaid', tone: 'amber' },
  PART_PAID: { label: 'Part paid', tone: 'blue' },
  PAID: { label: 'Paid', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};

// The tab each status belongs to on the Products page.
export const SALE_BUCKET = {
  PENDING_ACCEPTANCE: 'pending',
  PARTLY_INVOICED: 'pending',
  UNPAID: 'awaiting_payment',
  PART_PAID: 'awaiting_payment',
  PAID: 'paid',
  REJECTED: 'rejected',
};
