// services/registrationFeeGuard.js
//
// Single place that answers "is this client's registration fee in order?" at the moments
// money or a booking is created for them. Today it only WARNS — it never blocks:
//
//   REG_FEE_GUARD=off      does nothing
//   REG_FEE_GUARD=warn     (default) returns a warning for the caller to show, and writes a
//                           REG_FEE_GUARD_WARNING activity-log row so staff can see how often
//                           the gap happens before anything is enforced
//   REG_FEE_GUARD=enforce  blocks (HTTP 409, code REGISTRATION_NOT_IN_ORDER) the actions that call
//                           blockIfRegistrationMissing() while the client has NO registration
//                           invoice at all (NOT_INVOICED). Staff holding REG_FEE_OVERRIDE pass,
//                           and the override is logged. PAID_NO_RECORD never blocks (legacy data).
//
// A client "needs attention" when the fee is not PAID/WAIVED and no registration charge
// exists for them (no REGISTRATION_FEE debit and no registration overdue invoice), or when
// the fee is marked PAID but no registration payment is recorded. An override permission
// (REG_FEE_OVERRIDE) lets chosen staff continue in enforcing mode.

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

const roleOf = (role) => {
  const raw = Array.isArray(role) ? role[0] : role;
  return raw ? String(raw).replace(/\{|\}/g, '').split(',')[0].trim() : 'SYSTEM';
};
const MODE = () => String(process.env.REG_FEE_GUARD || 'warn').toLowerCase();

async function getRegistrationWarning(clientId, runner = db) {
  if (MODE() === 'off' || !clientId) return null;
  const res = await runner.query(
    `SELECT cp.client_code, cp.reg_fee_status AS status, cp.reg_fee_amount AS amount,
            EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = cp.client_profile_id
                      AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT') AS has_debit,
            EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = cp.client_profile_id
                      AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'CREDIT') AS has_payment,
            EXISTS (SELECT 1 FROM overdue_invoices o WHERE o.client_id = cp.client_profile_id
                      AND o.source_type = 'REGISTRATION_FEE') AS has_overdue_invoice
     FROM client_profiles cp WHERE cp.client_profile_id = $1`,
    [clientId]
  );
  const c = res.rows[0];
  if (!c || ['WAIVED'].includes(c.status)) return null;

  const charged = c.has_debit || c.has_overdue_invoice;
  if (['PAID', 'EXPIRED'].includes(c.status)) {
    if (c.has_payment) return null;
    return {
      code: 'PAID_NO_RECORD', client_code: c.client_code,
      message: 'This client’s registration fee is marked paid, but no payment is recorded for it.',
    };
  }
  if (charged) return null; // invoiced and awaiting payment — the fee is in the system
  return {
    code: 'NOT_INVOICED', client_code: c.client_code,
    message: `This client has no registration fee invoice (status ${c.status}). Invoice the fee, record it as paid, or waive it with a reason.`,
  };
}

// Warn + log. Never throws: a guard problem must never stop a payment or a booking.
async function warnIfRegistrationIncomplete(req, { clientId, action, runner = db }) {
  try {
    const warning = await getRegistrationWarning(clientId, runner);
    if (!warning) return null;
    try {
      await logActivity({
        actorUserId: req?.user?.user_id || null,
        actorName: 'Admin',
        actorRole: roleOf(req?.user?.role),
        actionType: 'REG_FEE_GUARD_WARNING',
        entityType: 'CLIENT',
        entityId: String(clientId),
        details: { action, code: warning.code, client_code: warning.client_code },
      });
    } catch (logErr) {
      console.error('Registration guard log failed:', logErr.message);
    }
    return warning;
  } catch (err) {
    console.error('Registration guard check failed:', err.message);
    return null;
  }
}

// Enforcing mode only. Returns true when it has already sent the 409 response, so the caller
// must `return`. Always false in off/warn mode, for WAIVED/PAID clients and for an invoiced fee.
async function blockIfRegistrationMissing(req, res, { clientId, action, runner = db }) {
  if (MODE() !== 'enforce') return false;
  try {
    const warning = await getRegistrationWarning(clientId, runner);
    if (!warning || warning.code !== 'NOT_INVOICED') return false;
    const { userHasPermission } = require('../middleware/authMiddleware');
    const allowed = await userHasPermission(req.user, 'REG_FEE_OVERRIDE');
    try {
      await logActivity({
        actorUserId: req?.user?.user_id || null, actorName: 'Admin', actorRole: roleOf(req?.user?.role),
        actionType: allowed ? 'REG_FEE_GUARD_OVERRIDDEN' : 'REG_FEE_GUARD_BLOCKED',
        entityType: 'CLIENT', entityId: String(clientId),
        details: { action, code: warning.code, client_code: warning.client_code },
      });
    } catch (logErr) { console.error('Registration guard log failed:', logErr.message); }
    if (allowed) return false;
    res.status(409).json({
      status: 'error', code: 'REGISTRATION_NOT_IN_ORDER',
      message: `${warning.message} You need the "Override Registration Fee Check" permission to continue without it.`,
      registration_warning: warning,
    });
    return true;
  } catch (err) {
    console.error('Registration enforcement check failed:', err.message);
    return false; // fail open: a guard fault must never stop real work
  }
}

module.exports = { getRegistrationWarning, warnIfRegistrationIncomplete, blockIfRegistrationMissing };
