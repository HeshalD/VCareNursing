// services/walletService.js
// Shared helpers for the client wallet (client_profiles.wallet_balance) acting as
// a standing account: service-charge money paid against a quotation lands here,
// and is only drawn onto a specific booking when a day/shift is actually invoiced.
// All functions must be called within an open client transaction (BEGIN already
// issued by the caller).
//
// EARMARKING — the wallet is one shared pool per client, but each booking records
// how much of that pool was funded for it and not yet consumed, in
// bookings.wallet_earmarked. That figure is what the admin settles when a booking
// ends early (see services/bookingSettlement.js). Money paid without a booking to
// attribute it to (a plain overpayment, or an admin-chosen wallet top-up) stays
// "unearmarked" — the difference between wallet_balance and the sum of earmarks.
//
// Draw order is deliberately: a booking's own earmark first, then unearmarked
// money, and NEVER another booking's earmark. A client's prepayment for booking A
// cannot be silently consumed by booking B; if A's own funds run out the charge
// goes overdue even while B still holds money.

const { bookingChargeSql, bookingSettledSql } = require('./clientFinancials');

// Total currently reserved across all of a client's bookings. Used to work out how
// much of the wallet is unearmarked and therefore free for any booking to draw.
const getEarmarkedTotal = async (client, client_id) => {
  const res = await client.query(
    `SELECT COALESCE(SUM(wallet_earmarked), 0) AS earmarked
     FROM bookings WHERE client_id = $1`,
    [client_id]
  );
  return parseFloat(res.rows[0]?.earmarked || 0);
};

// Credits the client's real wallet balance and records a WALLET_TOPUP transaction.
// Pass earmark_booking_id when this money is being paid toward a specific booking
// so it is reserved for that booking; leave it null for genuinely unattributed
// money (overpayment beyond a quotation, or an explicit wallet top-up).
const creditClientWallet = async (client, {
  client_id,
  quote_id = null,
  earmark_booking_id = null,
  amount,
  payment_method = null,
  bank_account_id = null,
  cheque_number = null,
  cheque_date = null,
  reference_number = null,
  receipt_url = null,
  notes = null,
  verified_by = null,
  // Ledger date for the resulting transaction row. Defaults to now; pass the
  // real payment date when recording a backdated payment so the statement
  // reflects when the money came in, not when it was keyed in.
  created_at = null,
}) => {
  await client.query(
    `UPDATE client_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE client_profile_id = $2`,
    [amount, client_id]
  );

  if (earmark_booking_id) {
    await client.query(
      `UPDATE bookings SET wallet_earmarked = COALESCE(wallet_earmarked, 0) + $1 WHERE booking_id = $2`,
      [amount, earmark_booking_id]
    );
  }

  const txResult = await client.query(
    `INSERT INTO transactions (
       client_id, quote_id, earmarked_booking_id, category, transaction_type, amount, payment_method,
       bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
       notes, status, verified_by, created_at
     ) VALUES ($1, $2, $3, 'WALLET_TOPUP', 'CREDIT', $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12,
               COALESCE($13::timestamptz, CURRENT_TIMESTAMP))
     RETURNING transaction_id`,
    [
      client_id, quote_id, earmark_booking_id, amount, payment_method, bank_account_id,
      cheque_number, cheque_date, reference_number, receipt_url,
      notes || 'Overpayment credited to wallet', verified_by, created_at,
    ]
  );

  return txResult.rows[0].transaction_id;
};

