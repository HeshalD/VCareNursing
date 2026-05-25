const db = require('../config/db');
const bcrypt = require('bcrypt');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getOrCreateClientProfileForQuotation = async (client, quotation) => {
  const requestResult = await client.query(
    `SELECT request_id, client_id, payer_name, payer_mobile, location_address
     FROM service_requests
     WHERE request_id = $1`,
    [quotation.request_id]
  );

  if (requestResult.rows.length === 0) {
    throw new Error('Service request not found for this quotation');
  }

  const serviceRequest = requestResult.rows[0];

  if (serviceRequest.client_id) {
    return {
      client_id: serviceRequest.client_id,
      client_profile_created: false
    };
  }

  if (!serviceRequest.payer_mobile) {
    throw new Error('Service request is missing payer mobile number');
  }

  const payerName = serviceRequest.payer_name || 'New Client';
  const payerAddress = serviceRequest.location_address || null;

  let userId = null;
  const userCheck = await client.query(
    `SELECT user_id FROM users WHERE mobile_number = $1`,
    [serviceRequest.payer_mobile]
  );

  if (userCheck.rows.length > 0) {
    userId = userCheck.rows[0].user_id;
  } else {
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const newUser = await client.query(
      `INSERT INTO users (mobile_number, password_hash, email, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id`,
      [serviceRequest.payer_mobile, hashedPassword, null, ['CLIENT'], true]
    );

    userId = newUser.rows[0].user_id;
  }

  const profileCheck = await client.query(
    `SELECT client_profile_id FROM client_profiles WHERE user_id = $1`,
    [userId]
  );

  let clientProfileId = null;
  let clientProfileCreated = false;

  if (profileCheck.rows.length > 0) {
    clientProfileId = profileCheck.rows[0].client_profile_id;
  } else {
    const newProfile = await client.query(
      `INSERT INTO client_profiles (user_id, full_name, primary_address, is_registration_fee_paid)
       VALUES ($1, $2, $3, $4)
       RETURNING client_profile_id`,
      [userId, payerName, payerAddress, false]
    );

    clientProfileId = newProfile.rows[0].client_profile_id;
    clientProfileCreated = true;
  }

  await client.query(
    `UPDATE service_requests SET client_id = $1 WHERE request_id = $2`,
    [clientProfileId, serviceRequest.request_id]
  );

  return {
    client_id: clientProfileId,
    client_profile_created: clientProfileCreated
  };
};

/**
 * Record a payment for a quotation
 * POST /api/quotations/:quote_id/record-payment
 */
