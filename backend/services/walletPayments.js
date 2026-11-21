// services/walletPayments.js
// An admin pays unpaid invoices out of a client's wallet (client page → Invoices).
//
// Targets:
//   { type: 'DAY',         id: <daily_invoice_id>, amount? }   a care day / shift / assignment row
//   { type: 'PRODUCT',     id: <invoice_id>,        amount? }   product or rental invoice
//   { type: 'REG_FEE',                              amount? }   the client's registration fee
//   { type: 'BOOKING_DUE', id: <booking_id>,        amount? }   everything a booking still owes, oldest day first
//
// Rules (shared with the automatic draws — see walletService.takeFromWallet):
//   - Partial payments are allowed; an amount defaults to what is due and may never exceed it.
//   - Money comes from the target booking's own reservation, then unreserved money. Money reserved
//     for OTHER bookings is only used when the admin explicitly allows it, with a reason — the
//     client's money is one pool, but the bookings it was reserved for lose that prepaid cover.
//   - Everything happens in the caller's transaction, so one failure rolls the whole batch back.
//     A preview is the same call rolled back by the caller.
//
// Must run inside an open client transaction.

const { takeFromWallet, drawWalletForBooking } = require('./walletService');
const { payInvoiceFromWallet, ensureInvoiceCharge, CHARGEABLE_CATEGORIES } = require('./invoiceCharges');
const { allocateToDay, reconcileBookingDays } = require('./dayAllocation');
const { getClientRegistrationAudit } = require('./clientRegistrationAudit');
const { settleRegistrationFee } = require('./registrationFeeSplit');
const { recordRegFeeInvoiceDebit } = require('./registrationFeeService');
const { bookingChargeSql, bookingSettledSql } = require('./clientFinancials');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

const fail = (status, message, extra = {}) => {
  const err = new Error(message);
  err.statusCode = status;
  Object.assign(err, extra);
  return err;
};

// Pay-all ordering: registration fee, then products, then care days oldest first.
const TYPE_ORDER = { REG_FEE: 0, PRODUCT: 1, DAY: 2, GENERIC: 3, BOOKING_DUE: 4 };

const mergeBreakdown = (acc, b) => {
  if (!b) return;
  acc.fromOwn = round2(acc.fromOwn + (b.fromOwn || 0));
  acc.fromUnreserved = round2(acc.fromUnreserved + (b.fromUnreserved || 0));
  acc.fromOthers = round2(acc.fromOthers + (b.fromOthers || 0));
  for (const o of b.others || []) {
    const hit = acc.others.find((x) => x.booking_id === o.booking_id);
    if (hit) hit.amount = round2(hit.amount + o.amount);
    else acc.others.push({ ...o });
  }
};

const clearOverdueIfPaid = (client, booking_id) => client.query(
  `UPDATE bookings b SET status = 'ACTIVE'
   WHERE b.booking_id = $1 AND b.status = 'OVERDUE'
     AND (SELECT COALESCE(SUM(t.amount) FILTER (WHERE ${bookingChargeSql('t')}), 0)
               - COALESCE(SUM(t.amount) FILTER (WHERE ${bookingSettledSql('t')}), 0)
          FROM transactions t WHERE t.booking_id = b.booking_id) <= 0.005`,
  [booking_id]
);

// ── Due amounts (reads) ────────────────────────────────────────────────────────

const loadDay = async (client, client_id, id) => {
  const res = await client.query(
    `SELECT d.daily_invoice_id, d.booking_id, d.service_date::text AS service_date, d.status, d.amount,
            b.booking_code, b.status AS booking_status,
            COALESCE((SELECT SUM(p.amount) FROM daily_invoice_payments p WHERE p.daily_invoice_id = d.daily_invoice_id), 0) AS paid
     FROM booking_daily_invoices d JOIN bookings b ON b.booking_id = d.booking_id
     WHERE d.daily_invoice_id = $1 AND b.client_id = $2`,
    [id, client_id]
  );
  const r = res.rows[0];
  if (!r) throw fail(404, 'Care invoice not found for this client');
  if (r.status !== 'INVOICED' || r.amount == null) throw fail(400, `${r.booking_code} ${r.service_date} is not a billed day, so there is nothing to pay`);
  const due = round2(parseFloat(r.amount) - parseFloat(r.paid));
  return { ...r, due, label: `${r.booking_code} · ${r.service_date}` };
};

