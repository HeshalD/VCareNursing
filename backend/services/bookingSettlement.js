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

    // The ledger-based remaining balance only reflects invoicing already recorded. When
    // completing/terminating on a given date, days between the last invoiced day and that
    // date still need to be billed — a prepayment that exactly covers the full period through
    // the chosen end date isn't a refundable surplus, it's earmarked for those pending
    // invoices. Project the true settlement balance using the booking's daily rate and the
    // number of days from start through the target date, so it reflects the full cost of
    // service through that day rather than however far invoicing has caught up so far.
    let settlementBalance = totalPaid - totalInvoiced;
    const dailyRate = parseFloat(booking.quote_daily_rate || booking.daily_rate || 0);
    if (targetDateInput && dailyRate > 0 && booking.start_date) {
        const start = new Date(booking.start_date); start.setHours(0, 0, 0, 0);
        const target = new Date(targetDateInput); target.setHours(0, 0, 0, 0);
        if (!isNaN(target.getTime())) {
            const targetServedDays = Math.max(0, Math.floor((target - start) / 86400000) + 1);
            settlementBalance = totalPaid - (targetServedDays * dailyRate);
        }
    }

    return {
        ...booking,
        total_paid: totalPaid,
        total_invoiced: totalInvoiced,
        remaining_balance: Math.max(totalPaid - totalInvoiced, 0),
        amount_owed: Math.max(totalInvoiced - totalPaid, 0),
        settlement_balance: settlementBalance
    };
};

const applyBookingSettlement = async (client, booking, settlementAction, settlementNote, reason, actorLabel) => {
    // Use the date-projected settlement balance (falls back to the plain ledger remaining
    // balance if no target date/daily rate was available to project with) — this is what
    // will genuinely be left over once the days through the completion/termination date are
    // billed, not just what's been invoiced so far.
    const settlementBalance = parseFloat(booking.settlement_balance ?? booking.remaining_balance ?? 0);

    // Nothing to settle — the prepayment doesn't exceed the cost of service through the
    // chosen end date, so there's no surplus to credit, refund, or write off. Don't record a
    // Rs. 0 wallet deposit / bank refund / write-off note for money that isn't actually spare.
    if (settlementBalance <= 0) {
        return { remaining_balance: 0, wallet_deposited_amount: 0, settlement_notes: null, skipped: true };
    }

    let walletDepositedAmount = 0;

    if (settlementAction === 'WALLET_DEPOSIT') {
        walletDepositedAmount = settlementBalance;

        await client.query(
            `UPDATE client_profiles
             SET wallet_balance = wallet_balance + $1
             WHERE client_profile_id = $2`,
            [walletDepositedAmount, booking.client_id]
        );
    }

    const settlementNotes = [
        `${actorLabel}`,
        reason ? `Reason: ${reason}` : null,
        settlementAction ? `Settlement action: ${settlementAction}` : null,
        `Remaining balance: Rs.${settlementBalance.toFixed(2)}`,
        settlementNote ? `Note: ${settlementNote}` : null
    ].filter(Boolean).join(' | ');

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
        ) VALUES ($1, $2, $3, 'CREDIT', $4, 'COMPLETED', $5, NOW())`,
        [
            booking.client_id,
            booking.booking_id,
            'WALLET_REFUND',
            walletDepositedAmount,
            settlementNotes
        ]
    );

    return {
        remaining_balance: settlementBalance,
        wallet_deposited_amount: walletDepositedAmount,
        settlement_notes: settlementNotes
    };
};

module.exports = {
    getBookingFinancialTotals,
    getBookingSettlementSnapshot,
    applyBookingSettlement
};
