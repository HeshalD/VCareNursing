// services/clientFinancials.js
// The definitions behind a client's headline money figures (Payments Made, Total
// Invoiced, Overdue). They live here — rather than in clientController — so the
// client page's drill-down breakdowns (services/clientFinancialBreakdown.js) are
// built from exactly the same rules as the numbers they explain.

const db = require('../config/db');

// Single source of truth for a client's Payments Made / Total Invoiced / Overdue.
//  - Payments Made = real money the client handed over (cash, transfer, cheque, ...). Wallet
//    draws (payment_method WALLET) only move already-received money around, and refunds /
//    forfeitures are not payments, so none of those count.
//  - Total Invoiced = every ledger debit that is a charge (refund pay-outs are not charges)
//    + every registration-fee (overdue_invoices) invoice ever raised, paid or not
//    − care-day invoice reductions made before corrections edited the original
//    ledger row (those left the full charge in place and posted the reduction as a
//    separate WALLET_REFUND credit — see services/amountCorrections.js), so the
//    figure matches the corrected day amounts.
//  - Overdue = what is invoiced but not yet settled, worked out booking by booking (so a
//    settled or refunded booking can't hide another one's debt) + unresolved
//    overdue_invoices rows. Never negative.
const NON_PAYMENT_CREDIT_CATEGORIES = ['WALLET_REFUND', 'SETTLEMENT_FORFEITURE', 'STAFF_SALARY', 'WALLET_ADJUSTMENT'];
const NON_CHARGE_DEBIT_CATEGORIES = ['WALLET_DEBIT', 'CLIENT_REFUND', 'DEPOSIT_REFUND', 'WALLET_ADJUSTMENT'];

// Per-BOOKING version of the same rules. A booking's ledger can also hold staff-salary
// rows (a salary clawback is a STAFF_SALARY DEBIT carrying the booking id), which are
// never the client's money, so they are excluded on both sides. Every query that asks
// "how much has this booking been invoiced / settled" must build on these two
// fragments — a copy that sums raw DEBITs counts wallet-payoff mirrors and salary
// clawbacks as invoices, so paying a booking off from the wallet never reduces what
// it owes. `alias` is the transactions table alias ('' for none).
const sqlList = (values) => values.map((v) => `'${v}'`).join(', ');
const BOOKING_NON_CHARGE_DEBIT_CATEGORIES = [...NON_CHARGE_DEBIT_CATEGORIES, 'STAFF_SALARY'];
const bookingChargeSql = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `(${p}transaction_type = 'DEBIT' AND COALESCE(${p}category::text, '') NOT IN (${sqlList(BOOKING_NON_CHARGE_DEBIT_CATEGORIES)}))`;
};
const bookingSettledSql = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `(${p}transaction_type = 'CREDIT' AND COALESCE(${p}category::text, '') <> 'STAFF_SALARY')`;
};

