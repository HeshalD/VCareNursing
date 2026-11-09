const db = require('../config/db');
const { logActivity, resolveActorName } = require('../utils/activityLogger');
const { userHasPermission } = require('../middleware/authMiddleware');
const register = require('../services/cashRegister');
const receiptController = require('./receiptController');
const { voidReceiptPayment, PaymentEditError } = require('../services/paymentEdits');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function actorOf(req) {
  const name = await resolveActorName(req.user.user_id).catch(() => null);
  return { user_id: req.user.user_id, name: name || 'Admin', role: extractActorRole(req.user.role) };
}

function log(actor, actionType, entityId, details) {
  logActivity({
    actorUserId: actor.user_id,
    actorName: actor.name,
    actorRole: actor.role,
    actionType,
    entityType: 'cash_register_session',
    entityId: entityId ? String(entityId) : null,
    details,
  }).catch((e) => console.error('[CashRegister] Activity log error:', e.message));
}

function handleError(res, err, label) {
  if (err instanceof register.RegisterError || err instanceof PaymentEditError) {
    return res.status(err.statusCode).json({ status: 'error', message: err.message });
  }
  console.error(`${label} error:`, err);
  return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
}

const checkUuid = (res, value, label) => {
  if (!uuidRegex.test(String(value))) {
    res.status(400).json({ status: 'error', message: `Invalid ${label}` });
    return false;
  }
  return true;
};

// GET /api/cash-register/current
// The register screen's one call: the open day (with totals + entries), whether today was
// already closed, and what the next opening float should default to.
const getCurrent = async (req, res) => {
  try {
    const today = register.todayLocal();
    const open = await register.getOpenSession();
    const todayRow = await db.query(
      `SELECT s.*, to_char(s.business_date, 'YYYY-MM-DD') AS business_date_str
       FROM cash_register_sessions s WHERE s.business_date = $1`,
      [today]
    );
    const closedToday = todayRow.rows[0] && todayRow.rows[0].status === 'CLOSED' ? todayRow.rows[0] : null;

    return res.status(200).json({
      status: 'success',
      data: {
        today,
        open_session: open ? await register.describeSession(open) : null,
        // The open day is from an earlier date: it has to be closed before today can start.
        stale_open_session: !!open && open.business_date_str !== today,
        closed_today_session: closedToday ? await register.describeSession(closedToday, { withEntries: false }) : null,
        suggested_float: await register.getSuggestedFloat(),
      },
    });
  } catch (err) {
    return handleError(res, err, 'getCurrent');
  }
};

// POST /api/cash-register/open
const openDay = async (req, res) => {
  try {
    const actor = await actorOf(req);
    const session = await register.openDay({
      openingFloat: req.body.opening_float,
      note: req.body.note,
      actor,
    });
    log(actor, 'CASH_REGISTER_OPENED', session.session_id, {
      business_date: session.business_date_str,
      opening_float: parseFloat(session.opening_float),
      suggested_float: session.suggested_float === null ? null : parseFloat(session.suggested_float),
      note: session.opening_float_note,
    });
    return res.status(201).json({ status: 'success', data: await register.describeSession(session) });
  } catch (err) {
    return handleError(res, err, 'openDay');
  }
};

// GET /api/cash-register/sessions/:session_id
const getSession = async (req, res) => {
  try {
    const { session_id } = req.params;
    if (!checkUuid(res, session_id, 'session id')) return;
    const session = await register.getSessionRow(session_id);
    if (!session) return res.status(404).json({ status: 'error', message: 'Register session not found' });

    // Cashiers work on the open day; looking back at any other day needs the history permission.
    if (session.status !== 'OPEN' && !(await userHasPermission(req.user, 'CASH_REGISTER_VIEW_ALL'))) {
      return res.status(403).json({ message: 'Permission Denied: You do not have access to this action.' });
    }
    const data = await register.describeSession(session);
    data.events = await register.getSessionEvents(session_id);
    return res.status(200).json({ status: 'success', data });
  } catch (err) {
    return handleError(res, err, 'getSession');
  }
};

