// services/billingService.js
// Shared billing helpers used by both the nightly cron (cron/dailyInvoicing.js)
// and the manual attendance/invoice confirmation endpoints.

// ─── Billing Engine (per-booking client charge calculation) ───────────────────

const calculateLiveInCharge = (booking) => {
  if (!booking.actual_end_time) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: 'Live-in daily charge'
    };
  }

  const scheduled = new Date(booking.scheduled_end_time);
  const actual = new Date(booking.actual_end_time);
  const overrunHours = (actual - scheduled) / (1000 * 60 * 60);

  if (overrunHours < 2) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: `Live-in daily charge (overrun ${overrunHours.toFixed(1)}h — waived)`
    };
  }

  return {
    amount: parseFloat(booking.daily_rate) * 2,
    notes: `Live-in daily charge + extra day (overrun ${overrunHours.toFixed(1)}h)`
  };
};

const calculateShiftCharge = (booking) => {
  if (!booking.actual_end_time || !booking.scheduled_end_time) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: 'Shift-based daily charge'
    };
  }

  const scheduled = new Date(booking.scheduled_end_time);
  const actual = new Date(booking.actual_end_time);
  const overtimeHours = (actual - scheduled) / (1000 * 60 * 60);

  if (overtimeHours <= 0) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: 'Shift-based daily charge (no overtime)'
    };
  }

  const otCharge = overtimeHours * parseFloat(booking.ot_rate);
  const total = parseFloat(booking.daily_rate) + otCharge;

  return {
    amount: total,
    notes: `Shift charge + OT ${overtimeHours.toFixed(1)}h × Rs.${booking.ot_rate} = Rs.${otCharge.toFixed(2)}`
  };
};

const calculateVisitingCharge = (booking) => {
  return {
    amount: parseFloat(booking.daily_rate),
    notes: 'Visiting service daily charge'
  };
};

// Per-shift client charge default for SHIFT_BASED bookings — bookings.shift_rate,
// the client-facing per-shift price, which is independent of the staff's own
// per-shift pay rate (booking_staff_assignments.daily_rate).
const calculateShiftSlotCharge = (booking) => ({
  amount: parseFloat(booking.shift_rate),
  notes: 'Shift charge'
});

const getBillingCharge = (booking) => {
  switch (booking.service_model) {
    case 'LIVE_IN':     return calculateLiveInCharge(booking);
    case 'SHIFT_BASED': return calculateShiftCharge(booking);
    case 'VISITING':    return calculateVisitingCharge(booking);
    default:
      return {
        amount: parseFloat(booking.daily_rate),
        notes: 'Daily charge'
      };
  }
};

// ─── Invoice Number Generator ──────────────────────────────────────────────────

const generateInvoiceNumber = async (client) => {
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');

  const result = await client.query(
    `SELECT COUNT(*) as count
     FROM transactions
      WHERE category IN ('SERVICE_INVOICE', 'REGISTRATION_FEE')
     AND DATE(created_at) = CURRENT_DATE`
  );

  const sequence = (parseInt(result.rows[0].count) + 1).toString().padStart(4, '0');
  return `INV-${datePart}-${sequence}`;
};

// ─── Staff Salary Credit ────────────────────────────────────────────────────────
// Credits a single day's salary to a staff member: current_earnings, a STAFF_SALARY
// transaction, the staff_wallet balance, and a staff_wallet_transactions audit row.
// Returns the new transaction_id. Must be called within an open client transaction.

const creditStaffSalary = async (client, { staff_profile_id, booking_id, amount, notes }) => {
  await client.query(
    `UPDATE staff_profiles
     SET current_earnings = current_earnings + $1
     WHERE staff_profile_id = $2`,
    [amount, staff_profile_id]
  );

  const salaryTransactionResult = await client.query(
    `INSERT INTO transactions (
      staff_profile_id,
      booking_id,
      category,
      transaction_type,
      amount,
      status,
      notes,
      created_at
    ) VALUES ($1, $2, 'STAFF_SALARY', 'CREDIT', $3, 'COMPLETED', $4, NOW())
    RETURNING transaction_id`,
    [staff_profile_id, booking_id, amount, notes]
  );

  const salaryTransactionId = salaryTransactionResult.rows[0].transaction_id;

  await client.query(
    `INSERT INTO staff_wallet (staff_profile_id, balance, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (staff_profile_id)
     DO UPDATE SET balance = staff_wallet.balance + EXCLUDED.balance,
                   updated_at = NOW()`,
    [staff_profile_id, amount]
  );

  await client.query(
    `INSERT INTO staff_wallet_transactions (
      staff_profile_id,
      type,
      amount,
      reason,
      reference_id,
      created_at
    ) VALUES ($1, 'CREDIT', $2, 'DAILY_SALARY', $3, NOW())`,
    [staff_profile_id, amount, salaryTransactionId]
  );

  return salaryTransactionId;
};

