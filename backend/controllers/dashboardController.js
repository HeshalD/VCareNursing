const db = require('../config/db');

// Tabs on the admin dashboard map to one or more raw service_type values.
// (Public booking forms have written inconsistent values over time, e.g. '{NANNY}'
// vs 'NANNY', so each tab matches every spelling seen in the data.)
const SERVICE_TYPE_FILTERS = {
  HOME_NURSING: ['HOME_NURSING'],
  ELDERLY_CARE: ['ELDERLY_CARE', 'CARETAKER'],
  CHILD_CARE: ['{NANNY}', 'NANNY', 'CHILD_CARE', 'BABY_CARE'],
};

const CATEGORY_LABELS = {
  HOME_NURSING: 'Home Nursing',
  ELDERLY_CARE: 'Elderly Care',
  CHILD_CARE: 'Child Care',
};

const REVENUE_CATEGORIES = ['CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_TOPUP'];
const ACTIVE_BOOKING_STATUSES = ['ACTIVE', 'OVERDUE'];
// A request stops being "in the pipeline" once it's done, cancelled, or already turned into a booking.
const OPEN_REQUEST_STATUSES_EXCLUDED = ['COMPLETED', 'CANCELLED', 'BOOKING_CREATED'];

const pctChange = (current, previous) => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

const getDashboardOverview = async (req, res) => {
  try {
    const { tab } = req.query;
    const serviceTypes = SERVICE_TYPE_FILTERS[tab] || null;

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalBookingsResult,
      lastMonthBookingsResult,
      activeRequestsResult,
      availableStaffResult,
      revenueResult,
      lastMonthRevenueResult,
      categoryBreakdownResult,
      recentRequestsResult,
      pendingVerificationResult,
      pendingAdvancesResult,
      pendingTerminationsResult,
    ] = await Promise.all([
      // Total bookings (filtered by tab, this calendar month)
      db.query(
        `SELECT COUNT(*) AS count FROM bookings
         WHERE created_at >= $1
           AND ($2::text[] IS NULL OR service_type = ANY($2::text[]))`,
        [startOfThisMonth, serviceTypes]
      ),
      db.query(
        `SELECT COUNT(*) AS count FROM bookings
         WHERE created_at >= $1 AND created_at < $2
           AND ($3::text[] IS NULL OR service_type = ANY($3::text[]))`,
        [startOfLastMonth, startOfThisMonth, serviceTypes]
      ),
      // Service requests still in the pipeline (not completed/cancelled)
      db.query(
        `SELECT COUNT(*) AS count FROM service_requests
         WHERE status != ALL($1::text[])
           AND ($2::text[] IS NULL OR service_type = ANY($2::text[]))`,
        [OPEN_REQUEST_STATUSES_EXCLUDED, serviceTypes]
      ),
      // Available staff — global, not tied to a single service-type tab
      db.query(
        `SELECT COUNT(*) AS count FROM staff_profiles
         WHERE current_status = 'AVAILABLE' AND is_active = true`
      ),
      // Revenue this month (joined to bookings for tab filtering)
      db.query(
        `SELECT COALESCE(SUM(t.amount), 0) AS total
         FROM transactions t
         LEFT JOIN bookings b ON b.booking_id = t.booking_id
         WHERE t.category::text = ANY($1::text[])
           AND t.created_at >= $2
           AND ($3::text[] IS NULL OR b.service_type = ANY($3::text[]))`,
        [REVENUE_CATEGORIES, startOfThisMonth, serviceTypes]
      ),
      db.query(
        `SELECT COALESCE(SUM(t.amount), 0) AS total
         FROM transactions t
         LEFT JOIN bookings b ON b.booking_id = t.booking_id
         WHERE t.category::text = ANY($1::text[])
           AND t.created_at >= $2 AND t.created_at < $3
           AND ($4::text[] IS NULL OR b.service_type = ANY($4::text[]))`,
        [REVENUE_CATEGORIES, startOfLastMonth, startOfThisMonth, serviceTypes]
      ),
      // Active bookings per category (always global — this *is* the category list)
      db.query(
        `SELECT service_type, COUNT(*) AS count
         FROM bookings
         WHERE status = ANY($1::text[])
         GROUP BY service_type`,
        [ACTIVE_BOOKING_STATUSES]
      ),
      // Live incoming requests feed
      db.query(
        `SELECT request_id, service_type, status, patient_name, payer_name, created_at
         FROM service_requests
         WHERE ($1::text[] IS NULL OR service_type = ANY($1::text[]))
         ORDER BY created_at DESC
         LIMIT 8`,
        [serviceTypes]
      ),
      db.query(`SELECT COUNT(*) AS count FROM staff_applications WHERE status = 'PENDING'`),
      db.query(`SELECT COUNT(*) AS count FROM staff_advances WHERE status = 'PENDING'`),
      db.query(`SELECT COUNT(*) AS count FROM bookings WHERE status = 'PENDING_TERMINATION'`),
    ]);

    const total_bookings = parseInt(totalBookingsResult.rows[0].count, 10);
    const last_month_bookings = parseInt(lastMonthBookingsResult.rows[0].count, 10);
    const monthly_revenue = parseFloat(revenueResult.rows[0].total);
    const last_month_revenue = parseFloat(lastMonthRevenueResult.rows[0].total);

    // Normalize the known spelling variants of CHILD_CARE back to one canonical key
    // for known categories; anything unrecognized is bucketed under OTHER.
    const categoryCounts = {};
    for (const row of categoryBreakdownResult.rows) {
      const raw = row.service_type;
      const canonical = Object.keys(SERVICE_TYPE_FILTERS).find((key) =>
        SERVICE_TYPE_FILTERS[key].includes(raw)
      ) || 'OTHER';
      categoryCounts[canonical] = (categoryCounts[canonical] || 0) + parseInt(row.count, 10);
    }
    const category_breakdown = Object.keys(CATEGORY_LABELS)
      .map((key) => ({
        key,
        label: CATEGORY_LABELS[key],
        active_count: categoryCounts[key] || 0,
      }))
      .concat(
        categoryCounts.OTHER
          ? [{ key: 'OTHER', label: 'Other', active_count: categoryCounts.OTHER }]
          : []
      );

    const pending_actions = [
      {
        type: 'WORKER_VERIFICATION',
        label: 'Worker Verification',
        count: parseInt(pendingVerificationResult.rows[0].count, 10),
        description: 'new worker application(s) awaiting review.',
        link: '/admin/workers',
      },
      {
        type: 'STAFF_ADVANCE',
        label: 'Staff Advance Requests',
        count: parseInt(pendingAdvancesResult.rows[0].count, 10),
        description: 'salary advance request(s) awaiting approval.',
        link: '/admin/advance-requests',
      },
      {
        type: 'PENDING_TERMINATION',
        label: 'Termination Requests',
        count: parseInt(pendingTerminationsResult.rows[0].count, 10),
        description: 'booking(s) with a pending termination request.',
        link: '/admin/termination-requests',
      },
    ].filter((action) => action.count > 0);

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          total_bookings,
          total_bookings_change: pctChange(total_bookings, last_month_bookings),
          active_requests: parseInt(activeRequestsResult.rows[0].count, 10),
          available_staff: parseInt(availableStaffResult.rows[0].count, 10),
          monthly_revenue,
          monthly_revenue_change: pctChange(monthly_revenue, last_month_revenue),
        },
        category_breakdown,
        recent_requests: recentRequestsResult.rows,
        pending_actions,
      },
    });
  } catch (error) {
    console.error('Error in getDashboardOverview:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching dashboard overview',
    });
  }
};

module.exports = { getDashboardOverview };
