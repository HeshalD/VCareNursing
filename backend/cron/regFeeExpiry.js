// cron/regFeeExpiry.js
// Runs once a day. Membership (the client registration fee) is valid for
// 365 days from payment. Any client_profiles row that's PAID and past its
// reg_fee_expires_at gets flipped back to PENDING — same state a client
// starts in before ever paying — so they show up again in the admin's
// "Registration Fees" queue (AdminInvoicesPage) for manual re-invoicing.
//
// Deliberately NOT automatic re-invoicing: per product decision, expiry only
// resets status; an admin decides when/whether to send the next invoice.
//
// reg_fee_invoiced_at / reg_fee_receipt_url / client_reg_fee_invoices history
// are left untouched — this only resets the "is currently a paid member" state.
const cron = require('node-cron');
const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

const runRegFeeExpiry = async () => {
  console.log('─── Registration Fee Expiry Cron Started ───');
  const client = await db.pool.connect();

  try {
    const expiredResult = await client.query(
      `SELECT client_profile_id, full_name FROM client_profiles
       WHERE reg_fee_status = 'PAID' AND reg_fee_expires_at IS NOT NULL AND reg_fee_expires_at <= NOW()`
    );

    for (const row of expiredResult.rows) {
      // One savepoint-free transaction per client — a failure on one client's
      // update shouldn't stop the rest of the batch from being processed.
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE client_profiles
           SET reg_fee_status = 'PENDING', is_registration_fee_paid = false,
               reg_fee_paid_at = NULL, reg_fee_expires_at = NULL
           WHERE client_profile_id = $1`,
          [row.client_profile_id]
        );
        await client.query('COMMIT');

        console.log(`Membership expired for client ${row.client_profile_id} (${row.full_name}) — reset to PENDING`);

        logActivity({
          actorUserId: null,
          actorName: 'System (Membership Expiry Cron)',
          actorRole: 'SYSTEM',
          actionType: 'REG_FEE_MEMBERSHIP_EXPIRED',
          entityType: 'CLIENT',
          entityId: row.client_profile_id,
          details: { client_name: row.full_name },
        }).catch((e) => console.error('Activity log error:', e.message));
      } catch (rowError) {
        await client.query('ROLLBACK');
        console.error(`Reg fee expiry failed for client ${row.client_profile_id}:`, rowError.message);
      }
    }

    console.log(`─── Registration Fee Expiry Cron Finished — ${expiredResult.rows.length} membership(s) expired ───`);
  } catch (error) {
    console.error('Registration fee expiry cron error:', error);
  } finally {
    client.release();
  }
};

const startRegFeeExpiry = () => {
  // Runs once daily, ahead of the other invoicing crons.
  cron.schedule('0 0 * * *', runRegFeeExpiry);
};

module.exports = startRegFeeExpiry;
module.exports.runRegFeeExpiry = runRegFeeExpiry;
