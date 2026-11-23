const { classifyRow } = require('../../services/statementLedger');

// Shared by tests/statementLedger.test.js and scripts/renderStatementSample.js:
// the Zoho Books statement (Mr. Ramasubramanian Gomathinayegam, 01 Jul - 31 Aug 2026) as ledger rows.

let seq = 0;
const raw = (o) => ({
  transaction_id: `t${++seq}`, transaction_code: `TR-${String(seq).padStart(7, '0')}`,
  category: 'SERVICE_INVOICE', transaction_type: 'DEBIT', amount: 100, payment_method: null, notes: '',
  created_at: `${o.eff_date}T12:00:00Z`, status: 'COMPLETED', staff_profile_id: null,
  booking_code: 'BK-00001', invoice_code: null, due_date: null, receipt_code: null,
  reverses_transaction_id: null, reversed_service_date: null, ...o,
});
const classify = (rows) => rows.flatMap((r) => classifyRow(r).rows);
const day = (base, n) => { const d = new Date(`${base}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const invoice = (eff_date, amount, code, extra = {}) => raw({ eff_date, amount, notes: `${code} — Live-in daily charge (1 staff member(s))`, ...extra });

// ── the Zoho scenario ─────────────────────────────────────────────────────────
function zohoRows() {
  const rows = [];
  // Before the period: INV-155488 (Rs.3,562 left) and 29 invoices of Rs.3,800 = Rs.113,762 opening.
  rows.push(invoice('2026-05-31', 3562, 'INV-155488'));
  const old = ['155653', '155821', '155993', '156166', '156342', '156528', '156703', '156886', '157072', '157262',
    '157446', '157687', '157873', '158062', '158250', '158436', '158626', '158825', '159027', '159225', '159424',
    '159625', '159822', '160022', '160219', '160420', '160774', '160958', '161142'];
  old.forEach((n, i) => rows.push(invoice(day('2026-06-01', i), 3800, `INV-${n}`)));
  // 62 daily invoices of Rs.4,500, 01 Jul - 31 Aug.
  const named = { 0: 'INV-161372', 1: 'INV-161553', 2: 'INV-161717', 3: 'INV-161899', 4: 'INV-162087', 5: 'INV-162269', 6: 'INV-162453', 53: 'INV-172137' };
  for (let i = 0; i < 62; i++) rows.push(invoice(day('2026-07-01', i), 4500, named[i] || `INV-9${String(i).padStart(5, '0')}`));
  // One payment of Rs.353,400 on 06 Jul (topup = real money; the later wallet draws must be ignored).
  rows.push(raw({ eff_date: '2026-07-06', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 353400, payment_method: 'BANK_TRANSFER', receipt_code: '16756', notes: 'Service charges credited to wallet' }));
  // Wallet draws that the old statement counted a second time:
  for (let i = 6; i < 20; i++) rows.push(raw({ eff_date: day('2026-07-01', i), category: 'BOOKING_PAYMENT', transaction_type: 'CREDIT', amount: 4500, payment_method: 'WALLET', notes: 'Auto-applied from client wallet balance' }));
  return rows;
}


module.exports = { raw, classify, day, invoice, zohoRows };
