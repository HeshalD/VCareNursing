// Unit tests for the statement engine (no database needed):
//
//   node --test tests/statementLedger.test.js
//
// The main test rebuilds the Zoho Books statement the business used before this system
// (client "Mr. Ramasubramanian Gomathinayegam", 01 Jul - 31 Aug 2026) and checks the engine
// reproduces its summary, running balances and allocation lines exactly.

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRow, buildStatement, toColomboDay, fmtMoney } = require('../services/statementLedger');

const { raw, classify, day, invoice, zohoRows } = require('./fixtures/zohoStatement');

test('Zoho statement is reproduced exactly', () => {
  const s = buildStatement(classify(zohoRows()), { start: '2026-07-01', end: '2026-08-31' });
  assert.equal(s.opening, 113762);
  assert.equal(s.invoiced, 279000);
  assert.equal(s.paid, 353400);
  assert.equal(s.balance, 39362);

  const L = s.ledger;
  assert.equal(L.length, 62 + 1); // 62 invoices + 1 payment (wallet draws hidden)
  const payment = L.find((r) => r.row_type === 'PAYMENT');
  assert.equal(payment.date, '2026-07-06');
  assert.equal(payment.label, 'Payment Received');
  assert.equal(payment.doc_number, '16756');
  assert.equal(payment.balance, -212638);

  // The payment settles 30 old invoices, 6 current ones, and leaves 212,638 as credit.
  assert.equal(payment.annotations.length, 30 + 6 + 1);
  assert.equal(payment.annotations[0], 'LKR3,562.00 for payment of INV-155488');
  assert.equal(payment.annotations[1], 'LKR3,800.00 for payment of INV-155653');
  assert.equal(payment.annotations[29], 'LKR3,800.00 for payment of INV-161142');
  assert.equal(payment.annotations[30], 'LKR4,500.00 for payment of INV-161372');
  assert.equal(payment.annotations[35], 'LKR4,500.00 for payment of INV-162269');
  assert.equal(payment.annotations[36], 'LKR212,638.00 in excess payments');

  // Invoice 07 Jul is paid from the credit, and the balance runs down as in Zoho.
  const jul7 = L.find((r) => r.doc_number === 'INV-162453');
  assert.deepEqual(jul7.annotations, ['LKR4,500.00 from payment 16756']);
  assert.equal(jul7.balance, -208138);
  assert.match(jul7.details, /^INV-162453 - due on 07 Jul 2026\n/);

  // 22 Aug leaves 1,138 of credit; 23 Aug uses it up and goes positive.
  const aug22 = L.find((r) => r.date === '2026-08-22');
  assert.equal(aug22.balance, -1138);
  const aug23 = L.find((r) => r.doc_number === 'INV-172137');
  assert.deepEqual(aug23.annotations, ['LKR1,138.00 from payment 16756']);
  assert.equal(aug23.balance, 3362);
  // From 24 Aug nothing is left to apply.
  const aug24 = L.find((r) => r.date === '2026-08-24');
  assert.deepEqual(aug24.annotations, []);
  assert.equal(L[L.length - 1].balance, 39362);
});

test('an invoice is listed before a payment made the same day, and that payment pays it', () => {
  const rows = classify([
    invoice('2026-07-06', 4500, 'INV-1'),
    raw({ eff_date: '2026-07-06', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 4500, payment_method: 'CASH', receipt_code: 'RCP-0000001' }),
  ]);
  const s = buildStatement(rows, { start: '2026-07-01', end: '2026-07-31' });
  assert.deepEqual(s.ledger.map((r) => r.row_type), ['INVOICE', 'PAYMENT']);
  assert.equal(s.balance, 0);
  assert.deepEqual(s.ledger[1].annotations, ['LKR4,500.00 for payment of INV-1']);
});