const recordPayment = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { quote_id } = req.params;
    const uploadedSlipUrl = req.file?.path || null;
    const {
      amount_received,
      payment_method,
      bank_account_id,
      cheque_number,
      cheque_date,
      reference_number,
      slip_url,
      notes
    } = req.body;
    const paymentSlipUrl = uploadedSlipUrl || slip_url || null;

    await client.query('BEGIN');

    // Validate quote_id format
    if (!quote_id || !uuidRegex.test(quote_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid quote ID format'
      });
    }

    // Validate required fields
    if (!amount_received || amount_received <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'amount_received is required and must be greater than 0'
      });
    }

    if (!payment_method) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'payment_method is required (BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE)'
      });
    }

    // Validate payment method
    const validMethods = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];
    if (!validMethods.includes(payment_method)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Invalid payment_method. Must be one of: ${validMethods.join(', ')}`
      });
    }

    // Validate conditional fields based on payment method
    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method)) {
      if (!bank_account_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: `bank_account_id is required for ${payment_method}`
        });
      }
    }

    if (payment_method === 'CHEQUE') {
      if (!cheque_number || !cheque_date) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'cheque_number and cheque_date are required for CHEQUE payments'
        });
      }
    }

    // Verify bank account exists and is active (if provided)
    if (bank_account_id) {
      const bankCheck = await client.query(`
        SELECT account_id, is_active FROM bank_accounts WHERE account_id = $1
      `, [bank_account_id]);

      if (bankCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          status: 'error',
          message: 'Bank account not found'
        });
      }

      if (!bankCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'Bank account is not active'
        });
      }
    }

    // Verify quotation exists
    const quoteCheck = await client.query(`
      SELECT 
        quote_id,
        total_amount,
        request_id,
        status
      FROM quotations
      WHERE quote_id = $1
    `, [quote_id]);

    if (quoteCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        message: 'Quotation not found'
      });
    }

    const quotation = quoteCheck.rows[0];

    // Bootstrap a client profile if this quotation belongs to a brand-new customer
    const clientBootstrap = await getOrCreateClientProfileForQuotation(client, quotation);
    const client_id = clientBootstrap.client_id;

    // Get total paid so far (sum from payment_tracking)
    const paidCheck = await client.query(`
      SELECT COALESCE(SUM(amount_received), 0) as total_paid
      FROM payment_tracking
      WHERE quote_id = $1 AND status = 'VERIFIED'
    `, [quote_id]);

    const total_paid_so_far = parseFloat(paidCheck.rows[0].total_paid);
    const new_total = total_paid_so_far + parseFloat(amount_received);

    // Validate total paid doesn't exceed quotation amount
    if (new_total > quotation.total_amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Total payment (${new_total}) cannot exceed quotation amount (${quotation.total_amount})`,
        current_total: quotation.total_amount,
        amount_paid: total_paid_so_far,
        amount_received: amount_received,
        remaining: quotation.total_amount - total_paid_so_far
      });
    }

    // Get verified_by from auth context
    const verified_by = req.user?.user_id || null;

    // Insert payment tracking record
    const paymentResult = await client.query(`
      INSERT INTO payment_tracking (
        quote_id,
        client_id,
        amount_received,
        payment_method,
        bank_account_id,
        cheque_number,
        cheque_date,
        reference_number,
        slip_url,
        status,
        verified_by,
        notes,
        payment_date,
        verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING 
        payment_id,
        quote_id,
        amount_received,
        payment_method,
        reference_number,
        status,
        payment_date,
        verified_at
    `, [
      quote_id,
      client_id,
      amount_received,
      payment_method,
      bank_account_id || null,
      cheque_number || null,
      cheque_date || null,
      reference_number || null,
      paymentSlipUrl,
      'VERIFIED',
      verified_by,
      notes || null
    ]);

    const payment = paymentResult.rows[0];

    // Update bookings table with payment info (if booking exists for this quote)
    await client.query(`
      UPDATE bookings
      SET 
        amount_paid = (
          SELECT COALESCE(SUM(amount_received), 0)
          FROM payment_tracking
          WHERE quote_id = $1 AND status = 'VERIFIED'
        ),
        amount_quotated = $2,
        last_payment_date = NOW()
      WHERE request_id = (SELECT request_id FROM quotations WHERE quote_id = $1)
    `, [quote_id, quotation.total_amount]);

    // Create transaction record for audit trail
    await client.query(`
      INSERT INTO transactions (
        quote_id,
        client_id,
        category,
        amount,
        payment_method,
        bank_account_id,
        cheque_number,
        cheque_date,
        reference_number,
        receipt_url,
        verified_by,
        status,
        notes,
        transaction_type,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    `, [
      quote_id,
      client_id,
      'CLIENT_PAYMENT',
      amount_received,
      payment_method,
      bank_account_id || null,
      cheque_number || null,
      cheque_date || null,
      reference_number || null,
      paymentSlipUrl,
      verified_by,
      'COMPLETED',
      notes || null,
      'DEBIT'
    ]);

    // Fetch bank account details if provided
    let bank_account = null;
    if (bank_account_id) {
      const bankResult = await client.query(`
        SELECT account_id, account_nickname, account_number, bank_name
        FROM bank_accounts
        WHERE account_id = $1
      `, [bank_account_id]);

      if (bankResult.rows.length > 0) {
        bank_account = bankResult.rows[0];
      }
    }

    const remaining_balance = quotation.total_amount - new_total;

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      message: 'Payment recorded successfully',
      data: {
        payment_id: payment.payment_id,
        quote_id: payment.quote_id,
        amount_received: parseFloat(payment.amount_received),
        payment_method: payment.payment_method,
        bank_account: bank_account,
        reference_number: payment.reference_number,
        slip_url: paymentSlipUrl,
        status: payment.status,
        verified_at: payment.verified_at,
        created_at: payment.payment_date,
        client_profile_created: clientBootstrap.client_profile_created
      },
      payment_summary: {
        total_amount: parseFloat(quotation.total_amount),
        total_paid: new_total,
        remaining_balance: remaining_balance,
        percent_paid: ((new_total / quotation.total_amount) * 100).toFixed(2)
      }
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error while recording payment:', rollbackError);
    }
    console.error('Error recording payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record payment',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get all payments for a quotation
 * GET /api/quotations/:quote_id/payments
 */
const getPaymentsByQuote = async (req, res) => {
  try {
    const { quote_id } = req.params;

    // Validate quote_id format
    if (!quote_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quote_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid quote ID format'
      });
    }

    // Verify quotation exists
    const quoteCheck = await db.query(`
      SELECT total_amount FROM quotations WHERE quote_id = $1
    `, [quote_id]);

    if (quoteCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Quotation not found'
      });
    }

    const total_amount = parseFloat(quoteCheck.rows[0].total_amount);

    // Get all payments for this quote
    const paymentsResult = await db.query(`
      SELECT 
        payment_id,
        amount_received,
        payment_method,
        bank_account_id,
        cheque_number,
        reference_number,
        slip_url,
        status,
        payment_date,
        verified_at,
        verified_by,
        notes
      FROM payment_tracking
      WHERE quote_id = $1
      ORDER BY payment_date DESC
    `, [quote_id]);

    const payments = [];
    let total_paid = 0;

    for (const payment of paymentsResult.rows) {
      const amount = parseFloat(payment.amount_received);
      total_paid += amount;

      let bank_account = null;
      if (payment.bank_account_id) {
        const bankResult = await db.query(`
          SELECT account_id, account_nickname, account_number, bank_name
          FROM bank_accounts
          WHERE account_id = $1
        `, [payment.bank_account_id]);

        if (bankResult.rows.length > 0) {
          bank_account = bankResult.rows[0];
        }
      }

      payments.push({
        payment_id: payment.payment_id,
        amount: amount,
        payment_method: payment.payment_method,
        bank_account: bank_account,
        cheque_number: payment.cheque_number,
        reference_number: payment.reference_number,
        slip_url: payment.slip_url,
        status: payment.status,
        payment_date: payment.payment_date,
        verified_at: payment.verified_at,
        verified_by: payment.verified_by,
        notes: payment.notes
      });
    }

    const remaining_amount = total_amount - total_paid;

    res.status(200).json({
      status: 'success',
      message: 'Payments retrieved successfully',
      quote_id: quote_id,
      total_amount: total_amount,
      total_paid: total_paid,
      remaining_amount: remaining_amount,
      percent_paid: ((total_paid / total_amount) * 100).toFixed(2),
      payment_count: payments.length,
      payments: payments
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
};

/**
 * Get payment progress for a quotation
 * GET /api/quotations/:quote_id/payment-progress
 */
const getPaymentProgress = async (req, res) => {
  try {
    const { quote_id } = req.params;

    // Validate quote_id format
    if (!quote_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quote_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid quote ID format'
      });
    }

    // Get quotation details
    const quoteCheck = await db.query(`
      SELECT 
        quote_id,
        estimate_number,
        total_amount
      FROM quotations
      WHERE quote_id = $1
    `, [quote_id]);

    if (quoteCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Quotation not found'
      });
    }

    const quotation = quoteCheck.rows[0];
    const total_amount = parseFloat(quotation.total_amount);

    // Get payment summary
    const paymentSummary = await db.query(`
      SELECT 
        COUNT(*) as payment_count,
        COALESCE(SUM(amount_received), 0) as total_paid
      FROM payment_tracking
      WHERE quote_id = $1 AND status = 'VERIFIED'
    `, [quote_id]);

    const total_paid = parseFloat(paymentSummary.rows[0].total_paid);
    const remaining_amount = total_amount - total_paid;

    // Get recent payments
    const recentPayments = await db.query(`
      SELECT 
        payment_id,
        amount_received,
        payment_date,
        status
      FROM payment_tracking
      WHERE quote_id = $1
      ORDER BY payment_date DESC
      LIMIT 5
    `, [quote_id]);

    const payments = recentPayments.rows.map(p => ({
      payment_id: p.payment_id,
      amount: parseFloat(p.amount_received),
      date: p.payment_date,
      status: p.status
    }));

    // Determine if staff can be assigned
    // Staff can be assigned once at least some payment is received
    const can_assign_staff = total_paid > 0;

    res.status(200).json({
      status: 'success',
      message: 'Payment progress retrieved successfully',
      quote_id: quotation.quote_id,
      estimate_number: quotation.estimate_number,
      total_amount: total_amount,
      total_paid: total_paid,
      remaining_amount: remaining_amount,
      percent_paid: ((total_paid / total_amount) * 100).toFixed(2),
      payment_count: parseInt(paymentSummary.rows[0].payment_count),
      can_assign_staff: can_assign_staff,
      recent_payments: payments
    });
  } catch (error) {
    console.error('Error fetching payment progress:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment progress',
      error: error.message
    });
  }
};