async function getClientFinancialTotals(clientId) {
  const [txResult, oiResult, overduePayments, legacyResult] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (
           WHERE transaction_type = 'CREDIT'
             AND payment_method IS DISTINCT FROM 'WALLET'
             AND category::text <> ALL($2::text[])
         ), 0) as total_paid,
         COALESCE(SUM(amount) FILTER (
           WHERE transaction_type = 'DEBIT'
             AND category::text <> ALL($3::text[])
         ), 0) as total_invoiced
       FROM transactions
       WHERE client_id = $1`,
      [clientId, NON_PAYMENT_CREDIT_CATEGORIES, NON_CHARGE_DEBIT_CATEGORIES]
    ),
    db.query(
      `SELECT COALESCE(SUM(amount), 0) as all_time_invoiced,
              COALESCE(SUM(amount) FILTER (WHERE status = 'OVERDUE'), 0) as open_overdue,
              COUNT(*) FILTER (WHERE status = 'OVERDUE')::int as overdue_count
       FROM overdue_invoices
       WHERE client_id = $1`,
      [clientId]
    ),
    queryBookingOverdueRows(clientId),
    db.query(
      `SELECT COALESCE(SUM(-c.delta_amount), 0) AS reductions
       FROM booking_amount_corrections c
       JOIN bookings b ON b.booking_id = c.booking_id
       WHERE b.client_id = $1
         AND c.target_type = 'INVOICE' AND c.applied_in_place = false AND c.delta_amount < 0`,
      [clientId]
    )
  ]);

  const totalPaid = parseFloat(txResult.rows[0]?.total_paid || 0);
  const totalInvoiced = parseFloat(txResult.rows[0]?.total_invoiced || 0)
    + parseFloat(oiResult.rows[0]?.all_time_invoiced || 0)
    - parseFloat(legacyResult.rows[0]?.reductions || 0);
  const balanceDue = overduePayments.reduce((sum, row) => sum + row.balance_due, 0)
    + parseFloat(oiResult.rows[0]?.open_overdue || 0);
  return {
    totalPaid,
    totalInvoiced,
    balanceDue: Math.max(balanceDue, 0),
    overduePayments,
    overdueInvoiceCount: oiResult.rows[0]?.overdue_count || 0
  };
}

async function getClientOverdueBreakdown(clientId) {
  const { balanceDue, overduePayments, overdueInvoiceCount } = await getClientFinancialTotals(clientId);

  const totalOverdue = balanceDue;
  const overdueCount = overduePayments.filter((payment) => payment.is_overdue).length + overdueInvoiceCount;

  return {
    overduePayments,
    totalOverdue,
    overdueCount
  };
}

async function queryBookingOverdueRows(clientId) {
  // Overdue = what has actually been invoiced (ledger DEBITs) for a booking minus what
  // has actually been settled against it (ledger CREDITs, excl. STAFF_SALARY, which
  // includes wallet/refund credits). Comparing against the whole quotation total would
  // flag bookings that are paid up to date but simply not yet invoiced in full.
  const result = await db.query(
    `SELECT
       b.booking_id,
       b.status,
       b.start_date,
       b.created_at,
       b.service_type,
       q.quote_id,
       q.estimate_number,
       p.full_name as patient_name,
       p.age as patient_age,
       led.total_invoiced as invoice_amount,
       led.total_paid as amount_paid,
       led.total_invoiced - led.total_paid as balance_due,
       led.first_invoice_at as invoice_date,
       true as is_overdue
     FROM bookings b
     LEFT JOIN service_requests sr ON b.request_id = sr.request_id
     LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
     LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
     JOIN LATERAL (
       SELECT
         COALESCE(SUM(t.amount) FILTER (WHERE ${bookingChargeSql('t')}), 0) as total_invoiced,
         COALESCE(SUM(t.amount) FILTER (WHERE ${bookingSettledSql('t')}), 0) as total_paid,
         MIN(t.created_at) FILTER (WHERE ${bookingChargeSql('t')}) as first_invoice_at
       FROM transactions t
       WHERE t.booking_id = b.booking_id
     ) led ON true
     WHERE b.client_id = $1
       AND led.total_invoiced > led.total_paid
     ORDER BY b.created_at DESC`,
    [clientId]
  );

  return result.rows.map((row) => ({
    ...row,
    transaction_id: row.booking_id,
    invoice_amount: parseFloat(row.invoice_amount || 0),
    amount_paid: parseFloat(row.amount_paid || 0),
    balance_due: parseFloat(row.balance_due || 0),
    days_overdue: row.invoice_date
      ? Math.max(Math.floor((Date.now() - new Date(row.invoice_date).getTime()) / 86400000), 0)
      : 0,
    is_fully_paid: false
  }));
}

module.exports = {
  NON_PAYMENT_CREDIT_CATEGORIES,
  NON_CHARGE_DEBIT_CATEGORIES,
  BOOKING_NON_CHARGE_DEBIT_CATEGORIES,
  bookingChargeSql,
  bookingSettledSql,
  getClientFinancialTotals,
  getClientOverdueBreakdown,
  queryBookingOverdueRows,
};
