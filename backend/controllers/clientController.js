const crypto = require('crypto');
const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendRegFeeNotice, sendRegFeeInvoice, sendClientWelcomeNew, sendClientInvoice } = require('../utils/metaWhatsapp');
const { sendSms } = require('../utils/sms');
const { generateAndUploadRegFeeInvoice } = require('../utils/regFeeInvoicePdf');
const { creditSalespersonForRegistration } = require('../services/clientSalespersonService');
const { createOverdueInvoice, resolveOverdueInvoices } = require('../services/overdueInvoices');
const html_to_pdf = require('html-pdf-node');
const dailyInvoiceTemplate = require('../templates/dailyInvoiceTemplate');
const { uploadBufferToS3 } = require('../config/s3Config');
const { toE164, isValidPhone } = require('../utils/phone');
const { userHasPermission } = require('../middleware/authMiddleware');

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getClientUserAccount(clientId) {
  const result = await db.query(
    `SELECT cp.client_profile_id, cp.client_code, cp.full_name, cp.updated_at, u.user_id, u.is_active, u.mobile_number, u.email
     FROM client_profiles cp
     JOIN users u ON cp.user_id = u.user_id
     WHERE cp.client_profile_id = $1`,
    [clientId]
  );

  return result.rows[0] || null;
}

