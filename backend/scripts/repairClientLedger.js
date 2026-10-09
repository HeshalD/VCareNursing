// scripts/repairClientLedger.js
// Finds — and, only when told to, repairs — the two kinds of drift the client money
// breakdown pages expose in records that were written before the underlying bugs were
// fixed:
//
//   regfee  A booking's registration-fee CHARGE (a REGISTRATION_FEE debit) still shows the
//           old amount although the fee was edited, so the booking owes a phantom
//           difference. Repair: restate the charge to what was actually paid, in place,
//           with the usual "Edited" marker.
//
//   wallet  The stored wallet balance disagrees with what the ledger entries add up to
//           (e.g. a booking was hard-deleted before that action settled the wallet).
//           Two repairs, chosen per client — only you know which side is right:
//             --wallet-mode adjust   The stored balance is right. Add a neutral
//                                    WALLET_ADJUSTMENT ledger entry so the ledger explains
//                                    it. The wallet itself is not touched.
//             --wallet-mode set      The ledger is right. Set the stored balance to the
//                                    ledger figure. (Refuses if that would leave less in
//                                    the wallet than is reserved for bookings, unless
//                                    --force.)
//
// Nothing is written unless --apply is given, and then only for the clients named with
// --client. Every repair runs in its own transaction and leaves an activity-log entry.
//
//   node scripts/repairClientLedger.js                       # report, whole database
//   node scripts/repairClientLedger.js --client <uuid>       # report, one client
//   node scripts/repairClientLedger.js --client <uuid> --apply --fix regfee
//   node scripts/repairClientLedger.js --client <uuid> --apply --fix wallet --wallet-mode adjust

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');
const { walletEffect, SOURCE_WALLET_REPAIR } = require('../services/walletLedger');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const APPLY = flag('apply');
const FORCE = flag('force');
const CLIENT = option('client');
const FIXES = (option('fix') || '').split(',').map((f) => f.trim()).filter(Boolean);
const WALLET_MODE = option('wallet-mode');
const TOLERANCE = 0.01;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Finding the drift ────────────────────────────────────────────────────────

const findWalletGaps = async () => {
  const [wallets, rows] = await Promise.all([
    db.query(
      `SELECT client_profile_id AS client_id, full_name, COALESCE(wallet_balance, 0) AS stored
       FROM client_profiles ${CLIENT ? 'WHERE client_profile_id = $1' : ''}`,
      CLIENT ? [CLIENT] : []
    ),
    db.query(
      `SELECT client_id, category::text AS category, transaction_type AS type, payment_method AS method, amount, notes
       FROM transactions
       WHERE client_id IS NOT NULL ${CLIENT ? 'AND client_id = $1' : ''}
         AND (category::text IN ('WALLET_TOPUP','WALLET_REFUND','SETTLEMENT_FORFEITURE','CLIENT_REFUND','WALLET_DEBIT','WALLET_ADJUSTMENT')
              OR payment_method = 'WALLET')`,
      CLIENT ? [CLIENT] : []
    ),
  ]);
  const ledger = new Map();
  for (const r of rows.rows) {
    const w = walletEffect(r);
    if (w) ledger.set(r.client_id, round2((ledger.get(r.client_id) || 0) + w.effect));
  }
  const reserved = await db.query(
    `SELECT client_id, COALESCE(SUM(wallet_earmarked), 0) AS reserved FROM bookings
     ${CLIENT ? 'WHERE client_id = $1' : ''} GROUP BY client_id`,
    CLIENT ? [CLIENT] : []
  );
  const reservedBy = new Map(reserved.rows.map((r) => [r.client_id, Number(r.reserved)]));

  return wallets.rows
    .map((w) => {
      const stored = round2(w.stored);
      const fromLedger = ledger.get(w.client_id) || 0;
      return { client_id: w.client_id, name: w.full_name, stored, fromLedger, gap: round2(stored - fromLedger), reserved: reservedBy.get(w.client_id) || 0 };
    })
    .filter((w) => Math.abs(w.gap) >= TOLERANCE);
};

const findRegFeeDrift = async () => {
  const res = await db.query(
    `SELECT d.transaction_id AS debit_id, d.client_id, cp.full_name AS name, d.amount AS charged, c.amount AS paid, b.booking_code
     FROM transactions d
     JOIN transactions c ON c.client_id = d.client_id AND c.quote_id = d.quote_id
                        AND c.category::text = 'REGISTRATION_FEE' AND c.transaction_type = 'CREDIT'
     JOIN client_profiles cp ON cp.client_profile_id = d.client_id
     LEFT JOIN bookings b ON b.booking_id = d.booking_id
     WHERE d.category::text = 'REGISTRATION_FEE' AND d.transaction_type = 'DEBIT'
       AND d.quote_id IS NOT NULL AND d.amount <> c.amount
       AND cp.reg_fee_status = 'PAID' AND cp.reg_fee_amount = c.amount
       ${CLIENT ? 'AND d.client_id = $1' : ''}
     ORDER BY cp.full_name`,
    CLIENT ? [CLIENT] : []
  );
  return res.rows.map((r) => ({ ...r, charged: round2(r.charged), paid: round2(r.paid) }));
};

// ── Repairing it ─────────────────────────────────────────────────────────────

