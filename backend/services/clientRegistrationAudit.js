// services/clientRegistrationAudit.js
//
// One authoritative record of a client's registration fee, so an auditor never has to
// piece it together from the Invoices tab, the ledger and the status badge.
//
//   status        what the profile says (state, amount, dates, expiry)
//   ledger[]      every registration debit / credit / overdue invoice / legacy marker, oldest
//                 first, each with where it came from and whether it counts in Total Invoiced,
//                 Payments Made and Overdue
//   totals        invoiced, paid (cash / wallet), waived, outstanding
//   contribution  the fee's share of the three headline figures, using the same rules as
//                 services/clientFinancials.js
//   check         balanced or not, with a reason code a person can act on
//   history[]     the REG_FEE_* activity-log entries
//
// Payments Made only ever counts payments recorded with a real method (see
// clientFinancials.js). A fee paid before the system existed is shown here and in the
// Payments breakdown as a "legacy" line that is NOT part of that total.

const db = require('../config/db');
const { queryRegistrationOutstanding } = require('./clientFinancials');
const { describeTier } = require('./registrationTier');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => parseFloat(v || 0);
const EPS = 0.005;

// Where a registration payment came from. Derived from what the ledger row carries,
// so older rows (that predate any explicit "source" field) still read correctly.
function creditSource(r) {
  if (r.payment_method === 'WALLET') return 'WALLET';
  if (r.is_priority_membership) return 'PRIORITY_MEMBERSHIP';
  if (r.quote_id || r.payment_tracking_id) return 'QUOTATION';
  const notes = String(r.notes || '').toLowerCase();
  if (notes.includes('backdated')) return 'BACKDATED';
  if (notes.includes('marked paid')) return 'MARK_PAID';
  if (notes.includes('receipt verified')) return 'RECEIPT_VERIFIED';
  return 'DIRECT';
}

const SOURCE_LABEL = {
  WALLET: 'Paid from the client wallet',
  PRIORITY_MEMBERSHIP: 'Priority membership',
  QUOTATION: 'Quotation payment',
  BACKDATED: 'Past payment entered by staff',
  MARK_PAID: 'Marked as paid by staff',
  RECEIPT_VERIFIED: 'Receipt verified by staff',
  DIRECT: 'Direct payment',
  LEGACY: 'Paid before the system (imported)',
  CHARGE: 'Registration fee charge',
  OVERDUE_INVOICE: 'Invoice sent to the client',
};

