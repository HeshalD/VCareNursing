const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { MANUAL_CATEGORIES, flowOf } = require('../utils/transactionFlow');

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

/**
 * Get all active bank accounts
 * GET /api/bank-accounts
 */
const getAllBankAccounts = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ba.account_id,
        ba.account_nickname,
        ba.account_number,
        ba.account_holder_name,
        ba.bank_name,
        ba.branch_name,
        ba.is_active,
        ba.currency,
        ba.opening_balance,
        ba.opening_balance_date,
        ba.created_at,
        ba.updated_at,
        ba.created_by,
        ba.is_petty_cash,
        ba.opening_balance + COALESCE(SUM(
          CASE WHEN t.transaction_type = 'DEBIT' THEN -t.amount ELSE t.amount END
        ) FILTER (WHERE t.status = 'COMPLETED'), 0) AS current_balance
      FROM bank_accounts ba
      LEFT JOIN transactions t ON t.bank_account_id = ba.account_id
      WHERE ba.is_active = true
      GROUP BY ba.account_id
      ORDER BY ba.created_at DESC
    `);

    res.status(200).json({
      status: 'success',
      message: 'Bank accounts retrieved successfully',
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bank accounts',
      error: error.message
    });
  }
};

/**
 * Get a specific bank account by ID
 * GET /api/bank-accounts/:account_id
 */
const getBankAccountById = async (req, res) => {
  try {
    const { account_id } = req.params;

    // Validate UUID format
    if (!account_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account ID format'
      });
    }

    const result = await db.query(`
      SELECT 
        account_id,
        account_nickname,
        account_number,
        account_holder_name,
        bank_name,
        branch_name,
        is_active,
        currency,
        opening_balance,
        opening_balance_date,
        created_at,
        updated_at,
        created_by,
        is_petty_cash
      FROM bank_accounts
      WHERE account_id = $1
    `, [account_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Bank account retrieved successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching bank account:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bank account',
      error: error.message
    });
  }
};

/**
 * Create a new bank account
 * POST /api/bank-accounts
 */
const createBankAccount = async (req, res) => {
  try {
    const {
      account_nickname,
      account_number,
      account_holder_name,
      bank_name,
      branch_name,
      currency = 'LKR',
      opening_balance = 0,
      opening_balance_date
    } = req.body;

    // Validate required fields
    if (!account_nickname || !account_number || !account_holder_name || !bank_name) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: account_nickname, account_number, account_holder_name, bank_name'
      });
    }

    if (opening_balance !== undefined && isNaN(parseFloat(opening_balance))) {
      return res.status(400).json({
        status: 'error',
        message: 'Opening balance must be a valid number'
      });
    }

    // Validate account_number uniqueness
    const existingCheck = await db.query(`
      SELECT account_id FROM bank_accounts WHERE account_number = $1
    `, [account_number]);

    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Account number already exists in the system'
      });
    }

    // Get user_id from auth context (assumes auth middleware sets req.user)
    const created_by = req.user?.user_id || null;

    const result = await db.query(`
      INSERT INTO bank_accounts (
        account_nickname,
        account_number,
        account_holder_name,
        bank_name,
        branch_name,
        currency,
        opening_balance,
        opening_balance_date,
        created_by,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING
        account_id,
        account_nickname,
        account_number,
        account_holder_name,
        bank_name,
        branch_name,
        is_active,
        currency,
        opening_balance,
        opening_balance_date,
        created_at,
        created_by
    `, [account_nickname, account_number, account_holder_name, bank_name, branch_name, currency, parseFloat(opening_balance) || 0, opening_balance_date || null, created_by]);

    const created = result.rows[0];
    (async () => {
      try {
        const actorUserId = req.user?.user_id;
        const actorRole = extractActorRole(req.user?.role);
        const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [actorUserId]);
        await logActivity({
          actorUserId,
          actorName: nameRes.rows[0]?.full_name || 'Admin',
          actorRole,
          actionType: 'BANK_ACCOUNT_CREATED',
          entityType: 'bank_account',
          entityId: null,
          details: {
            account_id: created.account_id,
            account_nickname: created.account_nickname,
            account_number: created.account_number,
            bank_name: created.bank_name,
            branch_name: created.branch_name,
            currency: created.currency,
            opening_balance: created.opening_balance,
          },
        });
      } catch (e) {
        console.error('[BankAccount] Activity log error:', e.message);
      }
    })();

    res.status(201).json({
      status: 'success',
      message: 'Bank account created successfully',
      data: created
    });
  } catch (error) {
    console.error('Error creating bank account:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create bank account',
      error: error.message
    });
  }
};

/**
 * Update a bank account
 * PUT /api/bank-accounts/:account_id
 */
const updateBankAccount = async (req, res) => {
  try {
    const { account_id } = req.params;
    const {
      account_nickname,
      account_number,
      account_holder_name,
      bank_name,
      branch_name,
      currency
    } = req.body;

    // Validate UUID format
    if (!account_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account ID format'
      });
    }

    // Check if account exists
    const existsCheck = await db.query(`
      SELECT account_id FROM bank_accounts WHERE account_id = $1
    `, [account_id]);

    if (existsCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found'
      });
    }

    // If account_number is being changed, check uniqueness
    if (account_number) {
      const numberCheck = await db.query(`
        SELECT account_id FROM bank_accounts 
        WHERE account_number = $1 AND account_id != $2
      `, [account_number, account_id]);

      if (numberCheck.rows.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Account number already exists in the system'
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (account_nickname !== undefined) {
      updates.push(`account_nickname = $${paramCount++}`);
      values.push(account_nickname);
    }
    if (account_number !== undefined) {
      updates.push(`account_number = $${paramCount++}`);
      values.push(account_number);
    }
    if (account_holder_name !== undefined) {
      updates.push(`account_holder_name = $${paramCount++}`);
      values.push(account_holder_name);
    }
    if (bank_name !== undefined) {
      updates.push(`bank_name = $${paramCount++}`);
      values.push(bank_name);
    }
    if (branch_name !== undefined) {
      updates.push(`branch_name = $${paramCount++}`);
      values.push(branch_name);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${paramCount++}`);
      values.push(currency);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(account_id);

    const query = `
      UPDATE bank_accounts
      SET ${updates.join(', ')}
      WHERE account_id = $${paramCount}
      RETURNING 
        account_id,
        account_nickname,
        account_number,
        account_holder_name,
        bank_name,
        branch_name,
        is_active,
        currency,
        created_at,
        updated_at,
        created_by
    `;

    const result = await db.query(query, values);

    (async () => {
      try {
        const actorUserId = req.user?.user_id;
        const actorRole = extractActorRole(req.user?.role);
        const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [actorUserId]);
        await logActivity({
          actorUserId,
          actorName: nameRes.rows[0]?.full_name || 'Admin',
          actorRole,
          actionType: 'BANK_ACCOUNT_UPDATED',
          entityType: 'bank_account',
          entityId: null,
          details: { account_id, updated_fields: Object.keys(req.body) },
        });
      } catch (e) {
        console.error('[BankAccount] Activity log error:', e.message);
      }
    })();

    res.status(200).json({
      status: 'success',
      message: 'Bank account updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating bank account:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update bank account',
      error: error.message
    });
  }
};

