// cron/scheduledActions.js
// Enforcer for the scheduled_actions queue (see services/scheduledActions.js for the
// execute* functions). Invoked from dailyInvoicing.js at two points in the nightly run:
//   - pre-billing: ASSIGNMENT_START / STAFF_SWAP, so today's payroll/invoicing reflects
//     whichever staff member is on duty today.
//   - post-billing: TERMINATION / COMPLETION, so the effective date is billed/paid as
//     the final served day (consistent with the settlement math, which counts the end
//     date as worked).
// One bad row must not poison the batch: each row gets its own SAVEPOINT, and a failure
// is recorded on the row (status='FAILED') rather than rolling back the whole cron run.

const { dispatchScheduledAction, SYSTEM_ACTOR } = require('../services/scheduledActions');

// STAFF_RELIEVE (outgoing staff goes on leave) must run here too: it was missing from
// both lists, so a swap with a leave attached left the outgoing assignment open forever.
const PRE_BILLING_TYPES = ['ASSIGNMENT_START', 'STAFF_SWAP', 'STAFF_RELIEVE', 'SHIFT_PATTERN_CHANGE', 'SHIFT_REASSIGNMENT'];
const POST_BILLING_TYPES = ['TERMINATION', 'COMPLETION'];

// A STAFF_SWAP scheduled with no replacement (payload.new_staff_id is null) logs the
// outgoing staff out and pauses the booking. It runs POST-billing, like a termination,
// so the swap date is billed/paid as the last day served; a normal swap runs pre-billing.
const UNFILLED_SWAP_SQL = `(action_type = 'STAFF_SWAP' AND payload->>'new_staff_id' IS NULL)`;

const runDueActions = async (client, businessDate, actionTypes, { includeUnfilledSwaps = false } = {}) => {
    const typeFilter = includeUnfilledSwaps
        ? `(action_type = ANY($2::text[]) OR ${UNFILLED_SWAP_SQL})`
        : `action_type = ANY($2::text[]) AND NOT ${UNFILLED_SWAP_SQL}`;
    const dueRes = await client.query(
        `SELECT * FROM scheduled_actions
         WHERE status = 'SCHEDULED' AND effective_date <= $1 AND ${typeFilter}
         ORDER BY effective_date ASC
         FOR UPDATE SKIP LOCKED`,
        [businessDate, actionTypes]
    );

    let executed = 0;
    let failed = 0;

    for (const action of dueRes.rows) {
        await client.query('SAVEPOINT scheduled_action_row');
        try {
            const { notify } = await dispatchScheduledAction(client, action, SYSTEM_ACTOR);

            await client.query(
                `UPDATE scheduled_actions SET status = 'EXECUTED', executed_at = NOW() WHERE action_id = $1`,
                [action.action_id]
            );

            await client.query('RELEASE SAVEPOINT scheduled_action_row');
            executed++;

            if (notify) {
                // Fire-and-forget: must not block or fail the cron transaction.
                notify().catch((e) => console.error(`[scheduledActions] notify error for ${action.action_id}:`, e.message));
            }

            console.log(`✅ Scheduled action executed: ${action.action_type} for booking ${action.booking_id} (effective ${action.effective_date.toISOString().split('T')[0]})`);
        } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT scheduled_action_row');
            await client.query(
                `UPDATE scheduled_actions SET status = 'FAILED', error_text = $2 WHERE action_id = $1`,
                [action.action_id, err.message]
            );
            await client.query('RELEASE SAVEPOINT scheduled_action_row');
            failed++;
            console.error(`❌ Scheduled action failed: ${action.action_type} for booking ${action.booking_id}:`, err.message);
        }
    }

    return { executed, failed };
};

const runPreBillingScheduledActions = (client, businessDate) => runDueActions(client, businessDate, PRE_BILLING_TYPES);
const runPostBillingScheduledActions = (client, businessDate) => runDueActions(client, businessDate, POST_BILLING_TYPES, { includeUnfilledSwaps: true });

module.exports = { runPreBillingScheduledActions, runPostBillingScheduledActions, runDueActions };