async function getClientOverdueBreakdown(clientId) {
  const totalsResult = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_paid,
       COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_invoiced
     FROM transactions
     WHERE client_id = $1`,
    [clientId]
  );

  const totalPaid = parseFloat(totalsResult.rows[0]?.total_paid || 0);
  const totalInvoiced = parseFloat(totalsResult.rows[0]?.total_invoiced || 0);

  const result = await db.query(
    `SELECT
       b.booking_id,
       b.status,
       b.start_date,
       b.created_at,
       b.amount_quotated,
       b.amount_paid as booking_amount_paid,
       q.quote_id,
       q.estimate_number,
       q.total_amount as quote_total_amount,
       p.full_name as patient_name,
       p.age as patient_age,
       COALESCE(ledger.total_paid, 0) as ledger_paid_amount,
       GREATEST(
         COALESCE(q.total_amount, b.amount_quotated, 0) -
         COALESCE(ledger.total_paid, b.amount_paid, 0),
         0
       ) as balance_due,
       CASE
         WHEN b.status = 'OVERDUE' OR GREATEST(
           COALESCE(q.total_amount, b.amount_quotated, 0) -
           COALESCE(ledger.total_paid, b.amount_paid, 0),
           0
         ) > 0 THEN true
         ELSE false
       END as is_overdue
     FROM bookings b
     LEFT JOIN service_requests sr ON b.request_id = sr.request_id
     LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
     LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(amount_received), 0) as total_paid
       FROM booking_payment_tracking bpt
       WHERE bpt.booking_id = b.booking_id
         AND bpt.status = 'VERIFIED'
     ) ledger ON true
     WHERE b.client_id = $1
       AND COALESCE(q.total_amount, b.amount_quotated, 0) > COALESCE(ledger.total_paid, b.amount_paid, 0)
     ORDER BY b.created_at DESC`,
    [clientId]
  );

  const overduePayments = result.rows.map((row) => ({
    ...row,
    invoice_amount: parseFloat(row.quote_total_amount || row.amount_quotated || 0),
    amount_paid: parseFloat(row.ledger_paid_amount || row.booking_amount_paid || 0),
    balance_due: parseFloat(row.balance_due || 0),
    is_fully_paid: parseFloat(row.balance_due || 0) <= 0
  }));

  const totalOverdue = totalPaid - totalInvoiced;
  const overdueCount = overduePayments.filter((payment) => payment.is_overdue).length;

  return {
    overduePayments,
    totalOverdue,
    overdueCount
  };
}

// 0. Get Client Profile by User ID
exports.getClientProfileByUserId = async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await db.query(
      'SELECT cp.*, u.email, u.mobile_number, u.created_at as user_created_at FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id WHERE cp.user_id = $1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "Client profile not found for this user" 
      });
    }

    res.status(200).json({
      message: "Client profile retrieved successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("Error fetching client profile by user ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 0.1. Get Client Profile by Client ID
exports.getClientProfile = async (req, res) => {
  const { client_id } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "Client profile not found" 
      });
    }

    res.status(200).json({
      message: "Client profile retrieved successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("Error fetching client profile by client ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Admin: deactivate a client profile by disabling the linked user account
exports.deactivateClientProfile = async (req, res) => {
  const { client_id } = req.params;

  try {
    const clientAccount = await getClientUserAccount(client_id);

    if (!clientAccount) {
      return res.status(404).json({ message: 'Client profile not found' });
    }

    if (!clientAccount.is_active) {
      return res.status(400).json({ message: 'Client account is already deactivated' });
    }

    await db.query(
      `UPDATE users
       SET is_active = false
       WHERE user_id = $1`,
      [clientAccount.user_id]
    );

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'CLIENT_ACCOUNT_DEACTIVATED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { client_name: clientAccount.full_name },
      });
    } catch (logErr) {
      console.error('Activity log failed (deactivateClientProfile):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Client account deactivated successfully',
      data: {
        client_id: clientAccount.client_profile_id,
        user_id: clientAccount.user_id,
        is_active: false
      }
    });
  } catch (error) {
    console.error('Error deactivating client profile:', error);
    res.status(500).json({ message: 'Error deactivating client profile' });
  }
};

// Admin: reactivate a client profile by enabling the linked user account
exports.reactivateClientProfile = async (req, res) => {
  const { client_id } = req.params;

  try {
    const clientAccount = await getClientUserAccount(client_id);

    if (!clientAccount) {
      return res.status(404).json({ message: 'Client profile not found' });
    }

    if (clientAccount.is_active) {
      return res.status(400).json({ message: 'Client account is already active' });
    }

    await db.query(
      `UPDATE users
       SET is_active = true
       WHERE user_id = $1`,
      [clientAccount.user_id]
    );

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'CLIENT_ACCOUNT_REACTIVATED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { client_name: clientAccount.full_name },
      });
    } catch (logErr) {
      console.error('Activity log failed (reactivateClientProfile):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Client account reactivated successfully',
      data: {
        client_id: clientAccount.client_profile_id,
        user_id: clientAccount.user_id,
        is_active: true
      }
    });
  } catch (error) {
    console.error('Error reactivating client profile:', error);
    res.status(500).json({ message: 'Error reactivating client profile' });
  }
};

// Admin: permanently delete a client profile (and its login account)
exports.deleteClientProfile = async (req, res) => {
  const { client_id } = req.params;

  try {
    const clientAccount = await getClientUserAccount(client_id);

    if (!clientAccount) {
      return res.status(404).json({ message: 'Client profile not found' });
    }

    // client_profiles.user_id has ON DELETE CASCADE, so removing the user
    // row cascades to the client profile as well.
    await db.query('DELETE FROM users WHERE user_id = $1', [clientAccount.user_id]);

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'CLIENT_ACCOUNT_DELETED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { client_name: clientAccount.full_name },
      });
    } catch (logErr) {
      console.error('Activity log failed (deleteClientProfile):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Client profile deleted successfully',
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        message: 'This client has existing bookings, invoices or other records and cannot be deleted. Deactivate the account instead.',
      });
    }
    console.error('Error deleting client profile:', error);
    res.status(500).json({ message: 'Error deleting client profile' });
  }
};

// Admin: consolidated client detail view for the dashboard
exports.getAdminClientDetail = async (req, res) => {
  const { client_id } = req.params;

  try {
    const clientProfileQuery = db.query(
      `SELECT
         cp.*,
         u.email,
         u.mobile_number,
         u.is_active,
         u.created_at as user_created_at,
         u.last_login,
         u.is_email_verified
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.user_id
       WHERE cp.client_profile_id = $1`,
      [client_id]
    );

    const paymentHistoryQuery = db.query(
      `SELECT
         bpt.booking_payment_id as transaction_id,
         bpt.payment_tracking_id,
         bpt.booking_id,
         bpt.quote_id,
         'BOOKING_PAYMENT' as category,
         bpt.amount_received as amount,
         bpt.payment_method,
         bpt.status,
         bpt.notes,
         'CREDIT' as transaction_type,
         bpt.payment_date as created_at,
         bpt.reference_number,
         bpt.slip_url,
         bpt.verified_by,
         bpt.verified_at,
         b.service_type,
         b.start_date,
         'Booking payment' as transaction_description
       FROM booking_payment_tracking bpt
       LEFT JOIN bookings b ON bpt.booking_id = b.booking_id
       WHERE bpt.client_id = $1
       ORDER BY COALESCE(bpt.verified_at, bpt.payment_date) DESC`,
      [client_id]
    );

    const bookingHistoryQuery = db.query(
      `SELECT
         b.booking_id,
         b.request_id,
         b.patient_id,
         b.service_type,
         b.service_model,
         b.service_mode,
         b.status,
         b.preferred_gender,
         b.start_date,
         b.created_at,
         b.assigned_staff_id,
         b.daily_rate,
         b.ot_rate,
         b.amount_quotated,
         b.amount_paid,
         b.scheduled_end_time,
         b.actual_end_time,
         p.full_name as patient_name,
         p.age as patient_age,
         p.relationship_to_client,
         sp.full_name as current_staff_name,
         sp.designation as current_staff_designation,
         q.quote_id,
         q.estimate_number,
         q.total_amount,
         q.daily_rate as quote_daily_rate,
         q.qty_days
       FROM bookings b
       LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
       LEFT JOIN LATERAL (
         SELECT bsa.staff_profile_id
         FROM booking_staff_assignments bsa
         WHERE bsa.booking_id = b.booking_id AND bsa.status = 'ACTIVE'
         ORDER BY bsa.assigned_on DESC
         LIMIT 1
       ) active_bsa ON true
       LEFT JOIN staff_profiles sp ON COALESCE(b.assigned_staff_id, active_bsa.staff_profile_id) = sp.staff_profile_id
       LEFT JOIN service_requests sr ON b.request_id = sr.request_id
       LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
       WHERE b.client_id = $1
       ORDER BY b.created_at DESC`,
      [client_id]
    );

    const quotationHistoryQuery = db.query(
      `SELECT
         q.quote_id,
         q.estimate_number,
         q.request_id,
         q.booking_id,
         q.registration_fee,
         q.daily_rate,
         q.qty_days,
         q.transport_fee,
         q.sub_total,
         q.total_amount,
         q.status,
         q.estimate_date,
         q.created_at,
         sr.payer_name,
         sr.payer_mobile,
         sr.patient_name,
         sr.service_type,
         sr.status as request_status,
         sr.active_quote_id,
         sr.service_request_code,
         b.booking_code,
         pq.quote_id as product_quote_id,
         CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
              THEN cp.company_name ELSE cp.full_name END AS billed_to_name,
         COALESCE((
           SELECT SUM(pt.amount_received)
           FROM payment_tracking pt
           WHERE pt.quote_id = q.quote_id AND pt.status = 'VERIFIED'
         ), 0) AS total_paid
       FROM quotations q
       JOIN service_requests sr ON q.request_id = sr.request_id
       LEFT JOIN bookings b ON q.booking_id = b.booking_id
       LEFT JOIN quotations pq ON pq.linked_quote_id = q.quote_id AND pq.quote_type = 'PRODUCT'
       LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
       WHERE sr.client_id = $1
       ORDER BY q.created_at DESC`,
      [client_id]
    );

    const staffAssignmentsQuery = db.query(
      `SELECT
         bsa.assignment_id,
         bsa.booking_id,
         bsa.staff_profile_id,
         bsa.assigned_on,
         bsa.daily_rate,
         bsa.service_start_date,
         bsa.service_end_date,
         bsa.amount_allocated,
         bsa.status,
         bsa.notes,
         bsa.updated_at,
         sp.full_name as staff_name,
         sp.designation,
         p.full_name as patient_name
       FROM booking_staff_assignments bsa
       JOIN bookings b ON bsa.booking_id = b.booking_id
       JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
       LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
       WHERE b.client_id = $1
       ORDER BY bsa.assigned_on DESC`,
      [client_id]
    );

    const reviewsQuery = db.query(
      `SELECT
         sr.review_id,
         sr.staff_profile_id,
         sr.rating,
         sr.review_text,
         sr.is_visible,
         sr.created_at,
         sp.full_name as staff_name,
         sp.designation
       FROM staff_reviews sr
       LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
       WHERE sr.client_profile_id = $1
       ORDER BY sr.created_at DESC`,
      [client_id]
    );

    const patientsQuery = db.query(
      `SELECT
         patient_id,
         full_name,
         age,
         relationship_to_client,
         medical_condition,
         special_remarks,
         is_registration_fee_paid,
         created_at,
         residential_address,
         emergency_contact_name,
         emergency_contact_number,
         gender
       FROM patient_profiles
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [client_id]
    );

    const statementSummaryQuery = db.query(
      `SELECT
         COUNT(*)::int as transaction_count,
         COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_invoiced,
         COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_paid,
         COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) as balance_due,
         MAX(created_at) as last_transaction_at
       FROM transactions
       WHERE client_id = $1`,
      [client_id]
    );

    const clientPaymentsSummaryQuery = db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM transactions
       WHERE client_id = $1
         AND transaction_type = 'CREDIT'`,
      [client_id]
    );

    const dailyInvoiceSummaryQuery = db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_invoiced
       FROM transactions
       WHERE client_id = $1
         AND transaction_type = 'DEBIT'`,
      [client_id]
    );

    // System-wide overdue-invoices ledger (currently only registration fees) —
    // all_time_invoiced (paid or not, for folding into total_invoiced below) and
    // the currently-outstanding total_overdue/overdue_count. See services/overdueInvoices.js.
    const overdueInvoicesSummaryQuery = db.query(
      `SELECT COALESCE(SUM(amount), 0) as all_time_invoiced,
              COALESCE(SUM(amount) FILTER (WHERE status = 'OVERDUE'), 0) as total_overdue,
              COUNT(*) FILTER (WHERE status = 'OVERDUE')::int as overdue_count
       FROM overdue_invoices
       WHERE client_id = $1`,
      [client_id]
    );

    const [clientProfileResult, paymentHistoryResult, bookingHistoryResult, quotationHistoryResult, staffAssignmentsResult, reviewsResult, patientsResult, statementSummaryResult, clientPaymentsSummaryResult, dailyInvoiceSummaryResult, overdueInvoicesSummaryResult] = await Promise.all([
      clientProfileQuery,
      paymentHistoryQuery,
      bookingHistoryQuery,
      quotationHistoryQuery,
      staffAssignmentsQuery,
      reviewsQuery,
      patientsQuery,
      statementSummaryQuery,
      clientPaymentsSummaryQuery,
      dailyInvoiceSummaryQuery,
      overdueInvoicesSummaryQuery
    ]);

    if (clientProfileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client profile not found' });
    }

    const clientProfile = clientProfileResult.rows[0];
    const payments = paymentHistoryResult.rows;
    const bookings = bookingHistoryResult.rows;
    const quotations = quotationHistoryResult.rows;
    const staffAssignments = staffAssignmentsResult.rows;
    const reviews = reviewsResult.rows;
    const patients = patientsResult.rows;
    const statementSummary = statementSummaryResult.rows[0];
    const clientPaymentsSummary = clientPaymentsSummaryResult.rows[0];
    const dailyInvoiceSummary = dailyInvoiceSummaryResult.rows[0];
    const overdueInvoicesSummary = overdueInvoicesSummaryResult.rows[0];

    const paymentCount = payments.length;
    const totalPaid = payments.reduce((sum, payment) => {
      return payment.transaction_type === 'CREDIT'
        ? sum + parseFloat(payment.amount || 0)
        : sum;
    }, 0);

    const totalInvoiced = payments.reduce((sum, payment) => {
      return payment.transaction_type === 'DEBIT'
        ? sum + parseFloat(payment.amount || 0)
        : sum;
    }, 0);

    const activeBookings = bookings.filter((booking) => booking.status === 'ACTIVE');
    const pendingBookings = bookings.filter((booking) => booking.status === 'PENDING');
    const completedBookings = bookings.filter((booking) => booking.status === 'COMPLETED');

    const reviewSummary = reviews.reduce((summary, review) => {
      summary.total_reviews += 1;
      summary.total_rating += Number(review.rating || 0);
      if (review.rating) {
        summary.rating_distribution[review.rating] = (summary.rating_distribution[review.rating] || 0) + 1;
      }
      return summary;
    }, {
      total_reviews: 0,
      total_rating: 0,
      rating_distribution: {}
    });

    reviewSummary.average_rating = reviewSummary.total_reviews > 0
      ? Number((reviewSummary.total_rating / reviewSummary.total_reviews).toFixed(2))
      : 0;

    const activeStaffAssignments = staffAssignments.filter((assignment) => assignment.status === 'ACTIVE');
    const recentStaffAssignments = staffAssignments.slice(0, 5);

    const { overduePayments, totalOverdue, overdueCount } = await getClientOverdueBreakdown(client_id);

    const bookingLookup = new Map(bookings.map((booking) => [booking.booking_id, booking]));
    const transactionRows = [];

    bookings.forEach((booking) => {
      const bookingBaseDate = booking.start_date || booking.created_at;
      transactionRows.push({
        row_type: 'INVOICE',
        booking_id: booking.booking_id,
        booking_sort_date: bookingBaseDate,
        transaction_date: booking.created_at,
        transaction_label: 'Daily invoicing',
        transaction_category: 'SERVICE_INVOICE',
        amount_invoiced: parseFloat(booking.amount_quotated || booking.quote_total || 0),
        amount_paid: 0,
        balance_due: Math.max(parseFloat(booking.amount_quotated || booking.quote_total || 0) - parseFloat(booking.amount_paid || 0), 0),
        payment_method: null,
        status: booking.status,
        service_type: booking.service_type,
        service_model: booking.service_model,
        patient_name: booking.patient_name,
        staff_name: booking.current_staff_name,
        staff_designation: booking.current_staff_designation,
        reference_number: booking.quote_id || booking.estimate_number || null,
        notes: booking.status ? `Invoice raised for booking ${booking.booking_id}` : 'Daily invoicing',
      });
    });

    payments.forEach((payment) => {
      const booking = bookingLookup.get(payment.booking_id) || null;
      transactionRows.push({
        row_type: 'PAYMENT',
        booking_id: payment.booking_id || booking?.booking_id || null,
        booking_sort_date: booking?.start_date || booking?.created_at || payment.created_at,
        transaction_date: payment.created_at,
        transaction_label: payment.transaction_description || 'Client payment',
        transaction_category: payment.category || 'CLIENT_PAYMENT',
        amount_invoiced: 0,
        amount_paid: parseFloat(payment.amount || 0),
        balance_due: booking ? Math.max(parseFloat(booking.amount_quotated || booking.quote_total || 0) - parseFloat(booking.amount_paid || 0), 0) : 0,
        payment_method: payment.payment_method,
        status: payment.status,
        service_type: booking?.service_type || payment.service_type || null,
        service_model: booking?.service_model || null,
        patient_name: booking?.patient_name || null,
        staff_name: booking?.current_staff_name || null,
        staff_designation: booking?.current_staff_designation || null,
        reference_number: payment.reference_number || payment.quote_id || null,
        notes: payment.notes || null,
      });
    });

    transactionRows.sort((a, b) => {
      const aDate = new Date(a.booking_sort_date || a.transaction_date || 0).getTime();
      const bDate = new Date(b.booking_sort_date || b.transaction_date || 0).getTime();
      if (bDate !== aDate) return bDate - aDate;
      return new Date(b.transaction_date || 0).getTime() - new Date(a.transaction_date || 0).getTime();
    });


    // "Total Invoiced" should reflect everything ever invoiced to this client, not
    // just daily-attendance debits — fold in the overdue-invoices ledger's all-time
    // total (registration fees for now) so it goes up the moment one is sent,
    // whether or not it's ever paid.
    const combinedTotalInvoiced = parseFloat(dailyInvoiceSummary?.total_invoiced || 0) + parseFloat(overdueInvoicesSummary?.all_time_invoiced || 0);
    const combinedTotalPaid = parseFloat(clientPaymentsSummary?.total_paid || 0);
    const combinedBalanceDue = Math.max(combinedTotalInvoiced - combinedTotalPaid, 0);

    res.status(200).json({
      status: 'success',
      data: {
        client_profile: clientProfile,
        payment_summary: {
          payment_count: paymentCount,
          total_paid: combinedTotalPaid,
          total_invoiced: combinedTotalInvoiced,
          balance_due: combinedBalanceDue,
          last_transaction_at: statementSummary?.last_transaction_at || null
        },
        booking_summary: {
          total_bookings: bookings.length,
          active_bookings: activeBookings.length,
          pending_bookings: pendingBookings.length,
          completed_bookings: completedBookings.length
        },
        quotation_summary: {
          total_quotes: quotations.length,
          active_quote_id: quotations.find((quotation) => quotation.quote_id === quotation.active_quote_id)?.quote_id || null,
          latest_quote: quotations[0] || null
        },
        staff_summary: {
          active_assignment_count: activeStaffAssignments.length,
          recent_assignments: recentStaffAssignments,
          current_staff: bookings
            .filter((booking) => booking.assigned_staff_id)
            .slice(0, 10)
            .map((booking) => ({
              booking_id: booking.booking_id,
              staff_profile_id: booking.assigned_staff_id,
              staff_name: booking.current_staff_name,
              staff_designation: booking.current_staff_designation,
              booking_status: booking.status
            }))
        },
        review_summary: reviewSummary,
        patient_summary: {
          total_patients: patients.length,
          data: patients
        },
        statement_summary: {
          transaction_count: parseInt(statementSummary?.transaction_count || 0, 10),
          total_invoiced: combinedTotalInvoiced,
          total_paid: combinedTotalPaid,
          balance_due: combinedBalanceDue,
          last_transaction_at: statementSummary?.last_transaction_at || null
        },
        overdue_summary: {
          total_overdue_amount: parseFloat((clientPaymentsSummary?.total_paid || 0) - (dailyInvoiceSummary?.total_invoiced || 0)),
          overdue_payments_count: overdueCount || 0,
          total_outstanding_invoices: overduePayments.length
        },
        overdue_invoices_summary: {
          total_overdue_amount: parseFloat(overdueInvoicesSummary?.total_overdue || 0),
          overdue_invoice_count: overdueInvoicesSummary?.overdue_count || 0
        },
        recent_activity: {
          bookings: bookings.slice(0, 5),
          quotations: quotations.slice(0, 5),
          payments: payments.slice(0, 5),
          transactions: transactionRows.slice(0, 20),
          staff_assignments: staffAssignments.slice(0, 5),
          reviews: reviews.slice(0, 5)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin client detail:', error);
    res.status(500).json({ message: 'Error fetching admin client detail' });
  }
};

// 1. Update Client Profile
exports.updateMe = async (req, res) => {
  const { full_name, latitude, longitude, gender, honorific, company_name } = req.body;
  const userId = req.user.user_id;

  try {
    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(full_name);
      paramIndex++;
    }

    if (gender !== undefined) {
      updates.push(`gender = $${paramIndex}::gender_enum`);
      values.push(gender);
      paramIndex++;
    }

    if (honorific !== undefined) {
      updates.push(`honorific = $${paramIndex}`);
      values.push(honorific || null);
      paramIndex++;
    }

    if (company_name !== undefined) {
      updates.push(`company_name = $${paramIndex}`);
      values.push(company_name || null);
      paramIndex++;
    }

    if (latitude !== undefined && longitude !== undefined) {
      updates.push(`gps_coordinates = point($${paramIndex}, $${paramIndex + 1})`);
      values.push(latitude, longitude);
      paramIndex += 2;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    const query = `
      UPDATE client_profiles 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING *;
    `;

    values.push(userId);
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Client profile not found." });
    }

    res.status(200).json({
      status: 'success',
      message: "Profile updated successfully",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating profile" });
  }
};

// Admin: update company name (and optionally honorific) for a client
exports.updateClientCompanyName = async (req, res) => {
  const { client_id } = req.params;
  const { company_name, honorific, display_name_source } = req.body;
  // Display name can only be the company when a company name is actually on file.
  const resolvedDisplayNameSource = company_name && display_name_source === 'COMPANY_NAME'
    ? 'COMPANY_NAME'
    : 'FULL_NAME';
  try {
    const result = await db.query(
      `UPDATE client_profiles
       SET company_name = $1, honorific = $2, display_name_source = $3, updated_at = NOW()
       WHERE client_profile_id = $4
       RETURNING client_profile_id, full_name, company_name, honorific, display_name_source`,
      [company_name || null, honorific || null, resolvedDisplayNameSource, client_id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Client not found.' });

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'CLIENT_BILLING_UPDATED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: {
          company_name: result.rows[0].company_name,
          honorific: result.rows[0].honorific,
          display_name_source: result.rows[0].display_name_source,
        },
      });
    } catch (logErr) {
      console.error('Activity log failed (client billing update):', logErr.message);
    }

    return res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('updateClientCompanyName error:', err);
    return res.status(500).json({ message: 'Failed to update billing details.' });
  }
};

// Admin: update a client's core profile details (name, phone, email, address, gender).
// Unlike updateClientCompanyName (billing-only), this writes across both
// client_profiles (full_name, primary_address, gender) and users (mobile_number, email).
exports.updateClientProfile = async (req, res) => {
  const { client_id } = req.params;
  const { full_name, email, primary_address, gender } = req.body;

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ message: 'Full name is required.' });
  }
  if (!isValidPhone(req.body.mobile_number)) {
    return res.status(400).json({ message: 'A valid mobile number is required.' });
  }
  const mobile_number = toE164(req.body.mobile_number);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  const rawSecondaryPhones = Array.isArray(req.body.secondary_phone_numbers) ? req.body.secondary_phone_numbers : [];
  const secondaryPhones = [];
  for (const raw of rawSecondaryPhones) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    if (!isValidPhone(trimmed)) {
      return res.status(400).json({ message: 'One of the secondary phone numbers is invalid.' });
    }
    secondaryPhones.push(toE164(trimmed));
  }

  const dbClient = await db.pool.connect();
  try {
    await dbClient.query('BEGIN');

    const clientRes = await dbClient.query(
      `SELECT user_id FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`,
      [client_id]
    );
    if (clientRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client not found.' });
    }
    const { user_id } = clientRes.rows[0];

    await dbClient.query(
      `UPDATE client_profiles
       SET full_name = $1, primary_address = $2, gender = $3::gender_enum, updated_at = NOW(),
           secondary_phone_numbers = $5,
           onboarding_status = CASE
               WHEN onboarding_status = 'CONTACT_PENDING' THEN 'ACTIVE'
               WHEN onboarding_status = 'PENDING_MIGRATION' AND $2 IS NOT NULL AND $3 IS NOT NULL THEN 'ACTIVE'
               ELSE onboarding_status
           END
       WHERE client_profile_id = $4`,
      [full_name.trim(), primary_address?.trim() || null, gender || null, client_id, secondaryPhones]
    );

    await dbClient.query(
      `UPDATE users SET mobile_number = $1, email = $2 WHERE user_id = $3`,
      [mobile_number, email?.trim() || null, user_id]
    );

    const updated = await dbClient.query(
      `SELECT cp.*, u.email, u.mobile_number
       FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id
       WHERE cp.client_profile_id = $1`,
      [client_id]
    );

    await dbClient.query('COMMIT');

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'CLIENT_PROFILE_UPDATED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { full_name: full_name.trim(), mobile_number, email: email?.trim() || null },
      });
    } catch (logErr) {
      console.error('Activity log failed (client profile update):', logErr.message);
    }

    return res.status(200).json({ status: 'success', data: updated.rows[0] });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'That mobile number or email is already in use by another account.' });
    }
    console.error('updateClientProfile error:', err);
    return res.status(500).json({ message: 'Failed to update client details.' });
  } finally {
    dbClient.release();
  }
};

