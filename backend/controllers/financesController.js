const db = require('../config/db');
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

module.exports = {
  getOverview,
  getAdvancesSummary,
  getStaffWalletsSummary,
  getCreditAlertsSummary,
  getRevenueChart,
  getPaymentMethodsChart,
  getTransactionCategoriesChart
};