/**
 * Get invoice progress for a booking
 * GET /api/bookings/:booking_id/invoice-progress
 */
const getBookingInvoiceProgress = async (req, res) => {
  try {
    const { booking_id } = req.params;

    if (!booking_id || !uuidRegex.test(booking_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid booking ID format'
      });
    }

    const bookingCheck = await db.query(`
      SELECT 
        booking_id,
        status,
        amount_paid,
        amount_quotated,
        client_id
      FROM bookings
      WHERE booking_id = $1
    `, [booking_id]);

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookingCheck.rows[0];

    const invoiceSummary = await db.query(`
      SELECT 
        COUNT(*) as invoice_count,
        COALESCE(SUM(amount), 0) as total_invoiced
      FROM transactions
      WHERE booking_id = $1
        AND category = 'SERVICE_INVOICE'
        AND transaction_type = 'DEBIT'
        AND status = 'COMPLETED'
    `, [booking_id]);

    const totalPaid = parseFloat(booking.amount_paid || 0);
    const totalInvoiced = parseFloat(invoiceSummary.rows[0].total_invoiced);
    const amountRemainingToInvoice = Math.max(totalPaid - totalInvoiced, 0);
    const percentCharged = totalPaid > 0
      ? ((totalInvoiced / totalPaid) * 100).toFixed(2)
      : '0.00';

    return res.status(200).json({
      status: 'success',
      message: 'Booking invoice progress retrieved successfully',
      data: {
        booking_id: booking.booking_id,
        booking_status: booking.status,
        amount_paid: totalPaid,
        amount_invoiced: totalInvoiced,
        amount_remaining_to_invoice: amountRemainingToInvoice,
        percent_charged: percentCharged,
        invoice_count: parseInt(invoiceSummary.rows[0].invoice_count, 10),
        can_invoice_more: amountRemainingToInvoice > 0
      }
    });
  } catch (error) {
    console.error('Error fetching booking invoice progress:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch booking invoice progress',
      error: error.message
    });
  }
};

