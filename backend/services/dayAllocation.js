// services/dayAllocation.js
// Per-day payment tracking for care invoices (booking_daily_invoices).
//
// A booking's payments are ONE pool (ledger credits on the booking). That cannot say whether
// "the 20 Nov invoice" is paid — which matters for SHIFT_BASED bookings (several rows a day) and
// for a LIVE_IN booking's first/last day (one row per assignment). daily_invoice_payments records
// how much of the pool settles each day row. Positive rows allocate, negative rows release, so a
// day's paid amount is simply the SUM and nothing is ever overwritten.
//
// Invariant kept by reconcileBookingDays():
//     SUM(automatic allocations on live days)  ==  min(service pool, SUM(live day amounts) − manual)
// where the service pool is the booking's settled credits, less
//   - whatever settles its non-day charges (registration fee, product invoices — settled first,
//     as everywhere else), and
//   - the revoked days' own money: a revoked day keeps its debit and its payment on the ledger,
//     and the refund returned that payment, so the two cancel and are not available to live days.
//     A revoke WITHOUT refund keeps the day's allocation as forfeited money (never released).
// Money an admin explicitly paid towards a specific day (source 'MANUAL') is "designated": it is
// backed by its own credit, is never absorbed by the registration-fee shortfall and is only ever
// released when the day itself changes.
//   - If a payment shrinks (voided, edited, a revoked day's payment returned), allocations are
//     trimmed newest-day-first, automatic ones before manual ones.
//   - If the pool grows (any payment lands), the extra is allocated to the oldest unpaid day.
//   - Allocations are never MOVED between days: an admin who paid a specific day keeps that day paid.
//
// Everything here must run inside the caller's open transaction.

const { bookingChargeSql, bookingSettledSql } = require('./clientFinancials');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const EPS = 0.005;
const OWN_CREDIT_CATEGORIES = `('REGISTRATION_FEE', 'PRODUCT_SALE', 'RENTAL_PAYMENT')`;

/**
 * Money on the booking that is available to settle its care days.
 *   generic credits (everything that is not a registration-fee / product payment)
 *   minus the part of the booking's non-day charges those own payments did not cover.
 */
const getServicePool = async (client, booking_id) => {
  const { pool } = await getPoolDetail(client, booking_id);
  return pool;
};

const getPoolDetail = async (client, booking_id) => {
  const res = await client.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE ${bookingSettledSql()}), 0) AS settled,
       COALESCE(SUM(amount) FILTER (WHERE ${bookingSettledSql()} AND category::text IN ${OWN_CREDIT_CATEGORIES}), 0) AS own_paid,
       COALESCE(SUM(amount) FILTER (WHERE ${bookingChargeSql()} AND category::text <> 'SERVICE_INVOICE'), 0) AS non_day_debits
     FROM transactions
     WHERE booking_id = $1`,
    [booking_id]
  );
  const r = res.rows[0];
  const settled = parseFloat(r.settled);
  const ownPaid = parseFloat(r.own_paid);
  const nonDayDebits = parseFloat(r.non_day_debits);
  const generic = settled - ownPaid;
  const shortfall = Math.max(nonDayDebits - ownPaid, 0);

  const rev = await client.query(
    `SELECT
       COALESCE(SUM(d.amount) FILTER (WHERE d.reversal_transaction_id IS NOT NULL), 0) AS refunded,
       COALESCE(SUM((SELECT COALESCE(SUM(p.amount), 0) FROM daily_invoice_payments p WHERE p.daily_invoice_id = d.daily_invoice_id))
                FILTER (WHERE d.reversal_transaction_id IS NULL), 0) AS forfeited
     FROM booking_daily_invoices d
     WHERE d.booking_id = $1 AND d.status = 'REVOKED'`,
    [booking_id]
  );
  const revokedOffset = parseFloat(rev.rows[0].refunded) + parseFloat(rev.rows[0].forfeited);

  // Explicitly designated money sits outside the automatic pool.
  const des = await client.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS designated
     FROM daily_invoice_payments p JOIN booking_daily_invoices d ON d.daily_invoice_id = p.daily_invoice_id
     WHERE d.booking_id = $1 AND p.source = 'MANUAL'`,
    [booking_id]
  );
  const designated = Math.max(parseFloat(des.rows[0].designated), 0);
  const pool = round2(Math.max(generic - designated - shortfall - revokedOffset, 0));
  return { pool, generic: round2(generic), designated: round2(designated) };
};

