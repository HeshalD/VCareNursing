// services/regFeeInvoiceDocs.js
//
// Safety net for registration-fee invoice DOCUMENTS (PDF + client_reg_fee_invoices row).
// Several paths book the fee on the ledger (a REGISTRATION_FEE DEBIT) without ever making
// the document — booking conversion (chargeRegistrationFeeForBooking) never did, and the
// quotation-payment path (quoteController.ensureRegFeeInvoiceRecord) runs un-awaited next to
// two other PDF renders and only logs when it fails. This finds every client with a fee debit
// and no invoice row and creates the document, one at a time:
//   - fee fully paid  -> status PAID (no bank details)
//   - unpaid / partly -> status SENT ("Unpaid") with the default bank + receipt-upload link
// It never touches the ledger, never sends WhatsApp, never writes overdue_invoices.
// Idempotent: a client with any invoice row is skipped. Never throws.

const crypto = require('crypto');
const db = require('../config/db');
const { generateAndUploadRegFeeInvoice } = require('../utils/regFeeInvoicePdf');
const { billingName } = require('../utils/clientName');

const DEFAULT_BANK_ACCOUNT_ID = 'f97f0e03-f6ef-4a04-942d-4b06a3b9d84b'; // Peoples Bank
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });

let running = false;

// clientId = null sweeps every client; pass an id to handle just one (after a conversion).
async function ensureRegFeeInvoiceDocs({ clientId = null, limit = 25 } = {}) {
  if (running) return { created: 0, failed: [], skipped: true };
  running = true;
  const result = { created: 0, failed: [] };
  try {
    const targets = (await db.query(
      `SELECT cp.client_profile_id AS client_id, cp.client_code, cp.honorific, cp.full_name, cp.company_name,
              cp.display_name_source, cp.reg_fee_expires_at, cp.reg_fee_paid_at,
              d.amount, d.created_at AS invoiced_on,
              (SELECT COALESCE(SUM(c.amount), 0) FROM transactions c WHERE c.client_id = cp.client_profile_id
                 AND c.category::text = 'REGISTRATION_FEE' AND c.transaction_type = 'CREDIT') AS paid,
              (SELECT MIN(c.created_at) FROM transactions c WHERE c.client_id = cp.client_profile_id
                 AND c.category::text = 'REGISTRATION_FEE' AND c.transaction_type = 'CREDIT') AS paid_at
       FROM client_profiles cp
       JOIN LATERAL (SELECT amount, created_at FROM transactions t
                     WHERE t.client_id = cp.client_profile_id AND t.category::text = 'REGISTRATION_FEE'
                       AND t.transaction_type = 'DEBIT' ORDER BY created_at LIMIT 1) d ON true
       WHERE ($1::uuid IS NULL OR cp.client_profile_id = $1::uuid)
         AND NOT EXISTS (SELECT 1 FROM client_reg_fee_invoices i WHERE i.client_id = cp.client_profile_id)
       ORDER BY d.created_at
       LIMIT $2`,
      [clientId, limit]
    )).rows;
    if (targets.length === 0) return result;

    const bank = (await db.query(
      `SELECT bank_name, account_holder_name, account_number, branch_name
       FROM bank_accounts WHERE account_id = $1 AND is_active = true`, [DEFAULT_BANK_ACCOUNT_ID])).rows[0];

    let n = 0;
    for (const c of targets) {
      try {
        const invoiceCode = `INV-${c.client_code}-${String(Date.now() + n++).slice(-6)}`;
        const amount = parseFloat(c.amount).toFixed(2);
        const fullyPaid = parseFloat(c.paid) + 0.005 >= parseFloat(c.amount);
        const showBank = !fullyPaid && !!bank;
        const token = crypto.randomBytes(32).toString('hex');
        const pdfUrl = await generateAndUploadRegFeeInvoice({
          invoice_code: invoiceCode,
          invoice_date: fmtDate(c.invoiced_on),
          client_name: billingName(c) || c.full_name,
          amount,
          bank_name: showBank ? bank.bank_name : '',
          account_holder_name: showBank ? bank.account_holder_name : '',
          account_number: showBank ? bank.account_number : '',
          branch_name: showBank ? (bank.branch_name || '—') : '—',
          upload_url: showBank ? `https://vcarenursing.com/client/pay-receipt/${token}` : '',
        });

        const tx = await db.pool.connect();
        try {
          await tx.query('BEGIN');
          // Re-check inside the transaction so two sweeps can never both insert.
          const exists = await tx.query(`SELECT 1 FROM client_reg_fee_invoices WHERE client_id = $1 LIMIT 1`, [c.client_id]);
          if (exists.rows.length === 0) {
            if (fullyPaid) {
              await tx.query(
                `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, status, period_start, period_end, created_at)
                 VALUES ($1, $2, $3, $4, 'PAID', $5, $6, $7)`,
                [c.client_id, invoiceCode, amount, pdfUrl, c.paid_at || c.reg_fee_paid_at, c.reg_fee_expires_at, c.invoiced_on]);
            } else {
              await tx.query(
                `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, bank_account_id, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, 'SENT', $6)`,
                [c.client_id, invoiceCode, amount, pdfUrl, bank ? DEFAULT_BANK_ACCOUNT_ID : null, c.invoiced_on]);
              await tx.query(
                `UPDATE client_profiles SET reg_fee_receipt_token = $2, reg_fee_receipt_token_expires_at = $3,
                        reg_fee_invoiced_at = COALESCE(reg_fee_invoiced_at, $4)
                 WHERE client_profile_id = $1 AND reg_fee_status <> 'PAID'`,
                [c.client_id, token, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), c.invoiced_on]);
            }
            result.created++;
          }
          await tx.query('COMMIT');
        } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
      } catch (err) {
        result.failed.push(c.client_code);
        console.error(`[RegFeeInvoiceDocs] ${c.client_code} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[RegFeeInvoiceDocs] sweep error:', err.message);
  } finally {
    running = false;
  }
  return result;
}

module.exports = { ensureRegFeeInvoiceDocs };
