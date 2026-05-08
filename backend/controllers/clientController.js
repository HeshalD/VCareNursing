const db = require('../config/db');

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
    // Get unpaid invoices (DEBIT transactions) that are overdue
    // Consider invoices overdue if they're older than 7 days and not fully paid
    const overdueQuery = `
      SELECT 
        t.transaction_id,
        t.amount as invoice_amount,
        t.created_at as invoice_date,
        t.notes,
        b.service_type,
        b.start_date,
        CASE 
          WHEN t.created_at < CURRENT_DATE - INTERVAL '7 days' THEN true
          ELSE false
        END as is_overdue,
        CURRENT_DATE - t.created_at as days_overdue,
        COALESCE(
          (SELECT COALESCE(SUM(amount), 0) 
           FROM transactions t2 
           WHERE t2.booking_id = t.booking_id 
           AND t2.transaction_type = 'CREDIT'
           AND t2.status = 'COMPLETED'), 0
        ) as amount_paid
      FROM transactions t
      LEFT JOIN bookings b ON t.booking_id = b.booking_id
      WHERE t.client_id = $1 
        AND t.transaction_type = 'DEBIT'
        AND t.category = 'SERVICE_INVOICE'
        AND t.status = 'COMPLETED'
      ORDER BY t.created_at ASC
    `;

    const result = await db.query(overdueQuery, [client_id]);

    // Calculate overdue amounts
    const overduePayments = result.rows.map(row => {
      const balance = parseFloat(row.invoice_amount) - parseFloat(row.amount_paid);
      return {
        ...row,
        balance_due: balance,
        is_fully_paid: balance <= 0
      };
    }).filter(row => row.balance_due > 0); // Only show unpaid or partially paid

    // Calculate totals
    const totalOverdue = overduePayments.reduce((sum, payment) => sum + payment.balance_due, 0);
    const overdueCount = overduePayments.filter(payment => payment.is_overdue).length;

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