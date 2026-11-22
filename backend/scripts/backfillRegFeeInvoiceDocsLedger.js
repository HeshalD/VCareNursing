// scripts/backfillRegFeeInvoiceDocsLedger.js
//
// Creates the registration-fee invoice DOCUMENT (PDF + client_reg_fee_invoices row) for every
// client who has a REGISTRATION_FEE ledger debit but no invoice document at all — fees booked
// at booking conversion / paid on a quotation, which never produced a PDF.
//   - fee fully paid (credits >= debit)  -> status PAID, dated by the debit, period = the paid window
//   - unpaid or partly paid              -> status SENT ("Unpaid") with bank details + receipt link,
//                                           same as backfillRegFeeInvoiceDocsUnpaid.js
// No WhatsApp message, no overdue_invoices row, no ledger change (the debit already counts).
//
//   node scripts/backfillRegFeeInvoiceDocsLedger.js                    (DRY RUN)
//   node scripts/backfillRegFeeInvoiceDocsLedger.js --apply --limit 1  (one client first)
//   node scripts/backfillRegFeeInvoiceDocsLedger.js --apply            (all)
// Idempotent: a client that already has any registration invoice row is skipped.

const crypto = require('crypto');
const db = require('../config/db');
const { generateAndUploadRegFeeInvoice } = require('../utils/regFeeInvoicePdf');
const { billingName } = require('../utils/clientName');

const BANK_ACCOUNT_ID = 'f97f0e03-f6ef-4a04-942d-4b06a3b9d84b'; // Peoples Bank (same as the Unpaid backfill)
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
if (limitIdx >= 0 && !(LIMIT > 0)) { console.error('Usage: --limit needs a positive number'); process.exit(1); }

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });

(async () => {
  const bank = (await db.query(
    `SELECT account_id, bank_name, account_holder_name, account_number, branch_name
     FROM bank_accounts WHERE account_id = $1 AND is_active = true`, [BANK_ACCOUNT_ID])).rows[0];
  if (!bank) { console.error('Bank account not found / inactive'); process.exit(1); }

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
     WHERE NOT EXISTS (SELECT 1 FROM client_reg_fee_invoices i WHERE i.client_id = cp.client_profile_id)
     ORDER BY cp.client_code`
  )).rows;

  const work = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`${targets.length} client(s) need an invoice document; processing ${work.length}. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  let ok = 0; const failed = []; let n = 0;
  for (const c of work) {
    const invoiceCode = `INV-${c.client_code}-${String(Date.now() + n++).slice(-6)}`;
    const name = billingName(c) || c.full_name;
    const amount = parseFloat(c.amount).toFixed(2);
    const fullyPaid = parseFloat(c.paid) + 0.005 >= parseFloat(c.amount);
    const line = `${c.client_code}  ${name}  Rs. ${amount}  paid ${parseFloat(c.paid).toFixed(2)}  ${fullyPaid ? 'PAID' : 'SENT(unpaid/partly)'}  dated ${fmtDate(c.invoiced_on)}  -> ${invoiceCode}`;
    if (!APPLY) { console.log('would create:', line); continue; }
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const pdfUrl = await generateAndUploadRegFeeInvoice({
        invoice_code: invoiceCode,
        invoice_date: fmtDate(c.invoiced_on),
        client_name: name,
        amount,
        bank_name: fullyPaid ? '' : bank.bank_name,
        account_holder_name: fullyPaid ? '' : bank.account_holder_name,
        account_number: fullyPaid ? '' : bank.account_number,
        branch_name: fullyPaid ? '—' : (bank.branch_name || '—'),
        upload_url: fullyPaid ? '' : `https://vcarenursing.com/client/pay-receipt/${token}`,
      });
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        if (fullyPaid) {
          await client.query(
            `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, status, period_start, period_end, created_at)
             VALUES ($1, $2, $3, $4, 'PAID', $5, $6, $7)`,
            [c.client_id, invoiceCode, amount, pdfUrl, c.paid_at || c.reg_fee_paid_at, c.reg_fee_expires_at, c.invoiced_on]);
        } else {
          await client.query(
            `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, bank_account_id, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'SENT', $6)`,
            [c.client_id, invoiceCode, amount, pdfUrl, BANK_ACCOUNT_ID, c.invoiced_on]);
          // Only stamp the receipt link on clients that are actually still unpaid.
          await client.query(
            `UPDATE client_profiles SET reg_fee_receipt_token = $2, reg_fee_receipt_token_expires_at = $3,
                    reg_fee_invoiced_at = COALESCE(reg_fee_invoiced_at, $4)
             WHERE client_profile_id = $1 AND reg_fee_status <> 'PAID'`,
            [c.client_id, token, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), c.invoiced_on]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      ok++; console.log('created:', line);
    } catch (err) { failed.push(c.client_code); console.error(`FAILED ${c.client_code}: ${err.message}`); }
  }
  if (APPLY) console.log(`\nDone. Created ${ok}, failed ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}.`);
  else console.log('\nDry run only. Re-run with --apply (optionally --limit 1 first).');
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
