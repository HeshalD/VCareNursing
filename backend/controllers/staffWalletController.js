// backend/controllers/staffWalletController.js

const { pool } = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendStaffAdvanceRequestSent, sendStaffAdvanceApproved, sendStaffAdvanceRejected } = require('../utils/metaWhatsapp');
const { sendStaffAdvanceApprovedSms, sendStaffAdvanceRejectedSms } = require('../utils/sms');

async function getReviewerName(userId) {
  const result = await pool.query(
    'SELECT full_name FROM staff_profiles WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.full_name || 'Admin';
}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').trim() : String(raw);
}

// GET /api/staff-wallet/my-wallet
// Staff views their own wallet balance
const getMyWallet = async (req, res) => {
  try {
    const staff = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, sp.advance_threshold_amount, 
              COALESCE(sw.balance, 0) AS balance
       FROM staff_profiles sp
       LEFT JOIN staff_wallet sw ON sw.staff_profile_id = sp.staff_profile_id
       WHERE sp.user_id = $1`,
      [req.user.user_id]
    );

    if (!staff.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    res.json({ status: 'success', data: staff.rows[0] });
  } catch (err) {
    console.error('getMyWallet error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-wallet/my-advances
// Staff views their own advance request history
const getMyAdvances = async (req, res) => {
  try {
    const staffResult = await pool.query(
      `SELECT staff_profile_id
       FROM staff_profiles
       WHERE user_id = $1`,
      [req.user.user_id]
    );

    if (!staffResult.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    const { staff_profile_id } = staffResult.rows[0];

    const advancesResult = await pool.query(
      `SELECT advance_id, advance_code, staff_profile_id, amount_requested, status, requested_at, approved_at,
              rejected_reason, reviewed_by_user_id, reviewed_by_name
       FROM staff_advances
       WHERE staff_profile_id = $1
       ORDER BY requested_at DESC`,
      [staff_profile_id]
    );

    return res.json({ status: 'success', data: advancesResult.rows });
  } catch (err) {
    console.error('getMyAdvances error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-wallet/request-advance
// Staff requests an advance
const requestAdvance = async (req, res) => {
  const { amount_requested } = req.body;

  if (!amount_requested || amount_requested <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid amount' });
  }

  try {
    // Get staff profile + wallet balance + threshold
    const result = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, u.mobile_number, sp.advance_threshold_amount,
              COALESCE(sw.balance, 0) AS balance
       FROM staff_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       LEFT JOIN staff_wallet sw ON sw.staff_profile_id = sp.staff_profile_id
       WHERE sp.user_id = $1`,
      [req.user.user_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    const { staff_profile_id, full_name, mobile_number, advance_threshold_amount, balance } = result.rows[0];

    // Threshold check
    if (parseFloat(balance) < parseFloat(advance_threshold_amount)) {
      return res.status(403).json({
        status: 'error',
        message: `You need a minimum accrued balance of Rs. ${advance_threshold_amount} to request an advance. Your current balance is Rs. ${balance}.`
      });
    }

    // Check no pending advance already exists
    const existing = await pool.query(
      `SELECT advance_id FROM staff_advances 
       WHERE staff_profile_id = $1 AND status = 'PENDING'`,
      [staff_profile_id]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        status: 'error',
        message: 'You already have a pending advance request.'
      });
    }

    // Create the advance request
    const advance = await pool.query(
      `INSERT INTO staff_advances (staff_profile_id, amount_requested, status, requested_at)
       VALUES ($1, $2, 'PENDING', NOW())
       RETURNING *`,
      [staff_profile_id, amount_requested]
    );

    if (mobile_number) {
      sendStaffAdvanceRequestSent(mobile_number, full_name, amount_requested).catch((err) =>
        console.error('[WA] sendStaffAdvanceRequestSent failed:', err.message)
      );
    }

    res.status(201).json({ status: 'success', data: advance.rows[0] });
  } catch (err) {
    console.error('requestAdvance error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// POST /api/staff-wallet/approve-advance/:advanceId
// Admin approves an advance — debits the wallet
const approveAdvance = async (req, res) => {
  const { advanceId } = req.params;
  const client = await pool.connect();

  try {
    const reviewerName = await getReviewerName(req.user.user_id);

    await client.query('BEGIN');

    // Get the advance
    const advanceResult = await client.query(
      `SELECT * FROM staff_advances WHERE advance_id = $1 AND status = 'PENDING'`,
      [advanceId]
    );

    if (!advanceResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Pending advance not found' });
    }

    const advance = advanceResult.rows[0];

    // Check wallet has enough balance
    const walletResult = await client.query(
      `SELECT * FROM staff_wallet WHERE staff_profile_id = $1`,
      [advance.staff_profile_id]
    );

    if (!walletResult.rows.length || parseFloat(walletResult.rows[0].balance) < parseFloat(advance.amount_requested)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Insufficient wallet balance to approve this advance' });
    }

    // Debit the wallet (controls advance eligibility)
    await client.query(
      `UPDATE staff_wallet
       SET balance = balance - $1, updated_at = NOW()
       WHERE staff_profile_id = $2`,
      [advance.amount_requested, advance.staff_profile_id]
    );

    // Also reduce current_earnings (controls how much can be paid out) so the
    // advance lowers the payout ceiling — an advance is an early payout of earnings.
    // Without this the staff member could be over-paid (advance + full payout).
    await client.query(
      `UPDATE staff_profiles
       SET current_earnings = GREATEST(COALESCE(current_earnings, 0) - $1, 0)
       WHERE staff_profile_id = $2`,
      [advance.amount_requested, advance.staff_profile_id]
    );

    // Log the wallet movement (staff wallet history)
    await client.query(
      `INSERT INTO staff_wallet_transactions
        (staff_profile_id, type, amount, reason, reference_id, created_at)
       VALUES ($1, 'DEBIT', $2, 'ADVANCE_DEDUCTION', $3, NOW())`,
      [advance.staff_profile_id, advance.amount_requested, advance.advance_id]
    );

    // Record the same advance in the main transactions ledger as money out
    await client.query(
      `INSERT INTO transactions
        (staff_profile_id, category, transaction_type, amount, status, notes,
         reference_number, created_by, verified_by, created_at)
       VALUES ($1, 'STAFF_ADVANCE', 'DEBIT', $2, 'COMPLETED', $3, $4, $5, $5, NOW())`,
      [
        advance.staff_profile_id,
        advance.amount_requested,
        `Salary advance approved by ${reviewerName}`,
        advance.advance_id,
        req.user.user_id,
      ]
    );

    // Update advance status and record reviewer
    const updated = await client.query(
      `UPDATE staff_advances
       SET status = 'APPROVED', approved_at = NOW(),
           reviewed_by_user_id = $1, reviewed_by_name = $2
       WHERE advance_id = $3
       RETURNING *`,
      [req.user.user_id, reviewerName, advanceId]
    );

    await client.query('COMMIT');

    await logActivity({
      actorUserId: req.user.user_id,
      actorName: reviewerName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'ADVANCE_APPROVED',
      entityType: 'STAFF_ADVANCE',
      entityId: advanceId,
      details: { staff_profile_id: advance.staff_profile_id, amount: advance.amount_requested }
    });

    // Notify staff via WhatsApp + SMS (non-blocking)
    const staffContactRes = await pool.query(
      `SELECT sp.full_name, u.mobile_number
       FROM staff_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.staff_profile_id = $1`,
      [advance.staff_profile_id]
    );
    if (staffContactRes.rows.length && staffContactRes.rows[0].mobile_number) {
      const { full_name, mobile_number } = staffContactRes.rows[0];
      const newBalance = (parseFloat(walletResult.rows[0].balance) - parseFloat(advance.amount_requested)).toFixed(2);
      sendStaffAdvanceApproved(mobile_number, full_name, advance.amount_requested, newBalance)
        .catch((err) => console.error('[WA] sendStaffAdvanceApproved failed:', err.message));
      sendStaffAdvanceApprovedSms(mobile_number, full_name, advance.amount_requested, newBalance)
        .catch((err) => console.error('[SMS] sendStaffAdvanceApprovedSms failed:', err.message));
    }

    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('approveAdvance error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  } finally {
    client.release();
  }
};

// POST /api/staff-wallet/reject-advance/:advanceId
// Admin rejects an advance
const rejectAdvance = async (req, res) => {
  const { advanceId } = req.params;
  const { reason } = req.body;

  try {
    const reviewerName = await getReviewerName(req.user.user_id);

    const result = await pool.query(
      `UPDATE staff_advances
       SET status = 'REJECTED', rejected_reason = $1,
           reviewed_by_user_id = $2, reviewed_by_name = $3
       WHERE advance_id = $4 AND status = 'PENDING'
       RETURNING *`,
      [reason || null, req.user.user_id, reviewerName, advanceId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Pending advance not found' });
    }

    await logActivity({
      actorUserId: req.user.user_id,
      actorName: reviewerName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'ADVANCE_REJECTED',
      entityType: 'STAFF_ADVANCE',
      entityId: advanceId,
      details: {
        staff_profile_id: result.rows[0].staff_profile_id,
        amount: result.rows[0].amount_requested,
        reason: reason || null
      }
    });

    // Notify staff via WhatsApp + SMS (non-blocking)
    const staffContactRes = await pool.query(
      `SELECT sp.full_name, u.mobile_number
       FROM staff_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE sp.staff_profile_id = $1`,
      [result.rows[0].staff_profile_id]
    );
    if (staffContactRes.rows.length && staffContactRes.rows[0].mobile_number) {
      const { full_name, mobile_number } = staffContactRes.rows[0];
      sendStaffAdvanceRejected(mobile_number, full_name, result.rows[0].amount_requested, reason)
        .catch((err) => console.error('[WA] sendStaffAdvanceRejected failed:', err.message));
      sendStaffAdvanceRejectedSms(mobile_number, full_name, result.rows[0].amount_requested, reason)
        .catch((err) => console.error('[SMS] sendStaffAdvanceRejectedSms failed:', err.message));
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('rejectAdvance error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-wallet/advances
// Admin gets all advance requests
const getAllAdvances = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sa.*, sp.full_name, sp.staff_code, sp.advance_threshold_amount,
              COALESCE(sw.balance, 0) AS current_balance
       FROM staff_advances sa
       JOIN staff_profiles sp ON sp.staff_profile_id = sa.staff_profile_id
       LEFT JOIN staff_wallet sw ON sw.staff_profile_id = sp.staff_profile_id
       ORDER BY sa.requested_at DESC`
    );

    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getAllAdvances error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// PATCH /api/staff-wallet/threshold/:staffProfileId
// Admin updates advance threshold for a specific staff member
const updateAdvanceThreshold = async (req, res) => {
  const { staffProfileId } = req.params;
  const { advance_threshold_amount } = req.body;

  if (advance_threshold_amount === undefined || advance_threshold_amount < 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid threshold value' });
  }

  try {
    const result = await pool.query(
      `UPDATE staff_profiles 
       SET advance_threshold_amount = $1
       WHERE staff_profile_id = $2
       RETURNING staff_profile_id, full_name, advance_threshold_amount`,
      [advance_threshold_amount, staffProfileId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    try {
      const reviewerName = await getReviewerName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName: reviewerName,
        actorRole: Array.isArray(req.user?.role) ? req.user.role[0] : String(req.user?.role),
        actionType: 'ADVANCE_THRESHOLD_UPDATED',
        entityType: 'STAFF',
        entityId: String(staffProfileId),
        details: { staff_name: result.rows[0].full_name, advance_threshold_amount },
      });
    } catch (logErr) {
      console.error('Activity log failed (updateAdvanceThreshold):', logErr.message);
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('updateAdvanceThreshold error:', err);
    // If column doesn't exist, provide a more helpful error message
    if (err.code === '42703') {
      return res.status(500).json({ status: 'error', message: 'advance_threshold_amount column does not exist in staff_profiles table' });
    }
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-wallet/advances/pending 
//Admin sees all pending advances

const getPendingAdvances = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sa.*, sp.full_name, sp.staff_code, sp.advance_threshold_amount,
              COALESCE(sw.balance, 0) AS current_balance
       FROM staff_advances sa
       JOIN staff_profiles sp ON sp.staff_profile_id = sa.staff_profile_id
       LEFT JOIN staff_wallet sw ON sw.staff_profile_id = sa.staff_profile_id
       WHERE sa.status = 'PENDING'
       ORDER BY sa.requested_at ASC`
    );

    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getPendingAdvances error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// GET /api/staff-wallet/my-earnings-breakdown
// Staff views their own earnings ledger + summary (mirrors admin getCurrentEarningsBreakdown)
const getMyCurrentEarningsBreakdown = async (req, res) => {
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  try {
    const profileRes = await pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, sp.current_earnings
       FROM staff_profiles sp WHERE sp.user_id = $1`,
      [req.user.user_id]
    );
    if (profileRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }
    const { staff_profile_id, full_name: staff_name, current_earnings } = profileRes.rows[0];

    const [summaryRes, advanceSumRes, countRes, ledgerRes, advancesRes] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY'      AND transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_earned,
          COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY_PAID' AND transaction_type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS total_paid_out
        FROM transactions
        WHERE staff_profile_id = $1
          AND (category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID')
          AND status = 'COMPLETED'
      `, [staff_profile_id]),

      pool.query(`
        SELECT COALESCE(SUM(amount_requested), 0) AS total_advances_approved
        FROM staff_advances
        WHERE staff_profile_id = $1 AND status = 'APPROVED'
      `, [staff_profile_id]),

      pool.query(`
        SELECT COUNT(*) AS total_count
        FROM transactions
        WHERE staff_profile_id = $1
          AND (category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID')
          AND status = 'COMPLETED'
      `, [staff_profile_id]),

      pool.query(`
        SELECT *
        FROM (
          SELECT
            t.transaction_id,
            t.booking_id,
            t.category,
            t.amount,
            t.transaction_type,
            t.created_at,
            SUM(
              CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE -t.amount END
            ) OVER (
              ORDER BY t.created_at ASC, t.transaction_id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_balance,
            b.service_type,
            c.full_name  AS client_name,
            p.full_name  AS patient_name,
            spt.notes    AS payout_notes,
            ba.account_nickname AS company_account_name,
            sba.bank_name       AS staff_bank_name,
            sba.account_number  AS staff_account_number
          FROM transactions t
          LEFT JOIN bookings b             ON t.booking_id = b.booking_id
          LEFT JOIN client_profiles c      ON b.client_id  = c.client_profile_id
          LEFT JOIN patient_profiles p     ON b.patient_id = p.patient_id
          LEFT JOIN staff_payments_tracking spt ON spt.transaction_id = t.transaction_id
          LEFT JOIN bank_accounts ba            ON spt.company_bank_account_id = ba.account_id
          LEFT JOIN staff_bank_accounts sba     ON spt.staff_bank_account_id = sba.staff_bank_account_id
          WHERE t.staff_profile_id = $1
            AND (t.category = 'STAFF_SALARY' OR t.category = 'STAFF_SALARY_PAID')
            AND t.status = 'COMPLETED'
        ) ledger
        ORDER BY created_at DESC, transaction_id DESC
        LIMIT $2 OFFSET $3
      `, [staff_profile_id, limit, offset]),

      pool.query(`
        SELECT advance_id, advance_code, amount_requested, status, requested_at, approved_at, reviewed_by_name
        FROM staff_advances
        WHERE staff_profile_id = $1 AND status = 'APPROVED'
        ORDER BY approved_at DESC
      `, [staff_profile_id]),
    ]);

    const totalCount = parseInt(countRes.rows[0].total_count || 0);

    return res.status(200).json({
      status: 'success',
      data: {
        staff_name,
        summary: {
          current_earnings:        parseFloat(current_earnings || 0),
          total_earned:            parseFloat(summaryRes.rows[0].total_earned || 0),
          total_paid_out:          parseFloat(summaryRes.rows[0].total_paid_out || 0),
          total_advances_approved: parseFloat(advanceSumRes.rows[0].total_advances_approved || 0),
        },
        ledger:   ledgerRes.rows,
        advances: advancesRes.rows,
        pagination: {
          current_page: page,
          per_page:     limit,
          total_count:  totalCount,
          total_pages:  Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('getMyCurrentEarningsBreakdown Error:', error);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

module.exports = {
  getMyWallet,
  getMyAdvances,
  requestAdvance,
  approveAdvance,
  rejectAdvance,
  getAllAdvances,
  updateAdvanceThreshold,
  getPendingAdvances,
  getMyCurrentEarningsBreakdown,
};