// services/walletLedger.js
// What each ledger entry does to a client's stored wallet balance
// (client_profiles.wallet_balance).
//
// The wallet is a running figure that eight different code paths nudge up and down;
// the `transactions` ledger is the only record of why. This module is the single
// reading of that record, shared by:
//   • the Wallet Balance breakdown page (services/clientFinancialBreakdown.js)
//   • hard-deleting a booking, which erases ledger rows and must settle their
//     wallet effect (controllers/bookingController.js → hardDeleteBooking)
//   • the repair tool (scripts/repairClientLedger.js)
// so all three agree on what a row means.
//
// WALLET_ADJUSTMENT is the only category whose whole job is the wallet: a NEUTRAL
// bookkeeping entry (not cash in, not a charge) that records money the wallet holds
// which no other entry explains — e.g. a prepayment carried over from a deleted
// booking, or a balance that predates the ledger.

const WALLET_ADJUSTMENT = 'WALLET_ADJUSTMENT';

// application_name values written to client_wallet_movements for changes that are deliberate
// but have no ledger entry of their own (the entries are gone, or the change IS the repair).
const SOURCE_BOOKING_DELETE = 'booking-delete';
const SOURCE_WALLET_REPAIR = 'wallet-repair';
const EXPLAINED_SOURCES = {
  [SOURCE_BOOKING_DELETE]: 'Booking deleted — money it had drawn was returned to the wallet',
  [SOURCE_WALLET_REPAIR]: 'Reconciliation repair',
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => parseFloat(v || 0);

// Raw `transactions` columns → the short names walletEffect reads.
const fromTransactionRow = (r) => ({
  category: r.category,
  type: r.type ?? r.transaction_type,
  method: r.method ?? r.payment_method,
  amount: r.amount,
  notes: r.notes,
});

/**
 * @param {{category:string,type:string,method:?string,amount:number|string,notes:?string}} r
 * @returns {{effect:number, rule:string}|null} null when the entry has nothing to do
 *   with the wallet; effect 0 for wallet-related entries that move no money.
 */
const walletEffect = (r) => {
  const amount = num(r.amount);
  const notes = String(r.notes || '');

  if (r.category === WALLET_ADJUSTMENT) {
    return r.type === 'CREDIT'
      ? { effect: amount, rule: 'Wallet adjustment — money the wallet holds that no other entry explains' }
      : { effect: -amount, rule: 'Wallet adjustment — money removed that no other entry explains' };
  }
  if (r.category === 'WALLET_TOPUP' && r.type === 'CREDIT') {
    return { effect: amount, rule: 'Paid into the wallet (top-up or service-charge prepayment)' };
  }
  if (r.type === 'CREDIT' && r.method === 'WALLET') {
    return { effect: -amount, rule: 'Drawn from the wallet to pay a booking charge or the registration fee' };
  }
  if (r.category === 'SETTLEMENT_FORFEITURE' && r.type === 'CREDIT') {
    return { effect: -amount, rule: 'Unused prepayment forfeited when the booking was settled' };
  }
  if (r.category === 'CLIENT_REFUND' && r.type === 'DEBIT') {
    return { effect: -amount, rule: 'Unused prepayment refunded to the client when the booking was settled' };
  }
  if (r.category === 'WALLET_REFUND' && r.type === 'CREDIT') {
    if (notes.includes('Settlement action: WALLET_DEPOSIT')) return { effect: 0, rule: 'Audit entry — the money was already in the wallet when the booking was settled' };
    if (notes.includes('bank refund')) return { effect: 0, rule: 'Refund processed outside the wallet (bank)' };
    if (notes.includes('booking extended')) return { effect: 0, rule: 'Kept on the booking to fund its extension — the wallet is untouched' };
    if (notes.startsWith('Correction for')) return { effect: 0, rule: 'Older invoice correction — adjusts what is owed, not the wallet' };
    return { effect: amount, rule: 'A reversed day credited back to the wallet' };
  }
  if (r.category === 'WALLET_DEBIT') {
    return { effect: 0, rule: 'Mirror entry for a wallet payoff — the wallet draws above already carry its effect' };
  }
  return null;
};

const netWalletEffect = (rows) => round2(rows.reduce((sum, row) => {
  const w = walletEffect(fromTransactionRow(row));
  return sum + (w ? w.effect : 0);
}, 0));

/**
 * Called by hardDeleteBooking just before it erases a booking's ledger rows, so the
 * stored wallet and the ledger stay in step afterwards. `rows` are the transactions
 * about to be deleted. Must run inside the caller's open transaction.
 *
 *   net > 0  — the rows put more into the wallet than they took out (unused
 *              prepayment). Deleting them must not make the client's money vanish
 *              and must not leave it unexplained, so it is carried over as an
 *              unearmarked WALLET_ADJUSTMENT credit. The wallet itself is untouched.
 *   net < 0  — the rows drew money out for charges that are being erased with the
 *              booking. That money goes back into the wallet.
 *
 * @returns {{net:number, action:'NONE'|'CARRIED_OVER'|'RESTORED'}}
 */
const settleWalletForDeletedTransactions = async (client, { client_id, rows, bookingCode }) => {
  const net = netWalletEffect(rows);
  if (Math.abs(net) < 0.005) return { net: 0, action: 'NONE' };

  await client.query(
    `SELECT wallet_balance FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`,
    [client_id]
  );

  if (net > 0) {
    await client.query(
      `INSERT INTO transactions (client_id, category, transaction_type, amount, status, notes, created_at)
       VALUES ($1, $2, 'CREDIT', $3, 'COMPLETED', $4, NOW())`,
      [client_id, WALLET_ADJUSTMENT, net,
        `Prepayment carried over from deleted booking${bookingCode ? ` ${bookingCode}` : ''} — kept in the client's wallet`]
    );
    return { net, action: 'CARRIED_OVER' };
  }

  // The rows that explain this change are about to be deleted, so tell the audit trail
  // (client_wallet_movements.application_name) it is a deliberate restore, not a stray edit.
  const previous = (await client.query(`SELECT current_setting('application_name') AS v`)).rows[0].v;
  await client.query(`SELECT set_config('application_name', $1, true)`, [SOURCE_BOOKING_DELETE]);
  await client.query(
    `UPDATE client_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE client_profile_id = $2`,
    [Math.abs(net), client_id]
  );
  await client.query(`SELECT set_config('application_name', $1, true)`, [previous]);
  return { net, action: 'RESTORED' };
};

module.exports = {
  WALLET_ADJUSTMENT,
  SOURCE_WALLET_REPAIR,
  EXPLAINED_SOURCES,
  walletEffect,
  fromTransactionRow,
  netWalletEffect,
  settleWalletForDeletedTransactions,
};
