// Integration tests for per-day payment tracking and paying invoices from the wallet.
//
//   node --test tests/
//
// They need the LOCAL development database (see .env) and pick two bookings that have no
// transactions or day rows to build their scenarios on. Every test runs inside a transaction that
// is rolled back, so nothing is left behind. NEVER point this at a real database.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const { reverseServiceInvoice } = require('../services/billingService');
const { reconcileBookingDays, releaseDay } = require('../services/dayAllocation');
const { payFromWallet } = require('../services/walletPayments');

if (/amazonaws|rds\./i.test(process.env.DB_HOST || '')) {
  throw new Error('Refusing to run: DB_HOST looks like a real (AWS) database');
}

let c;
let b;
let other;

const tx = (bid, cat, type, amt, pm = null, notes = 'x') => c.query(
  `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, payment_method, status, notes)
   VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7) RETURNING transaction_id`, [b.client_id, bid, cat, type, amt, pm, notes]);
const track = (bid, amt) => c.query(
  `INSERT INTO booking_payment_tracking (booking_id, client_id, amount_received, payment_method, notes, status, verified_at)
   VALUES ($1, $2, $3, 'WALLET', 't', 'VERIFIED', NOW())`, [bid, b.client_id, amt]);

const setup = async ({ wallet = 0, earmark = 0, days = 0, payments = 0 }) => {
  await c.query('BEGIN');
  await c.query(`UPDATE client_profiles SET wallet_balance = $2 WHERE client_profile_id = $1`, [b.client_id, wallet]);
  await c.query(`UPDATE bookings SET wallet_earmarked = $2, amount_paid = $3 WHERE booking_id = $1`, [b.booking_id, earmark, payments * 4800]);
  const ids = [];
  for (let i = 0; i < days; i++) {
    const t = await tx(b.booking_id, 'SERVICE_INVOICE', 'DEBIT', 4800);
    const d = await c.query(
      `INSERT INTO booking_daily_invoices (booking_id, service_date, entry_mode, status, amount, transaction_id)
       VALUES ($1, $2, 'AUTO', 'INVOICED', 4800, $3) RETURNING daily_invoice_id`, [b.booking_id, `2026-11-${17 + i}`, t.rows[0].transaction_id]);
    ids.push(d.rows[0].daily_invoice_id);
  }
  for (let i = 0; i < payments; i++) { await tx(b.booking_id, 'BOOKING_PAYMENT', 'CREDIT', 4800, 'WALLET'); await track(b.booking_id, 4800); }
  return ids;
};
const paidOf = async (id) => parseFloat((await c.query(
  `SELECT COALESCE(SUM(amount), 0) AS p FROM daily_invoice_payments WHERE daily_invoice_id = $1`, [id])).rows[0].p);
const money = async () => (await c.query(
  `SELECT b.amount_paid::float AS paid, b.wallet_earmarked::float AS earmark, cp.wallet_balance::float AS wallet
   FROM bookings b JOIN client_profiles cp ON cp.client_profile_id = b.client_id WHERE b.booking_id = $1`, [b.booking_id])).rows[0];

test.before(async () => {
  c = await db.pool.connect();
  const r = await c.query(
    `SELECT b.booking_id, b.client_id FROM bookings b
     WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.booking_id = b.booking_id)
       AND NOT EXISTS (SELECT 1 FROM booking_daily_invoices d WHERE d.booking_id = b.booking_id) LIMIT 2`);
  [b, other] = r.rows;
  assert.ok(b && other, 'need two empty bookings in the local database');
});
test.afterEach(async () => { await c.query('ROLLBACK').catch(() => {}); });
test.after(async () => { c.release(); await db.pool.end(); });

test('payments settle the oldest billed days first and reconcile is idempotent', async () => {
  const ids = await setup({ days: 4, payments: 3 });
  await reconcileBookingDays(c, b.booking_id);
  assert.deepEqual(await Promise.all(ids.map(paidOf)), [4800, 4800, 4800, 0]);
  const again = await reconcileBookingDays(c, b.booking_id);
  assert.equal(again.added, 0); assert.equal(again.released, 0);
});

