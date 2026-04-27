const db = require('../config/db');

const getOverview = async (req, res) => {
  try {
    // Get total revenue collected from client payments
    const totalRevenueQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_revenue_collected 
      FROM transactions 
      WHERE category = 'CLIENT_PAYMENT'
    `;
    
    // Get total invoiced amount
    const totalInvoicedQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_invoiced 
      FROM transactions 
      WHERE category = 'SERVICE_INVOICE'
    `;
    
    // Get total refunds issued
    const totalRefundsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_refunds_issued 
      FROM transactions 
      WHERE category = 'WALLET_REFUND'
    `;
    
    // Get active bookings count
    const activeBookingsCountQuery = `
      SELECT COUNT(*) as active_bookings_count 
      FROM bookings 
      WHERE status = 'ACTIVE'
    `;
    
    // Get total daily burn rate
    const dailyBurnRateQuery = `
      SELECT COALESCE(SUM(daily_rate), 0) as total_daily_burn_rate 
      FROM bookings 
      WHERE status = 'ACTIVE'
    `;

    // Execute all queries in parallel
    const [
      totalRevenueResult,
      totalInvoicedResult,
      totalRefundsResult,
      activeBookingsCountResult,
      dailyBurnRateResult
    ] = await Promise.all([
      db.query(totalRevenueQuery),
      db.query(totalInvoicedQuery),
      db.query(totalRefundsQuery),
      db.query(activeBookingsCountQuery),
      db.query(dailyBurnRateQuery)
    ]);

    // Extract values from query results
    const total_revenue_collected = parseFloat(totalRevenueResult.rows[0].total_revenue_collected);
    const total_invoiced = parseFloat(totalInvoicedResult.rows[0].total_invoiced);
    const total_refunds_issued = parseFloat(totalRefundsResult.rows[0].total_refunds_issued);
    const active_bookings_count = parseInt(activeBookingsCountResult.rows[0].active_bookings_count);
    const total_daily_burn_rate = parseFloat(dailyBurnRateResult.rows[0].total_daily_burn_rate);

    // Calculate derived values
    const outstanding_balance = total_revenue_collected - total_invoiced;
    const projected_monthly_revenue = total_daily_burn_rate * 30;

    // Return comprehensive overview
    res.status(200).json({
      status: 'success',
      data: {
        total_revenue_collected,
        total_invoiced,
        outstanding_balance,
        total_refunds_issued,
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

const getTransactions = async (req, res) => {
  try {
    // Extract query parameters with defaults
    const {
      category,
      payment_method,
      status,
      from_date,
      to_date,
      page = 1,
      limit = 20
    } = req.query;

    // Convert page and limit to integers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE conditions array
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Add conditions based on provided filters
    if (category) {
      conditions.push(`t.category = $${paramIndex++}`);
      params.push(category);
    }

    if (payment_method) {
      conditions.push(`t.payment_method = $${paramIndex++}`);
      params.push(payment_method);
    }

    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status);
    }

    if (from_date) {
      conditions.push(`t.created_at >= $${paramIndex++}`);
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(`t.created_at <= $${paramIndex++}`);
      params.push(to_date);
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Main query with joins
    const query = `
      SELECT 
        t.transaction_id,
        COALESCE(cp.full_name, 'Unknown Client') as client_name,
        COALESCE(b.service_type, 'Unknown Service') as service_type,
        t.category,
        t.amount,
        t.payment_method,
        t.status,
        t.notes,
        t.created_at
      FROM transactions t
      LEFT JOIN client_profiles cp ON t.client_id = cp.client_profile_id
      LEFT JOIN bookings b ON t.booking_id = b.booking_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM transactions t
      ${whereClause}
    `;

    // Add pagination parameters
    params.push(limitNum, offset);

    // Execute both queries
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
    ]);

    const total_count = parseInt(countResult.rows[0].total_count);

    // Return paginated results
    res.status(200).json({
      status: 'success',
      pagination: {
        total_count,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total_count / limitNum)
      },
      data: result.rows
    });

  } catch (error) {
    console.error('Error in getTransactions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching transactions'
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

const getCreditAlertsSummary = async (req, res) => {
  try {
    // Query 1: Count of expiring soon alerts today
    const expiringSoonTodayQuery = `
      SELECT COUNT(*) as expiring_soon_today
      FROM client_alerts
      WHERE alert_type = 'EXPIRING_SOON' 
        AND DATE(sent_at) = CURRENT_DATE
    `;
    
    // Query 2: Count of negative balance alerts today
    const negativeBalanceTodayQuery = `
      SELECT COUNT(*) as negative_balance_today
      FROM client_alerts
      WHERE alert_type = 'NEGATIVE_BALANCE' 
        AND DATE(sent_at) = CURRENT_DATE
    `;
    
    // Query 3: Count of total negative balance alerts across all time
    const totalNegativeBalanceQuery = `
      SELECT COUNT(*) as total_negative_balance_clients
      FROM client_alerts
      WHERE alert_type = 'NEGATIVE_BALANCE'
    `;

    // Execute all queries in parallel
    const [
      expiringSoonResult,
      negativeBalanceTodayResult,
      totalNegativeBalanceResult
    ] = await Promise.all([
      db.query(expiringSoonTodayQuery),
      db.query(negativeBalanceTodayQuery),
      db.query(totalNegativeBalanceQuery)
    ]);

    // Extract values from query results
    const expiring_soon_today = parseInt(expiringSoonResult.rows[0].expiring_soon_today);
    const negative_balance_today = parseInt(negativeBalanceTodayResult.rows[0].negative_balance_today);
    const total_negative_balance_clients = parseInt(totalNegativeBalanceResult.rows[0].total_negative_balance_clients);

    // Return credit alerts summary
    res.status(200).json({
      status: 'success',
      data: {
        expiring_soon_today,
        negative_balance_today,
        total_negative_balance_clients,
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

    // Query revenue data grouped by period
    const query = `
      SELECT 
        DATE_TRUNC('${dateTruncFormat}', created_at) as period,
        COALESCE(SUM(CASE WHEN category = 'CLIENT_PAYMENT' THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN category = 'SERVICE_INVOICE' THEN amount ELSE 0 END), 0) as invoiced
      FROM transactions
      WHERE category IN ('CLIENT_PAYMENT', 'SERVICE_INVOICE')
        AND created_at >= DATE_TRUNC('${dateTruncFormat}', CURRENT_DATE - INTERVAL '${limit} ${dateTruncFormat}s')
      GROUP BY DATE_TRUNC('${dateTruncFormat}', created_at)
      ORDER BY period ASC
    `;

    const result = await db.query(query);

    // Format the response data
    const chartData = result.rows.map(row => ({
      period: row.period,
      revenue: parseFloat(row.revenue),
      invoiced: parseFloat(row.invoiced)
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
      WHERE category = 'CLIENT_PAYMENT'
        AND payment_method IS NOT NULL
      GROUP BY payment_method
      ORDER BY total DESC
    `;

    const result = await db.query(query);

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
  getTransactions,
  getAdvancesSummary,
  getStaffWalletsSummary,
  getCreditAlertsSummary,
  getRevenueChart,
  getPaymentMethodsChart,
  getTransactionCategoriesChart
};