// Takes money out of the client's wallet and releases the matching reservation(s). The one place
// that decides WHICH money is spent:
//   1. the target booking's own reservation, 2. unreserved money, then — only when the admin
//   explicitly allows it (allowOtherEarmarks) — 3. other bookings' reservations, largest first.
// Without the override the old rule holds: a prepayment for booking A is never silently consumed
// by booking B. With it, the client's money is treated as one pool; the bookings it was reserved
// for simply have less prepaid cover afterwards. Locks the wallet row FOR UPDATE so concurrent
// draws can't double-spend. Returns the breakdown; drawn is 0 when nothing was available.
const takeFromWallet = async (client, { client_id, booking_id = null, amount, allowOtherEarmarks = false }) => {
  const none = { drawn: 0, fromOwn: 0, fromUnreserved: 0, fromOthers: 0, others: [] };
  if (!(amount > 0)) return none;

  const walletRes = await client.query(
    `SELECT COALESCE(wallet_balance, 0) as wallet_balance FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`,
    [client_id]
  );
  const walletBalance = parseFloat(walletRes.rows[0]?.wallet_balance || 0);

  let ownEarmark = 0;
  if (booking_id) {
    const ownRes = await client.query(
      `SELECT COALESCE(wallet_earmarked, 0) AS own FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [booking_id]
    );
    ownEarmark = parseFloat(ownRes.rows[0]?.own || 0);
  }

  // Anything in the wallet not reserved by any booking is fair game for this one.
  const earmarkedTotal = await getEarmarkedTotal(client, client_id);
  const unreserved = Math.max(0, walletBalance - earmarkedTotal);

  const available = allowOtherEarmarks ? walletBalance : Math.min(walletBalance, ownEarmark + unreserved);
  const drawn = Math.round(Math.min(amount, available) * 100) / 100;
  if (drawn <= 0.005) return none;

  const fromOwn = Math.min(drawn, ownEarmark);
  const fromUnreserved = Math.min(drawn - fromOwn, unreserved);
  const fromOthers = Math.round((drawn - fromOwn - fromUnreserved) * 100) / 100;

  await client.query(
    `UPDATE client_profiles SET wallet_balance = wallet_balance - $1 WHERE client_profile_id = $2`,
    [drawn, client_id]
  );

  // Consume the booking's own reservation first so unreserved money stays available for whatever
  // needs it next.
  if (fromOwn > 0) {
    await client.query(
      `UPDATE bookings SET wallet_earmarked = GREATEST(COALESCE(wallet_earmarked, 0) - $1, 0) WHERE booking_id = $2`,
      [fromOwn, booking_id]
    );
  }

  const others = [];
  if (fromOthers > 0.005) {
    const otherRes = await client.query(
      `SELECT booking_id, booking_code, wallet_earmarked FROM bookings
       WHERE client_id = $1 AND COALESCE(wallet_earmarked, 0) > 0 AND booking_id IS DISTINCT FROM $2
       ORDER BY wallet_earmarked DESC, booking_id FOR UPDATE`,
      [client_id, booking_id]
    );
    let left = fromOthers;
    for (const o of otherRes.rows) {
      if (left <= 0.005) break;
      const take = Math.round(Math.min(left, parseFloat(o.wallet_earmarked)) * 100) / 100;
      await client.query(
        `UPDATE bookings SET wallet_earmarked = GREATEST(COALESCE(wallet_earmarked, 0) - $1, 0) WHERE booking_id = $2`,
        [take, o.booking_id]
      );
      others.push({ booking_id: o.booking_id, booking_code: o.booking_code, amount: take });
      left = Math.round((left - take) * 100) / 100;
    }
  }

  return { drawn, fromOwn, fromUnreserved, fromOthers, others };
};

// Draws up to maxAmount from the client's wallet to fund a booking's amount_paid (see
// takeFromWallet for which money is used). Returns the amount actually drawn (0 if nothing was
// available). Pass `outcome` to receive the full breakdown.
const drawWalletForBooking = async (client, { booking_id, client_id, maxAmount, verified_by = null, allowOtherEarmarks = false, outcome = null, notes = null }) => {
  if (!(maxAmount > 0)) return 0;

  const taken = await takeFromWallet(client, { client_id, booking_id, amount: maxAmount, allowOtherEarmarks });
  if (outcome) Object.assign(outcome, taken);
  const drawAmount = taken.drawn;
  if (drawAmount <= 0.005) return 0;

  await client.query(
    `INSERT INTO booking_payment_tracking (
       booking_id, client_id, amount_received, payment_method, notes,
       status, verified_at, verified_by
     ) VALUES ($1, $2, $3, 'WALLET', $5, 'VERIFIED', NOW(), $4)`,
    [booking_id, client_id, drawAmount, verified_by, notes || 'Auto-applied from client wallet balance']
  );


  await client.query(
    `UPDATE bookings
     SET
       amount_paid = (
         SELECT COALESCE(SUM(amount_received), 0)
         FROM booking_payment_tracking
         WHERE booking_id = $1 AND status = 'VERIFIED'
       ),
       last_payment_date = NOW()
     WHERE booking_id = $1`,
    [booking_id]
  );

  const txRes = await client.query(
    `INSERT INTO transactions (
       client_id, booking_id, category, transaction_type, amount, payment_method,
       status, notes, verified_by
     ) VALUES ($1, $2, 'BOOKING_PAYMENT', 'CREDIT', $3, 'WALLET', 'COMPLETED', $5, $4)
     RETURNING transaction_id`,
    [client_id, booking_id, drawAmount, verified_by, notes || 'Auto-applied from client wallet balance']
  );
  if (outcome) outcome.transaction_id = txRes.rows[0].transaction_id;

  return drawAmount;
};

// Settles whatever a booking has already been invoiced but not yet paid, out of the
// client's wallet. Quotation payments only ever land in the wallet; a booking draws
// from it as each day/shift is invoiced. Charges raised BEFORE the money arrived
// (booking running unpaid, then the quotation is paid) would otherwise stay open on
// the booking's ledger — and show as overdue — while the matching cash sits unused
// in the wallet. Call this right after a wallet credit that is meant for the booking.
// Returns the amount drawn (0 if nothing was owed or available).
const settleBookingOutstandingFromWallet = async (client, { booking_id, client_id, verified_by = null }) => {
  if (!booking_id || !client_id) return 0;

  // The booking's product invoices (e.g. its transport) are paid as invoices first,
  // so they show as paid rather than their charge being covered anonymously below.
  // (Lazy require: invoiceCharges depends on this module.)
  const { payBookingProductInvoicesFromWallet } = require('./invoiceCharges');
  const invoiceDrawn = await payBookingProductInvoicesFromWallet(client, { booking_id, verified_by });

  const res = await client.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE ${bookingChargeSql()}), 0) AS invoiced,
       COALESCE(SUM(amount) FILTER (WHERE ${bookingSettledSql()}), 0) AS settled
     FROM transactions
     WHERE booking_id = $1`,
    [booking_id]
  );
  const outstanding = parseFloat(res.rows[0].invoiced) - parseFloat(res.rows[0].settled);
  const drawn = outstanding > 0.005
    ? await drawWalletForBooking(client, { booking_id, client_id, maxAmount: outstanding, verified_by })
    : 0;

  // Fully cleared → the booking is no longer overdue (the cron only ever flags
  // bookings, it never un-flags them).
  if (drawn + invoiceDrawn > 0 && outstanding - drawn <= 0.005) {
    await client.query(
      `UPDATE bookings SET status = 'ACTIVE' WHERE booking_id = $1 AND status = 'OVERDUE'`,
      [booking_id]
    );
  }
  return drawn + invoiceDrawn;
};

// Quotation-payment entry point: finds the booking the quote belongs to — the
// quotation's own booking_id once converted, otherwise the open booking sharing its
// service request (a booking created separately from the client profile) — and
// settles its outstanding invoiced charges from the wallet.
const settleQuoteBookingFromWallet = async (client, { quote_id, client_id, verified_by = null }) => {
  const q = await client.query(
    `SELECT booking_id, request_id FROM quotations WHERE quote_id = $1`,
    [quote_id]
  );
  if (q.rows.length === 0) return 0;

  let bookingId = q.rows[0].booking_id;
  if (!bookingId && q.rows[0].request_id) {
    const b = await client.query(
      `SELECT booking_id FROM bookings
       WHERE request_id = $1 AND client_id = $2 AND status IN ('ACTIVE', 'OVERDUE')
       ORDER BY created_at DESC LIMIT 1`,
      [q.rows[0].request_id, client_id]
    );
    bookingId = b.rows[0]?.booking_id || null;
  }
  return settleBookingOutstandingFromWallet(client, { booking_id: bookingId, client_id, verified_by });
};

module.exports = {
  creditClientWallet,
  drawWalletForBooking,
  takeFromWallet,
  getEarmarkedTotal,
  settleBookingOutstandingFromWallet,
  settleQuoteBookingFromWallet,
};
