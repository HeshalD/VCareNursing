// services/invoiceDate.js
// The date on a product invoice. It is the invoice's created_at, which is what its PDF prints as the
// invoice date and what its ledger charge (PRODUCT_INVOICE) is dated by, so choosing or changing it
// moves all three together. The original creation timestamp is not otherwise kept: every change is
// written to the activity log with the old and new date instead.

const TZ = 'Asia/Colombo';

const badRequest = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  err.status = 400;
  return err;
};

const todayInColombo = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

// 'YYYY-MM-DD' → the date to store, or null when none was given or it is today (meaning "now", so an
// invoice made today keeps its real time). A malformed or future date is refused.
function parseInvoiceDate(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw badRequest('Invoice date must be a valid date');
  }
  const today = todayInColombo();
  if (s > today) throw badRequest('Invoice date cannot be in the future');
  return s === today ? null : s;
}

// SQL for the stored timestamp of a chosen day: noon local time.
const DATE_TO_TIMESTAMP_SQL = (param) => `(${param}::date + TIME '12:00') AT TIME ZONE '${TZ}'`;

/**
 * Re-dates an existing product/rental invoice and its ledger charge. Runs inside the caller's
 * open transaction. Returns { changed, old_date, new_date } (YYYY-MM-DD, Colombo).
 */
async function setInvoiceDate(client, invoiceId, rawDate) {
  const s = rawDate ? String(rawDate).trim() : '';
  if (!s) throw badRequest('Invoice date is required');
  const stored = parseInvoiceDate(s); // validates; null when it is today
  const isToday = stored === null;

  const res = await client.query(
    `SELECT invoice_id, category, status, charge_transaction_id,
            to_char(created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS old_date
     FROM invoices WHERE invoice_id = $1 FOR UPDATE`,
    [invoiceId]
  );
  const inv = res.rows[0];
  if (!inv) { const e = new Error('Invoice not found'); e.statusCode = 404; throw e; }
  if (!['PRODUCT', 'RENTAL_ONE_TIME', 'RENTAL_RECURRING'].includes(inv.category)) {
    throw badRequest('Only product and rental invoices can be re-dated here');
  }
  if (inv.status === 'CANCELLED') throw badRequest('A cancelled invoice cannot be re-dated');
  if (inv.old_date === s) return { changed: false, old_date: inv.old_date, new_date: s };

  if (isToday) {
    await client.query(`UPDATE invoices SET created_at = CURRENT_TIMESTAMP, pdf_url = NULL WHERE invoice_id = $1`, [invoiceId]);
  } else {
    await client.query(
      `UPDATE invoices SET created_at = ${DATE_TO_TIMESTAMP_SQL('$2')}, pdf_url = NULL WHERE invoice_id = $1`,
      [invoiceId, stored]
    );
  }
  if (inv.charge_transaction_id) {
    await client.query(
      `UPDATE transactions SET created_at = (SELECT created_at FROM invoices WHERE invoice_id = $1)
       WHERE transaction_id = $2`,
      [invoiceId, inv.charge_transaction_id]
    );
  }
  return { changed: true, old_date: inv.old_date, new_date: s };
}

module.exports = { parseInvoiceDate, setInvoiceDate, DATE_TO_TIMESTAMP_SQL, todayInColombo };
