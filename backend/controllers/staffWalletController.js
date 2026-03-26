// backend/controllers/staffWalletController.js

const { pool } = require('../config/db');

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
      `SELECT sp.staff_profile_id, sp.advance_threshold_amount,
              COALESCE(sw.balance, 0) AS balance
       FROM staff_profiles sp
       LEFT JOIN staff_wallet sw ON sw.staff_profile_id = sp.staff_profile_id
       WHERE sp.user_id = $1`,
      [req.user.user_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    const { staff_profile_id, advance_threshold_amount, balance } = result.rows[0];

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

    // Debit the wallet
    await client.query(
      `UPDATE staff_wallet 
       SET balance = balance - $1, updated_at = NOW()
       WHERE staff_profile_id = $2`,
      [advance.amount_requested, advance.staff_profile_id]
    );

    // Log the transaction
    await client.query(
      `INSERT INTO staff_wallet_transactions 
        (staff_profile_id, type, amount, reason, reference_id, created_at)
       VALUES ($1, 'DEBIT', $2, 'ADVANCE_DEDUCTION', $3, NOW())`,
      [advance.staff_profile_id, advance.amount_requested, advance.advance_id]
    );

    // Update advance status
    const updated = await client.query(
      `UPDATE staff_advances 
       SET status = 'APPROVED', approved_at = NOW()
       WHERE advance_id = $1
       RETURNING *`,
      [advanceId]
    );

    await client.query('COMMIT');

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
    const result = await pool.query(
      `UPDATE staff_advances 
       SET status = 'REJECTED', rejected_reason = $1
       WHERE advance_id = $2 AND status = 'PENDING'
       RETURNING *`,
      [reason || null, advanceId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Pending advance not found' });
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
      `SELECT sa.*, sp.full_name, sp.advance_threshold_amount,
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
      `SELECT sa.*, sp.full_name, sp.advance_threshold_amount,
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

module.exports = {
  getMyWallet,
  requestAdvance,
  approveAdvance,
  rejectAdvance,
  getAllAdvances,
  updateAdvanceThreshold,
  getPendingAdvances
};