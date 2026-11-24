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
  assert.equal(payment.allocations.length, 30 + 6 + 1);
  assert.equal(payment.allocations[0], 'LKR3,562.00 for payment of INV-155488');
  assert.equal(payment.allocations[1], 'LKR3,800.00 for payment of INV-155653');
  assert.equal(payment.allocations[29], 'LKR3,800.00 for payment of INV-161142');
  assert.equal(payment.allocations[30], 'LKR4,500.00 for payment of INV-161372');
  assert.equal(payment.allocations[35], 'LKR4,500.00 for payment of INV-162269');
  assert.equal(payment.allocations[36], 'LKR212,638.00 in excess payments');

  // Invoice 07 Jul is paid from the credit, and the balance runs down as in Zoho.
  const jul7 = L.find((r) => r.doc_number === 'INV-162453');
  assert.deepEqual(jul7.allocations, ['LKR4,500.00 from payment 16756']);
  assert.equal(jul7.balance, -208138);
  assert.match(jul7.details, /^Care service - 07 Jul 2026\nInvoice INV-162453/);

  // 22 Aug leaves 1,138 of credit; 23 Aug uses it up and goes positive.
  const aug22 = L.find((r) => r.date === '2026-08-22');
  assert.equal(aug22.balance, -1138);
  const aug23 = L.find((r) => r.doc_number === 'INV-172137');
  assert.deepEqual(aug23.allocations, ['LKR1,138.00 from payment 16756']);
  assert.equal(aug23.balance, 3362);
  // From 24 Aug nothing is left to apply.
  const aug24 = L.find((r) => r.date === '2026-08-24');
  assert.deepEqual(aug24.allocations, []);
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
  assert.deepEqual(s.ledger[1].allocations, ['LKR4,500.00 for payment of INV-1']);
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
  assert.deepEqual(s.ledger[1].allocations, ['LKR4,500.00 from payment RCP-1']);
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
  assert.equal(row.label, 'Invoice Cancelled');
  assert.equal(row.doc_number, 'CN-0028041');
  assert.match(row.details, /^Invoice INV-7 cancelled \(care on 05 Nov 2026\)\nNopay/);
  assert.deepEqual(row.allocations, []);
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

test('one transfer booked as several ledger entries is ONE payment row (Esther Abraham, 04 Nov)', () => {
  const stamp = '2026-11-04 18:09:11.781245';
  const rows = classify([
    raw({ eff_date: '2026-11-04', category: 'PRODUCT_SALE', transaction_type: 'CREDIT', amount: 1000, payment_method: 'BANK_TRANSFER', created_key: stamp, transaction_code: 'TR-0024261', notes: 'INV-000014 — Product invoice payment' }),
    raw({ eff_date: '2026-11-04', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 28800, payment_method: 'BANK_TRANSFER', created_key: stamp, receipt_code: 'RCP-0000024', transaction_code: 'TR-0024260' }),
    invoice('2026-11-05', 1000, 'INV-000014'),
    invoice('2026-11-05', 4800, 'INV-20261123-0004'),
  ]);
  const s = buildStatement(rows, { start: '2026-11-01', end: '2026-11-30' });
  const pays = s.ledger.filter((r) => r.row_type === 'PAYMENT');
  assert.equal(pays.length, 1);
  assert.equal(pays[0].amount_paid, 29800);
  assert.equal(pays[0].doc_number, 'RCP-0000024'); // the receipt wins over the TR code
  assert.equal(pays[0].transaction_ids.length, 2);
  assert.deepEqual(pays[0].allocations, ['LKR29,800.00 in excess payments']);
  assert.deepEqual(s.ledger[1].allocations, ['LKR1,000.00 from payment RCP-0000024']);
  assert.equal(s.paid, 29800);
});

