const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

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
      FROM bank_accounts
      WHERE is_active = true
      ORDER BY created_at DESC
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
        created_at,
        updated_at,
        created_by
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
      currency = 'LKR'
    } = req.body;

    // Validate required fields
    if (!account_nickname || !account_number || !account_holder_name || !bank_name) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: account_nickname, account_number, account_holder_name, bank_name'
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
        created_by,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
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
        created_by
    `, [account_nickname, account_number, account_holder_name, bank_name, branch_name, currency, created_by]);

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
      SELECT account_id, is_active FROM bank_accounts WHERE account_id = $1
    `, [account_id]);

    if (existsCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Bank account not found'
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
    const { start_date, end_date, status } = req.query;

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
        t.category,
        cp.full_name as client_name
      FROM transactions t
      LEFT JOIN client_profiles cp ON t.client_id = cp.client_profile_id
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

    query += ` ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);

    // Calculate totals
    const totals = await db.query(`
      SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN t.status = 'COMPLETED' THEN t.amount ELSE 0 END) as total_completed,
        SUM(CASE WHEN t.status = 'PENDING' THEN t.amount ELSE 0 END) as total_pending
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
        total_pending: totals.rows[0].total_pending || 0
      },
      filters: {
        start_date: start_date || null,
        end_date: end_date || null,
        status: status || null
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
        currency
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
        payment_method,
        status,
        created_at,
        verified_by,
        category
      FROM transactions
      WHERE bank_account_id = $1 AND status = 'COMPLETED'
      ORDER BY created_at ASC
    `, [account_id]);

    // Calculate totals
    let total_deposits = 0;
    let transaction_details = [];

    for (const transaction of transactionsResult.rows) {
      total_deposits += parseFloat(transaction.amount);
      transaction_details.push({
        transaction_id: transaction.transaction_id,
        amount: parseFloat(transaction.amount),
        payment_method: transaction.payment_method,
        category: transaction.category,
        date: transaction.created_at,
        verified_by: transaction.verified_by
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Bank account reconciliation report generated',
      account: accountCheck.rows[0],
      summary: {
        total_deposits: total_deposits,
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

module.exports = {
  getAllBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  getAccountTransactions,
  getAccountReconciliation
};