async function getClientRegistrationAudit(clientId) {
  const [profileRes, txRes, invoiceRes, overdueRes, historyRes, outstanding] = await Promise.all([
    db.query(
      `SELECT client_profile_id, client_code, reg_fee_status, reg_fee_amount, reg_fee_invoiced_at,
              reg_fee_paid_at, reg_fee_expires_at, is_registration_fee_paid, import_batch_id, created_at, reg_fee_pre_system
       FROM client_profiles WHERE client_profile_id = $1`,
      [clientId]
    ),
    db.query(
      `SELECT t.transaction_id AS id, t.transaction_code AS code, t.created_at AS date,
              t.transaction_type AS type, t.amount, t.payment_method, t.reference_number AS reference,
              t.notes, t.booking_id, b.booking_code, t.quote_id, q.estimate_number,
              t.payment_tracking_id, t.receipt_url IS NOT NULL AS has_receipt,
              ba.account_nickname AS bank_account,
              COALESCE(vu.email, cu.email) AS recorded_by,
              (sr.service_type = 'PRIORITY_MEMBERSHIP') AS is_priority_membership,
              t.edited_at IS NOT NULL AS edited
       FROM transactions t
       LEFT JOIN bookings b ON b.booking_id = t.booking_id
       LEFT JOIN quotations q ON q.quote_id = t.quote_id
       LEFT JOIN service_requests sr ON sr.request_id = q.request_id
       LEFT JOIN bank_accounts ba ON ba.account_id = t.bank_account_id
       LEFT JOIN users vu ON vu.user_id = t.verified_by
       LEFT JOIN users cu ON cu.user_id = t.created_by
       WHERE t.client_id = $1 AND t.category::text = 'REGISTRATION_FEE'
       ORDER BY t.created_at ASC, t.transaction_id ASC`,
      [clientId]
    ),
    db.query(
      `SELECT invoice_id, invoice_code, amount, status, pdf_url, created_at
       FROM client_reg_fee_invoices WHERE client_id = $1 ORDER BY created_at ASC`,
      [clientId]
    ),
    db.query(
      `SELECT overdue_invoice_id AS id, invoice_code, amount, status, invoiced_at AS date
       FROM overdue_invoices WHERE client_id = $1 AND source_type = 'REGISTRATION_FEE'
       ORDER BY invoiced_at ASC`,
      [clientId]
    ),
    db.query(
      `SELECT action_type, actor_name, actor_role, details, created_at
       FROM activity_log
       WHERE entity_id = $1 AND action_type LIKE 'REG_FEE_%'
       ORDER BY created_at ASC`,
      [clientId]
    ),
    queryRegistrationOutstanding(clientId),
  ]);

  const profile = profileRes.rows[0];
  if (!profile) return null;

  const status = profile.reg_fee_status;
  const feeAmount = num(profile.reg_fee_amount);
  const txs = txRes.rows;
  const debits = txs.filter((t) => t.type === 'DEBIT');
  const credits = txs.filter((t) => t.type === 'CREDIT');
  const hasDebit = debits.length > 0;

  // ── Ledger rows ────────────────────────────────────────────────────────────
  const ledger = [];
  for (const t of txs) {
    const amount = num(t.amount);
    const isDebit = t.type === 'DEBIT';
    const fromWallet = t.payment_method === 'WALLET';
    const source = isDebit ? 'CHARGE' : creditSource(t);
    ledger.push({
      id: t.id, code: t.code, date: t.date, kind: isDebit ? 'INVOICE' : 'PAYMENT',
      amount, running_balance: null, source, source_label: SOURCE_LABEL[source] || source,
      method: t.payment_method, reference: t.reference || null, recorded_by: t.recorded_by || null,
      bank_account: t.bank_account || null, has_receipt: t.has_receipt,
      quote: t.estimate_number || null, booking_code: t.booking_code || null,
      edited: t.edited, notes: t.notes || null,
      counts_in_invoiced: isDebit,
      counts_in_payments: !isDebit && !fromWallet,
      why: !isDebit && fromWallet ? 'Drawn from money already in the wallet — settles the fee but is not a new payment' : null,
    });
  }

  // (an invoice backfilled on the same day as its payment must still read invoice-first)
  // An invoice sent to the client with no ledger debit behind it (older flow) still counts in
  // Total Invoiced through overdue_invoices — show it as its own line so it is not invisible.
  if (!hasDebit) {
    for (const o of overdueRes.rows) {
      ledger.push({
        id: o.id, code: o.invoice_code, date: o.date, kind: 'INVOICE', amount: num(o.amount),
        source: 'OVERDUE_INVOICE', source_label: SOURCE_LABEL.OVERDUE_INVOICE,
        counts_in_invoiced: true, counts_in_payments: false, running_balance: null,
        why: o.status === 'OVERDUE' ? 'Open invoice' : `Invoice ${String(o.status).toLowerCase()}`,
      });
    }
  }

  // Legacy: status says PAID but no payment is recorded anywhere on the ledger. A client who
  // came from the import paid before the system existed; anyone else is a gap staff must fix.
  const paidStatus = status === 'PAID' || status === 'EXPIRED';
  const noPaymentRecorded = credits.length === 0;
  const isImported = !!profile.import_batch_id;
  // Paid before the system = an imported client whose paid date is from before the import created
  // them. Marked paid weeks later, or never imported, is a gap in the record, not a legacy payment.
  const paidBeforeSystem = !!profile.reg_fee_pre_system || (isImported && profile.reg_fee_paid_at && profile.created_at
    && new Date(profile.reg_fee_paid_at) < new Date(profile.created_at));
  let legacy = null;
  if (paidStatus && noPaymentRecorded) {
    legacy = {
      kind: paidBeforeSystem ? 'PAID_BEFORE_SYSTEM' : 'PAID_NO_RECORD',
      amount: feeAmount,
      date: profile.reg_fee_paid_at,
      label: paidBeforeSystem
        ? 'Paid before the system went live. No payment was recorded here, so this is not counted in Payments Made.'
        : 'Marked paid but no payment was ever recorded. Staff need to record the payment or correct the status.',
    };
  }
  // Oldest first by day; on the same day the invoice reads before the payment, so the running
  // balance never dips below zero just because a charge was entered after its payment.
  const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
  ledger.sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date))
    || (a.kind === b.kind ? 0 : a.kind === 'INVOICE' ? -1 : 1)
    || new Date(a.date) - new Date(b.date));
  let running = 0;
  for (const row of ledger) {
    if (row.source === 'OVERDUE_INVOICE') continue;
    running = round2(running + (row.kind === 'INVOICE' ? row.amount : -row.amount));
    row.running_balance = running;
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const debitTotal = round2(debits.reduce((s, t) => s + num(t.amount), 0));
  const overdueRowsTotal = hasDebit ? 0 : round2(overdueRes.rows.reduce((s, o) => s + num(o.amount), 0));
  const invoicedTotal = round2(debitTotal + overdueRowsTotal);
  const paidCash = round2(credits.filter((t) => t.payment_method !== 'WALLET').reduce((s, t) => s + num(t.amount), 0));
  const paidWallet = round2(credits.filter((t) => t.payment_method === 'WALLET').reduce((s, t) => s + num(t.amount), 0));
  const paidTotal = round2(paidCash + paidWallet);
  const waived = status === 'WAIVED';
  // Owed = invoiced − paid, unless waived. Includes fee charges that sit on a booking.
  const owed = waived ? 0 : Math.max(round2(invoicedTotal - paidTotal), 0);
  const overpaid = Math.max(round2(paidTotal - invoicedTotal), 0);

  // ── Reconciliation ─────────────────────────────────────────────────────────
  const problems = [];
  const add = (code, text) => problems.push({ code, text });
  if (paidStatus && noPaymentRecorded && !paidBeforeSystem) add('PAID_NO_RECORD', 'Status is PAID but no payment is recorded.');
  if (credits.length > 0 && !hasDebit && overdueRowsTotal === 0) add('PAID_NOT_INVOICED', 'A payment is recorded but the fee was never invoiced, so it is missing from Total Invoiced.');
  if (!waived && hasDebit && owed > EPS && credits.length > 0 && paidTotal > 0) add('PARTIAL', `Only ${paidTotal.toFixed(2)} of ${invoicedTotal.toFixed(2)} is paid; ${owed.toFixed(2)} is still owed.`);
  if (overpaid > EPS) add('OVERPAID', `${overpaid.toFixed(2)} more was paid than invoiced. Decide whether to refund it or hold it as wallet credit.`);
  if (waived && (hasDebit || overdueRowsTotal > 0) && paidTotal > EPS) add('WAIVED_BUT_PAID', 'The fee is waived but a payment is recorded against it.');
  if (!waived && owed > EPS && ['PAID'].includes(status)) add('STATUS_LEDGER_MISMATCH', `Status says PAID but ${owed.toFixed(2)} is still owed on the ledger.`);
  if (debits.length > 1 && (profile.reg_fee_status !== 'EXPIRED')) add('DUPLICATE_DEBIT', `${debits.length} registration charges exist for this client.`);
  const pdfs = invoiceRes.rows;

  // ── Contribution to the headline figures (same rules as clientFinancials.js) ──
  const linkedOwed = Math.max(round2(
    debits.filter((t) => t.booking_id).reduce((s, t) => s + num(t.amount), 0)
    - credits.filter((t) => t.booking_id).reduce((s, t) => s + num(t.amount), 0)), 0);
  const contribution = {
    total_invoiced: invoicedTotal,
    payments_made: paidCash,
    overdue: waived ? 0 : round2(outstanding.outstanding),
    overdue_on_booking: waived ? 0 : linkedOwed,
    not_yet_due: round2(outstanding.notYetDue || 0),
    note: outstanding.notYetDue > EPS
      ? 'Invoiced, but the client has no started booking yet, so it is not counted as overdue until they do.'
      : linkedOwed > EPS
      ? 'Part of the unpaid fee sits on a booking, so it is shown in that booking’s balance on the Overdue page.'
      : null,
  };

  return {
    client_code: profile.client_code,
    tier: outstanding.tier,
    tier_reason: describeTier({ tier: outstanding.tier, reg_fee_status: status, reg_fee_expires_at: profile.reg_fee_expires_at }),
    status: {
      state: status, amount: feeAmount, invoiced_at: profile.reg_fee_invoiced_at,
      paid_at: profile.reg_fee_paid_at, expires_at: profile.reg_fee_expires_at,
      imported: isImported,
      source: waived ? 'WAIVER' : (credits.length ? creditSource(credits[credits.length - 1]) : (legacy?.kind === 'PAID_BEFORE_SYSTEM' ? 'LEGACY' : null)),
    },
    ledger,
    legacy,
    pdf_invoices: pdfs.map((p) => ({ id: p.invoice_id, code: p.invoice_code, amount: num(p.amount), status: p.status, pdf_url: p.pdf_url, date: p.created_at })),
    totals: { invoiced: invoicedTotal, paid: paidTotal, paid_cash: paidCash, paid_wallet: paidWallet, waived, owed, overpaid },
    contribution,
    check: { balanced: problems.length === 0, problems },
    history: historyRes.rows.map((h) => ({ date: h.created_at, action: h.action_type, by: h.actor_name, role: h.actor_role, details: h.details })),
  };
}

module.exports = { getClientRegistrationAudit, creditSource };
