// Nightly ledger health check (see services/ledgerHealth.js). Runs at 01:00, after the daily
// invoicing job (23:59), the registration-fee expiry job (00:00) and the rental invoicing job
// (00:15), so it audits the books once the night's billing has finished. Read-only.
//
// When a run finds NEW errors, an email goes to the addresses in LEDGER_HEALTH_ALERT_EMAILS
// (comma separated). Left unset, nothing is emailed and the Ledger Health page is the only place
// the results show.

const cron = require('node-cron');
const db = require('../config/db');
const sendEmail = require('../utils/email');
const { runLedgerHealth } = require('../services/ledgerHealth');

const alertRecipients = () => String(process.env.LEDGER_HEALTH_ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);

const emailNewErrors = async (summary) => {
  const to = alertRecipients();
  if (to.length === 0 || !summary.new_errors) return;
  const rows = (await db.query(
    `SELECT title, entity_label, amount, detail FROM ledger_health_findings
     WHERE first_seen_run = $1 AND severity = 'ERROR' AND resolved_at IS NULL ORDER BY title, entity_label LIMIT 25`, [summary.run_id]
  )).rows;
  const lines = rows.map((r) => `• ${r.title}: ${r.entity_label || ''}${r.amount ? ` (Rs. ${Number(r.amount).toLocaleString('en-LK')})` : ''}\n  ${r.detail || ''}`);
  const text = `The nightly ledger health check found ${summary.new_errors} new error${summary.new_errors === 1 ? '' : 's'}.\n\n${lines.join('\n\n')}`
    + `${summary.new_errors > rows.length ? `\n\n…and ${summary.new_errors - rows.length} more.` : ''}\n\nOpen Ledger Health in the admin area to review and acknowledge them.`;
  for (const email of to) {
    await sendEmail({ email, subject: `VCare ledger health: ${summary.new_errors} new error${summary.new_errors === 1 ? '' : 's'}`, message: text })
      .catch((err) => console.error('[ledgerHealth] alert email failed:', err.message));
  }
};

const runNightly = async () => {
  console.log('─── Ledger Health Check Started ───');
  try {
    const summary = await runLedgerHealth({ trigger: 'CRON' });
    console.log(`─── Ledger Health Check Finished: ${summary.errors} errors, ${summary.warnings} warnings, ${summary.new_errors} new errors ───`);
    await emailNewErrors(summary);
  } catch (err) {
    console.error('Ledger health check error:', err.message);
  }
};

const startLedgerHealth = () => {
  cron.schedule('0 1 * * *', runNightly);
};

module.exports = startLedgerHealth;
module.exports.runNightly = runNightly;