const logRepair = (client, clientId, action, details) => client.query(
  `INSERT INTO activity_log (actor_name, actor_role, action_type, entity_type, entity_id, details)
   VALUES ('Ledger repair script', 'SYSTEM', $1, 'CLIENT', $2, $3::jsonb)`,
  [action, clientId, JSON.stringify(details)]
);

const repairRegFee = async (drift) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE transactions
       SET original_amount = COALESCE(original_amount, amount),
           amount = $2,
           notes = CONCAT_WS(' | ', NULLIF(notes, ''), $3::text),
           edited_at = NOW(), edited_by_name = 'Ledger repair script',
           edit_reason = 'Registration fee charge brought in line with the fee that was edited and paid',
           edit_count = COALESCE(edit_count, 0) + 1
       WHERE transaction_id = $1`,
      [drift.debit_id, drift.paid, `Corrected Rs.${drift.charged} -> Rs.${drift.paid}: charge matched to the paid registration fee`]
    );
    await logRepair(client, drift.client_id, 'LEDGER_REPAIR_REG_FEE_CHARGE', { debit_id: drift.debit_id, from: drift.charged, to: drift.paid });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const repairWallet = async (gap, mode) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT wallet_balance FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE`, [gap.client_id]);

    if (mode === 'adjust') {
      const credit = gap.gap > 0; // the wallet holds more than the ledger explains
      await client.query(
        `INSERT INTO transactions (client_id, category, transaction_type, amount, status, notes, created_at)
         VALUES ($1, 'WALLET_ADJUSTMENT', $2, $3, 'COMPLETED', $4, NOW())`,
        [gap.client_id, credit ? 'CREDIT' : 'DEBIT', Math.abs(gap.gap),
          `Reconciliation: ${credit ? 'wallet money the ledger could not explain' : 'ledger credit that never reached the wallet'} — recorded so the ledger matches the stored balance`]
      );
    } else {
      // The audit trigger records the change; this label tells the page it was a deliberate repair.
      await client.query(`SELECT set_config('application_name', $1, true)`, [SOURCE_WALLET_REPAIR]);
      await client.query(`UPDATE client_profiles SET wallet_balance = $2 WHERE client_profile_id = $1`, [gap.client_id, gap.fromLedger]);
    }
    await logRepair(client, gap.client_id, 'LEDGER_REPAIR_WALLET', {
      mode, stored_before: gap.stored, ledger: gap.fromLedger, gap: gap.gap,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Run ──────────────────────────────────────────────────────────────────────

const main = async () => {
  try {
    if (APPLY && !CLIENT) throw new Error('--apply needs --client <uuid>: repairs are made one client at a time.');
    if (APPLY && FIXES.length === 0) throw new Error('--apply needs --fix regfee, --fix wallet or both (comma separated).');
    if (APPLY && FIXES.includes('wallet') && !['adjust', 'set'].includes(WALLET_MODE)) {
      throw new Error('--fix wallet needs --wallet-mode adjust (stored balance is right) or --wallet-mode set (ledger is right).');
    }

    const [gaps, drift] = await Promise.all([findWalletGaps(), findRegFeeDrift()]);

    console.log(`\nRegistration-fee charges that no longer match the fee paid: ${drift.length}`);
    drift.forEach((d) => console.log(`  ${d.name} · ${d.booking_code || 'no booking'}: charged ${money(d.charged)}, paid ${money(d.paid)}  → restate the charge to ${money(d.paid)}`));

    console.log(`\nWallets that disagree with their ledger: ${gaps.length}`);
    gaps.forEach((g) => {
      const suggestion = g.gap > 0
        ? `stored is ${money(g.gap)} higher → likely records lost without settling the wallet; "adjust" keeps the money, "set" removes it`
        : `ledger is ${money(-g.gap)} higher → the ledger says the client is owed this; "set" restores it`;
      console.log(`  ${g.name} (${g.client_id})\n    stored ${money(g.stored)} · ledger ${money(g.fromLedger)} · reserved for bookings ${money(g.reserved)}\n    ${suggestion}`);
    });

    if (!APPLY) {
      console.log('\nDry run — nothing was changed. Re-run with --client <uuid> --apply --fix … to repair one client.');
      return;
    }

    if (FIXES.includes('regfee')) {
      for (const d of drift) {
        await repairRegFee(d);
        console.log(`✔ registration-fee charge restated for ${d.name}: ${money(d.charged)} → ${money(d.paid)}`);
      }
    }
    if (FIXES.includes('wallet')) {
      for (const g of gaps) {
        if (WALLET_MODE === 'set' && g.fromLedger < g.reserved - TOLERANCE && !FORCE) {
          console.log(`✘ ${g.name}: setting the wallet to ${money(g.fromLedger)} would leave less than the ${money(g.reserved)} reserved for bookings. Use "adjust", or --force.`);
          continue;
        }
        await repairWallet(g, WALLET_MODE);
        console.log(`✔ wallet repaired for ${g.name} (${WALLET_MODE}): stored ${money(g.stored)}, ledger ${money(g.fromLedger)}`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
};

if (require.main === module) {
  main();
}

module.exports = { findWalletGaps, findRegFeeDrift, repairWallet, repairRegFee };
