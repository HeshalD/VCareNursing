const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { IN_CATEGORIES, OUT_CATEGORIES, MANUAL_CATEGORIES, flowOf } = require('../utils/transactionFlow');
const { generateTransactionsPdf } = require('../utils/transactionsPdf');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE', 'ONLINE_GATEWAY', 'OTHER'];
const VALID_FLOWS = ['IN', 'OUT', 'NEUTRAL'];

// Hard cap when a caller asks for every matching row (limit=all, used by
// exports) — protects against an unbounded response if a filter combination
// somehow matches the entire table.
const EXPORT_ROW_LIMIT = 5000;

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

const TRANSACTION_SELECT_COLUMNS = `
  t.transaction_id,
  t.transaction_code,
  t.category,
  t.transaction_type,
  t.amount,
  t.payment_method,
  t.status,
  t.notes,
  t.reference_number,
  t.cheque_number,
  t.cheque_date,
  t.receipt_url,
  t.is_manual,
  t.external_party,
  COALESCE(t.transaction_date, t.created_at::date) AS transaction_date,
  t.created_at,
  t.client_id,
  t.staff_profile_id,
  t.booking_id,
  cp.full_name          AS client_name,
  sp.full_name          AS staff_name,
  pp.full_name          AS patient_name,
  b.service_type        AS booking_service_type,
  ba.account_nickname   AS bank_account_nickname,
  ba.bank_name          AS bank_name,
  recorder.full_name    AS recorded_by_name
`;

const TRANSACTION_JOINS = `
  FROM transactions t
  LEFT JOIN client_profiles cp ON cp.client_profile_id = t.client_id
  LEFT JOIN staff_profiles sp ON sp.staff_profile_id = t.staff_profile_id
  LEFT JOIN bookings b ON b.booking_id = t.booking_id
  LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
  LEFT JOIN bank_accounts ba ON ba.account_id = t.bank_account_id
  LEFT JOIN staff_profiles recorder ON recorder.user_id = COALESCE(t.created_by, t.verified_by)
`;

