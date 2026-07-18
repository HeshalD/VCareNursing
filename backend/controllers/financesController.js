const db = require('../config/db');
const html_to_pdf = require('html-pdf-node');
const { IN_CATEGORIES, OUT_CATEGORIES } = require('../utils/transactionFlow');

const getOverview = async (req, res) => {
  try {
    // Real cash flow — same IN/OUT categorization used everywhere else (Transactions
    // page, bank account ledgers). SERVICE_INVOICE/WALLET_DEBIT/etc. are accrual
    // records, not cash movement, so they're deliberately excluded here.
    // transaction_type = 'CREDIT' filters out REGISTRATION_FEE's DEBIT-side
    // "charge" rows (see transactionFlow.js) — every other IN/OUT category is
    // CREDIT-only already, so this is a no-op for them.
    const cashFlowQuery = `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE category::text = ANY($1::text[]) AND transaction_type = 'CREDIT'), 0) AS total_money_in,
        COALESCE(SUM(amount) FILTER (WHERE category::text = ANY($2::text[]) AND transaction_type = 'CREDIT'), 0) AS total_money_out
      FROM transactions
    `;

    // Outstanding = unpaid amounts across all three invoice mechanisms in the
    // current system — these are three separate tables, not one, so each is
    // summed independently rather than trying to force them into `transactions`.
    const outstandingQuery = `
      SELECT
        COALESCE((SELECT SUM(amount) FROM booking_daily_invoices WHERE status = 'PENDING'), 0) AS outstanding_daily_invoices,
        COALESCE((SELECT SUM(amount) FROM invoices WHERE status IN ('PENDING', 'OVERDUE')), 0) AS outstanding_product_rental_invoices,
        COALESCE((SELECT SUM(amount) FROM invoices WHERE status = 'OVERDUE'), 0) AS overdue_product_rental_invoices,
        COALESCE((SELECT SUM(reg_fee_amount) FROM client_profiles WHERE reg_fee_status IN ('PENDING', 'EXPIRED')), 0) AS outstanding_registration_fees
    `;

    // Genuine receivables — money actually owed right now, as opposed to
    // "outstanding" above which also counts invoices that aren't due/decided
    // yet. Two sources:
    //  1. OVERDUE bookings' real ledger balance (total DEBITs - total CREDITs,
    //     same math as dailyInvoicing.js's flagOverdueBookings / clientController's
    //     getClientOverdueBreakdown). booking_daily_invoices is deliberately excluded
    //     — it's just the not-yet-approved manual queue, and once a charge is
    //     approved it becomes a DEBIT here anyway, so counting both would double-count.
    //  2. OVERDUE product/rental invoices only — PENDING ones aren't late yet.
    // Registration fees are intentionally excluded.
    const receivablesQuery = `
      SELECT COALESCE(SUM(GREATEST(total_debits - total_credits, 0)), 0) AS overdue_booking_balance
      FROM (
        SELECT
          b.booking_id,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END), 0) AS total_debits,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' AND COALESCE(t.category::text, '') != 'STAFF_SALARY' THEN t.amount ELSE 0 END), 0) AS total_credits
        FROM bookings b
        LEFT JOIN transactions t ON b.booking_id = t.booking_id
        WHERE b.status = 'OVERDUE'
        GROUP BY b.booking_id
      ) booking_balances
    `;

    // Lifetime registration-fee revenue actually collected — reads straight off
    // the ledger (see services/registrationFeeSplit.js) rather than
    // client_profiles.reg_fee_status, which only reflects the client's *current*
    // membership cycle and resets on the 365-day renewal (regFeeExpiry.js cron).
    const registrationFeeRevenueQuery = `
      SELECT COALESCE(SUM(amount), 0) AS registration_fee_revenue
      FROM transactions
      WHERE category = 'REGISTRATION_FEE' AND transaction_type = 'CREDIT' AND status = 'COMPLETED'
    `;

    // Active bookings count (OVERDUE bookings are still running, just behind on payment)
    const activeBookingsCountQuery = `
      SELECT COUNT(*) as active_bookings_count
      FROM bookings
      WHERE status IN ('ACTIVE', 'OVERDUE')
    `;

    // Total daily burn rate
    const dailyBurnRateQuery = `
      SELECT COALESCE(SUM(daily_rate), 0) as total_daily_burn_rate
      FROM bookings
      WHERE status IN ('ACTIVE', 'OVERDUE')
    `;

    const [
      cashFlowResult,
      outstandingResult,
      receivablesResult,
      registrationFeeRevenueResult,
      activeBookingsCountResult,
      dailyBurnRateResult
    ] = await Promise.all([
      db.query(cashFlowQuery, [IN_CATEGORIES, OUT_CATEGORIES]),
      db.query(outstandingQuery),
      db.query(receivablesQuery),
      db.query(registrationFeeRevenueQuery),
      db.query(activeBookingsCountQuery),
      db.query(dailyBurnRateQuery)
    ]);

    const total_money_in = parseFloat(cashFlowResult.rows[0].total_money_in);
    const total_money_out = parseFloat(cashFlowResult.rows[0].total_money_out);
    const net_cash_flow = total_money_in - total_money_out;

    const outstanding_daily_invoices = parseFloat(outstandingResult.rows[0].outstanding_daily_invoices);
    const outstanding_product_rental_invoices = parseFloat(outstandingResult.rows[0].outstanding_product_rental_invoices);
    const overdue_product_rental_invoices = parseFloat(outstandingResult.rows[0].overdue_product_rental_invoices);
    const outstanding_registration_fees = parseFloat(outstandingResult.rows[0].outstanding_registration_fees);
    const total_outstanding = outstanding_daily_invoices + outstanding_product_rental_invoices + outstanding_registration_fees;

    const overdue_booking_balance = parseFloat(receivablesResult.rows[0].overdue_booking_balance);
    const total_receivables = overdue_booking_balance + overdue_product_rental_invoices;

    const registration_fee_revenue = parseFloat(registrationFeeRevenueResult.rows[0].registration_fee_revenue);

    const active_bookings_count = parseInt(activeBookingsCountResult.rows[0].active_bookings_count);
    const total_daily_burn_rate = parseFloat(dailyBurnRateResult.rows[0].total_daily_burn_rate);
    const projected_monthly_revenue = total_daily_burn_rate * 30;

    res.status(200).json({
      status: 'success',
      data: {
        total_money_in,
        total_money_out,
        net_cash_flow,
        outstanding_daily_invoices,
        outstanding_product_rental_invoices,
        overdue_product_rental_invoices,
        outstanding_registration_fees,
        total_outstanding,
        overdue_booking_balance,
        total_receivables,
        registration_fee_revenue,
        active_bookings_count,
        total_daily_burn_rate,
        projected_monthly_revenue
      }
    });

  } catch (error) {
    console.error('Error in getOverview:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching financial overview'
    });
  }
};

