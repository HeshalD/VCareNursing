// services/regFeeAdminAction.js
//
// Lets staff settle the registration-fee question at the moment they create something that
// would otherwise bypass it (an admin-direct booking). Runs inside the caller's transaction.
//
//   INVOICE      book the fee as invoiced (ledger DEBIT, status INVOICED) — it then shows in
//                Total Invoiced and, until paid, in Total Overdue
//   WAIVE        waive it (needs CLIENT_WAIVE_REG_FEE and a reason)
//   PAID_BEFORE  mark it paid from before the system (needs a note); no ledger entry
//   SKIP / none  do nothing; the registration guard will warn
const { recordRegFeeInvoiceDebit } = require('./registrationFeeService');
const { resolveOverdueInvoices } = require('./overdueInvoices');
const { logRegFee } = require('./regFeeLog');

const ACTIONS = ['INVOICE', 'WAIVE', 'PAID_BEFORE', 'SKIP'];

// Returns { applied: bool, action, error? }. Never throws for validation problems.
async function applyRegistrationChoice(runner, { clientId, action, amount, reason, userId, canWaive }) {
  if (!action || action === 'SKIP') return { applied: false, action: 'SKIP' };
  if (!ACTIONS.includes(action)) return { applied: false, error: 'Unknown registration fee action.' };

  const cur = await runner.query(
    `SELECT reg_fee_status FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`, [clientId]);
  const status = cur.rows[0]?.reg_fee_status;
  if (!status) return { applied: false, error: 'Client not found.' };
  if (['PAID', 'WAIVED'].includes(status)) return { applied: false, action: 'SKIP', note: 'Already settled.' };

  const cleanReason = String(reason || '').trim();

  if (action === 'INVOICE') {
    const fee = parseFloat(amount);
    if (!(fee > 0)) return { applied: false, error: 'Enter the registration fee amount to invoice.' };
    await recordRegFeeInvoiceDebit(runner, {
      client_id: clientId, amount: fee,
      notes: 'Registration fee invoiced (admin direct booking)',
    });
    await runner.query(
      `UPDATE client_profiles
       SET reg_fee_status = 'INVOICED', reg_fee_amount = $2, reg_fee_invoiced_at = COALESCE(reg_fee_invoiced_at, NOW())
       WHERE client_profile_id = $1`, [clientId, fee]);
    logRegFee({ userId, action: 'REG_FEE_INVOICED_AT_BOOKING', clientId, details: { amount: fee } });
    return { applied: true, action };
  }

  if (cleanReason.length < 5) {
    return { applied: false, error: 'A reason (at least 5 characters) is required.' };
  }

  if (action === 'WAIVE') {
    if (!canWaive) return { applied: false, error: 'You do not have permission to waive registration fees.' };
    await runner.query(
      `UPDATE client_profiles
       SET reg_fee_status = 'WAIVED', is_registration_fee_paid = true,
           reg_fee_paid_at = NOW(), reg_fee_expires_at = NOW() + INTERVAL '365 days'
       WHERE client_profile_id = $1`, [clientId]);
    try { await resolveOverdueInvoices(runner, { client_id: clientId, source_type: 'REGISTRATION_FEE', resolution: 'WAIVED' }); }
    catch (e) { console.error('resolveOverdueInvoices (waive at booking):', e.message); }
    logRegFee({ userId, action: 'REG_FEE_WAIVED_AT_BOOKING', clientId, details: { reason: cleanReason } });
    return { applied: true, action };
  }

  // PAID_BEFORE
  await runner.query(
    `UPDATE client_profiles
     SET reg_fee_status = 'PAID', is_registration_fee_paid = true, reg_fee_pre_system = true,
         reg_fee_paid_at = NOW(), reg_fee_expires_at = NOW() + INTERVAL '365 days'
     WHERE client_profile_id = $1`, [clientId]);
  try { await resolveOverdueInvoices(runner, { client_id: clientId, source_type: 'REGISTRATION_FEE', resolution: 'PAID' }); }
  catch (e) { console.error('resolveOverdueInvoices (paid before at booking):', e.message); }
  logRegFee({ userId, action: 'REG_FEE_MARKED_PAID_BEFORE_SYSTEM_AT_BOOKING', clientId, details: { reason: cleanReason, pre_system: true } });
  return { applied: true, action };
}

module.exports = { applyRegistrationChoice, ACTIONS };