// 2. Delete Account (Hard Delete)
exports.deleteMe = async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Because we set ON DELETE CASCADE in our schema, 
    // deleting the user will automatically remove their client_profile and staff_profile.
    await db.query('DELETE FROM users WHERE user_id = $1', [userId]);

    res.status(204).json({
      status: 'success',
      data: null,
      message: "Account deleted successfully."
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting account" });
  }
};

// 3. Retrieve active bookings for a specific client. Client ID can be supplied
// as a URL parameter or derived from the authenticated user.
exports.getActiveBookingByClientID = async (req, res) => {
  try {
    let clientId = req.params.client_id;

    if (!clientId) {
      // derive from logged-in user
      const userId = req.user.user_id;
      const clientRes = await db.query(
        'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
        [userId]
      );
      if (clientRes.rows.length === 0) {
        return res.status(404).json({ message: 'Client profile not found' });
      }
      clientId = clientRes.rows[0].client_profile_id;
    }

    const bookingsRes = await db.query(
      'SELECT * FROM bookings WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC',
      [clientId, 'ACTIVE']
    );

    res.status(200).json({
      status: 'success',
      results: bookingsRes.rows.length,
      data: bookingsRes.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching bookings for client' });
  }
};

exports.getAllBookingsForClient = async (req, res) => {
  try {
    let clientId = req.params.client_id;

    if (!clientId) {
      // derive from logged-in user
      const userId = req.user.user_id;
      const clientRes = await db.query(
        'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
        [userId]
      );
      if (clientRes.rows.length === 0) {
        return res.status(404).json({ message: 'Client profile not found' });
      }
      clientId = clientRes.rows[0].client_profile_id;
    }

    const bookingsRes = await db.query(
      'SELECT * FROM bookings WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );

    res.status(200).json({
      status: 'success',
      results: bookingsRes.rows.length,
      data: bookingsRes.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching active bookings for client' });
  }
};

  // Admin: richer booking history for client (left joins, previous assignments, payments, quote)
  exports.getAdminClientBookings = async (req, res) => {
    const { client_id } = req.params;

    try {
      const bookingsRes = await db.query(
        `SELECT
           b.booking_id,
           b.request_id,
           b.patient_id,
           b.service_type,
           b.service_model,
           b.service_mode,
           b.status,
           b.preferred_gender,
           b.start_date,
           b.created_at,
           b.assigned_staff_id,
           sp.full_name as current_staff_name,
           sp.designation as current_staff_designation,
           q.quote_id,
           q.estimate_number,
           q.total_amount as quote_total,
           COALESCE(tx.total_invoiced, 0) as total_invoiced,
           COALESCE(tx.total_paid, 0) as total_paid,
           COALESCE(tx.total_invoiced, 0) - COALESCE(tx.total_paid, 0) as balance_due,
           pa.previous_assignments
         FROM bookings b
         LEFT JOIN staff_profiles sp ON b.assigned_staff_id = sp.staff_profile_id
         LEFT JOIN service_requests sr ON b.request_id = sr.request_id
         LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
         LEFT JOIN LATERAL (
           SELECT json_agg(json_build_object(
             'assignment_id', bsa.assignment_id,
             'staff_profile_id', bsa.staff_profile_id,
             'staff_name', sp2.full_name,
             'assigned_on', bsa.assigned_on,
             'service_start_date', bsa.service_start_date,
             'service_end_date', bsa.service_end_date,
             'status', bsa.status,
             'amount_allocated', bsa.amount_allocated
           ) ORDER BY bsa.assigned_on DESC) as previous_assignments
           FROM booking_staff_assignments bsa
           LEFT JOIN staff_profiles sp2 ON bsa.staff_profile_id = sp2.staff_profile_id
           WHERE bsa.booking_id = b.booking_id
         ) pa ON true
         LEFT JOIN LATERAL (
           SELECT
             SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END) as total_invoiced,
             SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END) as total_paid
           FROM transactions t
           WHERE t.booking_id = b.booking_id
         ) tx ON true
         WHERE b.client_id = $1
         ORDER BY b.created_at DESC`,
        [client_id]
      );

      res.status(200).json({
        status: 'success',
        results: bookingsRes.rows.length,
        data: bookingsRes.rows
      });
    } catch (error) {
      console.error('Error fetching admin bookings for client:', error);
      res.status(500).json({ message: 'Error fetching admin bookings for client' });
    }
  };

exports.getAdminClientBookingsPaginated = async (req, res) => {
  const { client_id } = req.params;
  const page_size = Math.min(parseInt(req.query.page_size) || 5, 20);
  const active_page = Math.max(1, parseInt(req.query.active_page) || 1);
  const recent_page = Math.max(1, parseInt(req.query.recent_page) || 1);

  try {
    const result = await db.query(
      `SELECT
         b.booking_id,
         b.request_id,
         b.patient_id,
         b.service_type,
         b.service_model,
         b.service_mode,
         b.status,
         b.preferred_gender,
         b.start_date,
         b.created_at,
         b.assigned_staff_id,
         b.amount_quotated,
         b.amount_paid,
         b.scheduled_end_time,
         b.actual_end_time,
         p.full_name as patient_name,
         sp.full_name as current_staff_name,
         sp.designation as current_staff_designation,
         q.quote_id,
         q.estimate_number,
         q.total_amount,
         q.daily_rate,
         q.qty_days,
         COALESCE(tx.total_invoiced, 0) as total_invoiced,
         COALESCE(tx.total_paid, 0) as total_paid,
         EXISTS(SELECT 1 FROM staff_reviews sr WHERE sr.booking_id = b.booking_id) AS is_reviewed
       FROM bookings b
       LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
       LEFT JOIN LATERAL (
         SELECT bsa.staff_profile_id
         FROM booking_staff_assignments bsa
         WHERE bsa.booking_id = b.booking_id AND bsa.status = 'ACTIVE'
         ORDER BY bsa.assigned_on DESC
         LIMIT 1
       ) active_bsa ON true
       LEFT JOIN staff_profiles sp ON COALESCE(b.assigned_staff_id, active_bsa.staff_profile_id) = sp.staff_profile_id
       LEFT JOIN service_requests sr ON b.request_id = sr.request_id
       LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
       LEFT JOIN LATERAL (
         SELECT
           SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END) as total_invoiced,
           SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END) as total_paid
         FROM transactions t
         WHERE t.booking_id = b.booking_id
       ) tx ON true
       WHERE b.client_id = $1
       ORDER BY b.created_at DESC`,
      [client_id]
    );

    const search = (req.query.search || '').trim().toLowerCase();
    const all = result.rows.filter((b) => {
      if (!search) return true;
      return (
        String(b.booking_id || '').toLowerCase().includes(search) ||
        (b.service_type || '').toLowerCase().includes(search) ||
        (b.patient_name || '').toLowerCase().includes(search) ||
        (b.current_staff_name || '').toLowerCase().includes(search) ||
        (b.status || '').toLowerCase().includes(search)
      );
    });
    const active = all.filter((b) => b.status === 'ACTIVE');
    const recent = all.filter((b) => b.status !== 'ACTIVE');

    const paginate = (arr, page) => {
      const total = arr.length;
      const total_pages = Math.max(1, Math.ceil(total / page_size));
      const safe_page = Math.min(page, total_pages);
      const start = (safe_page - 1) * page_size;
      return { data: arr.slice(start, start + page_size), total, page: safe_page, page_size, total_pages };
    };

    res.status(200).json({
      status: 'success',
      active_bookings: paginate(active, active_page),
      recent_bookings: paginate(recent, recent_page),
    });
  } catch (error) {
    console.error('Error fetching paginated client bookings:', error);
    res.status(500).json({ message: 'Error fetching paginated client bookings' });
  }
};

// 4.5. Get all client service requests, quotes, and payments in chronological order
exports.getClientServiceHistory = async (req, res) => {
  const { client_id } = req.params;

  try {
    // Get all service requests for this client
    const serviceRequestsResult = await db.query(`
      SELECT
        sr.*,
        u.mobile_number as client_mobile
      FROM service_requests sr
      LEFT JOIN users u ON sr.payer_mobile = u.mobile_number
      WHERE sr.client_id = $1
      ORDER BY sr.created_at DESC
    `, [client_id]);

    // Get all quotes for this client
    const quotesResult = await db.query(`
      SELECT 
        q.*,
        sr.payer_name,
        sr.payer_mobile,
        sr.patient_name,
        sr.service_type,
        sr.status as request_status
      FROM quotations q
      JOIN service_requests sr ON q.request_id = sr.request_id
      WHERE sr.client_id = $1
      ORDER BY q.created_at DESC
    `, [client_id]);

    // Get all payment slips for this client
    const paymentSlipsResult = await db.query(`
      SELECT 
        ps.*,
        q.estimate_number,
        q.total_amount,
        sr.payer_name,
        sr.payer_mobile
      FROM payment_slips ps
      JOIN quotations q ON ps.quote_id = q.quote_id
      JOIN service_requests sr ON q.request_id = sr.request_id
      WHERE sr.client_id = $1
      ORDER BY ps.created_at DESC
    `, [client_id]);

    // Combine all data into a single timeline
    const timeline = [];

    // Add service requests
    serviceRequestsResult.rows.forEach(request => {
      timeline.push({
        ...request,
        type: 'service_request',
        date: request.created_at,
        sortKey: request.created_at
      });
    });

    // Add quotes
    quotesResult.rows.forEach(quote => {
      timeline.push({
        ...quote,
        type: 'quote',
        date: quote.created_at,
        sortKey: quote.created_at
      });
    });

    // Add payment slips
    paymentSlipsResult.rows.forEach(payment => {
      timeline.push({
        ...payment,
        type: 'payment',
        date: payment.created_at,
        sortKey: payment.created_at
      });
    });

    // Sort all items by date (newest first)
    timeline.sort((a, b) => new Date(b.sortKey) - new Date(a.sortKey));

    res.status(200).json({
      status: 'success',
      results: timeline.length,
      data: timeline
    });

  } catch (error) {
    console.error('Error fetching client service history:', error);
    res.status(500).json({ 
      message: 'Failed to fetch service history' 
    });
  }
};

// Admin proxy-create client (bypasses OTP)
exports.proxyCreateClient = async (req, res) => {
  const { full_name, email, gender, primary_address, client_type, honorific, company_name, display_name_source } = req.body;
  const resolvedClientType = client_type || 'INDIVIDUAL';
  const isCorporateProxy = resolvedClientType === 'CORPORATE_PROXY';

  const rawMobile = String(req.body.mobile_number || '').trim();

  const rawSecondaryPhones = Array.isArray(req.body.secondary_phone_numbers) ? req.body.secondary_phone_numbers : [];
  const secondaryPhones = [];
  for (const raw of rawSecondaryPhones) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    if (!isValidPhone(trimmed)) {
      return res.status(400).json({ message: 'One of the secondary phone numbers is invalid.' });
    }
    secondaryPhones.push(toE164(trimmed));
  }
  // A corporate client's contact person may not be known yet — company_name
  // anchors the record instead. If any contact-person field is being entered,
  // still require gender alongside it for data consistency.
  const contactProvided = !!(full_name && full_name.trim()) || !!rawMobile;

  if (isCorporateProxy) {
    if (!company_name || !company_name.trim()) {
      return res.status(400).json({ message: 'company_name is required for corporate clients.' });
    }
    if (contactProvided && !gender) {
      return res.status(400).json({ message: 'gender is required when a contact person is provided.' });
    }
  } else if (!full_name || !rawMobile || !gender) {
    return res.status(400).json({ message: 'full_name, mobile_number, and gender are required.' });
  }

  if (rawMobile && !isValidPhone(rawMobile)) {
    return res.status(400).json({ message: 'A valid mobile number is required.' });
  }
  const mobile_number = rawMobile ? toE164(rawMobile) : null;

  // full_name stays NOT NULL in the DB — default it to company_name when the
  // contact person's name isn't known yet, so every existing consumer that
  // assumes a non-empty full_name (display, invoices, search) keeps working.
  const resolvedFullName = (full_name && full_name.trim()) || (isCorporateProxy ? company_name.trim() : null);

  const onboardingStatus = (isCorporateProxy && !mobile_number) ? 'CONTACT_PENDING' : 'ACTIVE';

  const resolvedDisplayNameSource =
    client_type === 'CORPORATE_PROXY' && company_name && display_name_source === 'COMPANY_NAME'
      ? 'COMPANY_NAME'
      : 'FULL_NAME';

  const bcrypt = require('bcryptjs');
  const dbClient = await db.pool.connect();
  try {
    const existing = await dbClient.query(
      'SELECT user_id FROM users WHERE ($1::varchar IS NOT NULL AND email = $1) OR ($2::varchar IS NOT NULL AND mobile_number = $2)',
      [email || null, mobile_number]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'A user with this email or mobile number already exists.' });
    }

    // 8 lowercase alphanumeric chars — the login endpoint recognises this shape as a
    // temporary password and forces a password change on first login (see authController).
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await dbClient.query('BEGIN');

    const userRes = await dbClient.query(
      `INSERT INTO users (mobile_number, password_hash, email, is_email_verified)
       VALUES ($1, $2, $3, $4) RETURNING user_id`,
      [mobile_number, hashedPassword, email || null, !!email]
    );
    const userId = userRes.rows[0].user_id;

    const profileRes = await dbClient.query(
      `INSERT INTO client_profiles (user_id, full_name, client_type, gender, primary_address, company_name, honorific, display_name_source, onboarding_status, secondary_phone_numbers)
       VALUES ($1, $2, $3, $4::gender_enum, $5, $6, $7, $8, $9, $10) RETURNING client_profile_id`,
      [
        userId, resolvedFullName, resolvedClientType,
        gender ? gender.toUpperCase() : null, primary_address || null,
        company_name || null, honorific || null, resolvedDisplayNameSource, onboardingStatus,
        secondaryPhones,
      ]
    );
    const clientProfileId = profileRes.rows[0].client_profile_id;

    await dbClient.query('COMMIT');

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'CLIENT_PROFILE_CREATED',
        entityType: 'CLIENT',
        entityId: String(clientProfileId),
        details: {
          full_name: resolvedFullName,
          client_type: resolvedClientType,
          company_name: company_name || null,
          display_name_source: resolvedDisplayNameSource,
        },
      });
    } catch (logErr) {
      console.error('Activity log failed (proxy create client):', logErr.message);
    }

    // Onboard the new client exactly like a brand-new user from a staff application
    // approval / booking conversion: login credentials (mobile + temp password) go via
    // SMS, and a welcome message goes via WhatsApp. WhatsApp policy disallows sending
    // the password in the template, so the WhatsApp message just welcomes them and
    // tells them to expect the SMS. Skipped entirely when no mobile number is on file
    // yet (a corporate client whose contact person isn't known) — there's nowhere to
    // send it until an admin fills one in via Edit Profile.
    if (mobile_number) {
      const welcomeSms = `Welcome to VCare Nursing, ${resolvedFullName}! An account has been created for you. Log in at https://vcarenursing.com/login\n\nUsername (mobile): ${mobile_number}\nTemporary password: ${tempPassword}\n\nYou'll be asked to set your own password on first login. - VCare Nursing`;

      Promise.allSettled([
        sendSms(mobile_number, welcomeSms),
        sendClientWelcomeNew(mobile_number, resolvedFullName),
      ]).then(([smsResult, waResult]) => {
        if (smsResult.status === 'rejected') console.error('Client welcome SMS failed:', smsResult.reason?.message);
        if (waResult.status === 'rejected') console.error('Client welcome WhatsApp failed:', waResult.reason?.message);
      });
    }

    res.status(201).json({
      status: 'success',
      message: mobile_number
        ? 'Client profile created. Login credentials sent via SMS and a welcome message via WhatsApp.'
        : 'Company client profile created. No mobile number on file yet — the client cannot log in until an admin adds contact details via Edit Profile.',
      data: { userId, clientProfileId, tempPassword: mobile_number ? tempPassword : undefined },
    });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('proxyCreateClient error:', error);
    res.status(500).json({ message: 'Failed to create client profile.' });
  } finally {
    dbClient.release();
  }
};