// ─── Staff Salary Reversal ──────────────────────────────────────────────────────
// Reverses a previously-credited day's salary (e.g. admin discovers a LIVE_IN
// no-show that was auto-paid). Decrements current_earnings and staff_wallet.balance
// by amount — no floor, negative balance is allowed and nets out against future
// payouts. Inserts an offsetting STAFF_SALARY DEBIT transaction (the original
// CREDIT row from creditStaffSalary is left untouched as the audit trail of what
// was originally paid). Must be called within an open client transaction.

const reverseStaffSalary = async (client, { staff_profile_id, booking_id, amount, notes }) => {
  await client.query(
    `UPDATE staff_profiles
     SET current_earnings = current_earnings - $1
     WHERE staff_profile_id = $2`,
    [amount, staff_profile_id]
  );

  const reversalTransactionResult = await client.query(
    `INSERT INTO transactions (
      staff_profile_id,
      booking_id,
      category,
      transaction_type,
      amount,
      status,
      notes,
      created_at
    ) VALUES ($1, $2, 'STAFF_SALARY', 'DEBIT', $3, 'COMPLETED', $4, NOW())
    RETURNING transaction_id`,
    [staff_profile_id, booking_id, amount, notes]
  );

  const reversalTransactionId = reversalTransactionResult.rows[0].transaction_id;

  await client.query(
    `INSERT INTO staff_wallet (staff_profile_id, balance, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (staff_profile_id)
     DO UPDATE SET balance = staff_wallet.balance - EXCLUDED.balance,
                   updated_at = NOW()`,
    [staff_profile_id, amount]
  );

  await client.query(
    `INSERT INTO staff_wallet_transactions (
      staff_profile_id,
      type,
      amount,
      reason,
      reference_id,
      created_at
    ) VALUES ($1, 'DEBIT', $2, 'SALARY_REVERSAL', $3, NOW())`,
    [staff_profile_id, amount, reversalTransactionId]
  );

  return reversalTransactionId;
};

// ─── Client Invoice Reversal ────────────────────────────────────────────────────
// Cancels a previously-created day's invoice under one of the admin-chosen settlement
// actions (mirrors the WALLET_DEPOSIT/BANK_REFUND/NO_REFUND choice already offered
// at booking completion/termination in bookingSettlement.js):
//   - WALLET_REFUND: credits the booking for the invoiced amount (same WALLET_REFUND
//     category used there), netting total_invoiced so the day stops counting as owed.
//     No real money moves — it offsets future invoices on this booking. Since
//     plannedDays on the calendar is computed live as total_paid ÷ rate (see
//     BookingDetailPageV2.jsx), this credit already pushes the booking's effective
//     "paid through" bound out by the reversed amount, with no extra code needed.
//   - WALLET_REFUND_EXTEND: identical money mechanics to WALLET_REFUND — the extra
//     effect (explicitly pushing bookings.scheduled_end_time for LIVE_IN) happens in
//     the caller (dailyAttendanceController.revokeDays), not here.
//   - BANK_REFUND: same netting transaction (still needed so the booking doesn't
//     stay flagged OVERDUE for a day being refunded), noted as a real refund the
//     admin processes externally (bank/gateway) rather than a system credit.
//   - NO_REFUND: a write-off — no offsetting transaction at all, the invoiced
//     amount is simply forfeited.
// total_paid sums CREDIT (excl. STAFF_SALARY) and total_invoiced sums DEBIT, so for
// every action except NO_REFUND this exactly nets out the booking's outstanding
// balance without mutating the original SERVICE_INVOICE DEBIT row. Returns null (no
// transaction) for NO_REFUND. Must be called within an open client transaction.