// Shared WHERE-clause builder for the transactions ledger — used by both the
// paginated list endpoint and the PDF/Excel export (which needs every
// matching row, not just one page).
function buildTransactionFilters(query) {
  const { category, flow, payment_method, status, source, search, from_date, to_date } = query;

  const conditions = [];
  const params = [];

  if (category) {
    params.push(category);
    conditions.push(`t.category = $${params.length}`);
  }
  if (flow && VALID_FLOWS.includes(flow)) {
    if (flow === 'IN') {
      params.push(IN_CATEGORIES);
      conditions.push(`t.category::text = ANY($${params.length}::text[])`);
    } else if (flow === 'OUT') {
      params.push(OUT_CATEGORIES);
      conditions.push(`t.category::text = ANY($${params.length}::text[])`);
    } else {
      params.push([...IN_CATEGORIES, ...OUT_CATEGORIES]);
      conditions.push(`NOT (t.category::text = ANY($${params.length}::text[]))`);
    }
  }
  if (payment_method) {
    params.push(payment_method);
    conditions.push(`t.payment_method = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (source === 'MANUAL') {
    conditions.push(`t.is_manual = TRUE`);
  } else if (source === 'SYSTEM') {
    conditions.push(`COALESCE(t.is_manual, FALSE) = FALSE`);
  }
  if (from_date) {
    params.push(from_date);
    conditions.push(`COALESCE(t.transaction_date, t.created_at::date) >= $${params.length}`);
  }
  if (to_date) {
    params.push(to_date);
    conditions.push(`COALESCE(t.transaction_date, t.created_at::date) <= $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const p = params.length;
    conditions.push(`(
      cp.full_name ILIKE $${p}
      OR sp.full_name ILIKE $${p}
      OR t.external_party ILIKE $${p}
      OR t.reference_number ILIKE $${p}
      OR t.notes ILIKE $${p}
      OR pp.full_name ILIKE $${p}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// =========================================================
// GET /api/transactions
// Full transactions ledger with context joins + filters
// =========================================================
const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;

    // limit=all bypasses pagination entirely (used by the Excel export, which
    // needs every filtered row up-front) — still hard-capped for safety.
    const fetchAll = limit === 'all';
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = fetchAll ? EXPORT_ROW_LIMIT : Math.min(100, Math.max(1, parseInt(limit) || 25));
    const offset = fetchAll ? 0 : (pageNum - 1) * limitNum;

    const { whereClause, params } = buildTransactionFilters(req.query);
    const joins = TRANSACTION_JOINS;

    const listQuery = fetchAll
      ? `
        SELECT ${TRANSACTION_SELECT_COLUMNS}
        ${joins}
        ${whereClause}
        ORDER BY t.created_at DESC
        LIMIT ${EXPORT_ROW_LIMIT}
      `
      : `
        SELECT ${TRANSACTION_SELECT_COLUMNS}
        ${joins}
        ${whereClause}
        ORDER BY t.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

    // Money In / Out totals are derived from the category, not the stored
    // transaction_type column (which is semantically inconsistent across the app).
    const inParam = params.length + 1;
    const outParam = params.length + 2;
    const summaryQuery = `
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.category::text = ANY($${inParam}::text[])), 0) AS total_in,
        COALESCE(SUM(t.amount) FILTER (WHERE t.category::text = ANY($${outParam}::text[])), 0) AS total_out
      ${joins}
      ${whereClause}
    `;

    const [listResult, summaryResult] = await Promise.all([
      db.query(listQuery, fetchAll ? params : [...params, limitNum, offset]),
      db.query(summaryQuery, [...params, IN_CATEGORIES, OUT_CATEGORIES]),
    ]);

    const summaryRow = summaryResult.rows[0];
    const total_count = parseInt(summaryRow.total_count);

    return res.status(200).json({
      status: 'success',
      data: listResult.rows,
      summary: {
        total_in: parseFloat(summaryRow.total_in),
        total_out: parseFloat(summaryRow.total_out),
        net: parseFloat(summaryRow.total_in) - parseFloat(summaryRow.total_out),
      },
      pagination: {
        total: total_count,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.max(1, Math.ceil(total_count / limitNum)),
      },
    });
  } catch (err) {
    console.error('getAllTransactions error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error while fetching transactions' });
  }
};

// =========================================================
// GET /api/transactions/export/pdf
// Same filters as the list endpoint, but every matching row (no pagination),
// rendered as a landscape PDF with the company logo/header.
// =========================================================
const exportTransactionsPdf = async (req, res) => {
  try {
    const { whereClause, params } = buildTransactionFilters(req.query);
    const joins = TRANSACTION_JOINS;

    const listQuery = `
      SELECT ${TRANSACTION_SELECT_COLUMNS}
      ${joins}
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `;

    const inParam = params.length + 1;
    const outParam = params.length + 2;
    const summaryQuery = `
      SELECT
        COALESCE(SUM(t.amount) FILTER (WHERE t.category::text = ANY($${inParam}::text[])), 0) AS total_in,
        COALESCE(SUM(t.amount) FILTER (WHERE t.category::text = ANY($${outParam}::text[])), 0) AS total_out
      ${joins}
      ${whereClause}
    `;

    const [listResult, summaryResult, actorResult] = await Promise.all([
      db.query(listQuery, params),
      db.query(summaryQuery, [...params, IN_CATEGORIES, OUT_CATEGORIES]),
      db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]),
    ]);

    const summaryRow = summaryResult.rows[0];
    const transactions = listResult.rows.map(tx => ({ ...tx, _flow: flowOf(tx.category) }));

    const pdfBuffer = await generateTransactionsPdf({
      transactions,
      summary: {
        total_in: parseFloat(summaryRow.total_in),
        total_out: parseFloat(summaryRow.total_out),
        net: parseFloat(summaryRow.total_in) - parseFloat(summaryRow.total_out),
      },
      filters: req.query,
      generatedAt: new Date(),
      generatedBy: actorResult.rows[0]?.full_name || 'Admin',
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Transactions_${Date.now()}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('exportTransactionsPdf error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to generate transactions PDF' });
  }
};

