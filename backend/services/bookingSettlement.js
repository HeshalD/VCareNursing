// services/bookingSettlement.js
// Shared booking financial helpers used by both the booking controller (immediate
// completion/termination) and the scheduled-action enforcer (future-dated execution).
// Kept in their own module so neither side has to require the other (avoids a cycle).

const getBookingFinancialTotals = async (client, booking_id) => {
    const result = await client.query(
        `SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') <> 'STAFF_SALARY' THEN amount ELSE 0 END), 0) as total_paid,
            COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_invoiced
         FROM transactions
         WHERE booking_id = $1`,
        [booking_id]
    );

    return {
        total_paid: parseFloat(result.rows[0]?.total_paid || 0),
        total_invoiced: parseFloat(result.rows[0]?.total_invoiced || 0)
    };
};

// targetDateInput is accepted for call-site compatibility but no longer used: the
// settlement balance is now read straight off the booking's earmark rather than
// projected forward from a target date (see the note below).
const getBookingSettlementSnapshot = async (client, booking_id, targetDateInput = null) => {
    const bookingResult = await client.query(
        `SELECT
            b.booking_id,
            b.booking_code,
            b.status,
            b.assigned_staff_id,
            b.client_id,
            b.start_date,
            b.scheduled_end_time,
            b.actual_end_time,
            b.daily_rate,
            b.ot_rate,
            b.wallet_earmarked,
            c.full_name as client_name,
            c.wallet_balance,
            sr.active_quote_id as quote_id,
            q.total_amount,
            q.daily_rate as quote_daily_rate
         FROM bookings b
         LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
         LEFT JOIN service_requests sr ON b.request_id = sr.request_id
         LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
         WHERE b.booking_id = $1
         FOR UPDATE OF b`,
        [booking_id]
    );

    if (bookingResult.rows.length === 0) {
        return null;
    }

    const booking = bookingResult.rows[0];

    const { total_paid: totalPaid, total_invoiced: totalInvoiced } = await getBookingFinancialTotals(client, booking_id);

    // What's genuinely left over for this booking is what the client prepaid for it
    // and never consumed — bookings.wallet_earmarked. Money is drawn out of the
    // earmark only as each day/shift is actually invoiced (services/walletService.js),
    // so whatever remains reserved is precisely the undelivered portion.
    //
    // This replaces an older `totalPaid - servedDays * dailyRate` projection, which
    // couldn't work for SHIFT_BASED bookings (their daily_rate is 0 — billing is
    // per-shift) and which counted the registration fee as refundable service money.
    // No forward projection is needed now: a future-dated termination settles when
    // its scheduled action fires, by which point the days in between have drawn
    // themselves out of the earmark.
    const settlementBalance = parseFloat(booking.wallet_earmarked || 0);

    return {
        ...booking,
        total_paid: totalPaid,
        total_invoiced: totalInvoiced,
        remaining_balance: Math.max(totalPaid - totalInvoiced, 0),
        amount_owed: Math.max(totalInvoiced - totalPaid, 0),
        settlement_balance: settlementBalance
    };
};

// The three choices an admin is given for money a client prepaid for days/shifts
// that were never delivered. All three clear the booking's earmark; they differ in
// where the money goes:
//
//   WALLET_DEPOSIT — "Add to client wallet". The money is ALREADY in the wallet
//                    under the lazy model, so nothing moves; releasing the earmark
//                    simply frees it for the client's other bookings.
//   BANK_REFUND    — "Refund to client". Real cash leaves: wallet_balance is
//                    debited and a CLIENT_REFUND row records the outflow.
//   NO_REFUND      — "Waive as additional income". The client forfeits it:
//                    wallet_balance is debited and a SETTLEMENT_FORFEITURE row
//                    recognises it as company revenue.
//
// The wire codes are historical (they predate the wallet model and are persisted in
// scheduled_actions payloads), which is why NO_REFUND now actively moves money
// rather than meaning "do nothing".
const VALID_BOOKING_SETTLEMENT_ACTIONS = ['WALLET_DEPOSIT', 'BANK_REFUND', 'NO_REFUND'];

const applyBookingSettlement = async (client, booking, settlementAction, settlementNote, reason, actorLabel) => {
    // What the client prepaid for this booking and never consumed. Under the lazy
    // wallet model this is exactly bookings.wallet_earmarked — the money is sitting
    // in the shared wallet reserved for this booking (see services/walletService.js).
    const settlementBalance = parseFloat(booking.settlement_balance ?? booking.remaining_balance ?? 0);

    // Nothing was left reserved for this booking, so there's no surplus to release,
    // refund, or write off — don't record a Rs. 0 settlement row.
    if (settlementBalance <= 0) {
        return { remaining_balance: 0, wallet_deposited_amount: 0, settlement_notes: null, skipped: true };
    }

    const settlementNotes = [
        `${actorLabel}`,
        reason ? `Reason: ${reason}` : null,
        settlementAction ? `Settlement action: ${settlementAction}` : null,
        `Unused prepayment: Rs.${settlementBalance.toFixed(2)}`,
        settlementNote ? `Note: ${settlementNote}` : null
    ].filter(Boolean).join(' | ');

    // Every action releases the reservation — what differs is whether the money
    // stays in the wallet, leaves as a refund, or is recognised as income.
    await client.query(
        `UPDATE bookings SET wallet_earmarked = 0 WHERE booking_id = $1`,
        [booking.booking_id]
    );

    // BANK_REFUND and NO_REFUND both take the money out of the client's wallet;
    // WALLET_DEPOSIT deliberately leaves wallet_balance untouched (it's already there).
    if (settlementAction === 'BANK_REFUND' || settlementAction === 'NO_REFUND') {
        await client.query(
            `UPDATE client_profiles
             SET wallet_balance = GREATEST(COALESCE(wallet_balance, 0) - $1, 0)
             WHERE client_profile_id = $2`,
            [settlementBalance, booking.client_id]
        );
    }

    // One ledger row per action, categorised so the outcome is recoverable from
    // `category` alone rather than by parsing the notes string.
    //   BANK_REFUND -> CLIENT_REFUND / DEBIT      (cash out, classified OUT)
    //   NO_REFUND   -> SETTLEMENT_FORFEITURE / CREDIT (company income, classified IN)
    //   WALLET_DEPOSIT -> WALLET_REFUND / CREDIT  (audit only, no money moved)
    const [category, transactionType] =
        settlementAction === 'BANK_REFUND'   ? ['CLIENT_REFUND', 'DEBIT']
      : settlementAction === 'NO_REFUND'     ? ['SETTLEMENT_FORFEITURE', 'CREDIT']
      :                                        ['WALLET_REFUND', 'CREDIT'];

    await client.query(
        `INSERT INTO transactions (
            client_id,
            booking_id,
            category,
            transaction_type,
            amount,
            status,
            notes,
            created_at
        ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, NOW())`,
        [
            booking.client_id,
            booking.booking_id,
            category,
            transactionType,
            settlementBalance,
            settlementNotes
        ]
    );

    return {
        remaining_balance: settlementBalance,
        // Kept for API compatibility: how much ended up (staying) in the wallet.
        wallet_deposited_amount: settlementAction === 'WALLET_DEPOSIT' ? settlementBalance : 0,
        settlement_action: settlementAction,
        settlement_notes: settlementNotes
    };
};

module.exports = {
    getBookingFinancialTotals,
    getBookingSettlementSnapshot,
    applyBookingSettlement,
    VALID_BOOKING_SETTLEMENT_ACTIONS
};
