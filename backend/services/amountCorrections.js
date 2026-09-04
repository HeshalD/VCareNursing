// services/amountCorrections.js
// Restates the amount on a day that has already been decided — a staff salary
// already PAID, or a client invoice already INVOICED — when the figure itself
// was wrong (the classic case: the nightly cron billed a whole week at the wrong
// rate before anyone noticed).
//
// ─── Correction is NOT revocation ────────────────────────────────────────────
// revokeDays (controllers/dailyAttendanceController.js) says "this day should
// never have been charged or paid at all": it hands the money back under a
// settlement choice, marks the day REVOKED, and for LIVE_IN effectively gives
// the client the day back. A correction says the opposite — the day was real and
// correctly charged, only the number was wrong — so the day stays PAID/INVOICED
// and nothing is given back. That is why nothing here asks for a settlement
// action, and why the day does not end in a terminal REVOKED state.
//
// ─── Why a delta, and not reverse-then-recharge ──────────────────────────────
// Expressing a correction as "reverse the old amount, charge the new one" looks
// tidier but is unsafe against this codebase's money paths:
//   1. reverseServiceInvoice credits the FULL invoice amount back to
//      client_profiles.wallet_balance and bookings.wallet_earmarked regardless of
//      how much was ever actually drawn from the wallet — on a part-paid day that
//      invents money the client never had there.
//   2. It decrements bookings.amount_paid directly, while drawWalletForBooking
//      RECOMPUTES amount_paid from booking_payment_tracking. In a correction the
//      two run back-to-back inside one transaction, so the decrement is silently
//      clobbered.
//   3. Each cycle also leaves a spurious booking_payment_tracking row and a
//      BOOKING_PAYMENT transaction behind.
// Posting only the difference avoids all three.
//
// ─── What a correction touches ───────────────────────────────────────────────
// The LEDGER, not the wallet. An overcharge is offset by a credit so the booking
// owes the right amount from that moment on; money physically returning to the
// client remains the job of the end-of-booking settlement flow
// (services/bookingSettlement.js), which already offers wallet-deposit /
// bank-refund / forfeit and is the only place equipped to decide between them.
//
// Transaction categories are reused rather than invented: SERVICE_INVOICE,
// WALLET_REFUND and STAFF_SALARY are all NEUTRAL in utils/transactionFlow.js
// (accruals, not cash movements), which is exactly what a correction is. A new
// category would have to be classified there and in the P&L groupings to avoid
// silently vanishing from reports; the booking_amount_corrections row plus the
// transaction note carry the "this was a correction" meaning instead.

const {
  createServiceInvoice,
  creditStaffSalary,
  reverseStaffSalary,
  checkAndFlagBookingOverdue,
} = require('./billingService');
const { drawWalletForBooking } = require('./walletService');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const badRequest = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Validates a requested new amount and works out the signed delta.
 * Returns null when the amount is unchanged (caller should no-op, not error).
 */
const resolveDelta = (oldAmountRaw, newAmountRaw) => {
  const newAmount = parseFloat(newAmountRaw);
  if (Number.isNaN(newAmount) || newAmount < 0) {
    throw badRequest('new_amount must be a number of 0 or more');
  }
  const oldAmount = round2(parseFloat(oldAmountRaw) || 0);
  const delta = round2(newAmount - oldAmount);
  if (delta === 0) return null;
  return { oldAmount, newAmount: round2(newAmount), delta };
};

/**
 * Records the correction itself. Shared by both sides.
 */