/**
 * Deactivate a bank account (soft delete)
 * DELETE /api/bank-accounts/:account_id
 */
const deactivateBankAccount = async (req, res) => {
  try {
    const { account_id } = req.params;

    // Validate UUID format
    if (!account_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account ID format'
      });
    }

    // Check if account exists
    const existsCheck = await db.query(`
      SELECT account_id, is_active, is_petty_cash FROM bank_accounts WHERE account_id = $1
    `, [account_id]);

    if (existsCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found'
      });
    }

    if (existsCheck.rows[0].is_petty_cash) {
      return res.status(400).json({
        status: 'error',
        message: 'The Petty Cash account cannot be deactivated'
      });
    }

    if (!existsCheck.rows[0].is_active) {
      return res.status(400).json({
        status: 'error',
        message: 'Bank account is already deactivated'
      });
    }

    // Soft delete: set is_active to false
    const result = await db.query(`
      UPDATE bank_accounts
      SET is_active = false, updated_at = NOW()
      WHERE account_id = $1
      RETURNING 
        account_id,
        account_nickname,
        account_number,
        bank_name,
        is_active,
        updated_at
    `, [account_id]);

    const deactivated = result.rows[0];
    (async () => {
      try {
        const actorUserId = req.user?.user_id;
        const actorRole = extractActorRole(req.user?.role);
        const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [actorUserId]);
        await logActivity({
          actorUserId,
          actorName: nameRes.rows[0]?.full_name || 'Admin',
          actorRole,
          actionType: 'BANK_ACCOUNT_DEACTIVATED',
          entityType: 'bank_account',
          entityId: null,
          details: {
            account_id,
            account_nickname: deactivated.account_nickname,
            account_number: deactivated.account_number,
            bank_name: deactivated.bank_name,
          },
        });
      } catch (e) {
        console.error('[BankAccount] Activity log error:', e.message);
      }
    })();

    res.status(200).json({
      status: 'success',
      message: 'Bank account deactivated successfully',
      data: deactivated
    });
  } catch (error) {
    console.error('Error deactivating bank account:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to deactivate bank account',
      error: error.message
    });
  }
};

