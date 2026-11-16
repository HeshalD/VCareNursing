// scripts/backfillRegFeeInvoiceDocs.js
//
// Creates the missing registration-fee invoice DOCUMENTS (PDF + client_reg_fee_invoices
// row, status PAID) for clients whose fee was entered as an admin "backdated" payment.
// The ledger side was fixed by scripts/fix_regfee_and_stranded_2026-11-15.sql, which tags
// its debits "backfilled 2026-11-15" — that tag is how this script finds its targets.
//
//   node scripts/backfillRegFeeInvoiceDocs.js                    (DRY RUN: lists targets)
//   node scripts/backfillRegFeeInvoiceDocs.js --apply --limit 1  (try one client first)
//   node scripts/backfillRegFeeInvoiceDocs.js --apply            (all targets)
//
// Idempotent: a client that already has any registration invoice row is skipped, so a
// re-run after a partial failure only does the remainder. Each client is handled on its
// own (PDF -> S3 -> insert); one failure does not stop the others.
//
// Run it where the backend env (DB + S3 credentials) and the PDF renderer are available.

const db = require('../config/db');
const { generateAndUploadRegFeeInvoice } = require('../utils/regFeeInvoicePdf');
const { billingName } = require('../utils/clientName');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
if (limitIdx >= 0 && !(LIMIT > 0)) {
  console.error('Usage: --limit needs a positive number');
  process.exit(1);
}

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo',
});

(async () => {
  const targets = (await db.query(
    `SELECT cp.client_profile_id AS client_id, cp.client_code, cp.honorific, cp.full_name,
            cp.company_name, cp.display_name_source, cp.reg_fee_expires_at,
            t.amount, t.created_at AS paid_at
     FROM transactions t
     JOIN client_profiles cp ON cp.client_profile_id = t.client_id
     WHERE t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT'
       AND t.notes LIKE '%backfilled 2026-11-15%'
       AND NOT EXISTS (SELECT 1 FROM client_reg_fee_invoices i WHERE i.client_id = t.client_id)
     ORDER BY cp.client_code`
  )).rows;

  const work = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`${targets.length} client(s) need an invoice document; processing ${work.length}. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  let ok = 0;
  const failed = [];
  let n = 0;
  for (const c of work) {
    const invoiceCode = `INV-${c.client_code}-${String(Date.now() + n++).slice(-6)}`;
    const name = billingName(c) || c.full_name;
    const line = `${c.client_code}  ${name}  Rs. ${parseFloat(c.amount).toFixed(2)}  paid ${fmtDate(c.paid_at)}  -> ${invoiceCode}`;
    if (!APPLY) { console.log('would create:', line); continue; }
    try {
      const pdfUrl = await generateAndUploadRegFeeInvoice({
        invoice_code: invoiceCode,
        invoice_date: fmtDate(c.paid_at),
        client_name: name,
        amount: parseFloat(c.amount).toFixed(2),
        bank_name: '', account_holder_name: '', account_number: '', branch_name: '—',
        upload_url: '',
      });
      await db.query(
        `INSERT INTO client_reg_fee_invoices
           (client_id, invoice_code, amount, pdf_url, status, period_start, period_end, created_at)
         VALUES ($1, $2, $3, $4, 'PAID', $5, $6, $5)`,
        [c.client_id, invoiceCode, c.amount, pdfUrl, c.paid_at, c.reg_fee_expires_at]
      );
      ok++;
      console.log('created:', line);
    } catch (err) {
      failed.push(c.client_code);
      console.error(`FAILED ${c.client_code}: ${err.message}`);
    }
  }

  if (APPLY) console.log(`\nDone. Created ${ok}, failed ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}.`);
  else console.log('\nDry run only. Re-run with --apply (optionally --limit 1 first).');
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