const writeCorrectionRow = async (client, {
  booking_id, target_type, attendance_id = null, daily_invoice_id = null,
  service_date, oldAmount, newAmount, delta, adjustment_transaction_id = null,
  reason, actorUserId = null, actorName = null,
}) => {
  const res = await client.query(
    `INSERT INTO booking_amount_corrections (
        booking_id, target_type, attendance_id, daily_invoice_id, service_date,
        old_amount, new_amount, delta_amount, adjustment_transaction_id,
        reason, corrected_by, corrected_by_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [booking_id, target_type, attendance_id, daily_invoice_id, service_date,
     oldAmount, newAmount, delta, adjustment_transaction_id,
     reason, actorUserId, actorName]
  );
  return res.rows[0];
};

// ─── Client invoice ───────────────────────────────────────────────────────────

/**
 * Restates what the client was billed for one day.
 *
 * delta > 0 — the client was under-billed: raise an additional SERVICE_INVOICE
 *   DEBIT for the shortfall and try to draw it from their wallet, exactly as any
 *   ordinary charge would. Anything unfunded simply leaves the booking OVERDUE.
 * delta < 0 — the client was over-billed: post an offsetting CREDIT so the
 *   booking's balance is right from now on. The wallet is deliberately NOT
 *   touched (see the header) — a resulting surplus is settled at close-out.
 *
 * Must be called inside the caller's open transaction.
 */
const correctInvoiceAmount = async (client, {
  booking_id, service_date, new_amount, reason,
  actorUserId = null, actorName = null,
}) => {
  if (!reason || !String(reason).trim()) throw badRequest('A reason is required');

  const bookingRes = await client.query(
    `SELECT booking_id, client_id FROM bookings WHERE booking_id = $1 FOR UPDATE`,
    [booking_id]
  );
  if (bookingRes.rows.length === 0) throw badRequest('Booking not found', 404);
  const booking = bookingRes.rows[0];

  // Only the standing (non shift-slot, non-reschedule) row for the day. Shift and
  // makeup occurrences carry their own rows and are corrected by their own ids;
  // a booking-wide date lookup must not silently pick one of them.
  const invoiceRes = await client.query(
    `SELECT * FROM booking_daily_invoices
     WHERE booking_id = $1 AND service_date = $2::date
       AND shift_slot_id IS NULL AND reschedule_id IS NULL
     FOR UPDATE`,
    [booking_id, service_date]
  );
  if (invoiceRes.rows.length === 0) {
    throw badRequest(`No invoice record exists for ${service_date}`, 404);
  }
  const invoice = invoiceRes.rows[0];

  if (invoice.status !== 'INVOICED') {
    throw badRequest(
      invoice.status === 'PENDING'
        ? `${service_date} has not been invoiced yet — decide it normally instead of correcting it.`
        : `${service_date} is ${invoice.status.toLowerCase()}, so there is no invoiced amount to correct.`,
      409
    );
  }

  const resolved = resolveDelta(invoice.amount, new_amount);
  if (!resolved) return { changed: false, service_date, amount: round2(invoice.amount) };
  const { oldAmount, newAmount, delta } = resolved;

  let adjustmentTransactionId = null;

  if (delta > 0) {
    adjustmentTransactionId = await createServiceInvoice(client, {
      booking_id,
      client_id: booking.client_id,
      amount: delta,
      notes: `Correction for ${service_date} — charge raised from Rs.${oldAmount} to Rs.${newAmount}. ${reason}`,
    });

    await drawWalletForBooking(client, {
      booking_id,
      client_id: booking.client_id,
      maxAmount: delta,
      verified_by: actorUserId,
    });

    await checkAndFlagBookingOverdue(client, booking_id);
  } else {
    // Offsets the over-charge on the booking's ledger. No wallet mutation: see
    // the header — returning money to the client is a settlement decision.
    const creditRes = await client.query(
      `INSERT INTO transactions (
         client_id, booking_id, category, transaction_type, amount, status, notes, created_at
       ) VALUES ($1, $2, 'WALLET_REFUND', 'CREDIT', $3, 'COMPLETED', $4, NOW())
       RETURNING transaction_id`,
      [booking.client_id, booking_id, Math.abs(delta),
       `Correction for ${service_date} — charge reduced from Rs.${oldAmount} to Rs.${newAmount}. ${reason}`]
    );
    adjustmentTransactionId = creditRes.rows[0].transaction_id;
  }

  await client.query(
    `UPDATE booking_daily_invoices
     SET amount = $1,
         corrected_at = NOW(),
         updated_at = NOW(),
         -- The stored PDF still shows the old figure; drop it so it regenerates
         -- on next download rather than handing the client a stale document.
         pdf_url = NULL,
         notes = CONCAT_WS(' | ', NULLIF(notes, ''), $2::text)
     WHERE daily_invoice_id = $3`,
    [newAmount, `Corrected Rs.${oldAmount} -> Rs.${newAmount}: ${reason}`, invoice.daily_invoice_id]
  );

  const correction = await writeCorrectionRow(client, {
    booking_id, target_type: 'INVOICE', daily_invoice_id: invoice.daily_invoice_id,
    service_date, oldAmount, newAmount, delta,
    adjustment_transaction_id: adjustmentTransactionId,
    reason, actorUserId, actorName,
  });

  return {
    changed: true, target_type: 'INVOICE', service_date,
    old_amount: oldAmount, new_amount: newAmount, delta,
    correction_id: correction.correction_id,
    was_whatsapped: Boolean(invoice.whatsapp_sent_at),
  };
};

// ─── Staff salary ─────────────────────────────────────────────────────────────

/**
 * Restates what a staff member was paid for one day.
 *
 * delta > 0 — underpaid: credit the shortfall (creditStaffSalary).
 * delta < 0 — overpaid: claw back the excess (reverseStaffSalary). staff_wallet
 *   is allowed to go negative by design and nets against future payouts, so a
 *   clawback never fails for want of balance.
 *
 * Must be called inside the caller's open transaction.
 */
const correctSalaryAmount = async (client, {
  booking_id, attendance_id, new_amount, reason,
  actorUserId = null, actorName = null,
}) => {
  if (!reason || !String(reason).trim()) throw badRequest('A reason is required');

  const attendanceRes = await client.query(
    `SELECT * FROM staff_daily_attendance
     WHERE attendance_id = $1 AND booking_id = $2
     FOR UPDATE`,
    [attendance_id, booking_id]
  );
  if (attendanceRes.rows.length === 0) throw badRequest('Attendance record not found for this booking', 404);
  const attendance = attendanceRes.rows[0];

  if (attendance.salary_status !== 'PAID') {
    throw badRequest(
      attendance.salary_status === 'PENDING'
        ? 'This day has not been paid yet — confirm the salary normally instead of correcting it.'
        : `This day's salary is ${attendance.salary_status.toLowerCase()}, so there is no paid amount to correct.`,
      409
    );
  }

  const resolved = resolveDelta(attendance.salary_amount, new_amount);
  if (!resolved) return { changed: false, service_date: attendance.service_date, amount: round2(attendance.salary_amount) };
  const { oldAmount, newAmount, delta } = resolved;

  const serviceDateStr = attendance.service_date instanceof Date
    ? attendance.service_date.toISOString().slice(0, 10)
    : String(attendance.service_date).slice(0, 10);

  let adjustmentTransactionId;
  if (delta > 0) {
    adjustmentTransactionId = await creditStaffSalary(client, {
      staff_profile_id: attendance.staff_profile_id,
      booking_id,
      amount: delta,
      notes: `Correction for ${serviceDateStr} — salary raised from Rs.${oldAmount} to Rs.${newAmount}. ${reason}`,
    });
  } else {
    adjustmentTransactionId = await reverseStaffSalary(client, {
      staff_profile_id: attendance.staff_profile_id,
      booking_id,
      amount: Math.abs(delta),
      notes: `Correction for ${serviceDateStr} — salary reduced from Rs.${oldAmount} to Rs.${newAmount}. ${reason}`,
    });
  }

  await client.query(
    `UPDATE staff_daily_attendance
     SET salary_amount = $1,
         corrected_at = NOW(),
         updated_at = NOW(),
         notes = CONCAT_WS(' | ', NULLIF(notes, ''), $2::text)
     WHERE attendance_id = $3`,
    [newAmount, `Corrected Rs.${oldAmount} -> Rs.${newAmount}: ${reason}`, attendance_id]
  );

  const correction = await writeCorrectionRow(client, {
    booking_id, target_type: 'SALARY', attendance_id,
    service_date: serviceDateStr, oldAmount, newAmount, delta,
    adjustment_transaction_id: adjustmentTransactionId,
    reason, actorUserId, actorName,
  });

  return {
    changed: true, target_type: 'SALARY', service_date: serviceDateStr,
    staff_profile_id: attendance.staff_profile_id,
    old_amount: oldAmount, new_amount: newAmount, delta,
    correction_id: correction.correction_id,
  };
};

// ─── History ──────────────────────────────────────────────────────────────────

const getCorrectionsForBooking = async (client, booking_id) => {
  const res = await client.query(
    `SELECT c.*, c.service_date::text AS service_date, sp.full_name AS staff_name
     FROM booking_amount_corrections c
     LEFT JOIN staff_daily_attendance a ON c.attendance_id = a.attendance_id
     LEFT JOIN staff_profiles sp ON a.staff_profile_id = sp.staff_profile_id
     WHERE c.booking_id = $1
     ORDER BY c.created_at DESC`,
    [booking_id]
  );
  return res.rows;
};

module.exports = {
  correctInvoiceAmount,
  correctSalaryAmount,
  getCorrectionsForBooking,
  _internal: { resolveDelta, round2 },
};