const getAdvancesSummary = async (req, res) => {
  try {
    // Get current month start and end dates
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Query 1: Sum of approved advances this month
    const approvedThisMonthQuery = `
      SELECT COALESCE(SUM(sa.amount_requested), 0) as total_approved_this_month
      FROM staff_advances sa
      JOIN staff_profiles sp ON sa.staff_profile_id = sp.staff_profile_id
      WHERE sa.status = 'APPROVED' 
        AND sa.approved_at >= $1 
        AND sa.approved_at <= $2
    `;
    
    // Query 2: Count of pending advances
    const pendingCountQuery = `
      SELECT COUNT(*) as pending_count
      FROM staff_advances sa
      JOIN staff_profiles sp ON sa.staff_profile_id = sp.staff_profile_id
      WHERE sa.status = 'PENDING'
    `;
    
    // Query 3: Sum of all approved advances (outstanding)
    const totalOutstandingQuery = `
      SELECT COALESCE(SUM(sa.amount_requested), 0) as total_outstanding_advances,
             array_agg(DISTINCT sp.full_name ORDER BY sp.full_name) as staff_with_advances
      FROM staff_advances sa
      JOIN staff_profiles sp ON sa.staff_profile_id = sp.staff_profile_id
      WHERE sa.status = 'APPROVED'
    `;

    // Execute all queries in parallel
    const [
      approvedThisMonthResult,
      pendingCountResult,
      totalOutstandingResult
    ] = await Promise.all([
      db.query(approvedThisMonthQuery, [firstDayOfMonth, lastDayOfMonth]),
      db.query(pendingCountQuery),
      db.query(totalOutstandingQuery)
    ]);

    // Extract values from query results
    const total_approved_this_month = parseFloat(approvedThisMonthResult.rows[0].total_approved_this_month);
    const pending_count = parseInt(pendingCountResult.rows[0].pending_count);
    const total_outstanding_advances = parseFloat(totalOutstandingResult.rows[0].total_outstanding_advances);
    const staff_with_advances = totalOutstandingResult.rows[0].staff_with_advances || [];

    // Return comprehensive advances summary
    res.status(200).json({
      status: 'success',
      data: {
        total_approved_this_month,
        pending_count,
        total_outstanding_advances,
        staff_with_advances,
        month_period: {
          start: firstDayOfMonth.toISOString().split('T')[0],
          end: lastDayOfMonth.toISOString().split('T')[0],
          month: now.toLocaleString('default', { month: 'long', year: 'numeric' })
        }
      }
    });

  } catch (error) {
    console.error('Error in getAdvancesSummary:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching advances summary'
    });
  }
};

