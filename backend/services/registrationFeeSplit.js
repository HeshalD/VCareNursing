// services/registrationFeeSplit.js
//
// A client's registration fee is billed as an ordinary quote_line_items row
// (is_registration_fee = true) and settled implicitly — once cumulative
// verified payments against that quote reach the line item's amount, the
// fee counts as paid (see paymentTrackingController.recordPayment). Cash
// coming in is otherwise recorded as one lump CLIENT_PAYMENT/BOOKING_PAYMENT
// transaction even when part of it happens to cross that threshold, which
// makes "how much registration-fee revenue have we actually collected"
// impossible to compute directly from the ledger.
//
// computeRegFeeSplit tells a caller how much of a given payment amount
// should be carved out into its own REGISTRATION_FEE transaction — the
// caller is responsible for inserting the (up to) two resulting rows and
// for the actual reg_fee_status settlement (see settleRegistrationFee).
//
// Callers must pass totalPaidBefore explicitly rather than have this helper
// infer it, because "total paid so far" is tracked on different ledgers at
// different stages (payment_tracking pre-conversion, bookings.amount_paid /
// booking_payment_tracking post-conversion) — inferring the wrong one would
// silently mis-split payments once both ledgers have contributed.
const { resolveOverdueInvoices } = require('./overdueInvoices');

async function computeRegFeeSplit(client, { client_id, quote_id, amount, totalPaidBefore }) {
  const noSplit = { regFeePortion: 0, remainderAmount: amount, regFeeItem: null };
  if (!client_id || !quote_id || !amount || amount <= 0) return noSplit;

  const statusRes = await client.query(
    `SELECT reg_fee_status FROM client_profiles WHERE client_profile_id = $1`,
    [client_id]
  );
  const regStatus = statusRes.rows[0]?.reg_fee_status;
  if (!regStatus || ['PAID', 'WAIVED'].includes(regStatus)) return noSplit;

  const regFeeItemRes = await client.query(
    `SELECT amount, salesperson_id FROM quote_line_items WHERE quote_id = $1 AND is_registration_fee = true LIMIT 1`,
    [quote_id]
  );
  const regFeeItem = regFeeItemRes.rows[0];
  if (!regFeeItem) return noSplit;

  const regFeeAmount = parseFloat(regFeeItem.amount);
  const remainingGap = Math.max(regFeeAmount - parseFloat(totalPaidBefore || 0), 0);
  const regFeePortion = Math.min(parseFloat(amount), remainingGap);
  const remainderAmount = parseFloat(amount) - regFeePortion;

  // regFeeItem is returned even when regFeePortion is 0 (e.g. a prior
  // payment already closed the gap but reg_fee_status hasn't flipped yet) —
  // callers use it to run the settlement check independently of whether
  // *this* payment needed splitting.
  return { regFeePortion, remainderAmount, regFeeItem };
}

// Marks the client's registration as PAID once cumulative payments (totalPaidBefore
// + the amount just applied) reach the reg-fee line item's amount, and credits the
// assigned salesperson if any. Idempotent — only fires while reg_fee_status isn't
// already PAID/WAIVED. Safe to call even when computeRegFeeSplit found no split
// (e.g. the fee was already fully covered by a prior payment on this same request).
async function settleRegistrationFee(client, { client_id, regFeeItem, verified_by, creditSalespersonForRegistration }) {
  if (!regFeeItem) return false;

  const settleResult = await client.query(
    `UPDATE client_profiles
     SET reg_fee_status = 'PAID', is_registration_fee_paid = true,
         reg_fee_paid_at = NOW(), reg_fee_expires_at = NOW() + INTERVAL '365 days',
         reg_fee_amount = $2
     WHERE client_profile_id = $1 AND reg_fee_status NOT IN ('PAID', 'WAIVED')
     RETURNING client_profile_id`,
    [client_id, regFeeItem.amount]
  );

  if (settleResult.rows.length === 0) return false;

  // Clears any outstanding overdue-invoice entry from a prior standalone
  // WhatsApp reg-fee invoice, since this quotation payment just settled the
  // same obligation. No-op if none exists.
  try {
    await resolveOverdueInvoices(client, { client_id, source_type: 'REGISTRATION_FEE', resolution: 'PAID' });
  } catch (overdueErr) {
    console.error('Failed to resolve overdue invoice (reg fee via quotation):', overdueErr.message);
  }

  if (regFeeItem.salesperson_id && typeof creditSalespersonForRegistration === 'function') {
    try {
      await creditSalespersonForRegistration(client, {
        client_id,
        salesperson_id: regFeeItem.salesperson_id,
        assigned_by: verified_by,
      });
    } catch (creditErr) {
      console.error('Failed to credit salesperson for registration:', creditErr.message);
    }
  }

  return true;
}

module.exports = { computeRegFeeSplit, settleRegistrationFee };