// GET /api/cash-register/sessions?from=&to=&flagged=
const listSessions = async (req, res) => {
  try {
    const { from, to, flagged, unreviewed } = req.query;
    const params = [];
    const where = [];
    if (from) { params.push(from); where.push(`s.business_date >= $${params.length}`); }
    if (to) { params.push(to); where.push(`s.business_date <= $${params.length}`); }
    if (flagged === 'true') where.push('s.flagged = TRUE');
    if (unreviewed === 'true') where.push('s.flagged = TRUE AND s.reviewed_at IS NULL');

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 60));
    const result = await db.query(
      `SELECT s.session_id, to_char(s.business_date, 'YYYY-MM-DD') AS business_date, s.status,
              s.opening_float, s.expected_cash, s.counted_cash, s.variance, s.variance_note,
              s.flagged, s.opened_by_name, s.closed_by_name, s.closed_at, s.reviewed_at,
              s.reviewed_by_name, s.reopen_count,
              COALESCE((SELECT SUM(total_amount) FROM payment_receipts r
                        WHERE r.register_session_id = s.session_id AND r.voided_at IS NULL), 0) AS total_received,
              COALESCE((SELECT COUNT(*) FROM payment_receipts r
                        WHERE r.register_session_id = s.session_id AND r.voided_at IS NULL), 0)::int AS payment_count
       FROM cash_register_sessions s
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY s.business_date DESC
       LIMIT ${limit}`,
      params
    );
    return res.status(200).json({ status: 'success', data: result.rows });
  } catch (err) {
    return handleError(res, err, 'listSessions');
  }
};

// POST /api/cash-register/sessions/:session_id/close
const closeDay = async (req, res) => {
  try {
    const { session_id } = req.params;
    if (!checkUuid(res, session_id, 'session id')) return;
    const actor = await actorOf(req);
    const out = await register.closeDay({
      sessionId: session_id,
      countedCash: req.body.counted_cash,
      note: req.body.variance_note,
      actor,
    });
    log(actor, 'CASH_REGISTER_CLOSED', session_id, {
      business_date: out.session.business_date_str,
      expected_cash: out.expected_cash,
      counted_cash: parseFloat(out.session.counted_cash),
      variance: out.variance,
      flagged: out.flagged,
      note: out.session.variance_note,
    });
    return res.status(200).json({
      status: 'success',
      message: out.flagged
        ? `Day closed with a ${out.variance > 0 ? 'surplus' : 'shortage'} of ${Math.abs(out.variance).toFixed(2)}. It has been flagged for a manager.`
        : 'Day closed. The cash count matches exactly.',
      data: await register.describeSession(out.session),
    });
  } catch (err) {
    return handleError(res, err, 'closeDay');
  }
};

// POST /api/cash-register/sessions/:session_id/reopen
const reopenDay = async (req, res) => {
  try {
    const { session_id } = req.params;
    if (!checkUuid(res, session_id, 'session id')) return;
    const actor = await actorOf(req);
    const session = await register.reopenDay({ sessionId: session_id, reason: req.body.reason, actor });
    log(actor, 'CASH_REGISTER_REOPENED', session_id, {
      business_date: session.business_date_str,
      reason: String(req.body.reason || '').trim(),
    });
    return res.status(200).json({ status: 'success', data: await register.describeSession(session) });
  } catch (err) {
    return handleError(res, err, 'reopenDay');
  }
};

// POST /api/cash-register/sessions/:session_id/review
const reviewSession = async (req, res) => {
  try {
    const { session_id } = req.params;
    if (!checkUuid(res, session_id, 'session id')) return;
    const actor = await actorOf(req);
    const session = await register.reviewSession({ sessionId: session_id, note: req.body.note, actor });
    log(actor, 'CASH_REGISTER_VARIANCE_REVIEWED', session_id, {
      business_date: session.business_date_str,
      variance: session.variance === null ? null : parseFloat(session.variance),
      note: String(req.body.note || '').trim() || null,
    });
    return res.status(200).json({ status: 'success', data: await register.describeSession(session, { withEntries: false }) });
  } catch (err) {
    return handleError(res, err, 'reviewSession');
  }
};