// 5. Get all clients (paginated — see getAllStaff in staffController.js for the same pattern)
exports.getAllClients = async (req, res) => {
  try {
    const salespersonId = req.user?.salesperson_id;
    const {
      page = 1,
      limit = 50,
      search = '',
      status = '',
      pending_migration = '',
      contact_pending = '',
    } = req.query;

    const scopeClause = salespersonId
      ? 'cp.client_profile_id IN (SELECT client_id FROM client_salesperson_assignments WHERE salesperson_id = $1)'
      : null;
    const scopeParams = salespersonId ? [salespersonId] : [];

    // Tab/badge counts always reflect the full (sales-scoped) dataset, independent of the
    // current search/status/toggle filters — matches the previous client-side behavior.
    const countsRes = await db.query(
      `SELECT
         COUNT(*) AS all_count,
         COUNT(*) FILTER (WHERE COALESCE(cp.reg_fee_status, 'PENDING') = 'PENDING') AS pending_count,
         COUNT(*) FILTER (WHERE COALESCE(cp.reg_fee_status, 'PENDING') = 'INVOICED') AS invoiced_count,
         COUNT(*) FILTER (WHERE COALESCE(cp.reg_fee_status, 'PENDING') = 'RECEIPT_UPLOADED') AS receipt_uploaded_count,
         COUNT(*) FILTER (WHERE COALESCE(cp.reg_fee_status, 'PENDING') = 'PAID') AS paid_count,
         COUNT(*) FILTER (WHERE COALESCE(cp.reg_fee_status, 'PENDING') = 'WAIVED') AS waived_count,
         COUNT(*) FILTER (WHERE COALESCE(cp.reg_fee_status, 'PENDING') = 'EXPIRED') AS expired_count,
         COUNT(*) FILTER (WHERE cp.onboarding_status = 'PENDING_MIGRATION') AS pending_migration_count,
         COUNT(*) FILTER (WHERE cp.onboarding_status = 'CONTACT_PENDING') AS contact_pending_count
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.user_id
       ${scopeClause ? `WHERE ${scopeClause}` : ''}`,
      scopeParams
    );

    const filters = scopeClause ? [scopeClause] : [];
    const params = [...scopeParams];

    if (status) {
      params.push(status);
      filters.push(`COALESCE(cp.reg_fee_status, 'PENDING') = $${params.length}`);
    }
    if (pending_migration === 'true') filters.push(`cp.onboarding_status = 'PENDING_MIGRATION'`);
    if (contact_pending === 'true') filters.push(`cp.onboarding_status = 'CONTACT_PENDING'`);
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      // Matches on full_name alone (honorific stored separately) as well as
      // "<honorific> <full_name>" so a search typed with or without the
      // honorific (e.g. "Mrs. Premila Paulraj" or "Premila Paulraj") both hit.
      const conditions = [
        `cp.full_name ILIKE $${idx}`,
        `(COALESCE(cp.honorific, '') || ' ' || cp.full_name) ILIKE $${idx}`,
        `u.email ILIKE $${idx}`,
        `u.mobile_number ILIKE $${idx}`,
        `cp.client_code ILIKE $${idx}`,
        `cp.primary_address ILIKE $${idx}`,
      ];

      // Numbers are stored in E.164 (+94XXXXXXXXX). Also match the local
      // trunk-prefix format (0XXXXXXXXX) by stripping the leading zero, so
      // "+94777745180", "0777745180", and "777745180" all find the same
      // record — the last two are already substrings of the E.164 form.
      const digitsOnly = search.replace(/\D/g, '');
      const withoutLeadingZero = digitsOnly.replace(/^0+/, '');
      if (withoutLeadingZero.length >= 4 && withoutLeadingZero !== digitsOnly) {
        params.push(`%${withoutLeadingZero}%`);
        conditions.push(`u.mobile_number ILIKE $${params.length}`);
      }

      filters.push(`(${conditions.join(' OR ')})`);
    }

    const whereSQL = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalRes = await db.query(
      `SELECT COUNT(*) AS total_count FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id ${whereSQL}`,
      params
    );
    const totalCount = parseInt(totalRes.rows[0].total_count, 10);
    const perPage = parseInt(limit, 10) || 50;
    const currentPage = parseInt(page, 10) || 1;
    const offset = (currentPage - 1) * perPage;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    const dataParams = [...params, perPage, offset];
    const dataRes = await db.query(
      `SELECT cp.*, u.email, u.mobile_number, u.created_at as user_created_at
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.user_id
       ${whereSQL}
       ORDER BY cp.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    const c = countsRes.rows[0];
    res.status(200).json({
      status: 'success',
      data: dataRes.rows,
      pagination: {
        current_page: currentPage,
        total_pages: totalPages,
        total_count: totalCount,
        per_page: perPage,
        has_next: currentPage < totalPages,
        has_prev: currentPage > 1,
      },
      counts: {
        All: parseInt(c.all_count, 10),
        Pending: parseInt(c.pending_count, 10),
        Invoiced: parseInt(c.invoiced_count, 10),
        'Receipt Submitted': parseInt(c.receipt_uploaded_count, 10),
        Paid: parseInt(c.paid_count, 10),
        Waived: parseInt(c.waived_count, 10),
        Expired: parseInt(c.expired_count, 10),
        pending_migration: parseInt(c.pending_migration_count, 10),
        contact_pending: parseInt(c.contact_pending_count, 10),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching clients' });
  }
};

// 7. Get Client Payment History
exports.getClientPaymentHistory = async (req, res) => {
  const { client_id } = req.params;
  const { 
    category, 
    payment_method, 
    status, 
    from_date, 
    to_date, 
    page = 1, 
    limit = 20 
  } = req.query;

  try {
    // Convert pagination params
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE conditions
    const conditions = ['t.client_id = $1'];
    const params = [client_id];
    let paramIndex = 2;

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

    const whereClause = conditions.join(' AND ');

    // Main query with booking details
    const query = `
      SELECT 
        t.transaction_id,
        t.category,
        t.amount,
        t.payment_method,
        t.status,
        t.notes,
        t.created_at,
        t.transaction_type,
        b.service_type,
        b.start_date,
        b.daily_rate,
        CASE 
          WHEN t.transaction_type = 'DEBIT' THEN 'Invoice'
          WHEN t.transaction_type = 'CREDIT' THEN 'Payment'
          ELSE 'Other'
        END as transaction_description
      FROM transactions t
      LEFT JOIN bookings b ON t.booking_id = b.booking_id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM transactions t
      WHERE ${whereClause}
    `;

    // Add pagination params
    params.push(limitNum, offset);

    // Execute queries
    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2))
    ]);

    const total_count = parseInt(countResult.rows[0].total_count);

    // Calculate summary statistics
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) as balance_due
      FROM transactions
      WHERE client_id = $1
    `;

    const summaryResult = await db.query(summaryQuery, [client_id]);

    res.status(200).json({
      status: 'success',
      pagination: {
        total_count,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total_count / limitNum)
      },
      summary: {
        total_invoiced: parseFloat(summaryResult.rows[0].total_invoiced),
        total_paid: parseFloat(summaryResult.rows[0].total_paid),
        balance_due: parseFloat(summaryResult.rows[0].balance_due)
      },
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching client payment history:', error);
    res.status(500).json({ message: 'Internal server error while fetching payment history' });
  }
};

// 8. Get Client Wallet Balance
exports.getClientWalletBalance = async (req, res) => {
  const { client_id } = req.params;

  try {
    const result = await db.query(
      'SELECT wallet_balance FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        wallet_balance: parseFloat(result.rows[0].wallet_balance),
        client_id
      }
    });

  } catch (error) {
    console.error('Error fetching client wallet balance:', error);
    res.status(500).json({ message: 'Internal server error while fetching wallet balance' });
  }
};

