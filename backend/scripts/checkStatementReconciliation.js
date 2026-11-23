// READ-ONLY. Cross-checks every client's Statement of Accounts against independent figures:
//
//   node scripts/checkStatementReconciliation.js            # all clients, prints only problems
//   node scripts/checkStatementReconciliation.js CL-05452   # one client, prints the full picture
//
// Checks per client (all-time statement, owing = positive):
//   A  statement balance == invoices - real money in - credit notes - adjustments, summed straight
//      from the ledger in SQL (catches engine bugs: dropped / double-counted / wrongly hidden rows)
//   B  statement balance + wallet balance == what the bookings still owe (charges - settled, the
//      definition the rest of the system uses) -- differences are listed with the likely cause
//   C  ledger rows the engine could not classify (new categories that need a rule)
// It never writes. Run it against production only through a read-only session
// (PGOPTIONS='-c default_transaction_read_only=on').

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');
const { getClientStatementData, classifyRow, loadLedgerRows } = require('../services/statementLedger');
const { bookingChargeSql, bookingSettledSql } = require('../services/clientFinancials');

const TOL = 0.5;
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const only = process.argv[2] || null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

  const clients = await db.query(
    `SELECT cp.client_profile_id AS id, cp.client_code, cp.full_name, COALESCE(cp.wallet_balance, 0)::float AS wallet
     FROM client_profiles cp
     WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = cp.client_profile_id)
       ${only ? 'AND cp.client_code = $1' : ''}
     ORDER BY cp.client_code`,
    only ? [only] : []
  );

  let checked = 0, problems = 0;
  const unclassifiedAll = new Map();

  for (const c of clients.rows) {
    checked++;
    const st = await getClientStatementData(c.id, '1970-01-01', today);

    // A — straight from the ledger
    const a = await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE transaction_type::text = 'DEBIT'  AND category::text IN ('SERVICE_INVOICE','PRODUCT_INVOICE','REGISTRATION_FEE')), 0)::float AS inv,
         COALESCE(SUM(amount) FILTER (WHERE transaction_type::text = 'CREDIT' AND COALESCE(payment_method,'') <> 'WALLET'
                                       AND COALESCE(notes,'') NOT LIKE 'Auto-applied from client wallet%'
                                       AND category::text NOT IN ('WALLET_REFUND','SETTLEMENT_FORFEITURE','WALLET_ADJUSTMENT')), 0)::float AS cash,
         COALESCE(SUM(amount) FILTER (WHERE category::text = 'WALLET_REFUND' AND COALESCE(notes,'') NOT LIKE '%Settlement action: WALLET_DEPOSIT%'), 0)::float AS cn,
         COALESCE(SUM(amount) FILTER (WHERE category::text IN ('CLIENT_REFUND','DEPOSIT_REFUND') AND transaction_type::text = 'DEBIT'), 0)::float AS refunds,
         COALESCE(SUM(amount) FILTER (WHERE category::text = 'SETTLEMENT_FORFEITURE'), 0)::float AS forfeits,
         COALESCE(SUM(amount) FILTER (WHERE category::text = 'WALLET_ADJUSTMENT' AND transaction_type::text = 'CREDIT'), 0)::float AS adj_c,
         COALESCE(SUM(amount) FILTER (WHERE category::text = 'WALLET_ADJUSTMENT' AND transaction_type::text = 'DEBIT'), 0)::float AS adj_d
       FROM transactions
       WHERE client_id = $1 AND staff_profile_id IS NULL AND COALESCE(status,'COMPLETED') NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REJECTED')`,
      [c.id]
    );
    const x = a.rows[0];
    const expectedA = x.inv - x.cash - x.cn + x.refunds + x.forfeits - x.adj_c + x.adj_d;
    const diffA = st.balance - expectedA;

    // B — what the bookings still owe, by the system's own definition
    const b = await db.query(
      `SELECT COALESCE(SUM(owed), 0)::float AS owed FROM (
         SELECT booking_id,
                COALESCE(SUM(amount) FILTER (WHERE ${bookingChargeSql()}), 0) - COALESCE(SUM(amount) FILTER (WHERE ${bookingSettledSql()}), 0) AS owed
         FROM transactions WHERE client_id = $1 AND booking_id IS NOT NULL GROUP BY booking_id) q`,
      [c.id]
    );
    const unbooked = await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE transaction_type::text = 'DEBIT'  AND category::text IN ('PRODUCT_INVOICE','REGISTRATION_FEE')), 0)::float AS deb,
         COALESCE(SUM(amount) FILTER (WHERE transaction_type::text = 'CREDIT' AND category::text IN ('PRODUCT_SALE','REGISTRATION_FEE')), 0)::float AS cred
       FROM transactions WHERE client_id = $1 AND booking_id IS NULL`, [c.id]);
    const owedBySystem = b.rows[0].owed + (unbooked.rows[0].deb - unbooked.rows[0].cred);
    const diffB = (st.balance + c.wallet) - owedBySystem;

    // C — unclassified
    const raw = await loadLedgerRows(c.id, today);
    for (const r of raw) {
      const { unclassified } = classifyRow(r);
      if (unclassified) unclassifiedAll.set(unclassified, (unclassifiedAll.get(unclassified) || 0) + 1);
    }

    const bad = Math.abs(diffA) > TOL;
    const noteB = Math.abs(diffB) > TOL;
    if (bad) problems++;
    if (only || bad || noteB) {
      console.log(`${c.client_code}  ${c.full_name}`);
      console.log(`   statement balance ${money(st.balance)}  (opening ${money(st.opening)}, invoiced ${money(st.invoiced)}, paid ${money(st.paid)})   wallet ${money(c.wallet)}`);
      console.log(`   A ledger formula  ${money(expectedA)}   ${bad ? `MISMATCH by ${money(diffA)}` : 'ok'}`);
      console.log(`   B bookings owe    ${money(owedBySystem)}   statement+wallet ${money(st.balance + c.wallet)}   ${noteB ? `differs by ${money(diffB)}` : 'ok'}`);
    }
  }

  console.log(`\nChecked ${checked} client(s). Check A mismatches (engine bugs): ${problems}.`);
  if (unclassifiedAll.size) {
    console.log('Unclassified ledger rows (hidden from statements, need a rule):');
    for (const [k, n] of unclassifiedAll) console.log(`   ${k}: ${n}`);
  } else console.log('Every ledger row was classified.');
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