/**
 * Verify/approve a payment
 * POST /api/payments/:payment_id/verify
 */
const verifyPayment = async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { verification_notes } = req.body;

    // Validate payment_id format
    if (!payment_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payment_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment ID format'
      });
    }

    // Get current payment
    const paymentCheck = await db.query(`
      SELECT 
        payment_id,
        quote_id,
        status,
        amount_received
      FROM payment_tracking
      WHERE payment_id = $1
    `, [payment_id]);

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    const payment = paymentCheck.rows[0];

    if (payment.status === 'VERIFIED') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment is already verified'
      });
    }

    const verified_by = req.user?.user_id || null;

    // Update payment status
    const result = await db.query(`
      UPDATE payment_tracking
      SET 
        status = 'VERIFIED',
        verified_at = NOW(),
        verified_by = $1,
        notes = CASE WHEN $2 IS NOT NULL THEN notes || E'\n' || $2 ELSE notes END
      WHERE payment_id = $3
      RETURNING 
        payment_id,
        status,
        verified_at
    `, [verified_by, verification_notes || null, payment_id]);

    // Recalculate and update booking payment status
    await db.query(`
      UPDATE bookings
      SET 
        amount_paid = (
          SELECT COALESCE(SUM(amount_received), 0)
          FROM payment_tracking
          WHERE quote_id = $1 AND status = 'VERIFIED'
        )
      WHERE request_id = (SELECT request_id FROM quotations WHERE quote_id = $1)
    `, [payment.quote_id]);

    res.status(200).json({
      status: 'success',
      message: 'Payment verified successfully',
      data: {
        payment_id: result.rows[0].payment_id,
        status: result.rows[0].status,
        verified_at: result.rows[0].verified_at
      }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

/**
 * Reject a payment
 * POST /api/payments/:payment_id/reject
 */
const rejectPayment = async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { rejection_reason } = req.body;

    // Validate payment_id format
    if (!payment_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payment_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment ID format'
      });
    }

    if (!rejection_reason) {
      return res.status(400).json({
        status: 'error',
        message: 'rejection_reason is required'
      });
    }

    // Get current payment
    const paymentCheck = await db.query(`
      SELECT 
        payment_id,
        quote_id,
        status
      FROM payment_tracking
      WHERE payment_id = $1
    `, [payment_id]);

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    const payment = paymentCheck.rows[0];

    if (payment.status === 'REJECTED') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment is already rejected'
      });
    }

    // Update payment status
    const result = await db.query(`
      UPDATE payment_tracking
      SET 
        status = 'REJECTED',
        notes = $1
      WHERE payment_id = $2
      RETURNING 
        payment_id,
        status
    `, [rejection_reason, payment_id]);

    res.status(200).json({
      status: 'success',
      message: 'Payment rejected successfully',
      data: {
        payment_id: result.rows[0].payment_id,
        status: result.rows[0].status,
        rejection_reason: rejection_reason
      }
    });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reject payment',
      error: error.message
    });
  }
};

module.exports = {
  recordPayment,
  getPaymentsByQuote,
  getPaymentProgress,
  getBookingInvoiceProgress,
  verifyPayment,
  rejectPayment
};