test('entries are NOT merged when receipts conflict, methods differ or the instants differ', () => {
  const stamp = '2026-11-04 18:09:11.781245';
  const mk = (o) => raw({ eff_date: '2026-11-04', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 100, payment_method: 'BANK_TRANSFER', created_key: stamp, ...o });
  const count = (list) => buildStatement(classify(list), { start: '2026-11-01', end: '2026-11-30' }).ledger.length;
  assert.equal(count([mk({ receipt_code: 'RCP-1' }), mk({ receipt_code: 'RCP-2' })]), 2); // two receipts = two payments
  assert.equal(count([mk({}), mk({ payment_method: 'CASH' })]), 2);
  assert.equal(count([mk({}), mk({ created_key: '2026-11-04 18:09:11.781999' })]), 2);
  assert.equal(count([mk({}), mk({})]), 1); // same action, no receipts: one payment
});

test('backdated payments stamped at midnight are not grouped by instant (that is only a date)', () => {
  const midnight = '2026-11-05 00:00:00.000000';
  const mk = (o) => raw({ eff_date: '2026-11-05', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 51000, payment_method: 'BANK_TRANSFER', created_key: midnight, ...o });
  const s = buildStatement(classify([mk({}), mk({ category: 'REGISTRATION_FEE', amount: 10000 })]), { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s.ledger.length, 2);
  // ...but a shared receipt still joins them
  const s2 = buildStatement(classify([mk({ receipt_code: 'RCP-171' }), mk({ category: 'REGISTRATION_FEE', amount: 10000, receipt_code: 'RCP-171' })]), { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s2.ledger.length, 1);
});

test('booking codes: always on the row, and on allocation lines only for multi-booking clients', () => {
  const one = buildStatement(classify([
    invoice('2026-11-01', 100, 'INV-1', { booking_code: 'BK-00001' }),
    raw({ eff_date: '2026-11-02', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 100, payment_method: 'CASH', receipt_code: 'R1' }),
  ]), { start: '2026-11-01', end: '2026-11-30' });
  assert.match(one.ledger[0].details, /Booking BK-00001/);
  assert.deepEqual(one.ledger[1].allocations, ['LKR100.00 for payment of INV-1']);

  const many = buildStatement(classify([
    invoice('2026-11-01', 100, 'INV-1', { booking_code: 'BK-00001' }),
    invoice('2026-11-01', 100, 'INV-2', { booking_code: 'BK-00002' }),
    raw({ eff_date: '2026-11-02', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 200, payment_method: 'CASH', receipt_code: 'R1' }),
  ]), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(many.ledger[2].allocations, ['LKR100.00 for payment of INV-1 (BK-00001)', 'LKR100.00 for payment of INV-2 (BK-00002)']);
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

test('plain wording; allocation lines are hidden unless asked for', () => {
  const rows = () => classify([
    invoice('2026-07-06', 4500, 'INV-1'),
    raw({ eff_date: '2026-07-06', category: 'WALLET_TOPUP', transaction_type: 'CREDIT', amount: 6000, payment_method: 'BANK_TRANSFER', receipt_code: 'RCP-0000001' }),
  ]);
  const plain = buildStatement(rows(), { start: '2026-07-01', end: '2026-07-31' });
  const [inv, pay] = plain.ledger;
  assert.match(inv.details, /^Care service - 06 Jul 2026\nInvoice INV-1(\n|$)/);
  assert.equal(pay.label, 'Payment Received');
  assert.match(pay.details, /^Bank transfer - Receipt RCP-0000001(\n|$)/);
  assert.deepEqual(pay.annotations, []);
  assert.doesNotMatch(pay.details, /LKR|excess|for payment of/);
  // the maths is unchanged and the allocation is still available
  assert.equal(pay.balance, -1500);
  assert.deepEqual(pay.allocations, ['LKR4,500.00 for payment of INV-1', 'LKR1,500.00 in excess payments']);
  // the detailed version prints them
  const detailed = buildStatement(rows(), { start: '2026-07-01', end: '2026-07-31' }, { showAllocations: true });
  assert.match(detailed.ledger[1].details, /LKR4,500\.00 for payment of INV-1\nLKR1,500\.00 in excess payments$/);
});