test('opening balance counts everything before the period start, nothing after the end', () => {
  const rows = classify([
    invoice('2026-06-30', 1000, 'INV-A'),
    invoice('2026-07-15', 500, 'INV-B'),
    invoice('2026-09-01', 700, 'INV-C'),
  ]);
  const s = buildStatement(rows, { start: '2026-07-01', end: '2026-07-31' });
  assert.equal(s.opening, 1000);
  assert.equal(s.invoiced, 500);
  assert.equal(s.balance, 1500);
  assert.equal(s.ledger.length, 1);
});

// ── classification ────────────────────────────────────────────────────────────
test('wallet draws, mirror rows and settlement audit rows are hidden (the double-count fix)', () => {
  const hidden = [
    raw({ eff_date: '2026-07-01', category: 'BOOKING_PAYMENT', transaction_type: 'CREDIT', payment_method: 'WALLET' }),
    raw({ eff_date: '2026-07-01', category: 'PRODUCT_SALE', transaction_type: 'CREDIT', payment_method: 'WALLET' }),
    raw({ eff_date: '2026-07-01', category: 'REGISTRATION_FEE', transaction_type: 'CREDIT', payment_method: 'WALLET' }),
    raw({ eff_date: '2026-07-01', category: 'BOOKING_PAYMENT', transaction_type: 'CREDIT', payment_method: null, notes: 'Auto-applied from client wallet balance' }),
    raw({ eff_date: '2026-07-01', category: 'WALLET_DEBIT', transaction_type: 'DEBIT' }),
    raw({ eff_date: '2026-07-01', category: 'WALLET_REFUND', transaction_type: 'CREDIT', notes: 'Admin complete booking | Settlement action: WALLET_DEPOSIT | Unused prepayment: Rs.100.00' }),
    raw({ eff_date: '2026-07-01', category: 'SERVICE_INVOICE', transaction_type: 'DEBIT', staff_profile_id: 'staff-1' }),
    raw({ eff_date: '2026-07-01', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', payment_method: 'CASH', status: 'VOIDED' }),
  ];
  for (const r of hidden) assert.equal(classifyRow(r).rows.length, 0, `${r.category}/${r.payment_method} should be hidden`);
});

test('real money in is a payment; the number is the receipt, falling back to the TR code', () => {
  const [a] = classify([raw({ eff_date: '2026-07-01', category: 'BOOKING_PAYMENT', transaction_type: 'CREDIT', payment_method: 'BANK_TRANSFER', receipt_code: 'RCP-0000183' })]);
  assert.equal(a.kind, 'PAYMENT');
  assert.equal(a.doc_number, 'RCP-0000183');
  const [b] = classify([raw({ eff_date: '2026-07-01', category: 'REGISTRATION_FEE', transaction_type: 'CREDIT', payment_method: null, transaction_code: 'TR-0008396' })]);
  assert.equal(b.kind, 'PAYMENT');
  assert.equal(b.doc_number, 'TR-0008396');
});

test('a prepayment is consumed by later invoices, and a draw does not make it count twice', () => {
  // The case the old statement got wrong: top-up 10,000, two 4,500 invoices paid by wallet draws.
  const rows = classify([
    raw({ eff_date: '2026-11-01', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 10000, payment_method: 'BANK_TRANSFER', receipt_code: 'RCP-1' }),
    invoice('2026-11-02', 4500, 'INV-1'),
    raw({ eff_date: '2026-11-02', category: 'BOOKING_PAYMENT', transaction_type: 'CREDIT', amount: 4500, payment_method: 'WALLET' }),
    invoice('2026-11-03', 4500, 'INV-2'),
    raw({ eff_date: '2026-11-03', category: 'BOOKING_PAYMENT', transaction_type: 'CREDIT', amount: 4500, payment_method: 'WALLET' }),
  ]);
  const s = buildStatement(rows, { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s.paid, 10000);
  assert.equal(s.invoiced, 9000);
  assert.equal(s.balance, -1000); // Rs.1,000 of credit left, not Rs.10,000
  assert.deepEqual(s.ledger[1].annotations, ['LKR4,500.00 from payment RCP-1']);
});

test('credit notes name and cancel the invoice they reverse; unpaid reversal nets to zero', () => {
  const inv = invoice('2026-11-05', 4500, 'INV-7', { transaction_id: 'inv7' });
  const cn = raw({
    eff_date: '2026-11-08', category: 'WALLET_REFUND', transaction_type: 'CREDIT', amount: 4500,
    notes: 'Reversal of 2026-11-05 invoice (unpaid, charge cancelled) — Nopay',
    reverses_transaction_id: 'inv7', reversed_service_date: '2026-11-05', transaction_code: 'TR-0028041',
  });
  const s = buildStatement(classify([inv, cn]), { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s.balance, 0);
  const row = s.ledger[1];
  assert.equal(row.label, 'Credit Note');
  assert.equal(row.doc_number, 'CN-0028041');
  assert.match(row.details, /^Credit note for INV-7 \(service day 05 Nov 2026\)\nNopay/);
  assert.deepEqual(row.annotations, []);
});

test('payments sharing one receipt are shown as one payment', () => {
  const rows = classify([
    raw({ eff_date: '2026-11-19', category: 'REGISTRATION_FEE', transaction_type: 'CREDIT', amount: 10000, payment_method: 'BANK_TRANSFER', receipt_code: 'RCP-0000004' }),
    raw({ eff_date: '2026-11-19', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 14500, payment_method: 'BANK_TRANSFER', receipt_code: 'RCP-0000004' }),
  ]);
  const s = buildStatement(rows, { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s.ledger.length, 1);
  assert.equal(s.ledger[0].amount_paid, 24500);
  assert.equal(s.ledger[0].transaction_ids.length, 2);
});

test('booking codes: always on the row, and on allocation lines only for multi-booking clients', () => {
  const one = buildStatement(classify([
    invoice('2026-11-01', 100, 'INV-1', { booking_code: 'BK-00001' }),
    raw({ eff_date: '2026-11-02', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 100, payment_method: 'CASH', receipt_code: 'R1' }),
  ]), { start: '2026-11-01', end: '2026-11-30' });
  assert.match(one.ledger[0].details, /Booking BK-00001/);
  assert.deepEqual(one.ledger[1].annotations, ['LKR100.00 for payment of INV-1']);

  const many = buildStatement(classify([
    invoice('2026-11-01', 100, 'INV-1', { booking_code: 'BK-00001' }),
    invoice('2026-11-01', 100, 'INV-2', { booking_code: 'BK-00002' }),
    raw({ eff_date: '2026-11-02', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 200, payment_method: 'CASH', receipt_code: 'R1' }),
  ]), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(many.ledger[2].annotations, ['LKR100.00 for payment of INV-1 (BK-00001)', 'LKR100.00 for payment of INV-2 (BK-00002)']);
});

test('refund takes credit back out; adjustments keep their direction', () => {
  const rows = classify([
    raw({ eff_date: '2026-11-01', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 5000, payment_method: 'CASH', receipt_code: 'R1' }),
    raw({ eff_date: '2026-11-02', category: 'CLIENT_REFUND', transaction_type: 'DEBIT', amount: 2000, notes: 'Settlement | x' }),
    raw({ eff_date: '2026-11-03', category: 'WALLET_ADJUSTMENT', transaction_type: 'CREDIT', amount: 500, notes: 'carried over' }),
  ]);
  const s = buildStatement(rows, { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s.balance, -3500); // 5000 paid, 2000 refunded, 500 adjustment credit
  assert.deepEqual(s.ledger.map((r) => r.label), ['Payment Received', 'Refund', 'Adjustment']);
});

test('date helpers: Sri Lanka calendar days and money format', () => {
  assert.equal(toColomboDay('2026-07-01'), '2026-07-01');
  assert.equal(toColomboDay('1970-01-01T00:00:00Z'), '1970-01-01');
  assert.equal(toColomboDay('2026-07-31T23:59:59.999+05:30'), '2026-07-31');
  assert.equal(toColomboDay('2026-07-31T20:00:00Z'), '2026-08-01'); // 01:30 next day in Sri Lanka
  assert.equal(fmtMoney(-212638), '-212,638.00');
  assert.equal(fmtMoney(4500), '4,500.00');
});