const getStaffWalletsSummary = async (req, res) => {
  try {
    // Query staff wallets summary statistics
    const query = `
      SELECT 
        COALESCE(SUM(balance), 0) as total_balance_held,
        COUNT(*) as total_staff_wallets,
        COALESCE(AVG(balance), 0) as average_wallet_balance
      FROM staff_wallet
    `;

    const result = await db.query(query);

    // Extract values from query result
    const total_balance_held = parseFloat(result.rows[0].total_balance_held);
    const total_staff_wallets = parseInt(result.rows[0].total_staff_wallets);
    const average_wallet_balance = parseFloat(result.rows[0].average_wallet_balance);

    // Return staff wallets summary
    res.status(200).json({
      status: 'success',
      data: {
        total_balance_held,
        total_staff_wallets,
        average_wallet_balance
      }
    });

  } catch (error) {
    console.error('Error in getStaffWalletsSummary:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching staff wallets summary'
    });
  }
};

// Live balance-risk counts — mirrors the PREDICTION query in
// scheduledActionsController.getUpcomingEvents (same math: unpaid minus
// invoiced, expressed in days of daily_rate remaining) rather than counting
// historical `client_alerts` notification logs, which only reflect whatever
// happened to be sent and can drift from the current live state.
const getCreditAlertsSummary = async (req, res) => {
  try {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(t.bal, 0) / b.daily_rate <= 0) AS negative_balance_today,
        COUNT(*) FILTER (WHERE COALESCE(t.bal, 0) / b.daily_rate > 0 AND COALESCE(t.bal, 0) / b.daily_rate <= 1) AS expiring_soon_today
      FROM bookings b
      LEFT JOIN (
        SELECT booking_id,
          COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') != 'STAFF_SALARY' THEN amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS bal
        FROM transactions
        GROUP BY booking_id
      ) t ON t.booking_id = b.booking_id
      WHERE b.status = 'ACTIVE'
        AND b.daily_rate IS NOT NULL AND b.daily_rate > 0
    `;

    const result = await db.query(query);
    const negative_balance_today = parseInt(result.rows[0].negative_balance_today);
    const expiring_soon_today = parseInt(result.rows[0].expiring_soon_today);

    res.status(200).json({
      status: 'success',
      data: {
        expiring_soon_today,
        negative_balance_today,
        current_date: new Date().toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error in getCreditAlertsSummary:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching credit alerts summary'
    });
  }
};

const getRevenueChart = async (req, res) => {
  try {
    // Get period parameter with default to monthly
    const { period = 'monthly' } = req.query;
    
    // Validate period parameter
    const validPeriods = ['daily', 'weekly', 'monthly'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid period. Must be one of: daily, weekly, monthly'
      });
    }

    // Determine date_trunc format and limit based on period
    let dateTruncFormat;
    let limit;
    
    switch (period) {
      case 'daily':
        dateTruncFormat = 'day';
        limit = 30; // Last 30 days
        break;
      case 'weekly':
        dateTruncFormat = 'week';
        limit = 12; // Last 12 weeks
        break;
      case 'monthly':
        dateTruncFormat = 'month';
        limit = 12; // Last 12 months
        break;
    }

    // Money In vs Money Out per period — same IN/OUT categorization as the
    // overview cards and the Transactions page, so the trend line and the
    // headline totals never disagree with each other.
    const query = `
      SELECT
        DATE_TRUNC('${dateTruncFormat}', created_at) as period,
        COALESCE(SUM(amount) FILTER (WHERE category::text = ANY($1::text[])), 0) as money_in,
        COALESCE(SUM(amount) FILTER (WHERE category::text = ANY($2::text[])), 0) as money_out
      FROM transactions
      WHERE (category::text = ANY($1::text[]) OR category::text = ANY($2::text[]))
        AND created_at >= DATE_TRUNC('${dateTruncFormat}', CURRENT_DATE - INTERVAL '${limit} ${dateTruncFormat}s')
      GROUP BY DATE_TRUNC('${dateTruncFormat}', created_at)
      ORDER BY period ASC
    `;

    const result = await db.query(query, [IN_CATEGORIES, OUT_CATEGORIES]);

    // Format the response data
    const chartData = result.rows.map(row => ({
      period: row.period,
      money_in: parseFloat(row.money_in),
      money_out: parseFloat(row.money_out)
    }));

    // Return revenue chart data
    res.status(200).json({
      status: 'success',
      data: chartData,
      meta: {
        period,
        date_trunc_format: dateTruncFormat,
        limit
      }
    });

  } catch (error) {
    console.error('Error in getRevenueChart:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching revenue chart data'
    });
  }
};

const getPaymentMethodsChart = async (req, res) => {
  try {
    // Query payment methods data grouped by payment method
    const query = `
      SELECT
        payment_method,
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count
      FROM transactions
      WHERE category::text = ANY($1::text[])
        AND transaction_type = 'CREDIT'
        AND payment_method IS NOT NULL
      GROUP BY payment_method
      ORDER BY total DESC
    `;

    const result = await db.query(query, [IN_CATEGORIES]);

    // Format the response data
    const chartData = result.rows.map(row => ({
      payment_method: row.payment_method,
      total: parseFloat(row.total),
      count: parseInt(row.count)
    }));

    // Return payment methods chart data
    res.status(200).json({
      status: 'success',
      data: chartData
    });

  } catch (error) {
    console.error('Error in getPaymentMethodsChart:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching payment methods chart data'
    });
  }
};

const getTransactionCategoriesChart = async (req, res) => {
  try {
    // Query transaction categories data grouped by category
    const query = `
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count
      FROM transactions
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY total DESC
    `;

    const result = await db.query(query);

    // Format the response data
    const chartData = result.rows.map(row => ({
      category: row.category,
      total: parseFloat(row.total),
      count: parseInt(row.count)
    }));

    // Return transaction categories chart data
    res.status(200).json({
      status: 'success',
      data: chartData
    });

  } catch (error) {
    console.error('Error in getTransactionCategoriesChart:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching transaction categories chart data'
    });
  }
};

// Same two receivable sources as getOverview's total_receivables (overdue
// booking ledger balances + overdue product/rental invoices), but broken out
// per-item with an age bucket so the admin can see exactly what makes up the
// number instead of just the total.
const getReceivablesAging = async (req, res) => {
  try {
    // Bookings don't store a "went overdue" timestamp, so age is approximated
    // as days since the oldest DEBIT transaction that is still unpaid — i.e.
    // walk the booking's debits oldest-first and find the first one whose
    // running total exceeds what's been credited back. That's the charge
    // that's actually been sitting unpaid the longest.
    const bookingItemsQuery = `
      WITH booking_credits AS (
        SELECT booking_id, COALESCE(SUM(amount), 0) AS total_credits
        FROM transactions
        WHERE transaction_type = 'CREDIT' AND COALESCE(category::text, '') != 'STAFF_SALARY'
        GROUP BY booking_id
      ),
      booking_debits AS (
        SELECT
          booking_id, created_at, amount,
          SUM(amount) OVER (PARTITION BY booking_id ORDER BY created_at, transaction_id) AS running_debit
        FROM transactions
        WHERE transaction_type = 'DEBIT'
      ),
      oldest_unpaid AS (
        SELECT bd.booking_id, MIN(bd.created_at) AS oldest_unpaid_date
        FROM booking_debits bd
        LEFT JOIN booking_credits bc ON bc.booking_id = bd.booking_id
        WHERE bd.running_debit > COALESCE(bc.total_credits, 0)
        GROUP BY bd.booking_id
      ),
      booking_balances AS (
        SELECT
          b.booking_id,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END), 0) AS total_debits,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' AND COALESCE(t.category::text, '') != 'STAFF_SALARY' THEN t.amount ELSE 0 END), 0) AS total_credits
        FROM bookings b
        LEFT JOIN transactions t ON b.booking_id = t.booking_id
        WHERE b.status = 'OVERDUE'
        GROUP BY b.booking_id
      )
      SELECT
        bb.booking_id,
        cp.full_name AS customer_name,
        GREATEST(bb.total_debits - bb.total_credits, 0) AS amount,
        ou.oldest_unpaid_date::date AS reference_date
      FROM booking_balances bb
      JOIN bookings b ON b.booking_id = bb.booking_id
      JOIN client_profiles cp ON cp.client_profile_id = b.client_id
      LEFT JOIN oldest_unpaid ou ON ou.booking_id = bb.booking_id
      WHERE GREATEST(bb.total_debits - bb.total_credits, 0) > 0
    `;

    const invoiceItemsQuery = `
      SELECT
        i.invoice_id,
        i.invoice_code,
        COALESCE(cp.full_name, wic.full_name, 'Unknown') AS customer_name,
        i.amount,
        i.due_date AS reference_date
      FROM invoices i
      LEFT JOIN client_profiles cp ON cp.client_profile_id = i.client_id
      LEFT JOIN walk_in_customers wic ON wic.walk_in_customer_id = i.walk_in_customer_id
      WHERE i.status = 'OVERDUE'
    `;

    const [bookingItemsResult, invoiceItemsResult] = await Promise.all([
      db.query(bookingItemsQuery),
      db.query(invoiceItemsQuery)
    ]);

    const today = new Date();
    const ageDays = (refDate) => {
      if (!refDate) return 0;
      const diffMs = today.setHours(0, 0, 0, 0) - new Date(refDate).setHours(0, 0, 0, 0);
      return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
    };

    const items = [
      ...bookingItemsResult.rows.map(row => ({
        source: 'BOOKING',
        reference: `Booking #${row.booking_id.slice(0, 8)}`,
        booking_id: row.booking_id,
        customer_name: row.customer_name,
        reference_date: row.reference_date,
        age_days: ageDays(row.reference_date),
        amount: parseFloat(row.amount),
        type: 'Booking Balance'
      })),
      ...invoiceItemsResult.rows.map(row => ({
        source: 'INVOICE',
        reference: row.invoice_code,
        invoice_id: row.invoice_id,
        customer_name: row.customer_name,
        reference_date: row.reference_date,
        age_days: ageDays(row.reference_date),
        amount: parseFloat(row.amount),
        type: 'Invoice'
      }))
    ].sort((a, b) => b.age_days - a.age_days);

    const bucketDefs = [
      { key: 'days_1_15', label: '1-15 Days', min: 0, max: 15 },
      { key: 'days_16_30', label: '16-30 Days', min: 16, max: 30 },
      { key: 'days_31_45', label: '31-45 Days', min: 31, max: 45 },
      { key: 'days_46_plus', label: 'Above 45 Days', min: 46, max: Infinity }
    ];

    const buckets = bucketDefs.map(def => {
      const bucketItems = items.filter(item => item.age_days >= def.min && item.age_days <= def.max);
      return {
        key: def.key,
        label: def.label,
        amount: bucketItems.reduce((sum, item) => sum + item.amount, 0),
        count: bucketItems.length
      };
    });

    const total_receivables = items.reduce((sum, item) => sum + item.amount, 0);

    res.status(200).json({
      status: 'success',
      data: {
        as_of: today.toISOString().split('T')[0],
        total_receivables,
        buckets,
        items
      }
    });

  } catch (error) {
    console.error('Error in getReceivablesAging:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching receivables aging'
    });
  }
};

