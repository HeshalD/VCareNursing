const db = require('../config/db');

// Looks up the single active Petty Cash bank_accounts row (see migrate.js seedPettyCashAccount).
async function getPettyCashAccountId() {
  const result = await db.query(
    `SELECT account_id FROM bank_accounts WHERE is_petty_cash = true AND is_active = true LIMIT 1`
  );
  return result.rows[0]?.account_id || null;
}

// Every payment-recording site stores whatever bank_account_id the caller supplied
// (or null) alongside payment_method. CASH payments/payouts never came with a
// bank_account_id from the client, so they need to be routed here instead.
async function resolveBankAccountId(paymentMethod, bankAccountId) {
  if (paymentMethod === 'CASH') {
    return getPettyCashAccountId();
  }
  return bankAccountId || null;
}

module.exports = { getPettyCashAccountId, resolveBankAccountId };
