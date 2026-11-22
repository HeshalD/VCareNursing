#!/usr/bin/env node
// scripts/restoreZeroedDaysAndRevoke.js
//
// One-off. Daily invoices that staff corrected down to Rs.0 by hand are put back to the amount they
// had before, then revoked with the SAME reason the staff member gave for the reduction.
//
// Dry run by default (everything rolls back). --apply commits.
//   --settlement WALLET_REFUND|BANK_REFUND|NO_REFUND   how a PAID day's money is settled (default WALLET_REFUND)
//   --revoke-salary                                    also reverse the staff salary of those days (default: client side only)
//
// Usage: node scripts/restoreZeroedDaysAndRevoke.js [--apply] [--settlement X]

const db = require('../config/db');
const { reverseServiceInvoice, reverseStaffSalary } = require('../services/billingService');
const { reconcileBookingDays, releaseDay } = require('../services/dayAllocation');
const { correctInvoiceAmount } = require('../services/amountCorrections');

const APPLY = process.argv.includes('--apply');
const REVOKE_SALARY = process.argv.includes('--revoke-salary');
const si = process.argv.indexOf('--settlement');
const SETTLEMENT = si > -1 ? process.argv[si + 1] : 'WALLET_REFUND';
const num = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100;
const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function main() {
  const pg = await db.pool.connect();
  const realQuery = db.query;
  db.query = (t, p) => pg.query(t, p);
  try {
    await pg.query('BEGIN');

    // Days whose invoice is still INVOICED at Rs.0 and whose LAST correction took it to 0.
    const rows = (await pg.query(`
      SELECT d.daily_invoice_id, d.booking_id, d.service_date, b.booking_code, b.client_id, b.service_model,
             c.old_amount, c.reason, c.corrected_by_name,
             cp.full_name AS client_name, cp.wallet_balance
      FROM booking_daily_invoices d
      JOIN bookings b ON b.booking_id = d.booking_id
      JOIN client_profiles cp ON cp.client_profile_id = b.client_id
      JOIN LATERAL (SELECT * FROM booking_amount_corrections c
                    WHERE c.daily_invoice_id = d.daily_invoice_id AND c.target_type = 'INVOICE'
                    ORDER BY c.created_at DESC LIMIT 1) c ON TRUE
      WHERE d.status = 'INVOICED' AND d.amount = 0 AND c.new_amount = 0
      ORDER BY b.booking_code, d.service_date`)).rows;

    console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN (nothing changes)'} | settlement ${SETTLEMENT} | salary ${REVOKE_SALARY ? 'reversed too' : 'left alone'} ===`);
    console.log(`${rows.length} zeroed day(s) found\n`);

    const walletBefore = {};
    let totalPaid = 0, totalUnpaid = 0, salaryPaid = 0;
    const actor = { actorUserId: null, actorName: 'Admin (restore & revoke)' };

    for (const r of rows) {
      if (walletBefore[r.client_id] === undefined) walletBefore[r.client_id] = num(r.wallet_balance);
      const date = ymd(r.service_date);

      const fix = await correctInvoiceAmount(pg, {
        booking_id: r.booking_id, service_date: date, daily_invoice_id: r.daily_invoice_id,
        new_amount: num(r.old_amount), reason: `Restoring amount before it was set to Rs.0 (${r.reason}) so the day can be revoked`,
        ...actor,
      });

      const paid = num((await pg.query(`SELECT COALESCE(SUM(amount),0) AS p FROM daily_invoice_payments WHERE daily_invoice_id = $1`, [r.daily_invoice_id])).rows[0].p);
      const inv = (await pg.query(`SELECT * FROM booking_daily_invoices WHERE daily_invoice_id = $1 FOR UPDATE`, [r.daily_invoice_id])).rows[0];
      const sal = (await pg.query(`SELECT * FROM staff_daily_attendance WHERE booking_id = $1 AND service_date = $2 AND salary_status = 'PAID'`, [r.booking_id, date])).rows;
      const salAmt = sal.reduce((s, x) => s + num(x.salary_amount), 0);
      salaryPaid += salAmt;

      // Money only went in for the part of the day that was actually paid. An unpaid day has nothing to
      // refund, so its charge is simply reversed on the ledger without crediting the wallet.
      const settle = paid > 0.005 ? SETTLEMENT : 'NO_CHARGE';
      const outcome = {};
      let reversalId = null;
      if (settle === 'NO_CHARGE') {
        reversalId = (await pg.query(
          `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, status, notes, created_at)
           VALUES ($1,$2,'WALLET_REFUND','CREDIT',$3,'COMPLETED',$4,NOW()) RETURNING transaction_id`,
          [r.client_id, r.booking_id, inv.amount, `Reversal of ${date} invoice (unpaid, charge cancelled) — ${r.reason}`])).rows[0].transaction_id;
      } else {
        reversalId = await reverseServiceInvoice(pg, {
          outcome, booking_id: r.booking_id, client_id: r.client_id, amount: inv.amount,
          notes: `Reversal of ${date} invoice — ${r.reason}`, settlementAction: SETTLEMENT,
        });
      }
      await pg.query(
        `UPDATE booking_daily_invoices SET status='REVOKED', reversal_transaction_id=$1, revoked_at=NOW(), revoked_by_user_id=NULL,
                revoked_by_name=$2, revoke_reason=$3, settlement_action=$4, updated_at=NOW() WHERE daily_invoice_id=$5`,
        [reversalId, 'Admin (restore & revoke)', r.reason, settle === 'NO_CHARGE' ? 'NO_REFUND' : SETTLEMENT, r.daily_invoice_id]);
      await releaseDay(pg, r.daily_invoice_id, 'Day revoked');

      if (REVOKE_SALARY) {
        for (const a of sal) {
          const rid = await reverseStaffSalary(pg, { staff_profile_id: a.staff_profile_id, booking_id: r.booking_id, amount: a.salary_amount, notes: `Reversal of ${date} salary — ${r.reason}` });
          await pg.query(`UPDATE staff_daily_attendance SET salary_status='REVOKED', reversal_transaction_id=$1, revoked_at=NOW(), revoked_by_name=$2, revoke_reason=$3, updated_at=NOW() WHERE attendance_id=$4`,
            [rid, 'Admin (restore & revoke)', r.reason, a.attendance_id]);
        }
      }

      if (paid > 0.005) totalPaid += num(inv.amount); else totalUnpaid += num(inv.amount);
      console.log(`${r.booking_code.padEnd(9)} ${date}  Rs.${String(num(r.old_amount)).padEnd(6)} restored:${fix.changed ? 'y' : 'n'}  dayPaid:${String(paid).padEnd(6)} ${settle.padEnd(13)} staffSalaryPaid:${salAmt}  reason "${r.reason}"`);
    }

    for (const bid of [...new Set(rows.map((x) => x.booking_id))]) await reconcileBookingDays(pg, bid);

    console.log(`\nPaid days revoked: Rs.${totalPaid} | unpaid days revoked: Rs.${totalUnpaid} | staff salary on these days: Rs.${salaryPaid}${REVOKE_SALARY ? ' (reversed)' : ' (NOT touched)'}`);
    console.log('\nClient wallet before -> after:');
    for (const id of Object.keys(walletBefore)) {
      const now = num((await pg.query(`SELECT wallet_balance, full_name FROM client_profiles WHERE client_profile_id=$1`, [id])).rows[0].wallet_balance);
      const nm = rows.find((x) => x.client_id === id).client_name;
      if (now !== walletBefore[id]) console.log(`  ${String(nm).padEnd(28)} ${walletBefore[id]} -> ${now}`);
    }

    if (APPLY) { await pg.query('COMMIT'); console.log('\nCOMMITTED.'); } else { await pg.query('ROLLBACK'); console.log('\nROLLED BACK (dry run).'); }
  } catch (e) {
    await pg.query('ROLLBACK').catch(() => {});
    console.error('FAILED, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    db.query = realQuery;
    pg.release();
    await db.pool.end().catch(() => {});
  }
}
main();
