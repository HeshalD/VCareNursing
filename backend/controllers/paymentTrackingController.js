const db = require('../config/db');
const bcrypt = require('bcrypt');
const { logActivity } = require('../utils/activityLogger');
const { createPaymentReceipt } = require('../services/receiptService');
const { sendSms } = require('../utils/sms');
const { sendClientWelcomeNew } = require('../utils/metaWhatsapp');
const { ensureCombinedInvoice, ensureRegFeeInvoiceRecord } = require('./quoteController');
const { applyInvoicePayment } = require('./invoiceController');
const { creditSalespersonForRegistration } = require('../services/clientSalespersonService');
const { computeRegFeeSplit, settleRegistrationFee } = require('../services/registrationFeeSplit');
const { resolveBankAccountId } = require('../utils/pettyCash');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

async function safeLog(params) {
  try {
    await logActivity(params);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

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
      client_profile_created: false,
      temp_password: null,
      payer_mobile: serviceRequest.payer_mobile,
      payer_name: serviceRequest.payer_name
    };
  }

  if (!serviceRequest.payer_mobile) {
    throw new Error('Service request is missing payer mobile number');
  }

  const payerName = serviceRequest.payer_name || 'New Client';
  const payerAddress = serviceRequest.location_address || null;

  let userId = null;
  // Only set when THIS call creates a brand-new login account — used to send the
  // welcome message with credentials after the transaction commits.
  let tempPassword = null;
  const userCheck = await client.query(
    `SELECT user_id FROM users WHERE mobile_number = $1`,
    [serviceRequest.payer_mobile]
  );

  if (userCheck.rows.length > 0) {
    // Existing user (matched by mobile) — reuse it, never create a duplicate account.
    userId = userCheck.rows[0].user_id;
  } else {
    tempPassword = Math.random().toString(36).slice(-8);
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
    client_profile_created: clientProfileCreated,
    temp_password: tempPassword,
    payer_mobile: serviceRequest.payer_mobile,
    payer_name: payerName
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
    const uploadedSlipUrl = req.file?.location || null;
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
        booking_id,
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
    const transactionCategory = quotation.booking_id ? 'BOOKING_PAYMENT' : 'CLIENT_PAYMENT';

    // CASH payments have no client-supplied bank account — route them to Petty Cash instead.
    const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);

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
      resolvedBankAccountId,
      cheque_number || null,
      cheque_date || null,
      reference_number || null,
      paymentSlipUrl,
      'VERIFIED',
      verified_by,
      notes || null
    ]);

    const payment = paymentResult.rows[0];

    let mirroredBookingPayment = null;
    if (quotation.booking_id) {
      const mirroredResult = await client.query(
        `INSERT INTO booking_payment_tracking (
           payment_tracking_id,
           booking_id,
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
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'VERIFIED', $12, $13, $14, $15)
         ON CONFLICT (payment_tracking_id) DO UPDATE SET
           booking_id = EXCLUDED.booking_id,
           quote_id = EXCLUDED.quote_id,
           client_id = EXCLUDED.client_id,
           amount_received = EXCLUDED.amount_received,
           payment_method = EXCLUDED.payment_method,
           bank_account_id = EXCLUDED.bank_account_id,
           cheque_number = EXCLUDED.cheque_number,
           cheque_date = EXCLUDED.cheque_date,
           reference_number = EXCLUDED.reference_number,
           slip_url = EXCLUDED.slip_url,
           status = EXCLUDED.status,
           verified_by = EXCLUDED.verified_by,
           notes = EXCLUDED.notes,
           payment_date = EXCLUDED.payment_date,
           verified_at = EXCLUDED.verified_at
         RETURNING booking_payment_id, booking_id, quote_id, amount_received, payment_method, reference_number, status, payment_date, verified_at`,
        [
          payment.payment_id,
          quotation.booking_id,
          quote_id,
          client_id,
          amount_received,
          payment_method,
          resolvedBankAccountId,
          cheque_number || null,
          cheque_date || null,
          reference_number || null,
          paymentSlipUrl,
          verified_by,
          notes || null,
          payment.payment_date,
          payment.verified_at
        ]
      );

      mirroredBookingPayment = mirroredResult.rows[0];

      await client.query(
        `UPDATE bookings
         SET
           amount_paid = (
             SELECT COALESCE(SUM(amount_received), 0)
             FROM booking_payment_tracking
             WHERE booking_id = $1 AND status = 'VERIFIED'
           ),
           last_payment_date = (
             SELECT MAX(COALESCE(verified_at, payment_date))
             FROM booking_payment_tracking
             WHERE booking_id = $1 AND status = 'VERIFIED'
           ),
           amount_quotated = $2
         WHERE booking_id = $1`,
        [quotation.booking_id, quotation.total_amount]
      );
    }

    // Keep legacy quote-linked bookings in sync only when the booking ledger does not exist yet.
    if (!quotation.booking_id) {
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
    }

    // Split off any portion of this payment that crosses the registration-fee
    // threshold into its own REGISTRATION_FEE transaction (see
    // services/registrationFeeSplit.js) — computed BEFORE this payment is
    // recorded anywhere, since it needs the totals as they stood immediately
    // prior. total_paid_so_far above is exactly that.
    const regFeeSplit = await computeRegFeeSplit(client, {
      client_id,
      quote_id,
      amount: parseFloat(amount_received),
      totalPaidBefore: total_paid_so_far,
    });

    if (regFeeSplit.regFeePortion > 0) {
      await client.query(`
        INSERT INTO transactions (
          payment_tracking_id, booking_id, quote_id, client_id, category, amount,
          payment_method, bank_account_id, cheque_number, cheque_date, reference_number,
          receipt_url, verified_by, status, notes, transaction_type, created_at
        ) VALUES ($1, $2, $3, $4, 'REGISTRATION_FEE', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'CREDIT', NOW())
        ON CONFLICT (payment_tracking_id) WHERE category = 'REGISTRATION_FEE' DO UPDATE SET
          booking_id = EXCLUDED.booking_id,
          quote_id = EXCLUDED.quote_id,
          client_id = EXCLUDED.client_id,
          amount = EXCLUDED.amount,
          payment_method = EXCLUDED.payment_method,
          bank_account_id = EXCLUDED.bank_account_id,
          cheque_number = EXCLUDED.cheque_number,
          cheque_date = EXCLUDED.cheque_date,
          receipt_url = EXCLUDED.receipt_url,
          reference_number = EXCLUDED.reference_number,
          verified_by = EXCLUDED.verified_by,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes
        `, [
        payment.payment_id,
        quotation.booking_id || null,
        quote_id,
        client_id,
        regFeeSplit.regFeePortion,
        payment_method,
        resolvedBankAccountId,
        cheque_number || null,
        cheque_date || null,
        reference_number || null,
        paymentSlipUrl,
        verified_by,
        'COMPLETED',
        notes || null,
      ]);
    }

    // Create transaction record for the remainder (or the whole amount, if no reg-fee split applied)
    if (regFeeSplit.remainderAmount > 0) {
      await client.query(`
        INSERT INTO transactions (
          payment_tracking_id,
          booking_id,
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        ON CONFLICT (payment_tracking_id) WHERE category != 'REGISTRATION_FEE' DO UPDATE SET
          booking_id = EXCLUDED.booking_id,
          quote_id = EXCLUDED.quote_id,
          client_id = EXCLUDED.client_id,
          category = EXCLUDED.category,
          amount = EXCLUDED.amount,
          payment_method = EXCLUDED.payment_method,
          bank_account_id = EXCLUDED.bank_account_id,
          cheque_number = EXCLUDED.cheque_number,
          cheque_date = EXCLUDED.cheque_date,
          receipt_url = EXCLUDED.receipt_url,
          reference_number = EXCLUDED.reference_number,
          verified_by = EXCLUDED.verified_by,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          transaction_type = EXCLUDED.transaction_type
        `, [
        payment.payment_id,
        quotation.booking_id || null,
        quote_id,
        client_id,
        transactionCategory,
        regFeeSplit.remainderAmount,
        payment_method,
        resolvedBankAccountId,
        cheque_number || null,
        cheque_date || null,
        reference_number || null,
        paymentSlipUrl,
        verified_by,
        'COMPLETED',
        notes || null,
        'CREDIT'
      ]);
    }

    // Fetch bank account details (client-supplied, or the Petty Cash account for CASH)
    let bank_account = null;
    if (resolvedBankAccountId) {
      const bankResult = await client.query(`
        SELECT account_id, account_nickname, account_number, bank_name
        FROM bank_accounts
        WHERE account_id = $1
      `, [resolvedBankAccountId]);

      if (bankResult.rows.length > 0) {
        bank_account = bankResult.rows[0];
      }
    }

    const remaining_balance = quotation.total_amount - new_total;

    // Registration fee as a quote line item (see ModularQuoteBuilder's "Add
    // Registration Fee") is treated as the first "bucket" any payment on this
    // quote fills — once cumulative verified payments reach that item's own
    // amount, the client's registration is considered settled even if the
    // rest of the quote (service charges) isn't fully paid yet. Idempotent:
    // only fires while reg_fee_status isn't already PAID/WAIVED. Reuses the
    // regFeeItem already looked up by computeRegFeeSplit above rather than
    // querying quote_line_items again.
    let registrationFeeSettled = false;
    try {
      if (regFeeSplit.regFeeItem && new_total >= parseFloat(regFeeSplit.regFeeItem.amount)) {
        registrationFeeSettled = await settleRegistrationFee(client, {
          client_id,
          regFeeItem: regFeeSplit.regFeeItem,
          verified_by,
          creditSalespersonForRegistration,
        });
      }
    } catch (regFeeErr) {
      console.error('Registration fee settlement check failed (recordPayment):', regFeeErr.message);
    }

    await client.query('COMMIT');

    // Welcome a brand-new client: when recording this payment created their login
    // account, send their login id (mobile number) and temporary password so they can
    // sign in and set their own password. Mirrors the booking-conversion onboarding.
    // Only fires when a fresh user account was created here (temp_password is set), so
    // existing customers are never re-notified and no duplicate account is implied.
    if (clientBootstrap.temp_password) {
      const welcomeSms = `Welcome to VCare Nursing, ${clientBootstrap.payer_name}! An account has been created for you. Log in at https://vcarenursing.com/login\n\nUsername (mobile): ${clientBootstrap.payer_mobile}\nTemporary password: ${clientBootstrap.temp_password}\n\nYou'll be asked to set your own password on first login. - VCare Nursing`;

      Promise.allSettled([
        sendSms(clientBootstrap.payer_mobile, welcomeSms),
        sendClientWelcomeNew(clientBootstrap.payer_mobile, clientBootstrap.payer_name)
      ]).then(([smsResult, waResult]) => {
        if (smsResult.status === 'rejected') console.error('Client welcome SMS failed:', smsResult.reason?.message);
        if (waResult.status === 'rejected') console.error('Client welcome WhatsApp failed:', waResult.reason?.message);
      });
    }

    // Generate a payment receipt (PDF stored on Cloudinary + tracked in DB).
    // Delivery to the client over WhatsApp is a separate, admin-triggered action.
    ;(async () => {
      try {
        let lineItem;
        if (quotation.booking_id) {
          const info = await db.query(
            `SELECT b.booking_code, b.service_type, pp.full_name AS patient_name
             FROM bookings b
             LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
             WHERE b.booking_id = $1`,
            [quotation.booking_id]
          );
          const row = info.rows[0] || {};
          const descParts = [];
          if (row.patient_name) descParts.push(`Patient: ${row.patient_name}`);
          if (row.service_type) descParts.push(String(row.service_type).replace(/_/g, ' '));
          lineItem = {
            label: `Booking ${row.booking_code || ''}`.trim(),
            description: descParts.join(' · '),
            amount: parseFloat(amount_received),
          };
        } else {
          const estRes = await db.query('SELECT estimate_number FROM quotations WHERE quote_id = $1', [quote_id]);
          const est = estRes.rows[0]?.estimate_number;
          lineItem = {
            label: est ? `Quotation ${est}` : 'Quotation Payment',
            description: 'Payment against quotation',
            amount: parseFloat(amount_received),
          };
        }

        await createPaymentReceipt({
          client_id,
          source_type: 'QUOTE_PAYMENT',
          source_id: payment.payment_id,
          total_amount: parseFloat(amount_received),
          payment_method,
          reference_number: reference_number || null,
          cheque_number: cheque_number || null,
          bank_account_id: resolvedBankAccountId,
          payment_date: payment.payment_date || new Date(),
          line_items: [lineItem],
          generated_by: verified_by,
        });
      } catch (e) {
        console.error('[Receipt] Generation error (recordPayment):', e.message);
      }
    })();

    // Generate the combined Invoice PDF (this quote + its linked PRODUCT
    // quote, if any) the first time any payment lands against it — no-op if
    // one already exists. Delivery alongside the receipt is a separate,
    // admin-triggered action (see receiptController.sendReceiptWhatsApp).
    ensureCombinedInvoice(quote_id).catch((e) =>
      console.error('[Invoice] Generation error (recordPayment):', e.message)
    );

    // The registration fee gets its own standalone invoice as soon as
    // cumulative payments cover it — independent of the combined Invoice
    // above, which may still be waiting on the rest of the quote.
    if (regFeeSplit.regFeeItem && new_total >= parseFloat(regFeeSplit.regFeeItem.amount)) {
      ensureRegFeeInvoiceRecord(quote_id, {
        clientId: client_id,
        registrationFee: regFeeSplit.regFeeItem.amount,
        payerName: clientBootstrap.payer_name,
      }).catch((e) =>
        console.error('[Invoice] Reg fee invoice generation error (recordPayment):', e.message)
      );
    }

    await safeLog({
      actorUserId: req.user?.user_id,
      actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
      actorRole: extractActorRole(req.user?.role),
      actionType: 'QUOTE_PAYMENT_RECORDED',
      entityType: 'QUOTATION',
      entityId: quote_id,
      details: {
        quote_id,
        payment_id: payment.payment_id,
        amount_received: parseFloat(amount_received),
        payment_method,
        reference_number: reference_number || null,
        total_paid: new_total,
        remaining_balance,
        percent_paid: ((new_total / quotation.total_amount) * 100).toFixed(2),
        has_slip: !!paymentSlipUrl,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Payment recorded successfully',
      data: {
        payment_id: payment.payment_id,
        quote_id: payment.quote_id,
          booking_payment_id: mirroredBookingPayment?.booking_payment_id || null,
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
      },
      registration_fee_settled: registrationFeeSettled
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
 * Record a single payment and split it across up to three admin-chosen
 * buckets in one action: Registration Fee, (remaining) Service Charges, and
 * Products & Rentals — replacing the old flow where an admin had to record
 * the service portion and the product portion as two separate payments.
 * Registration fee is a hard-gated priority bucket: until it's fully covered
 * by this payment's own allocation (or was already settled by an earlier
 * payment), the other two buckets must be 0 — same waterfall order
 * recordPayment above enforces implicitly, just made explicit and
 * admin-chosen instead of auto-computed.
 *
 * The service+reg-fee portion still lands in payment_tracking (one row for
 * whatever their combined allocation is); the products portion is applied
 * against the linked PRODUCT quote's own `invoices` row(s) via
 * invoiceController.applyInvoicePayment, which now supports partial
 * instalments — so a product/rental bucket no longer has to be paid in full
 * in the same action.
 *
 * POST /api/quotes/:quote_id/record-payment-allocated
 */
const recordAllocatedPayment = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { quote_id } = req.params;
    const uploadedSlipUrl = req.file?.location || null;
    const {
      amount_received,
      allocations,
      payment_method,
      bank_account_id,
      cheque_number,
      cheque_date,
      reference_number,
      slip_url,
      notes
    } = req.body;
    const paymentSlipUrl = uploadedSlipUrl || slip_url || null;

    let parsedAllocations;
    try {
      parsedAllocations = typeof allocations === 'string' ? JSON.parse(allocations) : (allocations || {});
    } catch {
      return res.status(400).json({ status: 'error', message: 'allocations must be valid JSON' });
    }
    const regFeeAlloc = parseFloat(parsedAllocations.reg_fee) || 0;
    const serviceAlloc = parseFloat(parsedAllocations.service) || 0;
    const productsAlloc = parseFloat(parsedAllocations.products) || 0;
    const totalAlloc = regFeeAlloc + serviceAlloc + productsAlloc;

    // A client can legitimately pay more than what's due on this quotation.
    // Whatever's left over after the three buckets above are maxed out isn't
    // rejected — it's routed to an admin-chosen destination instead (see
    // `overflow` handling near the end of this function): credited to the
    // client's wallet, or applied to an overdue booking's balance.
    let overflow;
    try {
      overflow = req.body.overflow
        ? (typeof req.body.overflow === 'string' ? JSON.parse(req.body.overflow) : req.body.overflow)
        : null;
    } catch {
      return res.status(400).json({ status: 'error', message: 'overflow must be valid JSON' });
    }

    await client.query('BEGIN');

    if (!quote_id || !uuidRegex.test(quote_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Invalid quote ID format' });
    }

    if (!amount_received || amount_received <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'amount_received is required and must be greater than 0' });
    }

    if (regFeeAlloc < 0 || serviceAlloc < 0 || productsAlloc < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Allocations cannot be negative' });
    }

    const overflowAmount = Math.round((parseFloat(amount_received) - totalAlloc) * 100) / 100;

    if (overflowAmount < -0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Allocations cannot exceed the amount received' });
    }

    if (overflowAmount > 0.01) {
      if (!overflow || !['WALLET', 'BOOKING_PAYOFF'].includes(overflow.type)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: `Payment exceeds what's due on this quotation by ${overflowAmount.toFixed(2)} — specify overflow.type ('WALLET' or 'BOOKING_PAYOFF') to say what to do with the extra`,
        });
      }
      if (overflow.type === 'BOOKING_PAYOFF' && !overflow.booking_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'overflow.booking_id is required for BOOKING_PAYOFF' });
      }
    }

    if (!payment_method) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'payment_method is required (BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE)' });
    }
    const validMethods = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];
    if (!validMethods.includes(payment_method)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Invalid payment_method. Must be one of: ${validMethods.join(', ')}` });
    }
    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bank_account_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `bank_account_id is required for ${payment_method}` });
    }
    if (payment_method === 'CHEQUE' && (!cheque_number || !cheque_date)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'cheque_number and cheque_date are required for CHEQUE payments' });
    }
    if (bank_account_id) {
      const bankCheck = await client.query(`SELECT account_id, is_active FROM bank_accounts WHERE account_id = $1`, [bank_account_id]);
      if (bankCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Bank account not found' });
      }
      if (!bankCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'Bank account is not active' });
      }
    }

    const quoteCheck = await client.query(`
      SELECT q.quote_id, q.booking_id, q.total_amount, q.request_id, q.status,
             pq.quote_id as product_quote_id
      FROM quotations q
      LEFT JOIN quotations pq ON pq.linked_quote_id = q.quote_id AND pq.quote_type = 'PRODUCT'
      WHERE q.quote_id = $1
    `, [quote_id]);

    if (quoteCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }

    const quotation = quoteCheck.rows[0];
    const transactionCategory = quotation.booking_id ? 'BOOKING_PAYMENT' : 'CLIENT_PAYMENT';

    // CASH payments have no client-supplied bank account — route them to Petty Cash instead.
    const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);

    const clientBootstrap = await getOrCreateClientProfileForQuotation(client, quotation);
    const client_id = clientBootstrap.client_id;

    const paidCheck = await client.query(`
      SELECT COALESCE(SUM(amount_received), 0) as total_paid
      FROM payment_tracking
      WHERE quote_id = $1 AND status = 'VERIFIED'
    `, [quote_id]);
    const total_paid_so_far = parseFloat(paidCheck.rows[0].total_paid);

    const regFeeItemRes = await client.query(
      `SELECT line_item_id, amount, salesperson_id FROM quote_line_items WHERE quote_id = $1 AND is_registration_fee = true LIMIT 1`,
      [quote_id]
    );
    const regFeeItem = regFeeItemRes.rows[0] || null;
    const regFeeAmount = regFeeItem ? parseFloat(regFeeItem.amount) : 0;
    const regFeeRemaining = regFeeItem ? Math.max(regFeeAmount - total_paid_so_far, 0) : 0;
    const serviceTotalRemaining = Math.max(parseFloat(quotation.total_amount) - total_paid_so_far, 0);
    const serviceOnlyRemaining = Math.max(serviceTotalRemaining - regFeeRemaining, 0);

    if (regFeeAlloc > regFeeRemaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Registration fee allocation (${regFeeAlloc}) exceeds remaining amount (${regFeeRemaining})` });
    }
    if (serviceAlloc > serviceOnlyRemaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Service charges allocation (${serviceAlloc}) exceeds remaining amount (${serviceOnlyRemaining})` });
    }
    if (regFeeRemaining - regFeeAlloc > 0.01 && (serviceAlloc > 0 || productsAlloc > 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Registration fee must be fully covered before allocating this payment to other charges' });
    }

    // Product/rental bucket — applied against the linked PRODUCT quote's own
    // unpaid invoices (oldest first), each of which can now absorb a partial
    // instalment via invoiceController.applyInvoicePayment.
    let productInvoices = [];
    let productsRemaining = 0;
    if (quotation.product_quote_id) {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE quote_id = $1 AND status != 'PAID' ORDER BY created_at ASC FOR UPDATE`,
        [quotation.product_quote_id]
      );
      for (const inv of invRes.rows) {
        const paidRes = await client.query(`SELECT COALESCE(SUM(amount), 0) as paid FROM invoice_payments WHERE invoice_id = $1`, [inv.invoice_id]);
        inv.__paidSoFar = parseFloat(paidRes.rows[0].paid || 0);
        productsRemaining += parseFloat(inv.amount) - inv.__paidSoFar;
      }
      productInvoices = invRes.rows;
    }
    if (productsAlloc > productsRemaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Products & rentals allocation (${productsAlloc}) exceeds remaining amount (${productsRemaining})` });
    }
    if (productsAlloc > 0 && productInvoices.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'No unpaid products/rentals invoice found for this quote — accept the linked product quote first' });
    }

    const verified_by = req.user?.user_id || null;
    const receiptLineItems = [];
    let payment = null;
    let mirroredBookingPayment = null;
    let registrationFeeSettled = false;

    // ── Registration fee + service charges bucket ──────────────────────────
    const svcAmount = regFeeAlloc + serviceAlloc;
    if (svcAmount > 0) {
      const paymentResult = await client.query(`
        INSERT INTO payment_tracking (
          quote_id, client_id, amount_received, payment_method, bank_account_id,
          cheque_number, cheque_date, reference_number, slip_url, status,
          verified_by, notes, payment_date, verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'VERIFIED', $10, $11, NOW(), NOW())
        RETURNING payment_id, quote_id, amount_received, payment_method, reference_number, status, payment_date, verified_at
      `, [
        quote_id, client_id, svcAmount, payment_method, resolvedBankAccountId,
        cheque_number || null, cheque_date || null, reference_number || null,
        paymentSlipUrl, verified_by, notes || null
      ]);
      payment = paymentResult.rows[0];

      if (quotation.booking_id) {
        const mirroredResult = await client.query(
          `INSERT INTO booking_payment_tracking (
             payment_tracking_id, booking_id, quote_id, client_id, amount_received,
             payment_method, bank_account_id, cheque_number, cheque_date, reference_number,
             slip_url, status, verified_by, notes, payment_date, verified_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'VERIFIED', $12, $13, $14, $15)
           RETURNING booking_payment_id, booking_id, quote_id, amount_received, payment_method, reference_number, status, payment_date, verified_at`,
          [
            payment.payment_id, quotation.booking_id, quote_id, client_id, svcAmount,
            payment_method, resolvedBankAccountId, cheque_number || null, cheque_date || null,
            reference_number || null, paymentSlipUrl, verified_by, notes || null,
            payment.payment_date, payment.verified_at
          ]
        );
        mirroredBookingPayment = mirroredResult.rows[0];

        await client.query(
          `UPDATE bookings
           SET amount_paid = (SELECT COALESCE(SUM(amount_received), 0) FROM booking_payment_tracking WHERE booking_id = $1 AND status = 'VERIFIED'),
               last_payment_date = (SELECT MAX(COALESCE(verified_at, payment_date)) FROM booking_payment_tracking WHERE booking_id = $1 AND status = 'VERIFIED'),
               amount_quotated = $2
           WHERE booking_id = $1`,
          [quotation.booking_id, quotation.total_amount]
        );
      } else {
        await client.query(`
          UPDATE bookings
          SET amount_paid = (SELECT COALESCE(SUM(amount_received), 0) FROM payment_tracking WHERE quote_id = $1 AND status = 'VERIFIED'),
              amount_quotated = $2,
              last_payment_date = NOW()
          WHERE request_id = (SELECT request_id FROM quotations WHERE quote_id = $1)
        `, [quote_id, quotation.total_amount]);
      }

      if (regFeeAlloc > 0) {
        await client.query(`
          INSERT INTO transactions (
            payment_tracking_id, booking_id, quote_id, client_id, category, amount,
            payment_method, bank_account_id, cheque_number, cheque_date, reference_number,
            receipt_url, verified_by, status, notes, transaction_type, created_at
          ) VALUES ($1, $2, $3, $4, 'REGISTRATION_FEE', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'CREDIT', NOW())
        `, [
          payment.payment_id, quotation.booking_id || null, quote_id, client_id, regFeeAlloc,
          payment_method, resolvedBankAccountId, cheque_number || null, cheque_date || null,
          reference_number || null, paymentSlipUrl, verified_by, 'COMPLETED', notes || null,
        ]);
        receiptLineItems.push({ label: 'Registration Fee', description: 'Payment toward registration fee', amount: regFeeAlloc });
      }

      if (serviceAlloc > 0) {
        await client.query(`
          INSERT INTO transactions (
            payment_tracking_id, booking_id, quote_id, client_id, category, amount,
            payment_method, bank_account_id, cheque_number, cheque_date, reference_number,
            receipt_url, verified_by, status, notes, transaction_type, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'CREDIT', NOW())
        `, [
          payment.payment_id, quotation.booking_id || null, quote_id, client_id, transactionCategory, serviceAlloc,
          payment_method, resolvedBankAccountId, cheque_number || null, cheque_date || null,
          reference_number || null, paymentSlipUrl, verified_by, 'COMPLETED', notes || null,
        ]);
        receiptLineItems.push({ label: 'Service Charges', description: 'Payment toward service charges', amount: serviceAlloc });
      }

      const new_total = total_paid_so_far + svcAmount;
      if (regFeeItem && new_total >= regFeeAmount) {
        try {
          registrationFeeSettled = await settleRegistrationFee(client, {
            client_id, regFeeItem, verified_by, creditSalespersonForRegistration,
          });
        } catch (regFeeErr) {
          console.error('Registration fee settlement check failed (recordAllocatedPayment):', regFeeErr.message);
        }
      }
    }

    // ── Products & rentals bucket ───────────────────────────────────────────
    const productPaymentResults = [];
    if (productsAlloc > 0) {
      let remainingToApply = productsAlloc;
      for (const inv of productInvoices) {
        if (remainingToApply <= 0.005) break;
        const invRemaining = parseFloat(inv.amount) - inv.__paidSoFar;
        const applyAmt = Math.min(invRemaining, remainingToApply);
        if (applyAmt <= 0.005) continue;

        const result = await applyInvoicePayment(client, {
          invoice: inv,
          amount: applyAmt,
          payment_method,
          bank_account_id,
          cheque_number,
          cheque_date,
          reference_number,
          slip_url: paymentSlipUrl,
          notes,
          actorUserId: verified_by,
        });
        productPaymentResults.push({ invoice_id: inv.invoice_id, invoice_code: inv.invoice_code, amount: applyAmt, newlyFullyPaid: result.newlyFullyPaid });
        receiptLineItems.push({ label: 'Products & Rentals', description: inv.invoice_code, amount: applyAmt });
        remainingToApply -= applyAmt;
      }
    }

    // ── Overflow — whatever's left once this quotation's own dues are fully
    // covered, routed to wherever the admin chose. ──────────────────────────
    let overflowResult = null;
    if (overflowAmount > 0.01) {
      if (overflow.type === 'WALLET') {
        await client.query(
          `UPDATE client_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE client_profile_id = $2`,
          [overflowAmount, client_id]
        );
        await client.query(
          `INSERT INTO transactions (
             client_id, quote_id, category, transaction_type, amount, payment_method,
             bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
             notes, status, verified_by
           ) VALUES ($1, $2, 'WALLET_TOPUP', 'CREDIT', $3, $4, $5, $6, $7, $8, $9, $10, 'COMPLETED', $11)`,
          [
            client_id, quote_id, overflowAmount, payment_method, resolvedBankAccountId,
            cheque_number || null, cheque_date || null, reference_number || null,
            paymentSlipUrl, notes || 'Overpayment credited to wallet', verified_by,
          ]
        );
        receiptLineItems.push({ label: 'Wallet Top-up', description: 'Overpayment credited to client wallet', amount: overflowAmount });
        overflowResult = { type: 'WALLET', amount: overflowAmount };
      } else if (overflow.type === 'BOOKING_PAYOFF') {
        const bookingCheck = await client.query(
          `SELECT booking_id, booking_code, client_id, status, amount_paid FROM bookings WHERE booking_id = $1 FOR UPDATE`,
          [overflow.booking_id]
        );
        if (bookingCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ status: 'error', message: 'Overflow target booking not found' });
        }
        const targetBooking = bookingCheck.rows[0];
        if (targetBooking.client_id !== client_id) {
          await client.query('ROLLBACK');
          return res.status(403).json({ status: 'error', message: 'Overflow target booking does not belong to this client' });
        }
        if (!['ACTIVE', 'OVERDUE'].includes(targetBooking.status)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ status: 'error', message: `Overflow target booking must be ACTIVE or OVERDUE (current: ${targetBooking.status})` });
        }

        const invoicedRes = await client.query(
          `SELECT COALESCE(SUM(amount), 0) as total_invoiced FROM transactions
           WHERE booking_id = $1 AND transaction_type = 'DEBIT' AND status = 'COMPLETED'`,
          [targetBooking.booking_id]
        );
        const overdueAmount = Math.max(
          parseFloat(invoicedRes.rows[0].total_invoiced || 0) - parseFloat(targetBooking.amount_paid || 0), 0
        );
        if (overflowAmount > overdueAmount + 0.01) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            status: 'error',
            message: `Overflow amount (${overflowAmount.toFixed(2)}) exceeds this booking's overdue amount (${overdueAmount.toFixed(2)})`,
          });
        }

        await client.query(
          `INSERT INTO booking_payment_tracking (
             booking_id, client_id, amount_received, payment_method, bank_account_id,
             cheque_number, cheque_date, reference_number, slip_url, notes,
             status, verified_at, verified_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'VERIFIED',NOW(),$11)`,
          [
            targetBooking.booking_id, client_id, overflowAmount, payment_method, resolvedBankAccountId,
            cheque_number || null, cheque_date || null, reference_number || null,
            paymentSlipUrl, notes || `Overpayment applied to booking ${targetBooking.booking_code}`, verified_by,
          ]
        );
        await client.query(
          `UPDATE bookings SET amount_paid = COALESCE(amount_paid, 0) + $1, last_payment_date = NOW() WHERE booking_id = $2`,
          [overflowAmount, targetBooking.booking_id]
        );
        await client.query(
          `INSERT INTO transactions (
             client_id, booking_id, category, transaction_type, amount, payment_method,
             bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
             notes, status, verified_by
           ) VALUES ($1,$2,'BOOKING_PAYMENT','CREDIT',$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED',$11)`,
          [
            client_id, targetBooking.booking_id, overflowAmount, payment_method, resolvedBankAccountId,
            cheque_number || null, cheque_date || null, reference_number || null,
            paymentSlipUrl, notes || null, verified_by,
          ]
        );
        receiptLineItems.push({ label: 'Overdue Booking Payoff', description: targetBooking.booking_code, amount: overflowAmount });
        overflowResult = { type: 'BOOKING_PAYOFF', booking_id: targetBooking.booking_id, amount: overflowAmount };
      }
    }

    await client.query('COMMIT');

    if (clientBootstrap.temp_password) {
      const welcomeSms = `Welcome to VCare Nursing, ${clientBootstrap.payer_name}! An account has been created for you. Log in at https://vcarenursing.com/login\n\nUsername (mobile): ${clientBootstrap.payer_mobile}\nTemporary password: ${clientBootstrap.temp_password}\n\nYou'll be asked to set your own password on first login. - VCare Nursing`;
      Promise.allSettled([
        sendSms(clientBootstrap.payer_mobile, welcomeSms),
        sendClientWelcomeNew(clientBootstrap.payer_mobile, clientBootstrap.payer_name)
      ]).then(([smsResult, waResult]) => {
        if (smsResult.status === 'rejected') console.error('Client welcome SMS failed:', smsResult.reason?.message);
        if (waResult.status === 'rejected') console.error('Client welcome WhatsApp failed:', waResult.reason?.message);
      });
    }

    ;(async () => {
      try {
        const estRes = await db.query('SELECT estimate_number FROM quotations WHERE quote_id = $1', [quote_id]);
        const est = estRes.rows[0]?.estimate_number;
        await createPaymentReceipt({
          client_id,
          source_type: 'QUOTE_PAYMENT',
          source_id: payment?.payment_id || quote_id,
          total_amount: parseFloat(amount_received),
          payment_method,
          reference_number: reference_number || null,
          cheque_number: cheque_number || null,
          bank_account_id: resolvedBankAccountId,
          payment_date: payment?.payment_date || new Date(),
          line_items: receiptLineItems.length > 0
            ? receiptLineItems
            : [{ label: est ? `Quotation ${est}` : 'Quotation Payment', description: 'Payment against quotation', amount: parseFloat(amount_received) }],
          generated_by: verified_by,
        });
      } catch (e) {
        console.error('[Receipt] Generation error (recordAllocatedPayment):', e.message);
      }
    })();

    ensureCombinedInvoice(quote_id).catch((e) =>
      console.error('[Invoice] Generation error (recordAllocatedPayment):', e.message)
    );

    if (regFeeItem && (total_paid_so_far + svcAmount) >= regFeeAmount) {
      ensureRegFeeInvoiceRecord(quote_id, {
        clientId: client_id,
        registrationFee: regFeeAmount,
        payerName: clientBootstrap.payer_name,
      }).catch((e) =>
        console.error('[Invoice] Reg fee invoice generation error (recordAllocatedPayment):', e.message)
      );
    }

    await safeLog({
      actorUserId: req.user?.user_id,
      actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
      actorRole: extractActorRole(req.user?.role),
      actionType: 'QUOTE_PAYMENT_ALLOCATED',
      entityType: 'QUOTATION',
      entityId: quote_id,
      details: {
        quote_id,
        amount_received: parseFloat(amount_received),
        allocations: { reg_fee: regFeeAlloc, service: serviceAlloc, products: productsAlloc },
        payment_method,
        reference_number: reference_number || null,
        payment_id: payment?.payment_id || null,
        product_payments: productPaymentResults,
        overflow: overflowResult,
        has_slip: !!paymentSlipUrl,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Payment recorded and allocated successfully',
      data: {
        payment_id: payment?.payment_id || null,
        booking_payment_id: mirroredBookingPayment?.booking_payment_id || null,
        amount_received: parseFloat(amount_received),
        allocations: { reg_fee: regFeeAlloc, service: serviceAlloc, products: productsAlloc },
        product_payments: productPaymentResults,
        overflow: overflowResult,
        client_profile_created: clientBootstrap.client_profile_created,
      },
      registration_fee_settled: registrationFeeSettled,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error while recording allocated payment:', rollbackError);
    }
    console.error('Error recording allocated payment:', error);
    res.status(error.statusCode || 500).json({
      status: 'error',
      message: error.message || 'Failed to record allocated payment',
    });
  } finally {
    client.release();
  }
};

