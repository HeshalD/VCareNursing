const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { createPaymentReceipt } = require('../services/receiptService');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

// =========================================================
// POST /api/client-payments/:client_id/record
// =========================================================
const recordClientPayment = async (req, res) => {
  const pgClient = await db.pool.connect();

  try {
    const { client_id } = req.params;
    const uploadedSlipUrl = req.file?.path || null;

    const {
      total_amount,
      payment_method,
      bank_account_id,
      cheque_number,
      cheque_date,
      reference_number,
      slip_url,
      notes,
      allocations: rawAllocations,
    } = req.body;

    const finalSlipUrl = uploadedSlipUrl || slip_url || null;

    // allocations may arrive as a JSON string when sent via multipart/form-data
    let allocations;
    try {
      allocations = typeof rawAllocations === 'string'
        ? JSON.parse(rawAllocations)
        : rawAllocations;
    } catch {
      return res.status(400).json({ status: 'error', message: 'allocations must be valid JSON' });
    }

    // ---- Validation (before opening transaction) ----

    if (!uuidRegex.test(client_id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid client_id format' });
    }

    const parsedTotal = parseFloat(total_amount);
    if (!parsedTotal || parsedTotal <= 0) {
      return res.status(400).json({ status: 'error', message: 'total_amount is required and must be > 0' });
    }

    if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        status: 'error',
        message: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
      });
    }

    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bank_account_id) {
      return res.status(400).json({ status: 'error', message: `bank_account_id is required for ${payment_method}` });
    }

    if (payment_method === 'CHEQUE' && (!cheque_number || !cheque_date)) {
      return res.status(400).json({ status: 'error', message: 'cheque_number and cheque_date are required for CHEQUE payments' });
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ status: 'error', message: 'At least one allocation is required' });
    }

    const validTypes = ['BOOKING', 'NEW_BOOKING', 'WALLET'];
    for (const alloc of allocations) {
      if (!validTypes.includes(alloc.type)) {
        return res.status(400).json({ status: 'error', message: `Invalid allocation type: ${alloc.type}` });
      }
      if (!alloc.amount || parseFloat(alloc.amount) <= 0) {
        return res.status(400).json({ status: 'error', message: 'Each allocation must have a positive amount' });
      }
      if (alloc.type === 'BOOKING' && !alloc.booking_id) {
        return res.status(400).json({ status: 'error', message: 'booking_id is required for BOOKING allocations' });
      }
      if (alloc.type === 'NEW_BOOKING') {
        const nb = alloc.new_booking;
        if (!nb || !nb.patient_id || !nb.service_type || !nb.start_date || !nb.daily_rate) {
          return res.status(400).json({
            status: 'error',
            message: 'NEW_BOOKING allocation requires new_booking with patient_id, service_type, start_date, and daily_rate',
          });
        }
      }
    }

    const allocTotal = allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
    if (Math.abs(allocTotal - parsedTotal) > 0.01) {
      return res.status(400).json({
        status: 'error',
        message: `Allocation total (${allocTotal}) must equal total_amount (${parsedTotal})`,
      });
    }

    // ---- Begin transaction ----
    await pgClient.query('BEGIN');

    // Verify client exists
    const clientCheck = await pgClient.query(
      'SELECT client_profile_id FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );
    if (clientCheck.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    // Verify bank account exists and is active
    if (bank_account_id) {
      const bankCheck = await pgClient.query(
        'SELECT is_active FROM bank_accounts WHERE account_id = $1',
        [bank_account_id]
      );
      if (bankCheck.rows.length === 0 || !bankCheck.rows[0].is_active) {
        await pgClient.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: 'Bank account not found or not active' });
      }
    }

    // Validate each BOOKING allocation: must belong to this client and be ACTIVE/OVERDUE
    for (const alloc of allocations.filter(a => a.type === 'BOOKING')) {
      const bookingCheck = await pgClient.query(
        'SELECT booking_id, status, client_id FROM bookings WHERE booking_id = $1',
        [alloc.booking_id]
      );
      if (bookingCheck.rows.length === 0) {
        await pgClient.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: `Booking ${alloc.booking_id} not found` });
      }
      const booking = bookingCheck.rows[0];
      if (booking.client_id !== client_id) {
        await pgClient.query('ROLLBACK');
        return res.status(403).json({ status: 'error', message: `Booking ${alloc.booking_id} does not belong to this client` });
      }
      if (!['ACTIVE', 'OVERDUE'].includes(booking.status)) {
        await pgClient.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: `Booking ${alloc.booking_id} must be ACTIVE or OVERDUE (current status: ${booking.status})`,
        });
      }
    }

    // Validate each NEW_BOOKING patient belongs to this client
    for (const alloc of allocations.filter(a => a.type === 'NEW_BOOKING')) {
      const patientCheck = await pgClient.query(
        'SELECT patient_id FROM patient_profiles WHERE patient_id = $1 AND client_id = $2',
        [alloc.new_booking.patient_id, client_id]
      );
      if (patientCheck.rows.length === 0) {
        await pgClient.query('ROLLBACK');
        return res.status(403).json({
          status: 'error',
          message: `Patient ${alloc.new_booking.patient_id} not found or does not belong to this client`,
        });
      }
    }

    // Resolve actor info
    const actorUserId = req.user.user_id;
    const actorRole = extractActorRole(req.user.role);
    const actorNameResult = await pgClient.query(
      'SELECT full_name FROM staff_profiles WHERE user_id = $1',
      [actorUserId]
    );
    const actorName = actorNameResult.rows[0]?.full_name || 'Admin';

    // Insert master payment record
    const recordResult = await pgClient.query(
      `INSERT INTO client_payment_records
         (client_id, total_amount, payment_method, bank_account_id, cheque_number,
          cheque_date, reference_number, slip_url, notes, recorded_by, recorded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        client_id, parsedTotal, payment_method,
        bank_account_id || null, cheque_number || null, cheque_date || null,
        reference_number || null, finalSlipUrl, notes || null,
        actorUserId, actorName,
      ]
    );
    const record = recordResult.rows[0];
    const record_id = record.record_id;

    const resultAllocations = [];

    for (const alloc of allocations) {
      const amount = parseFloat(alloc.amount);

      if (alloc.type === 'BOOKING') {

        const bptResult = await pgClient.query(
          `INSERT INTO booking_payment_tracking
             (booking_id, client_id, amount_received, payment_method, bank_account_id,
              cheque_number, cheque_date, reference_number, slip_url, notes,
              status, verified_at, verified_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'VERIFIED',NOW(),$11)
           RETURNING booking_payment_id`,
          [
            alloc.booking_id, client_id, amount, payment_method,
            bank_account_id || null, cheque_number || null, cheque_date || null,
            reference_number || null, finalSlipUrl, notes || null, actorUserId,
          ]
        );
        const booking_payment_id = bptResult.rows[0].booking_payment_id;

        await pgClient.query(
          `UPDATE bookings
           SET amount_paid = COALESCE(amount_paid, 0) + $1, last_payment_date = NOW()
           WHERE booking_id = $2`,
          [amount, alloc.booking_id]
        );

        const txResult = await pgClient.query(
          `INSERT INTO transactions
             (client_id, booking_id, category, transaction_type, amount, payment_method,
              bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
              notes, status, verified_by)
           VALUES ($1,$2,'BOOKING_PAYMENT','CREDIT',$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED',$11)
           RETURNING transaction_id`,
          [
            client_id, alloc.booking_id, amount, payment_method,
            bank_account_id || null, cheque_number || null, cheque_date || null,
            reference_number || null, finalSlipUrl, notes || null, actorUserId,
          ]
        );
        const transaction_id = txResult.rows[0].transaction_id;

        const allocResult = await pgClient.query(
          `INSERT INTO client_payment_allocations
             (record_id, allocation_type, amount, booking_id, transaction_id, booking_payment_id)
           VALUES ($1,'BOOKING',$2,$3,$4,$5)
           RETURNING *`,
          [record_id, amount, alloc.booking_id, transaction_id, booking_payment_id]
        );
        resultAllocations.push(allocResult.rows[0]);

      } else if (alloc.type === 'NEW_BOOKING') {
        const nb = alloc.new_booking;

        const bookingResult = await pgClient.query(
          `INSERT INTO bookings
             (client_id, patient_id, service_type, service_model, preferred_gender,
              start_date, daily_rate, amount_quotated, amount_paid, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE')
           RETURNING booking_id`,
          [
            client_id, nb.patient_id, nb.service_type,
            nb.service_model || 'SHIFT_BASED',
            nb.preferred_gender || 'ANY',
            nb.start_date,
            parseFloat(nb.daily_rate),
            nb.amount_quotated ? parseFloat(nb.amount_quotated) : amount,
            amount,
          ]
        );
        const new_booking_id = bookingResult.rows[0].booking_id;
        // Remember the created booking id so the receipt line item can resolve its code/patient.
        alloc._booking_id = new_booking_id;

        const bptResult = await pgClient.query(
          `INSERT INTO booking_payment_tracking
             (booking_id, client_id, amount_received, payment_method, bank_account_id,
              cheque_number, cheque_date, reference_number, slip_url, notes,
              status, verified_at, verified_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'VERIFIED',NOW(),$11)
           RETURNING booking_payment_id`,
          [
            new_booking_id, client_id, amount, payment_method,
            bank_account_id || null, cheque_number || null, cheque_date || null,
            reference_number || null, finalSlipUrl, notes || null, actorUserId,
          ]
        );
        const booking_payment_id = bptResult.rows[0].booking_payment_id;

        const txResult = await pgClient.query(
          `INSERT INTO transactions
             (client_id, booking_id, category, transaction_type, amount, payment_method,
              bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
              notes, status, verified_by)
           VALUES ($1,$2,'BOOKING_PAYMENT','CREDIT',$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED',$11)
           RETURNING transaction_id`,
          [
            client_id, new_booking_id, amount, payment_method,
            bank_account_id || null, cheque_number || null, cheque_date || null,
            reference_number || null, finalSlipUrl, notes || null, actorUserId,
          ]
        );
        const transaction_id = txResult.rows[0].transaction_id;

        const allocResult = await pgClient.query(
          `INSERT INTO client_payment_allocations
             (record_id, allocation_type, amount, booking_id, transaction_id, booking_payment_id)
           VALUES ($1,'NEW_BOOKING',$2,$3,$4,$5)
           RETURNING *`,
          [record_id, amount, new_booking_id, transaction_id, booking_payment_id]
        );
        resultAllocations.push(allocResult.rows[0]);

      } else if (alloc.type === 'WALLET') {

        await pgClient.query(
          `UPDATE client_profiles
           SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW()
           WHERE client_profile_id = $2`,
          [amount, client_id]
        );

        const txResult = await pgClient.query(
          `INSERT INTO transactions
             (client_id, category, transaction_type, amount, payment_method,
              bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
              notes, status, verified_by)
           VALUES ($1,'WALLET_TOPUP','CREDIT',$2,$3,$4,$5,$6,$7,$8,$9,'COMPLETED',$10)
           RETURNING transaction_id`,
          [
            client_id, amount, payment_method,
            bank_account_id || null, cheque_number || null, cheque_date || null,
            reference_number || null, finalSlipUrl, notes || null, actorUserId,
          ]
        );
        const transaction_id = txResult.rows[0].transaction_id;

        const allocResult = await pgClient.query(
          `INSERT INTO client_payment_allocations
             (record_id, allocation_type, amount, transaction_id)
           VALUES ($1,'WALLET',$2,$3)
           RETURNING *`,
          [record_id, amount, transaction_id]
        );
        resultAllocations.push(allocResult.rows[0]);
      }
    }

    await pgClient.query('COMMIT');

    logActivity({
      actorUserId,
      actorName,
      actorRole,
      actionType: 'CLIENT_PAYMENT_RECORDED',
      entityType: 'client_payment_record',
      entityId: record_id,
      details: {
        client_id,
        total_amount: parsedTotal,
        payment_method,
        allocation_count: allocations.length,
        allocations_summary: allocations.map(a => ({
          type: a.type,
          amount: parseFloat(a.amount),
          ...(a.booking_id && { booking_id: a.booking_id }),
        })),
      },
    }).catch(e => console.error('[ClientPayment] Activity log error:', e.message));

    // Generate a payment receipt (PDF stored on Cloudinary + tracked in DB).
    // Delivery to the client over WhatsApp is a separate, admin-triggered action.
    ;(async () => {
      try {
        const lineItems = [];
        for (const alloc of allocations) {
          const amt = parseFloat(alloc.amount);
          if (alloc.type === 'WALLET') {
            lineItems.push({
              label: 'Wallet Top-up',
              description: 'Credited to client wallet balance',
              amount: amt,
            });
            continue;
          }
          const bId = alloc.type === 'NEW_BOOKING' ? alloc._booking_id : alloc.booking_id;
          const info = await db.query(
            `SELECT b.booking_code, b.service_type, pp.full_name AS patient_name
             FROM bookings b
             LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
             WHERE b.booking_id = $1`,
            [bId]
          );
          const row = info.rows[0] || {};
          const prefix = alloc.type === 'NEW_BOOKING' ? 'New Booking' : 'Booking';
          const descParts = [];
          if (row.patient_name) descParts.push(`Patient: ${row.patient_name}`);
          if (row.service_type) descParts.push(String(row.service_type).replace(/_/g, ' '));
          lineItems.push({
            label: `${prefix} ${row.booking_code || ''}`.trim(),
            description: descParts.join(' · '),
            amount: amt,
          });
        }

        await createPaymentReceipt({
          client_id,
          source_type: 'CLIENT_PAYMENT',
          source_id: record_id,
          total_amount: parsedTotal,
          payment_method,
          reference_number: reference_number || null,
          cheque_number: cheque_number || null,
          bank_account_id: bank_account_id || null,
          payment_date: new Date(),
          line_items: lineItems,
          generated_by: actorUserId,
        });
      } catch (e) {
        console.error('[Receipt] Generation error (recordClientPayment):', e.message);
      }
    })();

    return res.status(201).json({
      status: 'success',
      record: { ...record, allocations: resultAllocations },
    });

  } catch (err) {
    await pgClient.query('ROLLBACK');
    console.error('recordClientPayment error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  } finally {
    pgClient.release();
  }
};

// =========================================================
// GET /api/client-payments/:client_id
// =========================================================
const getClientPaymentRecords = async (req, res) => {
  try {
    const { client_id } = req.params;

    if (!uuidRegex.test(client_id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid client_id format' });
    }

    const result = await db.query(
      `SELECT
         r.record_id,
         r.client_id,
         r.total_amount,
         r.payment_method,
         r.bank_account_id,
         r.cheque_number,
         r.cheque_date,
         r.reference_number,
         r.slip_url,
         r.notes,
         r.recorded_by_name,
         r.created_at,
         ba.account_nickname  AS bank_account_nickname,
         ba.bank_name,
         COALESCE(
           json_agg(
             json_build_object(
               'allocation_id',      a.allocation_id,
               'allocation_type',    a.allocation_type,
               'amount',             a.amount,
               'booking_id',         a.booking_id,
               'transaction_id',     a.transaction_id,
               'booking_payment_id', a.booking_payment_id,
               'created_at',         a.created_at
             ) ORDER BY a.created_at
           ) FILTER (WHERE a.allocation_id IS NOT NULL),
           '[]'
         ) AS allocations
       FROM client_payment_records r
       LEFT JOIN bank_accounts ba ON ba.account_id = r.bank_account_id
       LEFT JOIN client_payment_allocations a ON a.record_id = r.record_id
       WHERE r.client_id = $1
       GROUP BY r.record_id, ba.account_nickname, ba.bank_name
       ORDER BY r.created_at DESC`,
      [client_id]
    );

    return res.status(200).json({ status: 'success', records: result.rows });

  } catch (err) {
    console.error('getClientPaymentRecords error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

// =========================================================
// GET /api/client-payments/record/:record_id
// =========================================================
const getPaymentRecordDetail = async (req, res) => {
  try {
    const { record_id } = req.params;

    if (!uuidRegex.test(record_id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid record_id format' });
    }

    const recordResult = await db.query(
      `SELECT
         r.*,
         ba.account_nickname AS bank_account_nickname,
         ba.bank_name,
         cp.full_name AS client_name
       FROM client_payment_records r
       LEFT JOIN bank_accounts ba ON ba.account_id = r.bank_account_id
       LEFT JOIN client_profiles cp ON cp.client_profile_id = r.client_id
       WHERE r.record_id = $1`,
      [record_id]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Payment record not found' });
    }

    const allocResult = await db.query(
      `SELECT
         a.allocation_id,
         a.allocation_type,
         a.amount,
         a.booking_id,
         a.transaction_id,
         a.booking_payment_id,
         a.created_at,
         b.status        AS booking_status,
         b.service_type  AS booking_service_type,
         b.start_date    AS booking_start_date,
         b.amount_paid   AS booking_amount_paid,
         b.amount_quotated AS booking_amount_quotated,
         pp.full_name    AS patient_name
       FROM client_payment_allocations a
       LEFT JOIN bookings b ON b.booking_id = a.booking_id
       LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
       WHERE a.record_id = $1
       ORDER BY a.created_at`,
      [record_id]
    );

    return res.status(200).json({
      status: 'success',
      record: { ...recordResult.rows[0], allocations: allocResult.rows },
    });

  } catch (err) {
    console.error('getPaymentRecordDetail error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

module.exports = {
  recordClientPayment,
  getClientPaymentRecords,
  getPaymentRecordDetail,
};