/**
 * Get all transactions for a specific bank account
 * GET /api/bank-accounts/:account_id/transactions
 */
const getAccountTransactions = async (req, res) => {
  try {
    const { account_id } = req.params;
    const { start_date, end_date, status, verified } = req.query;

    // Validate UUID format
    if (!account_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account ID format'
      });
    }

    // Check if account exists
    const accountCheck = await db.query(`
      SELECT account_id, account_nickname, account_number, bank_name
      FROM bank_accounts
      WHERE account_id = $1
    `, [account_id]);

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found'
      });
    }

    // Build query for transactions
    let query = `
      SELECT
        t.transaction_id,
        t.amount,
        t.payment_method,
        t.reference_number,
        t.status,
        t.created_at,
        t.verified_by,
        t.quote_id,
        t.client_id,
        t.staff_profile_id,
        t.category,
        t.external_party,
        t.bank_verified,
        t.bank_verified_at,
        t.bank_verified_by,
        verifier.full_name as bank_verified_by_name,
        cp.full_name as client_name,
        sp.full_name as staff_name
      FROM transactions t
      LEFT JOIN client_profiles cp ON t.client_id = cp.client_profile_id
      LEFT JOIN staff_profiles sp ON t.staff_profile_id = sp.staff_profile_id
      LEFT JOIN staff_profiles verifier ON verifier.user_id = t.bank_verified_by
      WHERE t.bank_account_id = $1
    `;

    const params = [account_id];
    let paramCount = 2;

    // Add date filters if provided
    if (start_date) {
      query += ` AND DATE(t.created_at) >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND DATE(t.created_at) <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    // Add status filter if provided
    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    // Add bank verification filter if provided
    if (verified === 'true' || verified === 'false') {
      query += ` AND t.bank_verified = $${paramCount}`;
      params.push(verified === 'true');
      paramCount++;
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);

    // Calculate totals
    const totals = await db.query(`
      SELECT
        COUNT(*) as transaction_count,
        SUM(CASE WHEN t.status = 'COMPLETED' THEN t.amount ELSE 0 END) as total_completed,
        SUM(CASE WHEN t.status = 'PENDING' THEN t.amount ELSE 0 END) as total_pending,
        COUNT(*) FILTER (WHERE t.bank_verified = true) as verified_count,
        COUNT(*) FILTER (WHERE t.bank_verified = false) as unverified_count
      FROM transactions t
      WHERE t.bank_account_id = $1
    `, [account_id]);

    res.status(200).json({
      status: 'success',
      message: 'Bank account transactions retrieved successfully',
      account: accountCheck.rows[0],
      transactions: result.rows,
      summary: {
        transaction_count: parseInt(totals.rows[0].transaction_count),
        total_completed: totals.rows[0].total_completed || 0,
        total_pending: totals.rows[0].total_pending || 0,
        verified_count: parseInt(totals.rows[0].verified_count),
        unverified_count: parseInt(totals.rows[0].unverified_count)
      },
      filters: {
        start_date: start_date || null,
        end_date: end_date || null,
        status: status || null,
        verified: verified === 'true' ? true : verified === 'false' ? false : null
      }
    });
  } catch (error) {
    console.error('Error fetching account transactions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch account transactions',
      error: error.message
    });
  }
};

/**
 * Mark a transaction as bank-verified (or unverified) — used by SUPER_ADMIN
 * to cross-reference each transaction against the actual bank statement.
 * PATCH /api/bank-accounts/:account_id/transactions/:transaction_id/verify
 */
const verifyAccountTransaction = async (req, res) => {
  try {
    const { account_id, transaction_id } = req.params;
    const { verified } = req.body;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!account_id || !uuidRe.test(account_id) || !transaction_id || !uuidRe.test(transaction_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account or transaction ID format'
      });
    }

    if (typeof verified !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: '"verified" must be a boolean'
      });
    }

    const txCheck = await db.query(`
      SELECT transaction_id FROM transactions
      WHERE transaction_id = $1 AND bank_account_id = $2
    `, [transaction_id, account_id]);

    if (txCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found for this bank account'
      });
    }

    const actorUserId = req.user?.user_id || null;

    const result = await db.query(`
      UPDATE transactions
      SET bank_verified = $1,
          bank_verified_by = $2,
          bank_verified_at = $3
      WHERE transaction_id = $4
      RETURNING transaction_id, bank_verified, bank_verified_by, bank_verified_at
    `, [verified, verified ? actorUserId : null, verified ? new Date() : null, transaction_id]);

    (async () => {
      try {
        const actorRole = extractActorRole(req.user?.role);
        const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [actorUserId]);
        await logActivity({
          actorUserId,
          actorName: nameRes.rows[0]?.full_name || 'Admin',
          actorRole,
          actionType: verified ? 'BANK_TRANSACTION_VERIFIED' : 'BANK_TRANSACTION_UNVERIFIED',
          entityType: 'transaction',
          entityId: null,
          details: { account_id, transaction_id },
        });
      } catch (e) {
        console.error('[BankAccount] Activity log error:', e.message);
      }
    })();

    res.status(200).json({
      status: 'success',
      message: verified ? 'Transaction marked as verified' : 'Transaction marked as unverified',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error verifying account transaction:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update transaction verification status',
      error: error.message
    });
  }
};

/**
 * Get reconciliation report for a bank account
 * GET /api/bank-accounts/:account_id/reconciliation
 */
const getAccountReconciliation = async (req, res) => {
  try {
    const { account_id } = req.params;

    // Validate UUID format
    if (!account_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account ID format'
      });
    }

    // Check if account exists
    const accountCheck = await db.query(`
      SELECT
        account_id,
        account_nickname,
        account_number,
        bank_name,
        currency,
        opening_balance
      FROM bank_accounts
      WHERE account_id = $1
    `, [account_id]);

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found'
      });
    }

    // Get all verified transactions for this account
    const transactionsResult = await db.query(`
      SELECT
        transaction_id,
        amount,
        transaction_type,
        payment_method,
        status,
        created_at,
        verified_by,
        category
      FROM transactions
      WHERE bank_account_id = $1 AND status = 'COMPLETED'
      ORDER BY created_at ASC
    `, [account_id]);

    // Calculate totals — DEBIT rows are stored as positive amounts, so they
    // must be subtracted (not summed in) to net out to the real balance.
    let total_deposits = 0;
    let total_withdrawals = 0;
    let transaction_details = [];

    for (const transaction of transactionsResult.rows) {
      const amt = parseFloat(transaction.amount);
      if (transaction.transaction_type === 'DEBIT') {
        total_withdrawals += amt;
      } else {
        total_deposits += amt;
      }
      transaction_details.push({
        transaction_id: transaction.transaction_id,
        amount: amt,
        transaction_type: transaction.transaction_type,
        payment_method: transaction.payment_method,
        category: transaction.category,
        date: transaction.created_at,
        verified_by: transaction.verified_by
      });
    }

    const opening_balance = parseFloat(accountCheck.rows[0].opening_balance) || 0;

    res.status(200).json({
      status: 'success',
      message: 'Bank account reconciliation report generated',
      account: accountCheck.rows[0],
      summary: {
        opening_balance: opening_balance,
        total_deposits: total_deposits,
        total_withdrawals: total_withdrawals,
        closing_balance: opening_balance + total_deposits - total_withdrawals,
        transaction_count: transactionsResult.rows.length,
        reconciliation_status: 'READY_FOR_REVIEW'
      },
      transactions: transaction_details
    });
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate reconciliation report',
      error: error.message
    });
  }
};

function extractActorUserId(req) {
  return req.user?.user_id || null;
}

/**
 * Record a manual CASH transaction against the Petty Cash account.
 * Available to SUPER_ADMIN and any internal user explicitly granted the
 * PETTY_CASH_RECORD_TRANSACTION permission (enforced by route middleware).
 * POST /api/bank-accounts/petty-cash/transactions
 */
const recordPettyCashTransaction = async (req, res) => {
  try {
    const {
      category,
      amount,
      direction,
      external_party,
      reference_number,
      notes,
      transaction_date
    } = req.body;

    if (!category || !MANUAL_CATEGORIES.includes(category)) {
      return res.status(400).json({
        status: 'error',
        message: `category must be one of: ${MANUAL_CATEGORIES.join(', ')}`
      });
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ status: 'error', message: 'amount is required and must be > 0' });
    }

    if (!external_party || !String(external_party).trim()) {
      return res.status(400).json({ status: 'error', message: 'external_party (paid to / received from) is required' });
    }

    // Direction is derived from the category by default (same rule as the general
    // manual transaction tool), but petty cash allows an explicit override since
    // small cash movements (e.g. a refund into the tin) don't always match the
    // category's usual flow.
    const resolvedDirection = ['CREDIT', 'DEBIT'].includes(direction) ? direction : (flowOf(category) === 'IN' ? 'CREDIT' : 'DEBIT');

    if (transaction_date) {
      const txDate = new Date(transaction_date);
      if (isNaN(txDate.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid transaction_date' });
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (txDate > today) {
        return res.status(400).json({ status: 'error', message: 'transaction_date cannot be in the future' });
      }
    }

    const pettyCashResult = await db.query(
      `SELECT account_id FROM bank_accounts WHERE is_petty_cash = true AND is_active = true LIMIT 1`
    );
    if (pettyCashResult.rows.length === 0) {
      return res.status(500).json({ status: 'error', message: 'Petty cash account is not configured' });
    }
    const pettyCashAccountId = pettyCashResult.rows[0].account_id;

    const actorUserId = extractActorUserId(req);
    const actorRole = extractActorRole(req.user?.role);
    const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [actorUserId]);
    const actorName = nameRes.rows[0]?.full_name || 'Admin';

    const insertResult = await db.query(
      `INSERT INTO transactions
         (category, transaction_type, amount, payment_method, bank_account_id,
          reference_number, external_party, transaction_date, notes,
          status, is_manual, created_by, verified_by)
       VALUES ($1,$2,$3,'CASH',$4,$5,$6,COALESCE($7, CURRENT_DATE),$8,'COMPLETED',TRUE,$9,$9)
       RETURNING *`,
      [
        category, resolvedDirection, parsedAmount, pettyCashAccountId,
        reference_number || null, String(external_party).trim(),
        transaction_date || null, notes || null, actorUserId
      ]
    );
    const transaction = insertResult.rows[0];

    await logActivity({
      actorUserId,
      actorName,
      actorRole,
      actionType: 'PETTY_CASH_TRANSACTION_ADDED',
      entityType: 'transaction',
      entityId: transaction.transaction_id,
      details: {
        category,
        transaction_type: resolvedDirection,
        amount: parsedAmount,
        external_party: String(external_party).trim(),
        transaction_date: transaction.transaction_date,
        reference_number: reference_number || null,
      },
    });

    return res.status(201).json({ status: 'success', transaction });
  } catch (error) {
    console.error('Error recording petty cash transaction:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record petty cash transaction',
      error: error.message
    });
  }
};

/**
 * Transfer funds between two active bank accounts (including Petty Cash).
 * Records a linked DEBIT (source) + CREDIT (destination) pair, category
 * ACCOUNT_TRANSFER — deliberately left NEUTRAL in utils/transactionFlow.js
 * so an internal transfer never inflates company income/expense totals.
 * POST /api/bank-accounts/transfer
 */
const transferFunds = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { from_account_id, to_account_id, amount, reference_number, notes, transfer_date } = req.body;

    if (!from_account_id || !uuidRegex.test(from_account_id) || !to_account_id || !uuidRegex.test(to_account_id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid from_account_id or to_account_id' });
    }
    if (from_account_id === to_account_id) {
      return res.status(400).json({ status: 'error', message: 'Source and destination accounts must be different' });
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ status: 'error', message: 'amount is required and must be > 0' });
    }

    if (transfer_date) {
      const d = new Date(transfer_date);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid transfer_date' });
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (d > today) {
        return res.status(400).json({ status: 'error', message: 'transfer_date cannot be in the future' });
      }
    }

    await client.query('BEGIN');

    // Lock both rows in a consistent order (by account_id) so two transfers
    // racing in opposite directions can't deadlock each other, and compute
    // the source account's real current balance to prevent an overdraw.
    const accountsResult = await client.query(
      `SELECT
         ba.account_id, ba.account_nickname, ba.is_active,
         ba.opening_balance + COALESCE((
           SELECT SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN -t.amount ELSE t.amount END)
           FROM transactions t WHERE t.bank_account_id = ba.account_id AND t.status = 'COMPLETED'
         ), 0) AS current_balance
       FROM bank_accounts ba
       WHERE ba.account_id IN ($1, $2)
       ORDER BY ba.account_id
       FOR UPDATE`,
      [from_account_id, to_account_id]
    );

    const fromAccount = accountsResult.rows.find((a) => a.account_id === from_account_id);
    const toAccount = accountsResult.rows.find((a) => a.account_id === to_account_id);

    if (!fromAccount || !toAccount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Source or destination account not found' });
    }
    if (!fromAccount.is_active || !toAccount.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Both accounts must be active' });
    }

    const fromBalance = parseFloat(fromAccount.current_balance);
    if (parsedAmount > fromBalance + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Insufficient balance in ${fromAccount.account_nickname} (available: ${fromBalance.toFixed(2)})`,
      });
    }

    const actorUserId = extractActorUserId(req);
    const actorRole = extractActorRole(req.user?.role);
    const nameRes = await client.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [actorUserId]);
    const actorName = nameRes.rows[0]?.full_name || 'Admin';

    const debitNotes = notes || `Transfer to ${toAccount.account_nickname}`;
    const creditNotes = notes || `Transfer from ${fromAccount.account_nickname}`;

    const debitResult = await client.query(
      `INSERT INTO transactions
         (category, transaction_type, amount, payment_method, bank_account_id,
          reference_number, notes, transaction_date, status, is_manual, created_by, verified_by)
       VALUES ('ACCOUNT_TRANSFER', 'DEBIT', $1, 'ACCOUNT_TRANSFER', $2, $3, $4, COALESCE($5, CURRENT_DATE), 'COMPLETED', TRUE, $6, $6)
       RETURNING transaction_id, transaction_date`,
      [parsedAmount, from_account_id, reference_number || null, debitNotes, transfer_date || null, actorUserId]
    );
    const debitTransactionId = debitResult.rows[0].transaction_id;

    const creditResult = await client.query(
      `INSERT INTO transactions
         (category, transaction_type, amount, payment_method, bank_account_id,
          reference_number, notes, transaction_date, status, is_manual, created_by, verified_by)
       VALUES ('ACCOUNT_TRANSFER', 'CREDIT', $1, 'ACCOUNT_TRANSFER', $2, $3, $4, COALESCE($5, CURRENT_DATE), 'COMPLETED', TRUE, $6, $6)
       RETURNING transaction_id, transaction_date`,
      [parsedAmount, to_account_id, reference_number || null, creditNotes, transfer_date || null, actorUserId]
    );
    const creditTransactionId = creditResult.rows[0].transaction_id;

    await client.query('COMMIT');

    await logActivity({
      actorUserId,
      actorName,
      actorRole,
      actionType: 'FUNDS_TRANSFERRED',
      entityType: 'transaction',
      entityId: debitTransactionId,
      details: {
        from_account_id,
        from_account_nickname: fromAccount.account_nickname,
        to_account_id,
        to_account_nickname: toAccount.account_nickname,
        amount: parsedAmount,
        reference_number: reference_number || null,
        debit_transaction_id: debitTransactionId,
        credit_transaction_id: creditTransactionId,
      },
    });

    return res.status(201).json({
      status: 'success',
      message: `Transferred ${parsedAmount.toFixed(2)} from ${fromAccount.account_nickname} to ${toAccount.account_nickname}`,
      data: {
        debit_transaction_id: debitTransactionId,
        credit_transaction_id: creditTransactionId,
        transaction_date: debitResult.rows[0].transaction_date,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error transferring funds:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to transfer funds',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  getAccountTransactions,
  verifyAccountTransaction,
  getAccountReconciliation,
  recordPettyCashTransaction,
  transferFunds
};