const reverseServiceInvoice = async (client, { booking_id, client_id, amount, notes, settlementAction = 'WALLET_REFUND' }) => {
  if (settlementAction === 'NO_REFUND') {
    return null;
  }

  const settlementNote = settlementAction === 'BANK_REFUND'
    ? `${notes} (bank refund — processed externally by admin)`
    : settlementAction === 'WALLET_REFUND_EXTEND'
      ? `${notes} (booking extended)`
      : notes;

  const result = await client.query(
    `INSERT INTO transactions (
      client_id,
      booking_id,
      category,
      transaction_type,
      amount,
      status,
      notes,
      created_at
    ) VALUES ($1, $2, 'WALLET_REFUND', 'CREDIT', $3, 'COMPLETED', $4, NOW())
    RETURNING transaction_id`,
    [client_id, booking_id, amount, settlementNote]
  );

  // WALLET_REFUND_EXTEND keeps the money credited to this booking (it funds the
  // extended day instead of leaving), so amount_paid stays untouched. WALLET_REFUND
  // and BANK_REFUND both move real money out of this booking's budget — the former
  // into the client's real wallet, the latter out of the system entirely — so both
  // must release it from amount_paid to avoid double-counting it as still available.
  if (settlementAction === 'WALLET_REFUND' || settlementAction === 'BANK_REFUND') {
    await client.query(
      `UPDATE bookings SET amount_paid = amount_paid - $1 WHERE booking_id = $2`,
      [amount, booking_id]
    );
  }

  if (settlementAction === 'WALLET_REFUND') {
    await client.query(
      `UPDATE client_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE client_profile_id = $2`,
      [amount, client_id]
    );
    // The day was paid for out of this booking's earmark, so returning the money
    // to the wallet also restores its reservation — otherwise it would silently
    // become unearmarked and be spendable by the client's other bookings.
    await client.query(
      `UPDATE bookings SET wallet_earmarked = COALESCE(wallet_earmarked, 0) + $1 WHERE booking_id = $2`,
      [amount, booking_id]
    );
  }

  return result.rows[0].transaction_id;
};

// ─── Client Service Invoice ─────────────────────────────────────────────────────
// Creates a SERVICE_INVOICE DEBIT transaction for a booking. Returns the new
// transaction_id. Must be called within an open client transaction.

const createServiceInvoice = async (client, { booking_id, client_id, amount, notes }) => {
  const invoiceNumber = await generateInvoiceNumber(client);
  const fullNotes = `${invoiceNumber} — ${notes}`;

  const result = await client.query(
    `INSERT INTO transactions (
      client_id,
      booking_id,
      category,
      transaction_type,
      amount,
      status,
      notes,
      created_at
    ) VALUES ($1, $2, 'SERVICE_INVOICE', 'DEBIT', $3, 'COMPLETED', $4, NOW())
    RETURNING transaction_id`,
    [client_id, booking_id, amount, fullNotes]
  );

  return result.rows[0].transaction_id;
};

// ─── Overdue Check ──────────────────────────────────────────────────────────────
// Flags a single ACTIVE booking as OVERDUE the moment its total DEBITs exceed
// total CREDITs, instead of waiting for the nightly cron's sweep. Called right
// after any new invoice (DEBIT) is created for a booking. Must be called
// within an open client transaction.

const checkAndFlagBookingOverdue = async (client, booking_id) => {
  const result = await client.query(
    `SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits
     FROM transactions
     WHERE booking_id = $1`,
    [booking_id]
  );

  const { total_debits, total_credits } = result.rows[0];
  if (parseFloat(total_debits) > parseFloat(total_credits)) {
    await client.query(
      `UPDATE bookings SET status = 'OVERDUE' WHERE booking_id = $1 AND status = 'ACTIVE'`,
      [booking_id]
    );
  }
};

module.exports = {
  calculateLiveInCharge,
  calculateShiftCharge,
  calculateShiftSlotCharge,
  calculateVisitingCharge,
  getBillingCharge,
  generateInvoiceNumber,
  creditStaffSalary,
  createServiceInvoice,
  reverseStaffSalary,
  reverseServiceInvoice,
  checkAndFlagBookingOverdue
};