test('paying one day from its own reservation marks only that day paid', async () => {
  const ids = await setup({ wallet: 4800, earmark: 4800, days: 4, payments: 3 });
  await reconcileBookingDays(c, b.booking_id);
  const r = await payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[3] }] });
  assert.equal(r.total, 4800); assert.equal(r.breakdown.fromOwn, 4800);
  assert.equal(await paidOf(ids[3]), 4800);
  assert.deepEqual(await money(), { paid: 19200, earmark: 0, wallet: 0 });
});

test('partial payment, then insufficient wallet is rejected', async () => {
  const ids = await setup({ wallet: 3000, earmark: 3000, days: 2 });
  await payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[0], amount: 2000 }] });
  assert.equal(await paidOf(ids[0]), 2000);
  await assert.rejects(() => payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[1] }] }), /Insufficient wallet/);
});

test('paying more than is due is rejected', async () => {
  const ids = await setup({ wallet: 10000, earmark: 10000, days: 1 });
  await assert.rejects(() => payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[0], amount: 5000 }] }), /more than is due/);
});

test('other bookings’ reserved money needs the override and a reason', async () => {
  const ids = await setup({ wallet: 4800, earmark: 0, days: 1 });
  await c.query(`UPDATE bookings SET wallet_earmarked = 4800, client_id = $2 WHERE booking_id = $1`, [other.booking_id, b.client_id]);
  await assert.rejects(() => payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[0] }] }), (e) => e.code === 'NEEDS_OVERRIDE');
  await assert.rejects(() => payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[0] }], allowOtherEarmarks: true }), /reason is required/);
  await c.query('SAVEPOINT s');
  const r = await payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'DAY', id: ids[0] }], allowOtherEarmarks: true, overrideReason: 'test' });
  assert.equal(r.breakdown.fromOthers, 4800);
  const o = (await c.query(`SELECT wallet_earmarked::float AS e FROM bookings WHERE booking_id = $1`, [other.booking_id])).rows[0];
  assert.equal(o.e, 0);
});

test('revoking a paid day while another is unpaid applies the freed money, wallet stays empty', async () => {
  const ids = await setup({ days: 4, payments: 3 });
  await reconcileBookingDays(c, b.booking_id);
  await reverseServiceInvoice(c, { booking_id: b.booking_id, client_id: b.client_id, amount: 4800, notes: 'Reversal of 2026-11-17 invoice — t' });
  const rt = await c.query(`SELECT transaction_id FROM transactions WHERE booking_id = $1 AND category = 'WALLET_REFUND'`, [b.booking_id]);
  await c.query(`UPDATE booking_daily_invoices SET status = 'REVOKED', reversal_transaction_id = $2 WHERE daily_invoice_id = $1`, [ids[0], rt.rows[0].transaction_id]);
  await releaseDay(c, ids[0], 'Day revoked');
  await reconcileBookingDays(c, b.booking_id);
  assert.deepEqual(await Promise.all(ids.map(paidOf)), [0, 4800, 4800, 4800]);
  assert.equal((await money()).wallet, 0);
});

test('BOOKING_DUE pays oldest day first and sweeps unexplained ledger debt last', async () => {
  const ids = await setup({ wallet: 10000, earmark: 10000, days: 3 });
  await tx(b.booking_id, 'SERVICE_INVOICE', 'DEBIT', 500); // old correction with no day row
  const r = await payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'BOOKING_DUE', id: b.booking_id, amount: 10000 }] });
  assert.equal(r.total, 10000);
  assert.deepEqual(await Promise.all(ids.map(paidOf)), [4800, 4800, 400]);
});

test('product invoice: partial then full payment marks it paid', async () => {
  await setup({ wallet: 3000 });
  const inv = await c.query(`INSERT INTO invoices (category, client_id, amount, status) VALUES ('PRODUCT', $1, 2500, 'PENDING') RETURNING invoice_id`, [b.client_id]);
  await payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'PRODUCT', id: inv.rows[0].invoice_id, amount: 1000 }] });
  await payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'PRODUCT', id: inv.rows[0].invoice_id }] });
  assert.equal((await c.query(`SELECT status FROM invoices WHERE invoice_id = $1`, [inv.rows[0].invoice_id])).rows[0].status, 'PAID');
  await assert.rejects(() => payFromWallet(c, { client_id: b.client_id, targets: [{ type: 'PRODUCT', id: inv.rows[0].invoice_id }] }), /already paid/);
});
