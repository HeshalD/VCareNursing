const db = require('../config/db');

async function getClientUserAccount(clientId) {
  const result = await db.query(
    `SELECT cp.client_profile_id, cp.full_name, cp.updated_at, u.user_id, u.is_active, u.mobile_number, u.email
     FROM client_profiles cp
     JOIN users u ON cp.user_id = u.user_id
     WHERE cp.client_profile_id = $1`,
    [clientId]
  );

  return result.rows[0] || null;
}

async function getClientOverdueBreakdown(clientId) {
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

  const totalOverdue = overduePayments.reduce((sum, payment) => sum + payment.balance_due, 0);
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
         t.transaction_id,
         t.booking_id,
         t.quote_id,
         t.category,
         t.amount,
         t.payment_method,
         t.status,
         t.notes,
         t.transaction_type,
         t.created_at,
         b.service_type,
         b.start_date,
         CASE
           WHEN t.transaction_type = 'DEBIT' THEN 'Invoice'
           WHEN t.transaction_type = 'CREDIT' THEN 'Payment'
           ELSE 'Other'
         END as transaction_description
       FROM transactions t
       LEFT JOIN bookings b ON t.booking_id = b.booking_id
       WHERE t.client_id = $1
       ORDER BY t.created_at DESC`,
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
       LEFT JOIN staff_profiles sp ON b.assigned_staff_id = sp.staff_profile_id
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
         sr.active_quote_id
       FROM quotations q
       JOIN service_requests sr ON q.request_id = sr.request_id
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
         sp.designation
       FROM booking_staff_assignments bsa
       JOIN bookings b ON bsa.booking_id = b.booking_id
       JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
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
      `SELECT COALESCE(SUM(amount_received), 0) as total_paid
       FROM booking_payment_tracking
       WHERE client_id = $1
         AND status = 'VERIFIED'`,
      [client_id]
    );

    const dailyInvoiceSummaryQuery = db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_invoiced
       FROM transactions
       WHERE client_id = $1
         AND category = 'SERVICE_INVOICE'
         AND status = 'COMPLETED'`,
      [client_id]
    );

    const [clientProfileResult, paymentHistoryResult, bookingHistoryResult, quotationHistoryResult, staffAssignmentsResult, reviewsResult, patientsResult, statementSummaryResult, clientPaymentsSummaryResult, dailyInvoiceSummaryResult] = await Promise.all([
      clientProfileQuery,
      paymentHistoryQuery,
      bookingHistoryQuery,
      quotationHistoryQuery,
      staffAssignmentsQuery,
      reviewsQuery,
      patientsQuery,
      statementSummaryQuery,
      clientPaymentsSummaryQuery,
      dailyInvoiceSummaryQuery
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


    res.status(200).json({
      status: 'success',
      data: {
        client_profile: clientProfile,
        payment_summary: {
          payment_count: paymentCount,
          total_paid: parseFloat(clientPaymentsSummary?.total_paid || 0),
          total_invoiced: parseFloat(dailyInvoiceSummary?.total_invoiced || 0),
          balance_due: Math.max(parseFloat(dailyInvoiceSummary?.total_invoiced || 0) - parseFloat(clientPaymentsSummary?.total_paid || 0), 0),
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
          total_invoiced: parseFloat(dailyInvoiceSummary?.total_invoiced || 0),
          total_paid: parseFloat(clientPaymentsSummary?.total_paid || 0),
          balance_due: Math.max(parseFloat(dailyInvoiceSummary?.total_invoiced || 0) - parseFloat(clientPaymentsSummary?.total_paid || 0), 0),
          last_transaction_at: statementSummary?.last_transaction_at || null
        },
        overdue_summary: {
          total_overdue_amount: parseFloat((clientPaymentsSummary?.total_paid || 0) - (dailyInvoiceSummary?.total_invoiced || 0)),
          overdue_payments_count: overdueCount || 0,
          total_outstanding_invoices: overduePayments.length
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
  const { full_name, latitude, longitude, gender } = req.body;
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
      JOIN users u ON sr.payer_mobile = u.mobile_number
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

// 5. Get all clients
exports.getAllClients = async (req, res) => {
  try {
    const clientsRes = await db.query(
      'SELECT cp.*, u.email, u.created_at as user_created_at FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id ORDER BY cp.created_at DESC'
    );

    res.status(200).json({
      status: 'success',
      results: clientsRes.rows.length,
      data: clientsRes.rows
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