const loadDays = async (client, booking_id) => {
  const res = await client.query(
    `SELECT d.daily_invoice_id, d.service_date::text AS service_date, d.status, d.amount, d.created_at,
            d.reversal_transaction_id,
            COALESCE(SUM(p.amount), 0) AS alloc,
            COALESCE(SUM(p.amount) FILTER (WHERE p.source = 'MANUAL'), 0) AS manual
     FROM booking_daily_invoices d
     LEFT JOIN daily_invoice_payments p ON p.daily_invoice_id = d.daily_invoice_id
     WHERE d.booking_id = $1
     GROUP BY d.daily_invoice_id
     ORDER BY d.service_date, d.created_at, d.daily_invoice_id`,
    [booking_id]
  );
  return res.rows.map((r) => ({
    id: r.daily_invoice_id, date: r.service_date, status: r.status,
    live: r.status === 'INVOICED' && r.amount != null,
    // A revoke without refund keeps the paid money as forfeited — it stays on the day.
    forfeited: r.status === 'REVOKED' && !r.reversal_transaction_id,
    amount: r.amount == null ? 0 : parseFloat(r.amount),
    alloc: round2(parseFloat(r.alloc)), manual: round2(parseFloat(r.manual)),
  }));
};

const insertRow = (client, { daily_invoice_id, amount, source, transaction_id = null, created_by = null, note = null }) =>
  client.query(
    `INSERT INTO daily_invoice_payments (daily_invoice_id, transaction_id, amount, source, created_by, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [daily_invoice_id, transaction_id, round2(amount), source, created_by, note]
  );

/** Explicitly settle (part of) one day — used when an admin pays a specific day. */
const allocateToDay = async (client, { daily_invoice_id, amount, transaction_id = null, source = 'MANUAL', created_by = null, note = null }) => {
  if (!(amount > EPS)) return;
  await insertRow(client, { daily_invoice_id, amount, source, transaction_id, created_by, note });
};

/** Frees everything allocated to one day (revoked, skipped, charge removed). */
const releaseDay = async (client, daily_invoice_id, note = 'Released') => {
  const res = await client.query(
    `SELECT source, COALESCE(SUM(amount), 0) AS amount FROM daily_invoice_payments
     WHERE daily_invoice_id = $1 GROUP BY source`,
    [daily_invoice_id]
  );
  for (const r of res.rows) {
    const amt = round2(parseFloat(r.amount));
    if (Math.abs(amt) > EPS) await insertRow(client, { daily_invoice_id, amount: -amt, source: r.source, note });
  }
};

/**
 * Brings a booking's day allocations back in line with its payment pool (see the header).
 * Idempotent and cheap; call it at the end of anything that changes a booking's payments, a day's
 * amount or status. Locks the booking row.
 */
const reconcileBookingDays = async (client, booking_id, { created_by = null } = {}) => {
  if (!booking_id) return { pool: 0, allocated: 0, released: 0, added: 0 };
  await client.query(`SELECT 1 FROM bookings WHERE booking_id = $1 FOR UPDATE`, [booking_id]);

  const { pool, generic } = await getPoolDetail(client, booking_id);
  const days = await loadDays(client, booking_id);
  let released = 0;
  let added = 0;

  const release = async (day, amount, source, note) => {
    const amt = round2(Math.min(amount, source === 'MANUAL' ? day.manual : day.alloc - day.manual));
    if (amt <= EPS) return 0;
    await insertRow(client, { daily_invoice_id: day.id, amount: -amt, source, created_by, note });
    day.alloc = round2(day.alloc - amt);
    if (source === 'MANUAL') day.manual = round2(day.manual - amt);
    released += amt;
    return amt;
  };

  // 1. Days that no longer carry a charge hold nothing; a day never holds more than it costs.
  for (const day of days) {
    if (day.alloc <= EPS || day.forfeited) continue;
    const keep = day.live ? day.amount : 0;
    let excess = round2(day.alloc - keep);
    if (excess > EPS) {
      excess -= await release(day, excess, 'AUTO', day.live ? 'Day amount reduced' : 'Day no longer billed');
      if (excess > EPS) await release(day, excess, 'MANUAL', day.live ? 'Day amount reduced' : 'Day no longer billed');
    }
  }

  // 2. More allocated than the money can back → trim newest day first. Automatic allocations are
  //    limited by the automatic pool; designated (manual) ones only by the booking's credits.
  const live = days.filter((d) => !d.forfeited);
  const autoOf = (d) => round2(d.alloc - d.manual);
  let autoTotal = round2(live.reduce((s, d) => s + autoOf(d), 0));
  if (autoTotal > pool + EPS) {
    let over = round2(autoTotal - pool);
    for (const day of [...live].reverse()) {
      if (over <= EPS) break;
      over -= await release(day, over, 'AUTO', 'Payment no longer covers this day');
    }
    autoTotal = round2(live.reduce((s, d) => s + autoOf(d), 0));
  }
  const manualTotal = round2(live.reduce((s, d) => s + d.manual, 0));
  if (manualTotal > generic + EPS) {
    let over = round2(manualTotal - generic);
    for (const day of [...live].reverse()) {
      if (over <= EPS) break;
      over -= await release(day, over, 'MANUAL', 'Payment no longer covers this day');
    }
  }

  // 3. Automatic pool money not yet allocated → oldest unpaid day first.
  let spare = round2(pool - autoTotal);
  for (const day of live) {
    if (spare <= EPS) break;
    if (!day.live) continue;
    const due = round2(day.amount - day.alloc);
    if (due <= EPS) continue;
    const give = round2(Math.min(due, spare));
    await insertRow(client, { daily_invoice_id: day.id, amount: give, source: 'AUTO', created_by, note: 'Applied from booking payments' });
    day.alloc = round2(day.alloc + give);
    spare = round2(spare - give);
    added += give;
  }

  return { pool, allocated: round2(live.reduce((s, d) => s + d.alloc, 0)), released: round2(released), added: round2(added) };
};

/**
 * Reconciles every booking that has billed days — the nightly safety net (and the backfill's
 * engine), so a payment path that does not call reconcileBookingDays() cannot leave a day's
 * status stale for more than a day. Each booking runs inside its own savepoint.
 */
const reconcileAllBookingDays = async (client) => {
  const res = await client.query(
    `SELECT DISTINCT booking_id FROM booking_daily_invoices WHERE status = 'INVOICED' OR status = 'REVOKED'`
  );
  let changed = 0;
  for (const { booking_id } of res.rows) {
    try {
      await client.query('SAVEPOINT day_alloc');
      const r = await reconcileBookingDays(client, booking_id);
      if (r.released > EPS || r.added > EPS) changed++;
      await client.query('RELEASE SAVEPOINT day_alloc');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT day_alloc').catch(() => {});
      console.error(`Day allocation reconcile failed for booking ${booking_id}:`, err.message);
    }
  }
  return { bookings: res.rows.length, changed };
};

/**
 * Self-heal for one client, run before the Invoices tab reads day statuses: reconciles each of the
 * client's bookings in its own short transaction. Best effort — a failure never blocks the page.
 */
const reconcileClientBookingDays = async (client_id) => {
  const db = require('../config/db');
  const res = await db.query(
    `SELECT DISTINCT d.booking_id FROM booking_daily_invoices d JOIN bookings b ON b.booking_id = d.booking_id
     WHERE b.client_id = $1 AND d.status IN ('INVOICED', 'REVOKED')`,
    [client_id]
  );
  for (const { booking_id } of res.rows) {
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      await reconcileBookingDays(c, booking_id);
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      console.error('Day allocation self-heal failed for', booking_id, err.message);
    } finally {
      c.release();
    }
  }
};

/** Paid / due / status for a day row from its amount and allocations. */
const dayPaymentState = (status, amount, paid) => {
  if (status !== 'INVOICED' || amount == null) return { payment_status: null, amount_paid: 0, amount_due: 0 };
  const amt = Number(amount);
  const p = Math.min(Math.max(Number(paid || 0), 0), amt);
  const due = round2(amt - p);
  return {
    payment_status: due <= EPS ? 'PAID' : p > EPS ? 'PART_PAID' : 'UNPAID',
    amount_paid: round2(p),
    amount_due: due <= EPS ? 0 : due,
  };
};

/** SQL expression: amount allocated to a day row. `alias` is the booking_daily_invoices alias. */
const dayPaidSql = (alias = 'bdi') =>
  `(SELECT COALESCE(SUM(p.amount), 0) FROM daily_invoice_payments p WHERE p.daily_invoice_id = ${alias}.daily_invoice_id)`;

module.exports = {
  getServicePool,
  getPoolDetail,
  reconcileBookingDays,
  reconcileAllBookingDays,
  reconcileClientBookingDays,
  allocateToDay,
  releaseDay,
  dayPaymentState,
  dayPaidSql,
};