// The AP equivalent of getReceivablesAging — money the company owes staff
// that's sitting unpaid in their wallet (staff_wallet.balance), broken out
// per-employee with an age bucket. staff_wallet.balance is already the
// authoritative "amount owed" (STAFF_SALARY credits minus STAFF_SALARY_PAID
// payouts minus STAFF_ADVANCE deductions, kept in sync by staffWalletController
// / billingService), so unlike receivables there's no separate balance
// computation here — just an age anchor for each staff member's outstanding
// balance.
const getPayablesAging = async (req, res) => {
  try {
    // Staff don't have a "salary due date" — age is approximated the same way
    // as booking receivables: walk each staff member's STAFF_SALARY credits
    // oldest-first and find the first one whose running total exceeds what's
    // already been paid out / deducted as an advance. That's the earning
    // that's been sitting unpaid the longest.
    const payableItemsQuery = `
      WITH staff_debits AS (
        SELECT staff_profile_id, COALESCE(SUM(amount), 0) AS total_debits
        FROM transactions
        WHERE transaction_type = 'DEBIT' AND category::text IN ('STAFF_SALARY_PAID', 'STAFF_ADVANCE') AND status = 'COMPLETED'
        GROUP BY staff_profile_id
      ),
      staff_credits AS (
        SELECT
          staff_profile_id, created_at, amount,
          SUM(amount) OVER (PARTITION BY staff_profile_id ORDER BY created_at, transaction_id) AS running_credit
        FROM transactions
        WHERE transaction_type = 'CREDIT' AND category::text = 'STAFF_SALARY' AND status = 'COMPLETED'
      ),
      oldest_unpaid AS (
        SELECT sc.staff_profile_id, MIN(sc.created_at) AS oldest_unpaid_date
        FROM staff_credits sc
        LEFT JOIN staff_debits sd ON sd.staff_profile_id = sc.staff_profile_id
        WHERE sc.running_credit > COALESCE(sd.total_debits, 0)
        GROUP BY sc.staff_profile_id
      )
      SELECT
        sp.staff_profile_id,
        sp.full_name AS employee_name,
        sp.staff_code,
        sw.balance AS amount,
        ou.oldest_unpaid_date::date AS reference_date
      FROM staff_wallet sw
      JOIN staff_profiles sp ON sp.staff_profile_id = sw.staff_profile_id
      LEFT JOIN oldest_unpaid ou ON ou.staff_profile_id = sw.staff_profile_id
      WHERE sw.balance > 0
    `;

    const result = await db.query(payableItemsQuery);

    const today = new Date();
    const ageDays = (refDate) => {
      if (!refDate) return 0;
      const diffMs = today.setHours(0, 0, 0, 0) - new Date(refDate).setHours(0, 0, 0, 0);
      return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
    };

    const items = result.rows
      .map(row => ({
        source: 'STAFF_WALLET',
        reference: row.staff_code || `EMP-${row.staff_profile_id.slice(0, 8)}`,
        staff_profile_id: row.staff_profile_id,
        employee_name: row.employee_name,
        reference_date: row.reference_date,
        age_days: ageDays(row.reference_date),
        amount: parseFloat(row.amount),
        type: 'Salary Payable'
      }))
      .sort((a, b) => b.age_days - a.age_days);

    const bucketDefs = [
      { key: 'days_1_15', label: '1-15 Days', min: 0, max: 15 },
      { key: 'days_16_30', label: '16-30 Days', min: 16, max: 30 },
      { key: 'days_31_45', label: '31-45 Days', min: 31, max: 45 },
      { key: 'days_46_plus', label: 'Above 45 Days', min: 46, max: Infinity }
    ];

    const buckets = bucketDefs.map(def => {
      const bucketItems = items.filter(item => item.age_days >= def.min && item.age_days <= def.max);
      return {
        key: def.key,
        label: def.label,
        amount: bucketItems.reduce((sum, item) => sum + item.amount, 0),
        count: bucketItems.length
      };
    });

    const total_payables = items.reduce((sum, item) => sum + item.amount, 0);

    res.status(200).json({
      status: 'success',
      data: {
        as_of: today.toISOString().split('T')[0],
        total_payables,
        buckets,
        items
      }
    });

  } catch (error) {
    console.error('Error in getPayablesAging:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching payables aging'
    });
  }
};