// 9. Get Client Overdue Payments
exports.getOverduePayments = async (req, res) => {
  const { client_id } = req.params;

  try {
    const { overduePayments, totalOverdue, overdueCount } = await getClientOverdueBreakdown(client_id);

    res.status(200).json({
      status: 'success',
      summary: {
        total_overdue_amount: totalOverdue,
        overdue_payments_count: overdueCount,
        total_outstanding_invoices: overduePayments.length
      },
      data: overduePayments
    });

  } catch (error) {
    console.error('Error fetching overdue payments:', error);
    res.status(500).json({ message: 'Internal server error while fetching overdue payments' });
  }
};

// Admin: send two WhatsApp messages (notice + invoice) for the registration fee.
// Generates a receipt upload token, updates reg_fee_status to INVOICED, then sends both messages.
exports.sendRegFeeInvoice = async (req, res) => {
  const { client_id } = req.params;
  const { amount, bank_account_id, salesperson_id } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ message: 'A valid fee amount is required.' });
  }
  if (!bank_account_id) {
    return res.status(400).json({ message: 'A bank account must be selected.' });
  }

  try {
    const clientResult = await db.query(
      `SELECT cp.client_profile_id, cp.full_name, cp.company_name, cp.display_name_source, cp.reg_fee_status,
              u.mobile_number
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.user_id
       WHERE cp.client_profile_id = $1`,
      [client_id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const client = clientResult.rows[0];
    // The billed entity — the company itself when that's the client's chosen display name.
    client.display_name = (client.display_name_source === 'COMPANY_NAME' && client.company_name) || client.full_name;

    if (!client.mobile_number) {
      return res.status(400).json({ message: 'Client does not have a mobile number on file.' });
    }

    if (client.reg_fee_status === 'PAID' || client.reg_fee_status === 'WAIVED') {
      return res.status(409).json({ message: `Registration fee is already marked as ${client.reg_fee_status}.` });
    }

    const bankResult = await db.query(
      `SELECT account_id, bank_name, account_holder_name, account_number, branch_name
       FROM bank_accounts WHERE account_id = $1 AND is_active = true`,
      [bank_account_id]
    );

    if (bankResult.rows.length === 0) {
      return res.status(404).json({ message: 'Selected bank account not found or is inactive.' });
    }

    const bank = bankResult.rows[0];
    const receiptToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const invoiceDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const feeAmount = parseFloat(amount).toFixed(2);
    const uploadUrl = `https://vcarenursing.com/client/pay-receipt/${receiptToken}`;

    // Generate invoice code from client code and timestamp
    const clientCodeResult = await db.query('SELECT client_code FROM client_profiles WHERE client_profile_id = $1', [client_id]);
    const clientCode = clientCodeResult.rows[0]?.client_code || client_id.slice(0, 8).toUpperCase();
    const invoiceCode = `INV-${clientCode}-${Date.now().toString().slice(-6)}`;

    // Generate the invoice PDF and upload to S3
    const invoicePdfUrl = await generateAndUploadRegFeeInvoice({
      invoice_code: invoiceCode,
      invoice_date: invoiceDate,
      client_name: client.display_name,
      amount: feeAmount,
      bank_name: bank.bank_name,
      account_holder_name: bank.account_holder_name,
      account_number: bank.account_number,
      branch_name: bank.branch_name || '—',
      upload_url: uploadUrl,
    });

    const updated = await db.query(
      `UPDATE client_profiles
       SET reg_fee_status = 'INVOICED',
           reg_fee_amount = $1,
           reg_fee_invoiced_at = NOW(),
           reg_fee_receipt_token = $2,
           reg_fee_receipt_token_expires_at = $3
       WHERE client_profile_id = $4
       RETURNING reg_fee_status, reg_fee_amount, reg_fee_invoiced_at, reg_fee_receipt_token`,
      [feeAmount, receiptToken, tokenExpiry, client_id]
    );

    // Persist the invoice PDF so it stays downloadable later (in the client's
    // Invoices tab and the admin-wide invoice list) instead of only living in
    // the WhatsApp message that was just sent.
    try {
      const savedInvoice = await db.query(
        `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, bank_account_id, status, sent_by)
         VALUES ($1, $2, $3, $4, $5, 'SENT', $6)
         RETURNING invoice_id`,
        [client_id, invoiceCode, feeAmount, invoicePdfUrl, bank_account_id, req.user.user_id]
      );

      // This invoice is now unpaid money owed by the client — surface it in the
      // system-wide overdue-invoices ledger until it's paid/waived.
      try {
        await createOverdueInvoice(db, {
          client_id,
          source_type: 'REGISTRATION_FEE',
          source_id: savedInvoice.rows[0]?.invoice_id || null,
          invoice_code: invoiceCode,
          amount: feeAmount,
        });
      } catch (overdueErr) {
        console.error('Failed to record overdue invoice (reg fee):', overdueErr.message);
      }
    } catch (saveErr) {
      console.error('Failed to save registration fee invoice record:', saveErr.message);
    }

    // Crediting now happens the moment the invoice goes out, not when it's later
    // paid — idempotent + non-fatal, so a credit failure never blocks the invoice
    // send itself. Once a client has an origin salesperson, later PAID/verify
    // calls that still pass a salesperson_id are harmless no-ops (see
    // creditSalespersonForRegistration's alreadyCredited guard).
    if (salesperson_id) {
      try {
        await creditSalespersonForRegistration(db, {
          client_id,
          salesperson_id,
          assigned_by: req.user.user_id,
        });
      } catch (creditErr) {
        console.error('Failed to credit salesperson for registration:', creditErr.message);
      }
    }

    // Send notice template, then invoice template (PDF document header + bank details in body + CTA button)
    const [noticeResult, invoiceResult] = await Promise.allSettled([
      sendRegFeeNotice(client.mobile_number, client.display_name),
      sendRegFeeInvoice(
        client.mobile_number,
        client.display_name,
        feeAmount,
        bank.bank_name,
        bank.account_holder_name,
        bank.account_number,
        bank.branch_name || '—',
        invoicePdfUrl,
        receiptToken
      ),
    ]);

    if (noticeResult.status === 'rejected') {
      console.error('WhatsApp notice send failed:', noticeResult.reason?.message);
    }
    if (invoiceResult.status === 'rejected') {
      console.error('WhatsApp invoice PDF send failed:', invoiceResult.reason?.message);
    }

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'REG_FEE_INVOICE_SENT',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { client_name: client.full_name, amount: feeAmount, bank_account_id, invoice_code: invoiceCode, pdf_url: invoicePdfUrl },
      });
    } catch (logErr) {
      console.error('Activity log failed (reg fee invoice):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Registration fee invoice sent via WhatsApp.',
      data: { ...updated.rows[0], invoice_pdf_url: invoicePdfUrl },
      whatsapp: {
        notice: noticeResult.status,
        invoice: invoiceResult.status,
      },
    });
  } catch (error) {
    console.error('Send Reg Fee Invoice Error:', error.message);
    res.status(500).json({ message: 'Failed to send registration fee invoice.', error: error.message });
  }
};