// POST /api/cash-register/cash-out
const cashOut = async (req, res) => {
  try {
    const actor = await actorOf(req);
    const open = await register.getOpenSession();
    if (!open) return res.status(409).json({ status: 'error', message: 'Open the register before recording cash paid out.' });

    const out = await register.recordCashOut({
      sessionId: open.session_id,
      kind: req.body.kind,
      amount: req.body.amount,
      paidTo: req.body.paid_to,
      clientId: req.body.client_id,
      bankAccountId: req.body.bank_account_id,
      notes: req.body.notes,
      referenceNumber: req.body.reference_number,
      actor,
    });
    log(actor, 'CASH_REGISTER_CASH_OUT', open.session_id, {
      kind: out.kind,
      amount: out.amount,
      paid_to: req.body.paid_to || null,
      client_id: req.body.client_id || null,
      notes: req.body.notes || null,
    });
    return res.status(201).json({ status: 'success', data: out });
  } catch (err) {
    return handleError(res, err, 'cashOut');
  }
};

// POST /api/cash-register/cash-outs/:transaction_id/void
const voidCashOut = async (req, res) => {
  try {
    const { transaction_id } = req.params;
    if (!checkUuid(res, transaction_id, 'transaction id')) return;
    const actor = await actorOf(req);
    const out = await register.voidCashOut({
      transactionId: transaction_id,
      reason: req.body.reason,
      actor,
      canManageAll: await userHasPermission(req.user, 'CASH_REGISTER_MANAGE_ENTRIES'),
    });
    log(actor, 'CASH_REGISTER_ENTRY_VOIDED', out.session_id, {
      entry: 'CASH_OUT', kind: out.kind, amount: out.amount, reason: String(req.body.reason || '').trim(),
    });
    return res.status(200).json({ status: 'success', message: 'Entry voided.' });
  } catch (err) {
    return handleError(res, err, 'voidCashOut');
  }
};

// POST /api/cash-register/payments/:receipt_id/void
const voidPayment = async (req, res) => {
  try {
    const { receipt_id } = req.params;
    if (!checkUuid(res, receipt_id, 'receipt id')) return;
    const actor = await actorOf(req);
    const receipt = await register.loadManageableReceipt({
      receiptId: receipt_id,
      user: req.user,
      canManageAll: await userHasPermission(req.user, 'CASH_REGISTER_MANAGE_ENTRIES'),
    });
    const out = await voidReceiptPayment({ receipt_id, reason: req.body.reason, actor });
    await register.recordEvent(db, {
      sessionId: receipt.register_session_id, type: 'PAYMENT_VOIDED', actor,
      details: { receipt_code: out.receipt.receipt_code, amount: parseFloat(out.receipt.total_amount), reason: String(req.body.reason || '').trim(), reopened: out.reopened },
    });
    log(actor, 'CASH_REGISTER_ENTRY_VOIDED', receipt.register_session_id, {
      entry: 'PAYMENT',
      receipt_code: out.receipt.receipt_code,
      amount: parseFloat(out.receipt.total_amount),
      reason: String(req.body.reason || '').trim(),
      reopened: out.reopened,
    });
    return res.status(200).json({
      status: 'success',
      message: `Payment voided. Receipt ${out.receipt.receipt_code} has been cancelled.`,
      reopened: out.reopened,
    });
  } catch (err) {
    return handleError(res, err, 'voidPayment');
  }
};

// Gate for the edit routes below: same rules as a void (open day, current receipt, own
// entry unless the caller manages everyone's), then hands over to the shared handlers in
// receiptController so an edit at the desk behaves exactly like an admin edit.
const assertCanEditPayment = async (req, res, next) => {
  try {
    const { receipt_id } = req.params;
    if (!checkUuid(res, receipt_id, 'receipt id')) return;
    await register.loadManageableReceipt({
      receiptId: receipt_id,
      user: req.user,
      canManageAll: await userHasPermission(req.user, 'CASH_REGISTER_MANAGE_ENTRIES'),
    });
    return next();
  } catch (err) {
    return handleError(res, err, 'assertCanEditPayment');
  }
};

module.exports = {
  getCurrent,
  openDay,
  getSession,
  listSessions,
  closeDay,
  reopenDay,
  reviewSession,
  cashOut,
  voidCashOut,
  voidPayment,
  assertCanEditPayment,
  getEditContext: receiptController.getEditContext,
  editPayment: receiptController.editReceiptPayment,
};