// =========================================================
// GET /api/transactions/meta
// Enum values for filter/category dropdowns
// =========================================================
const getTransactionMeta = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT unnest(enum_range(NULL::transaction_category))::text AS category`
    );
    return res.status(200).json({
      status: 'success',
      categories: result.rows.map(r => r.category),
      payment_methods: VALID_PAYMENT_METHODS,
      manual_categories: MANUAL_CATEGORIES,
      in_categories: IN_CATEGORIES,
      out_categories: OUT_CATEGORIES,
    });
  } catch (err) {
    console.error('getTransactionMeta error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// =========================================================
// POST /api/transactions/manual
// Record an off-platform transaction manually
// =========================================================
const createManualTransaction = async (req, res) => {
  try {
    const {
      category,
      amount,
      payment_method,
      bank_account_id,
      cheque_number,
      cheque_date,
      reference_number,
      external_party,
      transaction_date,
      notes,
    } = req.body;

    // ---- Validation ----
    if (!category || !MANUAL_CATEGORIES.includes(category)) {
      return res.status(400).json({
        status: 'error',
        message: `category must be one of: ${MANUAL_CATEGORIES.join(', ')}`,
      });
    }

    // Direction is derived from the category, never trusted from the client.
    const flow = flowOf(category);
    const transaction_type = flow === 'IN' ? 'CREDIT' : 'DEBIT';

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ status: 'error', message: 'amount is required and must be > 0' });
    }

    if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        status: 'error',
        message: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
      });
    }

    if (!external_party || !String(external_party).trim()) {
      return res.status(400).json({ status: 'error', message: 'external_party (paid to / received from) is required' });
    }

    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bank_account_id) {
      return res.status(400).json({ status: 'error', message: `bank_account_id is required for ${payment_method}` });
    }

    if (payment_method === 'CHEQUE' && (!cheque_number || !cheque_date)) {
      return res.status(400).json({ status: 'error', message: 'cheque_number and cheque_date are required for CHEQUE payments' });
    }

    if (bank_account_id) {
      if (!uuidRegex.test(bank_account_id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid bank_account_id format' });
      }
      const bankCheck = await db.query(
        'SELECT is_active FROM bank_accounts WHERE account_id = $1',
        [bank_account_id]
      );
      if (bankCheck.rows.length === 0 || !bankCheck.rows[0].is_active) {
        return res.status(400).json({ status: 'error', message: 'Bank account not found or not active' });
      }
    }

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

    // ---- Resolve actor ----
    const actorUserId = req.user.user_id;
    const actorRole = extractActorRole(req.user.role);
    const actorNameResult = await db.query(
      'SELECT full_name FROM staff_profiles WHERE user_id = $1',
      [actorUserId]
    );
    const actorName = actorNameResult.rows[0]?.full_name || 'Admin';

    // ---- Insert ----
    const insertResult = await db.query(
      `INSERT INTO transactions
         (category, transaction_type, amount, payment_method, bank_account_id,
          cheque_number, cheque_date, reference_number, external_party,
          transaction_date, notes, status, is_manual, created_by, verified_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, CURRENT_DATE),$11,'COMPLETED',TRUE,$12,$12)
       RETURNING *`,
      [
        category, transaction_type, parsedAmount, payment_method,
        bank_account_id || null, cheque_number || null, cheque_date || null,
        reference_number || null, String(external_party).trim(),
        transaction_date || null, notes || null, actorUserId,
      ]
    );
    const transaction = insertResult.rows[0];

    await logActivity({
      actorUserId,
      actorName,
      actorRole,
      actionType: 'MANUAL_TRANSACTION_ADDED',
      entityType: 'transaction',
      entityId: transaction.transaction_id,
      details: {
        category,
        transaction_type,
        amount: parsedAmount,
        payment_method,
        external_party: String(external_party).trim(),
        transaction_date: transaction.transaction_date,
        reference_number: reference_number || null,
      },
    });

    return res.status(201).json({ status: 'success', transaction });
  } catch (err) {
    console.error('createManualTransaction error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
};

module.exports = {
  getAllTransactions,
  exportTransactionsPdf,
  getTransactionMeta,
  createManualTransaction,
};
