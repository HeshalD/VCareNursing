// services/registrationFeeService.js
//
// The registration fee is its own obligation — a one-off membership charge, not part
// of the service charges. Money paid toward it through a quotation is recorded as a
// REGISTRATION_FEE CREDIT (see paymentTrackingController.recordAllocatedPayment), and
// it is never absorbed by the wallet's service-charge pool.
//
// When that quotation becomes a booking, chargeRegistrationFeeForBooking books the fee
// against the booking's ledger and makes sure it is covered by money that was really
// paid for it:
//   1. whatever was already paid toward the fee on the quote is linked to the booking;
//   2. if the quote did not fully cover it, the shortfall is taken from the client's
//      FREE wallet balance (never another booking's earmark), as a REGISTRATION_FEE
//      CREDIT — the fee gets its own ledger lines, it does not hide inside the
//      BOOKING_PAYMENT draws used for service days;
//   3. the client is only marked PAID when it is genuinely covered. Anything left over
//      stays an open debit and the client stays unpaid, so it is chased instead of
//      silently written off.
//
// Must be called inside an open client transaction.

const { settleRegistrationFee } = require('./registrationFeeSplit');
const { getEarmarkedTotal } = require('./walletService');

const EPS = 0.005;

async function resolveDebitCategory(client) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'transaction_category' AND e.enumlabel = 'REGISTRATION_FEE'
     ) AS exists`
  );
  return res.rows[0]?.exists ? 'REGISTRATION_FEE' : 'SERVICE_INVOICE';
}

async function chargeRegistrationFeeForBooking(client, {
  client_id, booking_id, quote_id, amount, reference = null, verified_by = null,
}) {
  const fee = parseFloat(amount) || 0;
  const result = { charged: false, fee, paidOnQuote: 0, drawnFromWallet: 0, outstanding: 0, settled: false };
  if (fee <= 0) return result;

  const profileRes = await client.query(
    `SELECT reg_fee_status FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`,
    [client_id]
  );
  const status = profileRes.rows[0]?.reg_fee_status || 'PENDING';
  if (status === 'WAIVED') return result;

  // What the client already paid toward this fee on the quotation (before a booking existed).
  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM transactions
     WHERE quote_id = $1 AND category = 'REGISTRATION_FEE' AND transaction_type = 'CREDIT' AND status = 'COMPLETED'`,
    [quote_id]
  );
  const paidOnQuote = parseFloat(paidRes.rows[0].paid) || 0;
  result.paidOnQuote = paidOnQuote;

  // Settled outside this quotation (standalone invoice, uploaded receipt, admin mark-as-paid)
  // and nothing was paid here: there is nothing to charge this booking for.
  if (status === 'PAID' && paidOnQuote <= EPS) return result;

  // The fee may already be invoiced on the ledger without belonging to any booking yet — a
  // standalone registration invoice, an admin payment entry, or a backfill. Charging again
  // would bill the one-off fee twice, so such a debit is attached to this booking instead.
  const category = await resolveDebitCategory(client);
  const existingRes = await client.query(
    `SELECT transaction_id, amount FROM transactions
     WHERE client_id = $1 AND category::text = $2 AND transaction_type = 'DEBIT'
       AND booking_id IS NULL AND quote_id IS NULL
     ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
    [client_id, category]
  );
  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    const differs = Math.abs(parseFloat(existing.amount) - fee) > EPS;
    await client.query(
      `UPDATE transactions
       SET booking_id = $1, quote_id = $2, reference_number = COALESCE(reference_number, $3),
           original_amount = CASE WHEN $5::boolean THEN COALESCE(original_amount, amount) ELSE original_amount END,
           amount = $4::numeric
       WHERE transaction_id = $6`,
      [booking_id, quote_id, reference || quote_id, fee, differs, existing.transaction_id]
    );
  } else {
    await client.query(
      `INSERT INTO transactions (
         booking_id, quote_id, client_id, category, amount, status, notes,
         transaction_type, reference_number, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, 'DEBIT', $7, NOW())`,
      [booking_id, quote_id, client_id, category, fee,
       'Registration fee charged during booking conversion', reference || quote_id]
    );
  }
  result.charged = true;

  // Payments made before the booking existed had no booking to attach to.
  await client.query(
    `UPDATE transactions SET booking_id = $1
     WHERE quote_id = $2 AND category = 'REGISTRATION_FEE' AND transaction_type = 'CREDIT' AND booking_id IS NULL`,
    [booking_id, quote_id]
  );

  let covered = paidOnQuote;

  // The quote did not fully cover it — use the client's free wallet money. Skipped while
  // a receipt is awaiting verification, so the same fee is never paid twice.
  const shortfall = fee - covered;
  if (shortfall > EPS && status !== 'RECEIPT_UPLOADED') {
    const walletRes = await client.query(
      `SELECT COALESCE(wallet_balance, 0) AS balance FROM client_profiles WHERE client_profile_id = $1`,
      [client_id]
    );
    const balance = parseFloat(walletRes.rows[0]?.balance || 0);
    const free = Math.max(0, balance - await getEarmarkedTotal(client, client_id));
    const draw = Math.min(shortfall, free);
    if (draw > EPS) {
      await client.query(
        `UPDATE client_profiles SET wallet_balance = wallet_balance - $1 WHERE client_profile_id = $2`,
        [draw, client_id]
      );
      await client.query(
        `INSERT INTO transactions (
           booking_id, quote_id, client_id, category, amount, payment_method, status,
           notes, transaction_type, verified_by, created_at
         ) VALUES ($1, $2, $3, 'REGISTRATION_FEE', $4, 'WALLET', 'COMPLETED',
                   'Registration fee paid from client wallet', 'CREDIT', $5, NOW())`,
        [booking_id, quote_id, client_id, draw, verified_by]
      );
      covered += draw;
      result.drawnFromWallet = draw;
    }
  }

  result.outstanding = Math.max(fee - covered, 0);
  if (result.outstanding <= EPS) {
    result.settled = true;
    await settleRegistrationFee(client, { client_id, regFeeItem: { amount: fee }, verified_by });
  }
  return result;
}

// Books the registration-fee INVOICE (a DEBIT) for fee payments settled outside a
// quotation (admin mark-paid, receipt verified, backdated entry). Those paths used to
// write only the payment CREDIT, so the fee looked like prepaid credit and was missing
// from Total Invoiced. Idempotent and double-count safe: skipped when the client already
// has a registration DEBIT, or an invoice that was sent (SENT) — that one already counts
// in Total Invoiced through overdue_invoices.
// Returns true if a debit was written. Call it BEFORE inserting the payment CREDIT.
async function recordRegFeeInvoiceDebit(client, { client_id, amount, at = null, notes }) {
  const res = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM overdue_invoices WHERE client_id = $1 AND source_type = 'REGISTRATION_FEE') AS in_overdue,
       EXISTS (SELECT 1 FROM transactions WHERE client_id = $1 AND category::text = 'REGISTRATION_FEE'
               AND transaction_type = 'DEBIT') AS has_debit`,
    [client_id]
  );
  const { in_overdue, has_debit } = res.rows[0];
  if (in_overdue || has_debit) return false;
  await client.query(
    `INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes, created_at)
     VALUES ($1, 'REGISTRATION_FEE', $2, 'DEBIT', 'COMPLETED', $3, COALESCE($4::timestamptz, NOW()))`,
    [client_id, amount, notes, at]
  );
  return true;
}

module.exports = { chargeRegistrationFeeForBooking, recordRegFeeInvoiceDebit };
