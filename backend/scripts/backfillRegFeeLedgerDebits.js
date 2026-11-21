// Gives every sent registration-fee invoice its own ledger charge.
//
// Before this change, sending a registration-fee invoice only wrote an overdue_invoices row. That
// still counted in Total Invoiced, but the fee was not a transaction, so it never showed in the
// client's ledger. This writes the missing REGISTRATION_FEE DEBIT (dated when the invoice was
// sent) for every client that has such an invoice and no registration charge at all.
//
// Headline totals do not change: once the debit exists the totals count it instead of the
// overdue row (services/clientFinancials.js), so nothing is counted twice.
//
// Dry run by default. Add --apply to write.
//   docker exec vcarenursing-backend node scripts/backfillRegFeeLedgerDebits.js
//   docker exec vcarenursing-backend node scripts/backfillRegFeeLedgerDebits.js --apply

const db = require('../config/db');

const APPLY = process.argv.includes('--apply');

(async () => {
  const client = await db.pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT DISTINCT ON (o.client_id)
              o.client_id, cp.client_code, o.invoice_code, o.amount, o.invoiced_at
       FROM overdue_invoices o
       JOIN client_profiles cp ON cp.client_profile_id = o.client_id
       WHERE o.source_type = 'REGISTRATION_FEE'
         AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = o.client_id
                         AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT')
       ORDER BY o.client_id, o.invoiced_at ASC`
    );

    console.log(`${rows.length} client(s) have a registration-fee invoice with no ledger charge.`);
    rows.forEach((r) => console.log(`  ${r.client_code}  ${r.invoice_code || '-'}  Rs ${r.amount}  invoiced ${new Date(r.invoiced_at).toISOString().slice(0, 10)}`));
    if (!APPLY) { console.log('\nDry run. Nothing written. Re-run with --apply to write them.'); return; }

    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes, created_at)
         VALUES ($1, 'REGISTRATION_FEE', $2, 'DEBIT', 'COMPLETED', $3, $4)`,
        [r.client_id, r.amount, `Registration fee invoiced (${r.invoice_code || 'backfilled'})`, r.invoiced_at]
      );
    }
    await client.query('COMMIT');
    console.log(`\nWrote ${rows.length} registration-fee charge(s).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Backfill failed, nothing written:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
})();