// Admin: manually update reg_fee_status to PAID or WAIVED.
exports.updateRegFeeStatus = async (req, res) => {
  const { client_id } = req.params;
  const { status, salesperson_id } = req.body;

  const allowed = ['PENDING', 'PAID', 'WAIVED'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}.` });
  }

  if (status === 'WAIVED' && !(await userHasPermission(req.user, 'CLIENT_WAIVE_REG_FEE'))) {
    return res.status(403).json({ message: 'Permission Denied: You do not have access to waive registration fees.' });
  }

  try {
    // PAID and WAIVED both resolve the fee obligation; PENDING resets it.
    const feePaid = status === 'PAID' || status === 'WAIVED';

    const current = await db.query(
      `SELECT reg_fee_status, reg_fee_amount FROM client_profiles WHERE client_profile_id = $1`,
      [client_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }
    const wasAlreadyPaid = current.rows[0].reg_fee_status === 'PAID';

    // PAID and WAIVED both start the 365-day membership countdown; PENDING clears it.
    const startsCountdown = status === 'PAID' || status === 'WAIVED';
    const paidAt = startsCountdown ? new Date() : null;
    const expiresAt = startsCountdown ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;

    const updated = await db.query(
      `UPDATE client_profiles
       SET reg_fee_status = $1, is_registration_fee_paid = $2,
           reg_fee_paid_at = $3, reg_fee_expires_at = $4
       WHERE client_profile_id = $5
       RETURNING reg_fee_status, is_registration_fee_paid, reg_fee_expires_at`,
      [status, feePaid, paidAt, expiresAt, client_id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    // Either settlement path clears the client's overdue obligation for this
    // fee — a no-op if no invoice was ever sent (e.g. WAIVED with no prior invoice).
    if (feePaid) {
      try {
        await resolveOverdueInvoices(db, { client_id, source_type: 'REGISTRATION_FEE', resolution: status });
      } catch (overdueErr) {
        console.error('Failed to resolve overdue invoice (reg fee):', overdueErr.message);
      }
    }

    // Manually marking PAID (no receipt-upload flow) still means real cash was
    // confirmed received — record it the same way verifyRegFeePayment does.
    // WAIVED involves no cash, so no transaction is created for it.
    if (status === 'PAID' && !wasAlreadyPaid) {
      try {
        await db.query(
          `INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes)
           VALUES ($1, 'REGISTRATION_FEE', $2, 'CREDIT', 'COMPLETED', 'Registration fee payment (marked paid by admin)')`,
          [client_id, current.rows[0].reg_fee_amount]
        );
      } catch (txErr) {
        console.error('Failed to record registration fee transaction:', txErr.message);
      }
      try {
        await db.query(
          `UPDATE client_reg_fee_invoices SET status = 'PAID'
           WHERE client_id = $1 AND status = 'SENT'`,
          [client_id]
        );
      } catch (invErr) {
        console.error('Failed to sync registration fee invoice status:', invErr.message);
      }

      // Credit the salesperson who brought this registration in, if one was picked.
      // Idempotent + non-fatal: a credit failure shouldn't block the payment confirmation.
      if (salesperson_id) {
        try {
          await creditSalespersonForRegistration(db, {
            client_id,
            salesperson_id,
            assigned_by: req.user.user_id,
          });
        } catch (creditErr) {
          console.error('Failed to credit salesperson for registration:', creditErr.message);
        }
      }
    }

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'REG_FEE_STATUS_UPDATED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { new_status: status, is_registration_fee_paid: feePaid },
      });
    } catch (logErr) {
      console.error('Activity log failed (reg fee status update):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: `Registration fee status updated to ${status}.`,
      data: updated.rows[0],
    });
  } catch (error) {
    console.error('Update Reg Fee Status Error:', error.message);
    res.status(500).json({ message: 'Failed to update registration fee status.', error: error.message });
  }
};

// Admin: verify a client's uploaded receipt and mark their registration fee as PAID.
// Distinct from updateRegFeeStatus so the audit trail captures the receipt-review action separately.
exports.verifyRegFeePayment = async (req, res) => {
  const { client_id } = req.params;
  const { salesperson_id } = req.body;

  try {
    const clientResult = await db.query(
      `SELECT full_name, reg_fee_status, reg_fee_amount, reg_fee_receipt_url
       FROM client_profiles WHERE client_profile_id = $1`,
      [client_id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const client = clientResult.rows[0];

    if (client.reg_fee_status !== 'RECEIPT_UPLOADED') {
      return res.status(409).json({
        message: `Cannot verify: registration fee status is ${client.reg_fee_status}, not RECEIPT_UPLOADED.`,
      });
    }

    const updated = await db.query(
      `UPDATE client_profiles
       SET reg_fee_status = 'PAID', is_registration_fee_paid = true,
           reg_fee_paid_at = NOW(), reg_fee_expires_at = NOW() + INTERVAL '365 days'
       WHERE client_profile_id = $1
       RETURNING reg_fee_status, is_registration_fee_paid, reg_fee_expires_at`,
      [client_id]
    );

    // Real cash was just confirmed received — record it as a client payment
    // transaction so it appears on the Transactions ledger and counts as Money In.
    try {
      await db.query(
        `INSERT INTO transactions (client_id, category, amount, transaction_type, status, receipt_url, notes)
         VALUES ($1, 'REGISTRATION_FEE', $2, 'CREDIT', 'COMPLETED', $3, 'Registration fee payment (receipt verified)')`,
        [client_id, client.reg_fee_amount, client.reg_fee_receipt_url || null]
      );
    } catch (txErr) {
      console.error('Failed to record registration fee transaction:', txErr.message);
    }
    try {
      await resolveOverdueInvoices(db, { client_id, source_type: 'REGISTRATION_FEE', resolution: 'PAID' });
    } catch (overdueErr) {
      console.error('Failed to resolve overdue invoice (reg fee):', overdueErr.message);
    }
    try {
      await db.query(
        `UPDATE client_reg_fee_invoices SET status = 'PAID'
         WHERE client_id = $1 AND status = 'SENT'`,
        [client_id]
      );
    } catch (invErr) {
      console.error('Failed to sync registration fee invoice status:', invErr.message);
    }

    if (salesperson_id) {
      try {
        await creditSalespersonForRegistration(db, {
          client_id,
          salesperson_id,
          assigned_by: req.user.user_id,
        });
      } catch (creditErr) {
        console.error('Failed to credit salesperson for registration:', creditErr.message);
      }
    }

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'REG_FEE_PAYMENT_VERIFIED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: {
          client_name: client.full_name,
          amount: client.reg_fee_amount,
          receipt_url: client.reg_fee_receipt_url,
        },
      });
    } catch (logErr) {
      console.error('Activity log failed (reg fee verify):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Registration fee payment verified and marked as PAID.',
      data: updated.rows[0],
    });
  } catch (error) {
    console.error('Verify Reg Fee Payment Error:', error.message);
    res.status(500).json({ message: 'Failed to verify registration fee payment.', error: error.message });
  }
};

// Admin: record a registration fee payment that actually happened in the past
// (e.g. a client who paid before this system tracked reg fees, or before this
// feature existed). Unlike verifyRegFeePayment/updateRegFeeStatus — which always
// stamp "now" as the payment moment — this takes an admin-supplied payment_date
// and derives reg_fee_expires_at from THAT date, not from today, so a backdated
// entry doesn't grant a fresh 365-day membership starting today.
exports.backdateRegFeePayment = async (req, res) => {
  const { client_id } = req.params;
  const { amount, payment_date, salesperson_id } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ message: 'A valid fee amount is required.' });
  }

  const paidAt = payment_date ? new Date(payment_date) : null;
  if (!paidAt || isNaN(paidAt.getTime())) {
    return res.status(400).json({ message: 'A valid payment date is required.' });
  }
  if (paidAt.getTime() > Date.now()) {
    return res.status(400).json({ message: 'Payment date cannot be in the future — use "Send Invoice" or "Mark as Paid" for a current payment.' });
  }

  try {
    const clientResult = await db.query(
      `SELECT full_name FROM client_profiles WHERE client_profile_id = $1`,
      [client_id]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const feeAmount = parseFloat(amount).toFixed(2);
    const expiresAt = new Date(paidAt.getTime() + 365 * 24 * 60 * 60 * 1000);

    const updated = await db.query(
      `UPDATE client_profiles
       SET reg_fee_status = 'PAID', is_registration_fee_paid = true,
           reg_fee_amount = $1, reg_fee_paid_at = $2, reg_fee_expires_at = $3
       WHERE client_profile_id = $4
       RETURNING reg_fee_status, reg_fee_amount, reg_fee_paid_at, reg_fee_expires_at`,
      [feeAmount, paidAt, expiresAt, client_id]
    );

    // Dated to the actual payment date (not "now") so the statement/transactions
    // ledger reflects when the money actually came in, not when this was entered.
    try {
      await db.query(
        `INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes, created_at)
         VALUES ($1, 'REGISTRATION_FEE', $2, 'CREDIT', 'COMPLETED', 'Registration fee payment (backdated entry by admin)', $3)`,
        [client_id, feeAmount, paidAt]
      );
    } catch (txErr) {
      console.error('Failed to record backdated registration fee transaction:', txErr.message);
    }

    try {
      await db.query(
        `UPDATE client_reg_fee_invoices SET status = 'PAID'
         WHERE client_id = $1 AND status = 'SENT'`,
        [client_id]
      );
    } catch (invErr) {
      console.error('Failed to sync registration fee invoice status:', invErr.message);
    }

    try {
      await resolveOverdueInvoices(db, { client_id, source_type: 'REGISTRATION_FEE', resolution: 'PAID' });
    } catch (overdueErr) {
      console.error('Failed to resolve overdue invoice (backdated reg fee):', overdueErr.message);
    }

    if (salesperson_id) {
      try {
        await creditSalespersonForRegistration(db, {
          client_id,
          salesperson_id,
          assigned_by: req.user.user_id,
        });
      } catch (creditErr) {
        console.error('Failed to credit salesperson for registration:', creditErr.message);
      }
    }

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'REG_FEE_PAYMENT_BACKDATED',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { client_name: clientResult.rows[0].full_name, amount: feeAmount, payment_date: paidAt, expires_at: expiresAt },
      });
    } catch (logErr) {
      console.error('Activity log failed (reg fee backdate):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Historical registration fee payment recorded.',
      data: updated.rows[0],
    });
  } catch (error) {
    console.error('Backdate Reg Fee Payment Error:', error.message);
    res.status(500).json({ message: 'Failed to record historical registration fee payment.', error: error.message });
  }
};

// Admin: upload the registration fee payment receipt/slip on the client's behalf
// (e.g. the client sent it over WhatsApp/email instead of using the self-upload
// portal). Mirrors the public uploadPaymentReceipt flow, just admin-initiated.
exports.adminUploadRegFeeReceipt = async (req, res) => {
  const { client_id } = req.params;
  const receiptFile = req.file;

  if (!receiptFile) {
    return res.status(400).json({ message: 'No receipt file was uploaded.' });
  }

  try {
    const clientRes = await db.query(
      `SELECT full_name, reg_fee_status FROM client_profiles WHERE client_profile_id = $1`,
      [client_id]
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const client = clientRes.rows[0];
    if (['PAID', 'WAIVED'].includes(client.reg_fee_status)) {
      return res.status(409).json({ message: `Registration fee is already marked as ${client.reg_fee_status}.` });
    }

    const updated = await db.query(
      `UPDATE client_profiles
       SET reg_fee_receipt_url = $1, reg_fee_status = 'RECEIPT_UPLOADED'
       WHERE client_profile_id = $2
       RETURNING reg_fee_status, reg_fee_receipt_url`,
      [receiptFile.location, client_id]
    );

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user?.role),
        actionType: 'REG_FEE_RECEIPT_UPLOADED_BY_ADMIN',
        entityType: 'CLIENT',
        entityId: String(client_id),
        details: { client_name: client.full_name, receipt_url: receiptFile.location },
      });
    } catch (logErr) {
      console.error('Activity log failed (admin reg fee receipt upload):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Receipt uploaded. Review it and verify the payment to mark the fee as paid.',
      data: updated.rows[0],
    });
  } catch (error) {
    console.error('Admin Upload Reg Fee Receipt Error:', error.message);
    res.status(500).json({ message: 'Failed to upload registration fee receipt.', error: error.message });
  }
};

/**
 * @route   GET /api/clients/:client_id/invoices
 * @desc    All daily invoices across all bookings for a single client
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getClientInvoices = async (req, res) => {
  const { client_id } = req.params;
  const { status, date_from, date_to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const conditions = ['b.client_id = $1'];
  const params = [client_id];
  let idx = 2;

  if (status) { conditions.push(`bdi.status = $${idx++}`); params.push(status); }
  if (date_from) { conditions.push(`bdi.service_date >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`bdi.service_date <= $${idx++}`); params.push(date_to); }

  const where = conditions.join(' AND ');

  try {
    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT
            bdi.daily_invoice_id, bdi.service_date::text, bdi.status, bdi.amount,
            bdi.entry_mode, bdi.decided_by_name, bdi.decided_at, bdi.notes,
            bdi.shift_slot_id, bdi.whatsapp_sent_at,
            ss.label AS shift_label, ss.shift_number,
            b.booking_id, b.booking_code, b.service_type,
            CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                 THEN cp.company_name ELSE cp.full_name END AS client_name
         FROM booking_daily_invoices bdi
         JOIN bookings b ON bdi.booking_id = b.booking_id
         LEFT JOIN booking_shift_slots ss ON bdi.shift_slot_id = ss.shift_slot_id
         LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
         WHERE ${where}
         ORDER BY bdi.service_date DESC, bdi.decided_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit, 10), offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM booking_daily_invoices bdi
         JOIN bookings b ON bdi.booking_id = b.booking_id
         WHERE ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), total_pages: Math.ceil(total / parseInt(limit, 10)) },
    });
  } catch (err) {
    console.error('Get client invoices error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch client invoices.' });
  }
};

