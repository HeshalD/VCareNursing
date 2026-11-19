// scripts/backfillRegFeeInvoiceDocsUnpaid.js
//
// Creates the registration-fee invoice DOCUMENT (PDF + client_reg_fee_invoices row, status
// SENT = "Unpaid") for clients who have paid the system something, have an unpaid
// REGISTRATION_FEE ledger debit, and no invoice row — so the invoice shows in the client's
// Invoices tab. Mirrors the app's "send invoice" action, WITHOUT the WhatsApp message and
// WITHOUT an overdue_invoices row (the ledger debit already counts in Total Invoiced; an
// overdue row would be a second record of the same fee). The client's status stays PENDING;
// a 30-day receipt-upload token is set so the link printed on the PDF works.
//
//   node scripts/backfillRegFeeInvoiceDocsUnpaid.js                          (DRY RUN)
//   node scripts/backfillRegFeeInvoiceDocsUnpaid.js --apply --limit 1        (one client)
//   node scripts/backfillRegFeeInvoiceDocsUnpaid.js --apply                  (all)
// Idempotent: clients that already have an invoice row are skipped.

const crypto = require('crypto');
const db = require('../config/db');
const { generateAndUploadRegFeeInvoice } = require('../utils/regFeeInvoicePdf');
const { billingName } = require('../utils/clientName');

const BANK_ACCOUNT_ID = 'f97f0e03-f6ef-4a04-942d-4b06a3b9d84b'; // Peoples Bank
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
    `SELECT cp.client_profile_id AS client_id, cp.client_code, cp.honorific, cp.full_name,
            cp.company_name, cp.display_name_source, d.amount, d.created_at AS invoiced_on
     FROM client_profiles cp
     JOIN LATERAL (SELECT amount, created_at FROM transactions t
                   WHERE t.client_id = cp.client_profile_id AND t.category::text = 'REGISTRATION_FEE'
                     AND t.transaction_type = 'DEBIT' ORDER BY created_at LIMIT 1) d ON true
     WHERE cp.reg_fee_status = 'PENDING'
       AND cp.client_code NOT IN ('CL-05451', 'CL-05480')
       AND NOT EXISTS (SELECT 1 FROM client_reg_fee_invoices i WHERE i.client_id = cp.client_profile_id)
       AND NOT EXISTS (SELECT 1 FROM transactions c WHERE c.client_id = cp.client_profile_id
                       AND c.category::text = 'REGISTRATION_FEE' AND c.transaction_type = 'CREDIT')
       AND EXISTS (SELECT 1 FROM transactions p WHERE p.client_id = cp.client_profile_id
                   AND p.transaction_type = 'CREDIT'
                   AND p.category::text IN ('BOOKING_PAYMENT','WALLET_TOPUP','PRODUCT_SALE'))
     ORDER BY cp.client_code`
  )).rows;

  const work = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`${targets.length} client(s) need an unpaid invoice document; processing ${work.length}. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}. Bank: ${bank.bank_name}`);

  let ok = 0; const failed = []; let n = 0;
  for (const c of work) {
    const invoiceCode = `INV-${c.client_code}-${String(Date.now() + n++).slice(-6)}`;
    const name = billingName(c) || c.full_name;
    const amount = parseFloat(c.amount).toFixed(2);
    const line = `${c.client_code}  ${name}  Rs. ${amount}  dated ${fmtDate(c.invoiced_on)}  -> ${invoiceCode}`;
    if (!APPLY) { console.log('would create:', line); continue; }
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const pdfUrl = await generateAndUploadRegFeeInvoice({
        invoice_code: invoiceCode, invoice_date: fmtDate(new Date()), client_name: name, amount,
        bank_name: bank.bank_name, account_holder_name: bank.account_holder_name,
        account_number: bank.account_number, branch_name: bank.branch_name || '—',
        upload_url: `https://vcarenursing.com/client/pay-receipt/${token}`,
      });
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, bank_account_id, status)
           VALUES ($1, $2, $3, $4, $5, 'SENT')`, [c.client_id, invoiceCode, amount, pdfUrl, BANK_ACCOUNT_ID]);
        await client.query(
          `UPDATE client_profiles SET reg_fee_invoiced_at = NOW(), reg_fee_receipt_token = $2,
                  reg_fee_receipt_token_expires_at = $3 WHERE client_profile_id = $1`,
          [c.client_id, token, expiry]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      ok++; console.log('created:', line);
    } catch (err) { failed.push(c.client_code); console.error(`FAILED ${c.client_code}: ${err.message}`); }
  }
  if (APPLY) console.log(`\nDone. Created ${ok}, failed ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}.`);
  else console.log('\nDry run only. Re-run with --apply (optionally --limit 1 first).');
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
