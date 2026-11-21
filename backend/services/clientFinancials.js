// services/clientFinancials.js
// The definitions behind a client's headline money figures (Payments Made, Total
// Invoiced, Overdue). They live here — rather than in clientController — so the
// client page's drill-down breakdowns (services/clientFinancialBreakdown.js) are
// built from exactly the same rules as the numbers they explain.

const db = require('../config/db');
const { TIER_SQL, TIERS } = require('./registrationTier');

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
//    overdue_invoices rows + unpaid product invoices that belong to no booking
//    (unbookedDueInvoiceSql). Never negative.
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
  return `(${p}transaction_type = 'CREDIT' AND COALESCE(${p}category::text, '') <> 'STAFF_SALARY' AND NOT ${refundedReversalSql(alias)})`;
};

// The "Reversal of …" credit a revoked day leaves behind (billingService.reverseServiceInvoice).
// It is NOT a payment: it cancels the day's charge AND returns the payment that covered it (to
// the wallet, or out of the system for a bank refund), and those two cancel each other. So the
// booking's owed amount is simply charges − payments, ignoring both the cancelled charge's
// offset and the returned payment — i.e. this credit must not count as settled. Counting it did:
// a booking with another unpaid invoice read as fully paid while the returned money also sat in
// the wallet (BK-00322 — the same Rs. counted twice). "(booking extended)" reversals are the
// exception: the payment stays on the booking to fund the extra day, so they keep their old
// reading. Pre-existing "Correction for …" credits are different rows and stay counted.
const refundedReversalSql = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `(${p}category::text = 'WALLET_REFUND' AND COALESCE(${p}notes, '') LIKE 'Reversal of %' AND COALESCE(${p}notes, '') NOT LIKE '%(booking extended)%')`;
};

// A product/rental invoice that is not part of a booking (a standalone sale, or a quotation's
// products before any booking exists) has no booking ledger to be "overdue" on, so it counts on
// its own: the moment it is unpaid, like a care day, unless a due date was set and has not passed.
// Rental invoices keep their own rule: they count once the nightly job marks them OVERDUE after
// the billing period. Invoices that belong to a booking are NOT counted here. Their charge is
// already on that booking's balance, so counting them again would double the debt.
// `a` is the invoices table alias. Shared by the client page, its Overdue breakdown and the
// Finances dashboard so all three always agree.
const unbookedDueInvoiceSql = (a = 'i') => `(
  ${a}.booking_id IS NULL AND ${a}.status <> 'PAID'
  AND (${a}.category = 'PRODUCT' OR (${a}.category IN ('RENTAL_ONE_TIME', 'RENTAL_RECURRING') AND ${a}.status = 'OVERDUE'))
  AND (${a}.due_date IS NULL OR ${a}.due_date <= CURRENT_DATE)
)`;
const invoiceUnpaidSql = (a = 'i') =>
  `GREATEST(${a}.amount - COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = ${a}.invoice_id), 0), 0)`;

async function queryUnbookedInvoiceRows(clientId) {
  const result = await db.query(
    `SELECT i.invoice_id, i.invoice_code, i.category, i.status, i.amount, i.created_at AS date, i.due_date,
            ${invoiceUnpaidSql('i')} AS owing
     FROM invoices i
     WHERE i.client_id = $1 AND ${unbookedDueInvoiceSql('i')} AND ${invoiceUnpaidSql('i')} > 0.005
     ORDER BY i.created_at`,
    [clientId]
  );
  return result.rows.map((r) => ({ ...r, amount: parseFloat(r.amount), owing: parseFloat(r.owing) }));
}