/**
 * @route   GET /api/admin/invoices
 * @desc    Global daily invoices list with filters (date, status, client, booking)
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getAdminInvoices = async (req, res) => {
  const { status, date_from, date_to, client_id, booking_id, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`bdi.status = $${idx++}`); params.push(status); }
  if (date_from) { conditions.push(`bdi.service_date >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`bdi.service_date <= $${idx++}`); params.push(date_to); }
  if (client_id) { conditions.push(`b.client_id = $${idx++}`); params.push(client_id); }
  if (booking_id) { conditions.push(`bdi.booking_id = $${idx++}`); params.push(booking_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT
            bdi.daily_invoice_id, bdi.service_date::text, bdi.status, bdi.amount,
            bdi.entry_mode, bdi.decided_by_name, bdi.decided_at, bdi.notes,
            bdi.shift_slot_id,
            ss.label AS shift_label, ss.shift_number,
            b.booking_id, b.booking_code, b.service_type,
            CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                 THEN cp.company_name ELSE cp.full_name END AS client_name,
            cp.client_profile_id
         FROM booking_daily_invoices bdi
         JOIN bookings b ON bdi.booking_id = b.booking_id
         LEFT JOIN booking_shift_slots ss ON bdi.shift_slot_id = ss.shift_slot_id
         LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
         ${where}
         ORDER BY bdi.service_date DESC, bdi.decided_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit, 10), offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM booking_daily_invoices bdi
         JOIN bookings b ON bdi.booking_id = b.booking_id
         ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), total_pages: Math.ceil(total / parseInt(limit, 10)) },
    });
  } catch (err) {
    console.error('Get admin invoices error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch invoices.' });
  }
};

/**
 * @route   GET /api/client/invoice-pdf/:daily_invoice_id
 * @desc    Generate and download a single daily invoice as a PDF (on demand)
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
function formatInvoiceDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Loads a single daily invoice row plus the booking/client context needed to
// render it, so both the on-demand PDF download and the WhatsApp resend can
// build the exact same document from one query.
async function getDailyInvoiceRow(dailyInvoiceId) {
  const result = await db.query(
    `SELECT
        bdi.daily_invoice_id, bdi.service_date::text, bdi.status, bdi.amount, bdi.pdf_url,
        bdi.decided_by_name, bdi.decided_at, bdi.notes,
        ss.label AS shift_label, ss.shift_number,
        b.booking_id, b.booking_code, b.service_type, b.client_id,
        CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
             THEN cp.company_name ELSE cp.full_name END AS client_name,
        u.mobile_number AS client_mobile
     FROM booking_daily_invoices bdi
     JOIN bookings b ON bdi.booking_id = b.booking_id
     LEFT JOIN booking_shift_slots ss ON bdi.shift_slot_id = ss.shift_slot_id
     LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
     LEFT JOIN users u ON cp.user_id = u.user_id
     WHERE bdi.daily_invoice_id = $1`,
    [dailyInvoiceId]
  );
  return result.rows[0] || null;
}

function buildDailyInvoiceHtml(inv, invoiceCode) {
  return dailyInvoiceTemplate({
    invoice_code: invoiceCode,
    invoice_date: formatInvoiceDate(new Date()),
    service_date: formatInvoiceDate(inv.service_date),
    client_name: inv.client_name,
    booking_code: inv.booking_code || String(inv.booking_id).slice(0, 8),
    service_type: inv.service_type,
    shift_label: inv.shift_label || (inv.shift_number ? `Shift ${inv.shift_number}` : null),
    status: inv.status,
    amount: inv.amount,
    decided_by_name: inv.decided_by_name,
    decided_at: formatInvoiceDate(inv.decided_at),
    notes: inv.notes,
  });
}

// Generates (once) and persists a daily invoice's PDF to S3 — idempotent,
// mirrors invoiceController.ensureInvoicePdf's pattern — so a WhatsApp resend
// always links to the same stable document instead of a fresh one each time.
async function ensureDailyInvoicePdf(dailyInvoiceId) {
  const inv = await getDailyInvoiceRow(dailyInvoiceId);
  if (!inv) return null;
  if (inv.pdf_url) return inv;

  const invoiceCode = `DINV-${String(inv.daily_invoice_id).slice(0, 8).toUpperCase()}`;
  const html = buildDailyInvoiceHtml(inv, invoiceCode);
  const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
  const pdfKey = `invoices/${invoiceCode}_${Date.now()}.pdf`;
  const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

  await db.query(`UPDATE booking_daily_invoices SET pdf_url = $1 WHERE daily_invoice_id = $2`, [pdfUrl, dailyInvoiceId]);
  inv.pdf_url = pdfUrl;
  return inv;
}

exports.downloadDailyInvoicePdf = async (req, res) => {
  const { daily_invoice_id } = req.params;
  try {
    const inv = await getDailyInvoiceRow(daily_invoice_id);
    if (!inv) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found.' });
    }

    const invoiceCode = `DINV-${String(inv.daily_invoice_id).slice(0, 8).toUpperCase()}`;
    const html = buildDailyInvoiceHtml(inv, invoiceCode);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceCode}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('Download daily invoice PDF error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to generate invoice PDF.' });
  }
};

/**
 * @route   POST /api/client/invoice/:daily_invoice_id/resend
 * @desc    Send (or resend) a single daily invoice's PDF to the client over
 *          WhatsApp. Generates + persists the PDF first if it doesn't exist yet.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.resendDailyInvoice = async (req, res) => {
  const { daily_invoice_id } = req.params;
  try {
    const inv = await ensureDailyInvoicePdf(daily_invoice_id);
    if (!inv) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found.' });
    }
    if (!inv.client_mobile) {
      return res.status(400).json({ status: 'error', message: 'Client has no mobile number on file.' });
    }

    const invoiceCode = `DINV-${String(inv.daily_invoice_id).slice(0, 8).toUpperCase()}`;

    try {
      await sendClientInvoice(inv.client_mobile, inv.client_name || 'Valued Client', invoiceCode, inv.amount, inv.pdf_url);
    } catch (sendErr) {
      console.error('Resend Daily Invoice WhatsApp Error:', sendErr.message);
      return res.status(502).json({ status: 'error', message: 'WhatsApp send failed — the "vcare_client_invoice" template may not be approved yet.' });
    }

    await db.query(`UPDATE booking_daily_invoices SET whatsapp_sent_at = NOW() WHERE daily_invoice_id = $1`, [daily_invoice_id]);

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'DAILY_INVOICE_RESENT',
        entityType: 'CLIENT',
        entityId: String(inv.client_id),
        details: { daily_invoice_id, invoice_code: invoiceCode, amount: inv.amount },
      });
    } catch (logErr) {
      console.error('Activity log failed (daily invoice resend):', logErr.message);
    }

    res.status(200).json({ status: 'success', message: 'Invoice sent via WhatsApp.', data: { pdf_url: inv.pdf_url } });
  } catch (err) {
    console.error('Resend daily invoice error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to resend invoice.' });
  }
};

/**
 * @route   GET /api/client/:client_id/reg-fee-invoices
 * @desc    All registration fee invoices ever sent to a single client
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getClientRegFeeInvoices = async (req, res) => {
  const { client_id } = req.params;
  try {
    const result = await db.query(
      `SELECT crfi.invoice_id, crfi.invoice_code, crfi.amount, crfi.pdf_url, crfi.status, crfi.created_at,
              crfi.whatsapp_resent_at,
              ba.account_nickname AS bank_account_nickname, ba.bank_name,
              CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                   THEN cp.company_name ELSE cp.full_name END AS billed_to_name
       FROM client_reg_fee_invoices crfi
       LEFT JOIN bank_accounts ba ON crfi.bank_account_id = ba.account_id
       LEFT JOIN client_profiles cp ON crfi.client_id = cp.client_profile_id
       WHERE crfi.client_id = $1
       ORDER BY crfi.created_at DESC`,
      [client_id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('Get client reg fee invoices error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch registration fee invoices.' });
  }
};

/**
 * @route   POST /api/client/reg-fee-invoices/:invoice_id/resend
 * @desc    Resend an already-sent registration fee invoice PDF over WhatsApp,
 *          reusing its existing PDF, bank details and receipt-upload token
 *          rather than generating a new invoice.
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.resendRegFeeInvoice = async (req, res) => {
  const { invoice_id } = req.params;
  try {
    const result = await db.query(
      `SELECT crfi.invoice_id, crfi.invoice_code, crfi.amount, crfi.pdf_url, crfi.client_id,
              cp.full_name, cp.company_name, cp.display_name_source, cp.reg_fee_receipt_token,
              u.mobile_number,
              ba.bank_name, ba.account_holder_name, ba.account_number, ba.branch_name
       FROM client_reg_fee_invoices crfi
       JOIN client_profiles cp ON cp.client_profile_id = crfi.client_id
       JOIN users u ON u.user_id = cp.user_id
       LEFT JOIN bank_accounts ba ON ba.account_id = crfi.bank_account_id
       WHERE crfi.invoice_id = $1`,
      [invoice_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found.' });
    }

    const inv = result.rows[0];
    if (!inv.mobile_number) {
      return res.status(400).json({ status: 'error', message: 'Client has no mobile number on file.' });
    }
    if (!inv.reg_fee_receipt_token) {
      return res.status(400).json({ status: 'error', message: 'This client has no active receipt-upload link — send a fresh invoice from the registration fee tab instead.' });
    }

    const displayName = (inv.display_name_source === 'COMPANY_NAME' && inv.company_name) || inv.full_name;

    try {
      await sendRegFeeInvoice(
        inv.mobile_number,
        displayName,
        parseFloat(inv.amount).toFixed(2),
        inv.bank_name || '—',
        inv.account_holder_name || '—',
        inv.account_number || '—',
        inv.branch_name || '—',
        inv.pdf_url,
        inv.reg_fee_receipt_token
      );
    } catch (sendErr) {
      console.error('Resend Reg Fee Invoice WhatsApp Error:', sendErr.message);
      return res.status(502).json({ status: 'error', message: 'Failed to resend invoice via WhatsApp.' });
    }

    await db.query(`UPDATE client_reg_fee_invoices SET whatsapp_resent_at = NOW() WHERE invoice_id = $1`, [invoice_id]);

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'REG_FEE_INVOICE_RESENT',
        entityType: 'CLIENT',
        entityId: String(inv.client_id),
        details: { invoice_code: inv.invoice_code, amount: inv.amount },
      });
    } catch (logErr) {
      console.error('Activity log failed (reg fee invoice resend):', logErr.message);
    }

    res.status(200).json({ status: 'success', message: 'Invoice resent via WhatsApp.' });
  } catch (err) {
    console.error('Resend reg fee invoice error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to resend invoice.' });
  }
};

/**
 * @route   GET /api/client/reg-fee-invoices
 * @desc    Global registration fee invoices list with filters (status, date, client)
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getAllRegFeeInvoices = async (req, res) => {
  const { status, date_from, date_to, client_id, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`crfi.status = $${idx++}`); params.push(status); }
  if (date_from) { conditions.push(`crfi.created_at >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`crfi.created_at <= $${idx++}`); params.push(date_to); }
  if (client_id) { conditions.push(`crfi.client_id = $${idx++}`); params.push(client_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT crfi.invoice_id, crfi.invoice_code, crfi.amount, crfi.pdf_url, crfi.status, crfi.created_at,
                cp.client_profile_id,
                CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                     THEN cp.company_name ELSE cp.full_name END AS client_name,
                cp.reg_fee_status AS membership_status, cp.reg_fee_expires_at AS membership_expires_at
         FROM client_reg_fee_invoices crfi
         LEFT JOIN client_profiles cp ON crfi.client_id = cp.client_profile_id
         ${where}
         ORDER BY crfi.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit, 10), offset]
      ),
      db.query(`SELECT COUNT(*) FROM client_reg_fee_invoices crfi ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), total_pages: Math.ceil(total / parseInt(limit, 10)) },
    });
  } catch (err) {
    console.error('Get all reg fee invoices error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch registration fee invoices.' });
  }
};

/**
 * @route   GET /api/client/:client_id/overdue-invoices
 * @desc    A single client's overdue-invoices ledger (currently only
 *          registration fees — see services/overdueInvoices.js).
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getClientOverdueInvoices = async (req, res) => {
  const { client_id } = req.params;
  try {
    const result = await db.query(
      `SELECT overdue_invoice_id, source_type, source_id, invoice_code, amount,
              status, resolution, invoiced_at, resolved_at
       FROM overdue_invoices
       WHERE client_id = $1
       ORDER BY invoiced_at DESC`,
      [client_id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('Get client overdue invoices error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch overdue invoices.' });
  }
};

/**
 * @route   GET /api/client/all-overdue-invoices
 * @desc    System-wide overdue-invoices ledger across all clients (currently
 *          only registration fees — see services/overdueInvoices.js).
 * @access  Private (SUPER_ADMIN, COORDINATOR, ACCOUNTS)
 */
exports.getAllOverdueInvoices = async (req, res) => {
  const { status = 'OVERDUE', source_type, client_id, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`oi.status = $${idx++}`); params.push(status); }
  if (source_type) { conditions.push(`oi.source_type = $${idx++}`); params.push(source_type); }
  if (client_id) { conditions.push(`oi.client_id = $${idx++}`); params.push(client_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT oi.overdue_invoice_id, oi.source_type, oi.source_id, oi.invoice_code, oi.amount,
                oi.status, oi.resolution, oi.invoiced_at, oi.resolved_at,
                cp.client_profile_id,
                CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                     THEN cp.company_name ELSE cp.full_name END AS client_name
         FROM overdue_invoices oi
         LEFT JOIN client_profiles cp ON oi.client_id = cp.client_profile_id
         ${where}
         ORDER BY oi.invoiced_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit, 10), offset]
      ),
      db.query(`SELECT COUNT(*) FROM overdue_invoices oi ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), total_pages: Math.ceil(total / parseInt(limit, 10)) },
    });
  } catch (err) {
    console.error('Get all overdue invoices error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch overdue invoices.' });
  }
};