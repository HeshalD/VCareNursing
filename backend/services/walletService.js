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
       notes, status, verified_by
     ) VALUES ($1, $2, $3, 'WALLET_TOPUP', 'CREDIT', $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12)
     RETURNING transaction_id`,
    [
      client_id, quote_id, earmark_booking_id, amount, payment_method, bank_account_id,
      cheque_number, cheque_date, reference_number, receipt_url,
      notes || 'Overpayment credited to wallet', verified_by,
    ]
  );

  return txResult.rows[0].transaction_id;
};

// Draws up to maxAmount from the client's wallet to fund a booking's amount_paid,
// taking this booking's own earmark first and then any unearmarked balance —
// never another booking's earmark (see the note at the top of this file). Returns
// the amount actually drawn (0 if nothing was available). Locks the wallet row
// FOR UPDATE so concurrent draws can't double-spend the same balance.
const drawWalletForBooking = async (client, { booking_id, client_id, maxAmount, verified_by = null }) => {
  if (!(maxAmount > 0)) return 0;

  const walletRes = await client.query(
    `SELECT COALESCE(wallet_balance, 0) as wallet_balance FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`,
    [client_id]
  );
  const walletBalance = parseFloat(walletRes.rows[0]?.wallet_balance || 0);

  const ownRes = await client.query(
    `SELECT COALESCE(wallet_earmarked, 0) AS own FROM bookings WHERE booking_id = $1 FOR UPDATE`,
    [booking_id]
  );
  const ownEarmark = parseFloat(ownRes.rows[0]?.own || 0);

  // Anything in the wallet not reserved by any booking is fair game for this one.
  const earmarkedTotal = await getEarmarkedTotal(client, client_id);
  const unearmarked = Math.max(0, walletBalance - earmarkedTotal);

  const available = Math.min(walletBalance, ownEarmark + unearmarked);
  const drawAmount = Math.min(maxAmount, available);
  if (drawAmount <= 0.005) return 0;

  // Consume the booking's own reservation first so unearmarked money stays
  // available for whatever needs it next.
  const fromEarmark = Math.min(drawAmount, ownEarmark);

  await client.query(
    `UPDATE client_profiles SET wallet_balance = wallet_balance - $1 WHERE client_profile_id = $2`,
    [drawAmount, client_id]
  );

  if (fromEarmark > 0) {
    await client.query(
      `UPDATE bookings SET wallet_earmarked = GREATEST(COALESCE(wallet_earmarked, 0) - $1, 0) WHERE booking_id = $2`,
      [fromEarmark, booking_id]
    );
  }

  await client.query(
    `INSERT INTO booking_payment_tracking (
       booking_id, client_id, amount_received, payment_method, notes,
       status, verified_at, verified_by
     ) VALUES ($1, $2, $3, 'WALLET', 'Auto-applied from client wallet balance', 'VERIFIED', NOW(), $4)`,
    [booking_id, client_id, drawAmount, verified_by]
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

  await client.query(
    `INSERT INTO transactions (
       client_id, booking_id, category, transaction_type, amount, payment_method,
       status, notes, verified_by
     ) VALUES ($1, $2, 'BOOKING_PAYMENT', 'CREDIT', $3, 'WALLET', 'COMPLETED', 'Auto-applied from client wallet balance', $4)`,
    [client_id, booking_id, drawAmount, verified_by]
  );

  return drawAmount;
};

module.exports = { creditClientWallet, drawWalletForBooking, getEarmarkedTotal };