// Category groupings for the Profit & Loss report. Service revenue is read
// from SERVICE_INVOICE only (the accrual charge billingService creates per
// billed day/shift) rather than also including BOOKING_PAYMENT — the latter
// is just the cash settling that same charge, so summing both would double
// count. Product revenue has no equivalent "invoice issued" ledger entry
// (PRODUCT_SALE/RENTAL_PAYMENT are only posted once payment is recorded —
// see invoiceController.recordInvoicePayment), so it's necessarily counted
// on collection.
const PNL_SERVICE_CATEGORIES = ['SERVICE_INVOICE'];
const PNL_PRODUCT_CATEGORIES = ['PRODUCT_SALE', 'RENTAL_PAYMENT'];
const PNL_OTHER_INCOME_CATEGORIES = ['REGISTRATION_FEE', 'OTHER_INCOME'];
const PNL_SALARY_CATEGORIES = ['STAFF_SALARY_PAID'];
const PNL_OTHER_EXPENSE_CATEGORIES = ['OTHER_EXPENSE', 'AGENCY_FEE'];

function monthKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Shared by the JSON endpoint and the PDF export so both always agree.
async function computeProfitLoss({ mode, date }) {
  const numMonths = mode === 'month' ? 1 : mode === '6month' ? 6 : 12;
  const anchor = date ? new Date(date) : new Date();
  const anchorMonthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(anchorMonthStart.getUTCFullYear(), anchorMonthStart.getUTCMonth() - (numMonths - 1), 1));
  const periodEndExclusive = new Date(Date.UTC(anchorMonthStart.getUTCFullYear(), anchorMonthStart.getUTCMonth() + 1, 1));

  const txQuery = `
    SELECT date_trunc('month', created_at) AS month_start, category::text AS category,
           COALESCE(SUM(amount), 0) AS amount
    FROM transactions
    WHERE created_at >= $1 AND created_at < $2 AND status = 'COMPLETED'
    GROUP BY 1, 2
  `;
  // Sold products' cost basis: joins each PRODUCT_SALE/RENTAL_PAYMENT
  // transaction to the quote it settled, summing quantity * cost snapshot
  // across that quote's line items (a sale can bundle several products).
  const cogsQuery = `
    SELECT date_trunc('month', t.created_at) AS month_start,
           COALESCE(SUM(qli.quantity * COALESCE(qli.cost_price_snapshot, 0)), 0) AS cogs
    FROM transactions t
    JOIN quote_line_items qli ON qli.quote_id = t.quote_id
    WHERE t.category::text = ANY($3::text[])
      AND t.created_at >= $1 AND t.created_at < $2 AND t.status = 'COMPLETED'
    GROUP BY 1
  `;

  const [txResult, cogsResult] = await Promise.all([
    db.query(txQuery, [periodStart, periodEndExclusive]),
    db.query(cogsQuery, [periodStart, periodEndExclusive, PNL_PRODUCT_CATEGORIES]),
  ]);

  const byMonth = new Map();
  for (const row of txResult.rows) {
    const key = monthKey(new Date(row.month_start));
    if (!byMonth.has(key)) byMonth.set(key, {});
    byMonth.get(key)[row.category] = parseFloat(row.amount);
  }
  const cogsByMonth = new Map();
  for (const row of cogsResult.rows) {
    cogsByMonth.set(monthKey(new Date(row.month_start)), parseFloat(row.cogs));
  }

  const sumCategories = (catValues, cats) => cats.reduce((sum, c) => sum + (catValues[c] || 0), 0);

  const periods = [];
  for (let i = 0; i < numMonths; i++) {
    const monthStart = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + i, 1));
    const key = monthKey(monthStart);
    const catValues = byMonth.get(key) || {};

    const serviceRevenue = sumCategories(catValues, PNL_SERVICE_CATEGORIES);
    const productRevenue = sumCategories(catValues, PNL_PRODUCT_CATEGORIES);
    const otherIncome = sumCategories(catValues, PNL_OTHER_INCOME_CATEGORIES);
    const totalSales = serviceRevenue + productRevenue;
    const cogs = cogsByMonth.get(key) || 0;
    const grossProfit = totalSales - cogs;
    const salaries = sumCategories(catValues, PNL_SALARY_CATEGORIES);
    const otherExpenses = sumCategories(catValues, PNL_OTHER_EXPENSE_CATEGORIES);
    const totalExpenses = salaries + otherExpenses;
    const operatingProfit = grossProfit + otherIncome - totalExpenses;
    const netProfit = operatingProfit;

    periods.push({
      label: monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      monthStart: monthStart.toISOString().split('T')[0],
      serviceRevenue, productRevenue, otherIncome, totalSales,
      cogs, grossProfit, salaries, otherExpenses, totalExpenses,
      operatingProfit, netProfit,
    });
  }

  return {
    mode,
    from: periodStart.toISOString().split('T')[0],
    to: new Date(periodEndExclusive.getTime() - 86400000).toISOString().split('T')[0],
    periods,
  };
}