/**
 * Record a payment directly against a booking
 * POST /api/bookings/:booking_id/record-payment
 */
const recordBookingPayment = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { booking_id } = req.params;
    const uploadedSlipUrl = req.file?.location || null;
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

    if (!booking_id || !uuidRegex.test(booking_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Invalid booking ID format' });
    }

    if (!amount_received || amount_received <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'amount_received is required and must be greater than 0' });
    }

    if (!payment_method) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'payment_method is required (BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE)' });
    }

    const validMethods = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];
    if (!validMethods.includes(payment_method)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Invalid payment_method. Must be one of: ${validMethods.join(', ')}` });
    }

    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bank_account_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `bank_account_id is required for ${payment_method}` });
    }

    if (payment_method === 'CHEQUE' && (!cheque_number || !cheque_date)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'cheque_number and cheque_date are required for CHEQUE payments' });
    }

    if (bank_account_id) {
      const bankCheck = await client.query(
        `SELECT account_id, is_active FROM bank_accounts WHERE account_id = $1`,
        [bank_account_id]
      );

      if (bankCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Bank account not found' });
      }

      if (!bankCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'Bank account is not active' });
      }
    }

    const bookingCheck = await client.query(
      `SELECT
         b.booking_id,
         b.client_id,
         sr.active_quote_id as quote_id,
         COALESCE(q.total_amount, b.amount_quotated, 0) as total_amount
       FROM bookings b
       LEFT JOIN service_requests sr ON sr.request_id = b.request_id
       LEFT JOIN quotations q ON q.quote_id = sr.active_quote_id
       WHERE b.booking_id = $1`,
      [booking_id]
    );

    if (bookingCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Booking not found' });
    }

    const booking = bookingCheck.rows[0];

    // CASH payments have no client-supplied bank account — route them to Petty Cash instead.
    const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);

    const totalPaidResult = await client.query(
      `SELECT COALESCE(SUM(amount_received), 0) as total_paid
       FROM booking_payment_tracking
       WHERE booking_id = $1 AND status = 'VERIFIED'`,
      [booking_id]
    );

    const total_paid_so_far = parseFloat(totalPaidResult.rows[0].total_paid || 0);
    const new_total = total_paid_so_far + parseFloat(amount_received);

    const verified_by = req.user?.user_id || null;

    const paymentResult = await client.query(
      `INSERT INTO booking_payment_tracking (
         booking_id,
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
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING
         booking_payment_id,
         booking_id,
         quote_id,
         amount_received,
         payment_method,
         reference_number,
         status,
         payment_date,
         verified_at`,
      [
        booking_id,
        booking.quote_id || null,
        booking.client_id,
        amount_received,
        payment_method,
        resolvedBankAccountId,
        cheque_number || null,
        cheque_date || null,
        reference_number || null,
        paymentSlipUrl,
        'VERIFIED',
        verified_by,
        notes || null
      ]
    );

    const payment = paymentResult.rows[0];

    await client.query(
      `UPDATE bookings
       SET
         amount_paid = (
           SELECT COALESCE(SUM(amount_received), 0)
           FROM booking_payment_tracking
           WHERE booking_id = $1 AND status = 'VERIFIED'
         ),
         last_payment_date = NOW()
       WHERE booking_id = $1`,
      [booking_id]
    );

    await client.query(
      `INSERT INTO transactions (
         client_id,
         booking_id,
         quote_id,
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
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
      [
        booking.client_id,
        booking_id,
        booking.quote_id || null,
        'BOOKING_PAYMENT',
        amount_received,
        payment_method,
        resolvedBankAccountId,
        cheque_number || null,
        cheque_date || null,
        reference_number || null,
        paymentSlipUrl,
        verified_by,
        'COMPLETED',
        notes || null,
        'CREDIT'
      ]
    );

    const remaining_balance = parseFloat(booking.total_amount || 0) - new_total;

    await client.query('COMMIT');

    // Generate a payment receipt (PDF stored on Cloudinary + tracked in DB).
    // Delivery to the client over WhatsApp is a separate, admin-triggered action.
    ;(async () => {
      try {
        const info = await db.query(
          `SELECT b.booking_code, b.service_type, pp.full_name AS patient_name
           FROM bookings b
           LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
           WHERE b.booking_id = $1`,
          [booking_id]
        );
        const row = info.rows[0] || {};
        const descParts = [];
        if (row.patient_name) descParts.push(`Patient: ${row.patient_name}`);
        if (row.service_type) descParts.push(String(row.service_type).replace(/_/g, ' '));

        await createPaymentReceipt({
          client_id: booking.client_id,
          source_type: 'BOOKING_PAYMENT',
          source_id: payment.booking_payment_id,
          total_amount: parseFloat(amount_received),
          payment_method,
          reference_number: reference_number || null,
          cheque_number: cheque_number || null,
          bank_account_id: resolvedBankAccountId,
          payment_date: payment.payment_date || new Date(),
          line_items: [{
            label: `Booking ${row.booking_code || ''}`.trim(),
            description: descParts.join(' · '),
            amount: parseFloat(amount_received),
          }],
          generated_by: verified_by,
        });
      } catch (e) {
        console.error('[Receipt] Generation error (recordBookingPayment):', e.message);
      }
    })();

    await safeLog({
      actorUserId: req.user?.user_id,
      actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
      actorRole: extractActorRole(req.user?.role),
      actionType: 'BOOKING_PAYMENT_RECORDED',
      entityType: 'BOOKING',
      entityId: booking_id,
      details: {
        booking_id,
        payment_id: payment.booking_payment_id,
        amount_received: parseFloat(amount_received),
        payment_method,
        reference_number: reference_number || null,
        total_paid: new_total,
        remaining_balance,
        has_slip: !!paymentSlipUrl,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Booking payment recorded successfully',
      data: {
        booking_payment_id: payment.booking_payment_id,
        booking_id: payment.booking_id,
        quote_id: payment.quote_id,
        amount_received: parseFloat(payment.amount_received),
        payment_method: payment.payment_method,
        reference_number: payment.reference_number,
        slip_url: paymentSlipUrl,
        status: payment.status,
        verified_at: payment.verified_at,
        created_at: payment.payment_date
      },
      payment_summary: {
        total_amount: parseFloat(booking.total_amount || 0),
        total_paid: new_total,
        remaining_balance: remaining_balance,
        percent_paid: booking.total_amount ? ((new_total / booking.total_amount) * 100).toFixed(2) : '0.00'
      }
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error while recording booking payment:', rollbackError);
    }
    console.error('Error recording booking payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record booking payment',
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
        AND category IN ('SERVICE_INVOICE', 'REGISTRATION_FEE')
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
 * Get all payments for a booking
 * GET /api/bookings/:booking_id/payments
 */
const getPaymentsByBooking = async (req, res) => {
  try {
    const { booking_id } = req.params;

    if (!booking_id || !uuidRegex.test(booking_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid booking ID format'
      });
    }

    const bookingCheck = await db.query(
      `SELECT b.booking_id, sr.active_quote_id as quote_id, COALESCE(q.total_amount, b.amount_quotated, 0) as total_amount
       FROM bookings b
       LEFT JOIN service_requests sr ON sr.request_id = b.request_id
       LEFT JOIN quotations q ON q.quote_id = sr.active_quote_id
       WHERE b.booking_id = $1`,
      [booking_id]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const total_amount = parseFloat(bookingCheck.rows[0].total_amount || 0);

    const paymentsResult = await db.query(
      `SELECT
         booking_payment_id as payment_id,
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
       FROM booking_payment_tracking
       WHERE booking_id = $1
       ORDER BY payment_date DESC`,
      [booking_id]
    );

    const payments = [];
    let total_paid = 0;

    for (const payment of paymentsResult.rows) {
      const amount = parseFloat(payment.amount_received);
      total_paid += amount;

      payments.push({
        payment_id: payment.payment_id,
        amount,
        payment_method: payment.payment_method,
        bank_account: null,
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
      message: 'Booking payments retrieved successfully',
      booking_id,
      total_amount,
      total_paid,
      remaining_amount,
      percent_paid: total_amount > 0 ? ((total_paid / total_amount) * 100).toFixed(2) : '0.00',
      payment_count: payments.length,
      payments
    });
  } catch (error) {
    console.error('Error fetching booking payments:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch booking payments',
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

    await safeLog({
      actorUserId: req.user?.user_id,
      actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PAYMENT_VERIFIED',
      entityType: 'PAYMENT',
      entityId: payment_id,
      details: {
        payment_id,
        quote_id: payment.quote_id,
        amount: parseFloat(payment.amount_received),
        verification_notes: verification_notes || null,
      },
    });

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

    await safeLog({
      actorUserId: req.user?.user_id,
      actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PAYMENT_REJECTED',
      entityType: 'PAYMENT',
      entityId: payment_id,
      details: {
        payment_id,
        quote_id: payment.quote_id,
        rejection_reason,
      },
    });

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

/**
 * Pay off overdue booking amount using the client's wallet balance
 * POST /api/bookings/:booking_id/wallet-payoff
 */
const walletPayoffBooking = async (req, res) => {
  const pgClient = await db.pool.connect();
  try {
    const { booking_id } = req.params;
    const { amount, notes } = req.body;
    const parsedAmount = parseFloat(amount);

    if (!booking_id || !uuidRegex.test(booking_id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid booking ID format' });
    }
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ status: 'error', message: 'amount must be greater than 0' });
    }

    await pgClient.query('BEGIN');

    const bookingResult = await pgClient.query(
      `SELECT b.booking_id, b.client_id, b.amount_paid, b.status,
              sr.active_quote_id as quote_id
       FROM bookings b
       LEFT JOIN service_requests sr ON sr.request_id = b.request_id
       WHERE b.booking_id = $1`,
      [booking_id]
    );

    if (bookingResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    const bookingStatus = (booking.status || '').toUpperCase();

    if (!['ACTIVE', 'OVERDUE', 'PENDING'].includes(bookingStatus)) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Wallet payoff is not available for bookings with status: ${booking.status}` });
    }

    const invoiceResult = await pgClient.query(
      `SELECT COALESCE(SUM(amount), 0) as total_invoiced
       FROM transactions
       WHERE booking_id = $1 AND transaction_type = 'DEBIT' AND status = 'COMPLETED'`,
      [booking_id]
    );

    const totalInvoiced = parseFloat(invoiceResult.rows[0].total_invoiced);
    const totalPaid = parseFloat(booking.amount_paid || 0);
    const overdueAmount = totalInvoiced > totalPaid ? totalInvoiced - totalPaid : 0;

    if (overdueAmount <= 0) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'This booking has no overdue amount to pay off' });
    }

    if (parsedAmount > overdueAmount + 0.005) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Amount (${parsedAmount}) exceeds the overdue amount (${overdueAmount.toFixed(2)})` });
    }

    const walletResult = await pgClient.query(
      `SELECT wallet_balance FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`,
      [booking.client_id]
    );

    if (walletResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Client profile not found' });
    }

    const walletBalance = parseFloat(walletResult.rows[0].wallet_balance || 0);

    if (parsedAmount > walletBalance + 0.005) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: `Insufficient wallet balance. Available: ${walletBalance.toFixed(2)}, Requested: ${parsedAmount.toFixed(2)}` });
    }

    const verified_by = req.user?.user_id || null;
    const paymentNote = notes?.trim() || 'Wallet payoff for overdue booking amount';

    await pgClient.query(
      `UPDATE client_profiles SET wallet_balance = wallet_balance - $1 WHERE client_profile_id = $2`,
      [parsedAmount, booking.client_id]
    );

    const paymentResult = await pgClient.query(
      `INSERT INTO booking_payment_tracking (
         booking_id, quote_id, client_id, amount_received, payment_method,
         status, verified_by, notes, payment_date, verified_at
       ) VALUES ($1, $2, $3, $4, 'WALLET', 'VERIFIED', $5, $6, NOW(), NOW())
       RETURNING booking_payment_id, payment_date`,
      [booking_id, booking.quote_id || null, booking.client_id, parsedAmount, verified_by, paymentNote]
    );

    const payment = paymentResult.rows[0];

    await pgClient.query(
      `UPDATE bookings
       SET amount_paid = (
         SELECT COALESCE(SUM(amount_received), 0)
         FROM booking_payment_tracking
         WHERE booking_id = $1 AND status = 'VERIFIED'
       ), last_payment_date = NOW()
       WHERE booking_id = $1`,
      [booking_id]
    );

    // Split off any portion of this payoff that crosses the registration-fee
    // threshold — the overdue amount being cleared can include a
    // REGISTRATION_FEE DEBIT charge (see bookingController.js's
    // convertToBooking), so this payment path can settle a reg fee too, same
    // as the ordinary recordPayment flow. totalPaid (booking.amount_paid,
    // fetched above before this payoff was applied) is the correct "total
    // paid so far" ledger here since booking_payment_tracking — not
    // payment_tracking — is this booking's canonical payment record.
    const regFeeSplit = booking.quote_id
      ? await computeRegFeeSplit(pgClient, {
          client_id: booking.client_id,
          quote_id: booking.quote_id,
          amount: parsedAmount,
          totalPaidBefore: totalPaid,
        })
      : { regFeePortion: 0, remainderAmount: parsedAmount, regFeeItem: null };

    if (regFeeSplit.regFeePortion > 0) {
      await pgClient.query(
        `INSERT INTO transactions (
           client_id, booking_id, quote_id, category, amount, payment_method,
           verified_by, status, notes, transaction_type, created_at
         ) VALUES ($1, $2, $3, 'REGISTRATION_FEE', $4, 'WALLET', $5, 'COMPLETED', $6, 'CREDIT', NOW())`,
        [booking.client_id, booking_id, booking.quote_id || null, regFeeSplit.regFeePortion, verified_by, paymentNote]
      );
    }

    if (regFeeSplit.remainderAmount > 0) {
      await pgClient.query(
        `INSERT INTO transactions (
           client_id, booking_id, quote_id, category, amount, payment_method,
           verified_by, status, notes, transaction_type, created_at
         ) VALUES ($1, $2, $3, 'BOOKING_PAYMENT', $4, 'WALLET', $5, 'COMPLETED', $6, 'CREDIT', NOW())`,
        [booking.client_id, booking_id, booking.quote_id || null, regFeeSplit.remainderAmount, verified_by, paymentNote]
      );
    }

    if (regFeeSplit.regFeeItem) {
      const newTotalPaid = totalPaid + parsedAmount;
      if (newTotalPaid >= parseFloat(regFeeSplit.regFeeItem.amount)) {
        try {
          await settleRegistrationFee(pgClient, {
            client_id: booking.client_id,
            regFeeItem: regFeeSplit.regFeeItem,
            verified_by,
            creditSalespersonForRegistration,
          });
        } catch (regFeeErr) {
          console.error('Registration fee settlement check failed (walletPayoffBooking):', regFeeErr.message);
        }
      }
    }

    await pgClient.query(
      `INSERT INTO transactions (
         client_id, booking_id, category, amount, payment_method,
         verified_by, status, notes, transaction_type, created_at
       ) VALUES ($1, $2, 'WALLET_DEBIT', $3, 'WALLET', $4, 'COMPLETED', $5, 'DEBIT', NOW())`,
      [booking.client_id, booking_id, parsedAmount, verified_by, `Wallet deducted for booking overdue payoff — ${paymentNote}`]
    );

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
      actorRole: extractActorRole(req.user?.role),
      actionType: 'WALLET_BOOKING_PAYOFF',
      entityType: 'BOOKING',
      entityId: booking_id,
      details: {
        booking_id,
        client_id: booking.client_id,
        amount: parsedAmount,
        wallet_balance_before: walletBalance,
        wallet_balance_after: walletBalance - parsedAmount,
        overdue_amount: overdueAmount,
        payment_id: payment.booking_payment_id,
      },
    });

    return res.status(201).json({
      status: 'success',
      message: 'Overdue amount paid off from client wallet successfully',
      data: {
        payment_id: payment.booking_payment_id,
        amount_paid: parsedAmount,
        wallet_balance_before: walletBalance,
        wallet_balance_after: walletBalance - parsedAmount,
        overdue_cleared: parsedAmount,
      },
    });
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    console.error('Error in walletPayoffBooking:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  } finally {
    pgClient.release();
  }
};

/**
 * List a client's ACTIVE/OVERDUE bookings that currently have money owed on
 * them — same overdue calc walletPayoffBooking uses (invoiced via COMPLETED
 * DEBIT transactions, minus amount_paid) — so an admin overpaying elsewhere
 * (see recordAllocatedPayment's overflow handling) can see what's available
 * to pay off with the extra.
 * GET /api/bookings/client/:client_id/overdue-bookings
 */
const getClientOverdueBookings = async (req, res) => {
  try {
    const { client_id } = req.params;
    if (!client_id || !uuidRegex.test(client_id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid client ID format' });
    }

    const result = await db.query(
      `SELECT b.booking_id, b.booking_code, b.service_type, b.status, b.amount_paid,
              COALESCE(inv.total_invoiced, 0) as total_invoiced
       FROM bookings b
       LEFT JOIN (
         SELECT booking_id, SUM(amount) as total_invoiced
         FROM transactions
         WHERE transaction_type = 'DEBIT' AND status = 'COMPLETED'
         GROUP BY booking_id
       ) inv ON inv.booking_id = b.booking_id
       WHERE b.client_id = $1 AND b.status IN ('ACTIVE', 'OVERDUE')`,
      [client_id]
    );

    const bookings = result.rows
      .map((b) => ({
        booking_id: b.booking_id,
        booking_code: b.booking_code,
        service_type: b.service_type,
        status: b.status,
        overdue_amount: Math.max(parseFloat(b.total_invoiced || 0) - parseFloat(b.amount_paid || 0), 0),
      }))
      .filter((b) => b.overdue_amount > 0.01);

    res.status(200).json({ status: 'success', data: bookings });
  } catch (error) {
    console.error('Error fetching client overdue bookings:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch overdue bookings' });
  }
};

module.exports = {
  recordPayment,
  recordAllocatedPayment,
  recordBookingPayment,
  walletPayoffBooking,
  getClientOverdueBookings,
  getPaymentsByQuote,
  getPaymentsByBooking,
  getPaymentProgress,
  getBookingInvoiceProgress,
  verifyPayment,
  rejectPayment
};
