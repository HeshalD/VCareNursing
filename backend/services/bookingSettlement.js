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

const getBookingSettlementSnapshot = async (client, booking_id) => {
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

    return {
        ...booking,
        total_paid: totalPaid,
        total_invoiced: totalInvoiced,
        remaining_balance: Math.max(totalPaid - totalInvoiced, 0),
        amount_owed: Math.max(totalInvoiced - totalPaid, 0)
    };
};

const applyBookingSettlement = async (client, booking, settlementAction, settlementNote, reason, actorLabel) => {
    const remainingBalance = parseFloat(booking.remaining_balance || 0);
    let walletDepositedAmount = 0;

    if (settlementAction === 'WALLET_DEPOSIT' && remainingBalance > 0) {
        walletDepositedAmount = remainingBalance;

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
        remainingBalance > 0 ? `Remaining balance: Rs.${remainingBalance.toFixed(2)}` : 'No remaining balance',
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
        remaining_balance: remainingBalance,
        wallet_deposited_amount: walletDepositedAmount,
        settlement_notes: settlementNotes
    };
};

module.exports = {
    getBookingFinancialTotals,
    getBookingSettlementSnapshot,
    applyBookingSettlement
};