const loadProduct = async (client, client_id, id) => {
  const res = await client.query(`SELECT * FROM invoices WHERE invoice_id = $1 AND client_id = $2`, [id, client_id]);
  const inv = res.rows[0];
  if (!inv) throw fail(404, 'Invoice not found for this client');
  if (!CHARGEABLE_CATEGORIES.includes(inv.category)) throw fail(400, `${inv.invoice_code} cannot be paid from the wallet (it is paid through its quotation)`);
  if (inv.status === 'PAID') throw fail(400, `${inv.invoice_code} is already paid`);
  const paid = await client.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = $1`, [id]);
  const due = round2(parseFloat(inv.amount) - parseFloat(paid.rows[0].paid));
  return { ...inv, due, label: inv.invoice_code };
};

const loadRegFee = async (client, client_id) => {
  const audit = await getClientRegistrationAudit(client_id);
  const owed = round2(audit?.totals?.owed || 0);
  // Which booking (if any) carries the fee's ledger charge — its payment must sit on the same account.
  const debit = await client.query(
    `SELECT booking_id FROM transactions
     WHERE client_id = $1 AND category::text = 'REGISTRATION_FEE' AND transaction_type = 'DEBIT'
     ORDER BY created_at DESC LIMIT 1`,
    [client_id]
  );
  const hasDebit = debit.rows.length > 0;
  const booking_id = debit.rows[0]?.booking_id || null;
  let due = owed;
  if (booking_id) {
    // On a booking, the fee may already be covered by that booking's general payments.
    const owedRes = await client.query(
      `SELECT COALESCE(SUM(t.amount) FILTER (WHERE ${bookingChargeSql('t')}), 0)
            - COALESCE(SUM(t.amount) FILTER (WHERE ${bookingSettledSql('t')}), 0) AS owed
       FROM transactions t WHERE t.booking_id = $1`,
      [booking_id]
    );
    due = round2(Math.min(owed, Math.max(parseFloat(owedRes.rows[0].owed), 0)));
  }
  return { audit, due, hasDebit, booking_id, invoiced: round2(audit?.totals?.invoiced || 0), label: 'Registration fee' };
};

/** What is currently payable for a client: used by the preview screen and by "pay all". */
const listPayable = async (client, client_id) => {
  const days = await client.query(
    `SELECT d.daily_invoice_id AS id, d.booking_id, b.booking_code, d.service_date::text AS service_date, d.amount,
            COALESCE((SELECT SUM(p.amount) FROM daily_invoice_payments p WHERE p.daily_invoice_id = d.daily_invoice_id), 0) AS paid
     FROM booking_daily_invoices d JOIN bookings b ON b.booking_id = d.booking_id
     WHERE b.client_id = $1 AND d.status = 'INVOICED' AND d.amount IS NOT NULL
     ORDER BY d.service_date, d.created_at`,
    [client_id]
  );
  const products = await client.query(
    `SELECT i.invoice_id AS id, i.invoice_code, i.amount,
            COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.invoice_id), 0) AS paid
     FROM invoices i
     WHERE i.client_id = $1 AND i.category = ANY($2::text[]) AND i.status <> 'PAID'
     ORDER BY i.created_at`,
    [client_id, CHARGEABLE_CATEGORIES]
  );
  const reg = await loadRegFee(client, client_id);
  return {
    reg_fee_due: reg.due,
    products: products.rows.map((r) => ({ id: r.id, code: r.invoice_code, due: round2(parseFloat(r.amount) - parseFloat(r.paid)) })).filter((r) => r.due > EPS),
    days: days.rows.map((r) => ({ id: r.id, booking_id: r.booking_id, booking_code: r.booking_code, service_date: r.service_date, due: round2(parseFloat(r.amount) - parseFloat(r.paid)) })).filter((r) => r.due > EPS),
  };
};

// ── The payment ────────────────────────────────────────────────────────────────

/**
 * @returns {{ items, total, breakdown, wallet_before, wallet_after, bookings_touched }}
 */
const payFromWallet = async (client, { client_id, targets, allowOtherEarmarks = false, overrideReason = null, note = null, actorUserId = null, creditSalespersonForRegistration = null }) => {
  if (!Array.isArray(targets) || targets.length === 0) throw fail(400, 'Choose at least one invoice to pay');
  if (allowOtherEarmarks && String(overrideReason || '').trim().length < 3) {
    throw fail(400, 'A reason is required to use money reserved for other bookings');
  }

  const walletRes = await client.query(`SELECT COALESCE(wallet_balance, 0) AS wallet FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`, [client_id]);
  if (walletRes.rows.length === 0) throw fail(404, 'Client not found');
  const walletBefore = round2(parseFloat(walletRes.rows[0].wallet));

  // Expand BOOKING_DUE into its unpaid days (oldest first), then order everything.
  const expanded = [];
  for (const t of targets) {
    if (t.type === 'BOOKING_DUE') {
      const own = await client.query(
        `SELECT 1 FROM bookings WHERE booking_id = $1 AND client_id = $2`, [t.id, client_id]
      );
      if (own.rows.length === 0) throw fail(404, 'Booking not found for this client');
      await reconcileBookingDays(client, t.id);
      let budget = t.amount != null ? Number(t.amount) : Infinity;
      let covered = 0;
      const take = (type, id, due) => {
        if (budget <= EPS || due <= EPS) return;
        const amt = round2(Math.min(due, budget));
        expanded.push({ type, id, amount: amt });
        budget = round2(budget - amt);
        covered = round2(covered + amt);
      };
      // Registration fee carried by this booking, then its product invoices, then care days.
      const reg = await loadRegFee(client, client_id);
      if (reg.booking_id === t.id) take('REG_FEE', null, reg.due);
      const prods = await client.query(
        `SELECT invoice_id FROM invoices WHERE booking_id = $1 AND client_id = $2 AND category = ANY($3::text[]) AND status <> 'PAID' ORDER BY created_at`,
        [t.id, client_id, CHARGEABLE_CATEGORIES]
      );
      for (const r of prods.rows) take('PRODUCT', r.invoice_id, (await loadProduct(client, client_id, r.invoice_id)).due);
      const days = await client.query(
        `SELECT d.daily_invoice_id FROM booking_daily_invoices d
         WHERE d.booking_id = $1 AND d.status = 'INVOICED' AND d.amount IS NOT NULL
         ORDER BY d.service_date, d.created_at`, [t.id]
      );
      for (const d of days.rows) take('DAY', d.daily_invoice_id, (await loadDay(client, client_id, d.daily_invoice_id)).due);
      // Anything the booking owes that no invoice row explains (older ledger corrections) is paid as
      // a plain booking payment so the booking is still cleared.
      const owedRes = await client.query(
        `SELECT COALESCE(SUM(t.amount) FILTER (WHERE ${bookingChargeSql('t')}), 0)
              - COALESCE(SUM(t.amount) FILTER (WHERE ${bookingSettledSql('t')}), 0) AS owed
         FROM transactions t WHERE t.booking_id = $1`, [t.id]
      );
      const unexplained = round2(Math.max(parseFloat(owedRes.rows[0].owed), 0) - covered);
      if (unexplained > EPS && budget > EPS) {
        expanded.push({ type: 'GENERIC', id: t.id, amount: round2(Math.min(unexplained, budget)) });
      }
    } else {
      expanded.push({ ...t });
    }
  }
  if (expanded.length === 0) throw fail(400, 'Nothing is due on the selected invoices');
  expanded.sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]));

  // Lock + refresh each affected booking's day tracking first (fixed order → no deadlocks).
  const bookingIds = new Set();
  for (const t of expanded) {
    if (t.type === 'DAY') {
      const r = await client.query(`SELECT booking_id FROM booking_daily_invoices WHERE daily_invoice_id = $1`, [t.id]);
      if (r.rows[0]) bookingIds.add(r.rows[0].booking_id);
    } else if (t.type === 'GENERIC') {
      bookingIds.add(t.id);
    }
  }
  for (const id of [...bookingIds].sort()) await reconcileBookingDays(client, id);

  // Pass 1: work out what is due for every target and validate the amounts.
  const plan = [];
  for (const t of expanded) {
    let detail;
    if (t.type === 'DAY') detail = await loadDay(client, client_id, t.id);
    else if (t.type === 'PRODUCT') detail = await loadProduct(client, client_id, t.id);
    else if (t.type === 'REG_FEE') detail = await loadRegFee(client, client_id);
    else if (t.type === 'GENERIC') {
      const b = await client.query(`SELECT booking_code FROM bookings WHERE booking_id = $1 AND client_id = $2`, [t.id, client_id]);
      if (!b.rows[0]) throw fail(404, 'Booking not found for this client');
      detail = { due: t.amount, label: `${b.rows[0].booking_code} · other charges`, booking_id: t.id };
    }
    else throw fail(400, `Unknown target type ${t.type}`);

    if (detail.due <= EPS) throw fail(400, `${detail.label} has nothing due`);
    const amount = t.amount == null ? detail.due : round2(Number(t.amount));
    if (!(amount > EPS)) throw fail(400, `The amount for ${detail.label} must be greater than 0`);
    if (amount > detail.due + EPS) throw fail(400, `The amount for ${detail.label} (${amount.toFixed(2)}) is more than is due (${detail.due.toFixed(2)})`);
    plan.push({ type: t.type, id: t.id, amount, detail });
  }
  const total = round2(plan.reduce((s, p) => s + p.amount, 0));
  if (total > walletBefore + EPS) {
    throw fail(400, `Insufficient wallet balance. Available: ${walletBefore.toFixed(2)}, requested: ${total.toFixed(2)}`);
  }

  // Pass 2: pay.
  const breakdown = { fromOwn: 0, fromUnreserved: 0, fromOthers: 0, others: [] };
  const items = [];
  const touchedBookings = new Set();
  const withNote = (text) => [text, note && note.trim()].filter(Boolean).join(' — ');
  const shortBy = (label, got, wanted) => fail(409,
    `Only ${got.toFixed(2)} of the ${wanted.toFixed(2)} for ${label} can be paid without using money reserved for other bookings. Enable the override (with a reason) to use it.`,
    { code: 'NEEDS_OVERRIDE' });

  for (const p of plan) {
    const out = {};
    if (p.type === 'DAY') {
      const d = p.detail;
      await drawWalletForBooking(client, {
        booking_id: d.booking_id, client_id, maxAmount: p.amount, verified_by: actorUserId,
        allowOtherEarmarks, outcome: out,
        notes: withNote(`Paid from client wallet by admin — ${d.service_date}`),
      });
      if ((out.drawn || 0) + EPS < p.amount) throw shortBy(d.label, out.drawn || 0, p.amount);
      await allocateToDay(client, { daily_invoice_id: p.id, amount: out.drawn, transaction_id: out.transaction_id, source: 'MANUAL', created_by: actorUserId, note: 'Paid from wallet' });
      touchedBookings.add(d.booking_id);
    } else if (p.type === 'GENERIC') {
      await drawWalletForBooking(client, {
        booking_id: p.id, client_id, maxAmount: p.amount, verified_by: actorUserId, allowOtherEarmarks, outcome: out,
        notes: withNote('Paid from client wallet by admin'),
      });
      if ((out.drawn || 0) + EPS < p.amount) throw shortBy(p.detail.label, out.drawn || 0, p.amount);
      touchedBookings.add(p.id);
    } else if (p.type === 'PRODUCT') {
      await ensureInvoiceCharge(client, p.id);
      const drawn = await payInvoiceFromWallet(client, {
        invoiceId: p.id, maxAmount: p.amount, verified_by: actorUserId, allowOtherEarmarks, outcome: out,
        notes: withNote(`${p.detail.invoice_code} — paid from client wallet by admin`),
      });
      if (drawn + EPS < p.amount) throw shortBy(p.detail.label, drawn, p.amount);
      if (p.detail.booking_id) touchedBookings.add(p.detail.booking_id);
    } else {
      const r = p.detail;
      // An invoice sent to the client with no ledger charge yet gets its charge first (never twice).
      if (!r.hasDebit) {
        await recordRegFeeInvoiceDebit(client, { client_id, amount: r.invoiced || p.amount, notes: 'Registration fee', ignoreOverdueInvoice: true });
      }
      const taken = await takeFromWallet(client, { client_id, booking_id: r.booking_id, amount: p.amount, allowOtherEarmarks });
      Object.assign(out, taken);
      if (taken.drawn + EPS < p.amount) throw shortBy(r.label, taken.drawn, p.amount);
      await client.query(
        `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, payment_method, status, notes, verified_by, created_at)
         VALUES ($1, $2, 'REGISTRATION_FEE', 'CREDIT', $3, 'WALLET', 'COMPLETED', $4, $5, NOW())`,
        [client_id, r.booking_id, taken.drawn, withNote('Registration fee paid from client wallet by admin'), actorUserId]
      );
      if (r.booking_id) {
        await client.query(
          `INSERT INTO booking_payment_tracking (booking_id, client_id, amount_received, payment_method, notes, status, verified_at, verified_by)
           VALUES ($1, $2, $3, 'WALLET', $4, 'VERIFIED', NOW(), $5)`,
          [r.booking_id, client_id, taken.drawn, withNote('Registration fee paid from client wallet by admin'), actorUserId]
        );
        await client.query(
          `UPDATE bookings SET amount_paid = (SELECT COALESCE(SUM(amount_received), 0) FROM booking_payment_tracking
                                              WHERE booking_id = $1 AND status = 'VERIFIED') WHERE booking_id = $1`,
          [r.booking_id]
        );
        touchedBookings.add(r.booking_id);
      }
      // Fully paid → settle the registration (status, overdue row, salesperson credit).
      if (p.amount >= r.due - EPS) {
        const li = await client.query(
          `SELECT li.salesperson_id FROM quote_line_items li JOIN quotations q ON q.quote_id = li.quote_id
           WHERE q.client_id = $1 AND li.is_registration_fee = true ORDER BY q.created_at DESC LIMIT 1`,
          [client_id]
        );
        await settleRegistrationFee(client, {
          client_id, regFeeItem: { amount: r.invoiced || p.amount, salesperson_id: li.rows[0]?.salesperson_id || null },
          verified_by: actorUserId, creditSalespersonForRegistration,
        });
      }
    }
    mergeBreakdown(breakdown, out);
    items.push({
      type: p.type, id: p.id || null, label: p.detail.label, amount: p.amount,
      due_before: p.detail.due, due_after: round2(p.detail.due - p.amount),
      from_own: round2(out.fromOwn || 0), from_unreserved: round2(out.fromUnreserved || 0), from_others: round2(out.fromOthers || 0),
    });
  }

  for (const id of [...touchedBookings].sort()) {
    await reconcileBookingDays(client, id);
    await clearOverdueIfPaid(client, id);
  }

  return { items, total, breakdown, wallet_before: walletBefore, wallet_after: round2(walletBefore - total), bookings_touched: [...touchedBookings] };
};

module.exports = { payFromWallet, listPayable };