const getProfitLoss = async (req, res) => {
  try {
    const { mode = 'month', date } = req.query;
    if (!['month', '6month', 'year'].includes(mode)) {
      return res.status(400).json({ status: 'error', message: 'Invalid mode. Must be one of: month, 6month, year' });
    }

    const data = await computeProfitLoss({ mode, date });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('Error in getProfitLoss:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error while fetching profit and loss report' });
  }
};

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Renders the same figures as getProfitLoss into a standalone HTML page styled
// after the reference P&L layout, then rasterizes it server-side (mirrors
// invoiceController's html-pdf-node usage) — sent straight back as an
// attachment rather than persisted to S3, since this report is regenerated
// on demand rather than being a fixed document like an invoice.
const getProfitLossPdf = async (req, res) => {
  try {
    const { mode = 'month', date } = req.query;
    if (!['month', '6month', 'year'].includes(mode)) {
      return res.status(400).json({ status: 'error', message: 'Invalid mode. Must be one of: month, 6month, year' });
    }

    const { from, to, periods } = await computeProfitLoss({ mode, date });

    const rows = [
      ['Operating Income', null, true],
      ['Service Revenue', 'serviceRevenue'],
      ['Product Revenue', 'productRevenue'],
      ['Other Operating Income', 'otherIncome'],
      ['Total for Operating Income', 'totalSales', true],
      ['Cost of Goods Sold', null, true],
      ['Cost of Goods Sold', 'cogs'],
      ['Total for Cost of Goods Sold', 'cogs', true],
      ['Gross Profit', 'grossProfit', true],
      ['Operating Expense', null, true],
      ['Other Expenses', 'otherExpenses'],
      ['Salaries and Employee Wages', 'salaries'],
      ['Total for Operating Expense', 'totalExpenses', true],
      ['Operating Profit', 'operatingProfit', true],
      ['Net Profit/Loss', 'netProfit', true],
    ];

    const periodHeaders = periods.map(p => `<th style="text-align:right;padding:8px;">${p.label}</th>`).join('');
    const bodyRows = rows.map(([label, key, bold]) => {
      const cells = key
        ? periods.map(p => `<td style="text-align:right;padding:8px;${bold ? 'font-weight:bold;' : ''}">${fmtMoney(p[key])}</td>`).join('')
        : `<td colspan="${periods.length}"></td>`;
      return `<tr style="${bold ? 'border-top:1px solid #ccc;' : ''}">
        <td style="padding:8px;${bold ? 'font-weight:bold;' : ''}">${label}</td>
        ${cells}
      </tr>`;
    }).join('');

    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: Arial, sans-serif; color:#1f2937;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="margin:0;">Vcare Nursing</h1>
            <h2 style="margin:4px 0;">Profit and Loss</h2>
            <div>From ${from} To ${to}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:8px;">Account</th>
                ${periodHeaders}
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
          <div style="margin-top:24px;font-size:12px;color:#6b7280;">**Amount is displayed in your base currency LKR</div>
        </body>
      </html>
    `;

    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ProfitLoss_${from}_to_${to}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error in getProfitLossPdf:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error while generating profit and loss PDF' });
  }
};

module.exports = {
  getOverview,
  getAdvancesSummary,
  getStaffWalletsSummary,
  getCreditAlertsSummary,
  getRevenueChart,
  getPaymentMethodsChart,
  getTransactionCategoriesChart,
  getReceivablesAging,
  getPayablesAging,
  getProfitLoss,
  getProfitLossPdf
};