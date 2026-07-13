// cron/rentalInvoicing.js
// Runs once a day. For every ACTIVE rental_agreement on RECURRING billing
// whose next_invoice_date has arrived, stamps a new invoice into the
// generic `invoices` table (category = 'RENTAL_RECURRING') covering the
// next billing period, then advances next_invoice_date by one month.
//
// ONE_TIME agreements are invoiced once, at creation time, in
// rentalController.createRentalAgreement — this job never touches them.
//
// Idempotent by design: uniq_rental_recurring_invoice (rental_agreement_id,
// billing_period_start) means a re-run (or a slow/retried run) can't ever
// double-bill the same period — the INSERT ... ON CONFLICT DO NOTHING no-ops.
const cron = require('node-cron');
const db = require('../config/db');

function addOneMonth(dateStr) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function periodEndFor(startDateStr) {
  const d = new Date(startDateStr);
  d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Flags any PENDING invoice (product purchases, rentals, etc.) whose due
// date has passed as OVERDUE. Rental invoices never get an explicit
// due_date (see createRentalAgreementCore / this file's insert above), so
// billing_period_end is used as the effective due date for those; other
// invoice categories fall back further to billing_period_start, then
// due_date is checked first when a caller did set one explicitly.
const flagOverdueInvoices = async (client, today) => {
  const result = await client.query(
    `UPDATE invoices
        SET status = 'OVERDUE'
      WHERE status = 'PENDING'
        AND COALESCE(due_date, billing_period_end, billing_period_start) < $1
      RETURNING invoice_id`,
    [today]
  );
  return result.rows.length;
};

const runRentalInvoicing = async () => {
  console.log('─── Rental Invoicing Cron Started ───');
  const client = await db.pool.connect();

  try {
    const businessDateResult = await client.query(
      `SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS business_date`
    );
    const today = businessDateResult.rows[0].business_date;

    const overdueCount = await flagOverdueInvoices(client, today);
    if (overdueCount > 0) {
      console.log(`⚠️  ${overdueCount} invoice(s) flagged as OVERDUE.`);
    }

    const dueResult = await client.query(
      `SELECT rental_agreement_id, client_id, walk_in_customer_id, quote_id, rate, next_invoice_date
       FROM rental_agreements
       WHERE status = 'ACTIVE' AND billing_type = 'RECURRING' AND next_invoice_date <= $1`,
      [today]
    );

    let created = 0;
    for (const agreement of dueResult.rows) {
      // Each agreement gets its own transaction so one bad row can't block the rest.
      try {
        await client.query('BEGIN');

        const periodStart = agreement.next_invoice_date;
        const periodEnd = periodEndFor(periodStart);

        const insertResult = await client.query(
          `INSERT INTO invoices
             (category, client_id, walk_in_customer_id, quote_id, rental_agreement_id,
              amount, billing_period_start, billing_period_end)
           VALUES ('RENTAL_RECURRING', $1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (rental_agreement_id, billing_period_start)
             WHERE category = 'RENTAL_RECURRING'
           DO NOTHING
           RETURNING invoice_id`,
          [
            agreement.client_id, agreement.walk_in_customer_id, agreement.quote_id,
            agreement.rental_agreement_id, agreement.rate, periodStart, periodEnd,
          ]
        );

        if (insertResult.rows.length > 0) {
          created += 1;
        }

        await client.query(
          `UPDATE rental_agreements SET next_invoice_date = $1 WHERE rental_agreement_id = $2`,
          [addOneMonth(periodStart), agreement.rental_agreement_id]
        );

        await client.query('COMMIT');
      } catch (rowError) {
        await client.query('ROLLBACK');
        console.error(`Rental invoicing failed for agreement ${agreement.rental_agreement_id}:`, rowError.message);
      }
    }

    console.log(`─── Rental Invoicing Cron Finished — ${created} invoice(s) created ───`);
  } catch (error) {
    console.error('Rental invoicing cron error:', error);
  } finally {
    client.release();
  }
};

const startRentalInvoicing = () => {
  // Runs shortly after the daily invoicing job (23:59) so a rental agreement
  // created earlier today never gets billed a second time on the same day.
  cron.schedule('15 0 * * *', runRentalInvoicing);
};

module.exports = startRentalInvoicing;
module.exports.runRentalInvoicing = runRentalInvoicing;