// The registration fee is one obligation per client, shown on its own audit block. A fee charge
// that belongs to a booking is already part of that booking's balance above. One that belongs to
// no booking (a standalone invoice, an admin payment entry, a backfill) has no booking ledger to be
// "overdue" on, so it counts here: unlinked fee debits minus unlinked fee credits. Every kind of
// payment settles it — cash, transfer, wallet draw — because this is about what is still owed, not
// about Payments Made. A WAIVED fee owes nothing. Never negative.
// Registration TIER (services/registrationTier.js) decides whether it is OVERDUE yet: a client who
// has not started any booking (tier INACTIVE) has been invoiced but nothing is due from them, so the
// amount is reported as `notYetDue` and left out of Overdue. It is still in Total Invoiced.
async function queryRegistrationOutstanding(clientId) {
  const tierRes = await db.query(`SELECT ${TIER_SQL} AS tier FROM client_profiles cp WHERE cp.client_profile_id = $1`, [clientId]);
  const tier = tierRes.rows[0]?.tier || TIERS.INACTIVE;
  const result = await db.query(
    `SELECT cp.reg_fee_status,
            COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'DEBIT'  AND t.booking_id IS NULL), 0) AS unlinked_debit,
            COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'CREDIT' AND t.booking_id IS NULL), 0) AS unlinked_credit
     FROM client_profiles cp
     LEFT JOIN transactions t ON t.client_id = cp.client_profile_id AND t.category::text = 'REGISTRATION_FEE'
     WHERE cp.client_profile_id = $1
     GROUP BY cp.reg_fee_status`,
    [clientId]
  );
  const row = result.rows[0];
  if (!row) return { outstanding: 0, notYetDue: 0, tier, unlinkedDebit: 0, unlinkedCredit: 0, waived: false };
  const unlinkedDebit = parseFloat(row.unlinked_debit);
  const unlinkedCredit = parseFloat(row.unlinked_credit);
  const waived = row.reg_fee_status === 'WAIVED';
  const unpaid = waived ? 0 : Math.max(Math.round((unlinkedDebit - unlinkedCredit) * 100) / 100, 0);
  const overdueNow = tier !== TIERS.INACTIVE;
  return {
    outstanding: overdueNow ? unpaid : 0,
    notYetDue: overdueNow ? 0 : unpaid,
    tier, unlinkedDebit, unlinkedCredit, waived,
  };
}

async function getClientFinancialTotals(clientId) {
  const [txResult, oiResult, overduePayments, legacyResult, reversalResult, unbookedInvoices, registration] = await Promise.all([
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
      // A registration-fee overdue invoice is not counted once the fee has its own ledger
      // debit (booking conversion / admin payment entry book one) — it would count twice.
      `SELECT COALESCE(SUM(amount) FILTER (WHERE NOT (
                source_type = 'REGISTRATION_FEE' AND EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.client_id = overdue_invoices.client_id
                    AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT'))), 0) as all_time_invoiced,
              COALESCE(SUM(amount) FILTER (WHERE status = 'OVERDUE' AND NOT (
                source_type = 'REGISTRATION_FEE' AND EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.client_id = overdue_invoices.client_id
                    AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT'))), 0) as open_overdue,
              COUNT(*) FILTER (WHERE status = 'OVERDUE' AND NOT (
                source_type = 'REGISTRATION_FEE' AND EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.client_id = overdue_invoices.client_id
                    AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT')))::int as overdue_count
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
    ),
    // Revoked days: the original charge stays on the ledger and is cancelled by a
    // WALLET_REFUND "Reversal of …" credit (billingService.reverseServiceInvoice).
    db.query(
      `SELECT COALESCE(SUM(amount), 0) AS reversed
       FROM transactions
       WHERE client_id = $1 AND category::text = 'WALLET_REFUND' AND transaction_type = 'CREDIT'
         AND notes LIKE 'Reversal of %'`,
      [clientId]
    ),
    queryUnbookedInvoiceRows(clientId),
    queryRegistrationOutstanding(clientId)
  ]);

  const totalPaid = parseFloat(txResult.rows[0]?.total_paid || 0);
  const totalInvoiced = parseFloat(txResult.rows[0]?.total_invoiced || 0)
    + parseFloat(oiResult.rows[0]?.all_time_invoiced || 0)
    - parseFloat(legacyResult.rows[0]?.reductions || 0)
    - parseFloat(reversalResult.rows[0]?.reversed || 0);
  const balanceDue = overduePayments.reduce((sum, row) => sum + row.balance_due, 0)
    + parseFloat(oiResult.rows[0]?.open_overdue || 0)
    + unbookedInvoices.reduce((sum, row) => sum + row.owing, 0)
    + registration.outstanding;
  return {
    totalPaid,
    totalInvoiced,
    balanceDue: Math.max(balanceDue, 0),
    overduePayments,
    unbookedInvoices,
    registration,
    overdueInvoiceCount: oiResult.rows[0]?.overdue_count || 0
  };
}

async function getClientOverdueBreakdown(clientId) {
  const { balanceDue, overduePayments, overdueInvoiceCount, unbookedInvoices, registration } = await getClientFinancialTotals(clientId);

  const totalOverdue = balanceDue;
  const overdueCount = overduePayments.filter((payment) => payment.is_overdue).length + overdueInvoiceCount + unbookedInvoices.length
    + (registration.outstanding > 0 ? 1 : 0);

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
       NULLIF(CONCAT_WS(' ', NULLIF(p.honorific, ''), p.full_name), '') as patient_name,
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
  refundedReversalSql,
  unbookedDueInvoiceSql,
  invoiceUnpaidSql,
  queryUnbookedInvoiceRows,
  queryRegistrationOutstanding,
  getClientFinancialTotals,
  getClientOverdueBreakdown,
  queryBookingOverdueRows,
};
