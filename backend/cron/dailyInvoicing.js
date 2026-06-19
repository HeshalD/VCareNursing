// cron/dailyInvoicing.js
const cron = require('node-cron');
const db = require('../config/db');
const {
  getBillingCharge,
  creditStaffSalary,
  createServiceInvoice
} = require('../services/billingService');

const getActiveBookingBalances = async (client) => {
  return client.query(
    `SELECT 
        b.booking_id,
        b.client_id,
        b.daily_rate,
        cp.full_name as client_name,
        uc.mobile_number as client_mobile,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' AND COALESCE(t.category::text, '') != 'STAFF_SALARY' THEN t.amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END), 0) as total_credits
     FROM bookings b
     JOIN client_profiles cp ON b.client_id = cp.client_profile_id
     JOIN users uc ON cp.user_id = uc.user_id
     LEFT JOIN transactions t ON b.booking_id = t.booking_id
     WHERE b.status = 'ACTIVE'
       AND b.daily_rate IS NOT NULL
       AND b.daily_rate > 0
     GROUP BY 
        b.booking_id, b.client_id, b.daily_rate, 
        cp.full_name, uc.mobile_number`
  );
};

// ─── Overdue Detection ─────────────────────────────────────────────────────────

const flagOverdueBookings = async (client) => {
  // Find ACTIVE bookings where total DEBITs exceed total CREDITs (new rule)
  const overdueRes = await getActiveBookingBalances(client);
  const overdueRows = overdueRes.rows.filter(
    booking => parseFloat(booking.total_debits) > parseFloat(booking.total_credits)
  );

  if (overdueRows.length === 0) return 0;

  for (const booking of overdueRows) {
    // Flag booking as OVERDUE
    await client.query(
      `UPDATE bookings SET status = 'OVERDUE' WHERE booking_id = $1`,
      [booking.booking_id]
    );

    console.log(
      `⚠️  Booking ${booking.booking_id} flagged as OVERDUE — debits Rs.${parseFloat(booking.total_debits).toFixed(2)} vs credits Rs.${parseFloat(booking.total_credits).toFixed(2)}`
    );

    // TODO: Plug in WhatsApp/SMS admin alert here in Sprint 2
    // await sendWhatsAppMessage(adminNumber, `Booking ${booking.booking_id} has exceeded its paid days. Please extend or terminate.`);
  }

  return overdueRows.length;
};

// ─── Cron Job ──────────────────────────────────────────────────────────────────

const startDailyInvoicing = () => {
  cron.schedule('59 23 * * *', async () => {
    console.log('─── Daily Invoicing Cron Started ───');
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const businessDateResult = await client.query(
        `SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS business_date`
      );
      const today = businessDateResult.rows[0].business_date;

      // Step 1 — Flag any overdue bookings first
      const overdueCount = await flagOverdueBookings(client);
      if (overdueCount > 0) {
        console.log(`⚠️  ${overdueCount} booking(s) flagged as OVERDUE and skipped from invoicing.`);
      }

      // Step 2 — Fetch active and overdue bookings, then their active staff assignments
      const activeBookingsRes = await client.query(
        `SELECT booking_id, client_id, service_model, ot_rate, scheduled_end_time, actual_end_time, invoicing_mode
         FROM bookings
        WHERE status IN ('ACTIVE', 'OVERDUE')
         ORDER BY created_at DESC`
      );

      const activeBookingIds = activeBookingsRes.rows.map(booking => booking.booking_id);

      if (activeBookingIds.length === 0) {
        console.log('No active or overdue bookings to process today.');
        await client.query('COMMIT');
        return;
      }

      const activeAssignmentsRes = await client.query(
        `SELECT
          bsa.assignment_id,
          bsa.booking_id,
          bsa.staff_profile_id,
          bsa.daily_rate,
          bsa.service_start_date,
          bsa.service_end_date,
          b.client_id,
          b.service_model,
          b.ot_rate,
          b.scheduled_end_time,
          b.actual_end_time,
          b.invoicing_mode,
          q.daily_rate as quote_daily_rate,
          sp.full_name as staff_name,
          c.full_name as client_name
         FROM booking_staff_assignments bsa
         JOIN bookings b ON bsa.booking_id = b.booking_id
         LEFT JOIN service_requests sr ON b.request_id = sr.request_id
         LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
         JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
         JOIN client_profiles c ON b.client_id = c.client_profile_id
         WHERE bsa.status = 'ACTIVE'
           AND bsa.booking_id = ANY($1::uuid[])`
        , [activeBookingIds]
      );

      const activeAssignments = activeAssignmentsRes.rows;

      if (activeAssignments.length === 0) {
        console.log('No active staff assignments to process today.');
        await client.query('COMMIT');
        return;
      }

      // Step 3 — Process staff earnings and client invoices
      // Only LIVE_IN bookings are auto-processed by the cron. A live-in nurse is
      // on-site continuously, so the daily salary is never in question. SHIFT_BASED
      // and VISITING staff may work far less than a full day (e.g. a 4-hour overnight
      // shift), so their salary requires an admin to log actual in/out time and
      // confirm payment manually via the attendance endpoints — see
      // controllers/dailyAttendanceController.js.
      let staffEarningsCount = 0;
      let clientInvoiceCount = 0;

      // Group assignments by booking for client invoicing
      const bookingMap = new Map();
      for (const assignment of activeAssignments) {
        if (!bookingMap.has(assignment.booking_id)) {
          bookingMap.set(assignment.booking_id, {
            booking_id: assignment.booking_id,
            client_id: assignment.client_id,
            client_name: assignment.client_name,
            service_model: assignment.service_model,
            invoicing_mode: assignment.invoicing_mode,
            daily_rate: parseFloat(assignment.quote_daily_rate || assignment.daily_rate),
            ot_rate: assignment.ot_rate,
            scheduled_end_time: assignment.scheduled_end_time,
            actual_end_time: assignment.actual_end_time,
            total_daily_rate: 0 // Sum of all staff daily rates for this booking
          });
        }
        // Add this assignment's daily rate to the booking total
        bookingMap.get(assignment.booking_id).total_daily_rate += parseFloat(assignment.daily_rate);
      }

      // ===== PROCESS STAFF EARNINGS (LIVE_IN only) =====
      for (const assignment of activeAssignments) {
        if (assignment.service_model !== 'LIVE_IN') continue; // SHIFT_BASED/VISITING require manual confirmation

        try {
          const salaryAmount = parseFloat(assignment.daily_rate);
          const salaryTransactionId = await creditStaffSalary(client, {
            staff_profile_id: assignment.staff_profile_id,
            booking_id: assignment.booking_id,
            amount: salaryAmount,
            notes: `Daily earnings from booking ${assignment.booking_id} for ${assignment.staff_name} (${today})`
          });

          // Audit trail row, consistent with the manual-confirmation flow's table
          await client.query(
            `INSERT INTO staff_daily_attendance (
              booking_id, assignment_id, staff_profile_id, service_date,
              hours_served, entry_mode, salary_status, salary_amount,
              salary_transaction_id, decided_by_name, decided_at
            ) VALUES ($1, $2, $3, $4, 24, 'AUTO', 'PAID', $5, $6, 'SYSTEM (auto — LIVE_IN)', NOW())
            ON CONFLICT (assignment_id, service_date) DO NOTHING`,
            [assignment.booking_id, assignment.assignment_id, assignment.staff_profile_id, today, salaryAmount, salaryTransactionId]
          );

          staffEarningsCount++;
          console.log(`✅ Staff Earnings: ${assignment.staff_name} earned Rs.${assignment.daily_rate} for ${today}`);
        } catch (staffError) {
          console.error(`❌ Failed to process earnings for staff ${assignment.staff_profile_id}:`, staffError);
        }
      }

      // ===== PROCESS CLIENT INVOICES (LIVE_IN + invoicing_mode = AUTO only) =====
      // SHIFT_BASED/VISITING bookings are always manual. LIVE_IN bookings can opt
      // into manual invoicing via bookings.invoicing_mode = 'MANUAL'.
      for (const [bookingId, bookingData] of bookingMap.entries()) {
        if (bookingData.service_model !== 'LIVE_IN' || bookingData.invoicing_mode === 'MANUAL') continue;

        try {
          const { amount, notes } = getBillingCharge(bookingData);
          const staffCount = activeAssignments.filter(a => a.booking_id === bookingId).length;
          const transactionId = await createServiceInvoice(client, {
            booking_id: bookingId,
            client_id: bookingData.client_id,
            amount,
            notes: `${notes} (${staffCount} staff member(s))`
          });

          await client.query(
            `INSERT INTO booking_daily_invoices (
              booking_id, service_date, entry_mode, status, amount, transaction_id, decided_by_name, decided_at
            ) VALUES ($1, $2, 'AUTO', 'INVOICED', $3, $4, 'SYSTEM (auto — LIVE_IN)', NOW())
            ON CONFLICT (booking_id, service_date) DO NOTHING`,
            [bookingId, today, amount, transactionId]
          );

          clientInvoiceCount++;
          console.log(`✅ Client Invoice: ${bookingData.client_name} charged Rs.${amount} for ${today}`);
        } catch (invoiceError) {
          console.error(`❌ Failed to invoice booking ${bookingId}:`, invoiceError);
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Daily Invoicing Complete: ${staffEarningsCount} staff earnings processed, ${clientInvoiceCount} client invoices created.`);

      // Step 4 — Run credit monitor in its own transaction
      await client.query('BEGIN');
      const alertsCount = await runCreditMonitor(client);
      await client.query('COMMIT');
      console.log(`✅ Credit monitor: ${alertsCount} alert(s) sent.`);
      console.log('─── Daily Invoicing Cron Finished ───');



    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Fatal error in daily invoicing cron:', error);
    } finally {
      client.release();
    }
  });
};

// ─── Credit Monitor ────────────────────────────────────────────────────────────

const runCreditMonitor = async (client) => {
  // Get all active bookings with their payment vs invoice totals
  const result = await getActiveBookingBalances(client);

  let alertsSent = 0;

  for (const booking of result.rows) {
    const totalPaid = parseFloat(booking.total_paid);
    const totalInvoiced = parseFloat(booking.total_invoiced);
    const dailyRate = parseFloat(booking.daily_rate);

    const remainingBalance = totalPaid - totalInvoiced;
    const remainingDays = dailyRate > 0 ? remainingBalance / dailyRate : null;

    // Log remainingDays for visibility
    console.log(`ℹ️  Booking ${booking.booking_id} remainingDays: ${remainingDays === null ? 'N/A' : remainingDays.toFixed(2)}`);

    // Determine alert type based on strict totals comparison per new rule
    const isNegative = totalPaid < totalInvoiced;
    const alertType = isNegative ? 'NEGATIVE_BALANCE' : 'EXPIRING_SOON';

    // Check if we already sent an alert today to avoid duplicates
    const alertCheck = await client.query(
      `SELECT alert_id FROM client_alerts
       WHERE booking_id = $1
         AND alert_type = $2
         AND DATE(sent_at) = CURRENT_DATE`,
      [booking.booking_id, alertType]
    );

    if (alertCheck.rows.length > 0) continue; // Already alerted today

    if (isNegative) {
      // Negative balance — total_paid < total_invoiced
      console.log(`🔴 NEGATIVE BALANCE: Booking ${booking.booking_id} — Client ${booking.client_name} owes Rs.${Math.abs(remainingBalance).toFixed(2)}`);

      // Log the alert
      await client.query(
        `INSERT INTO client_alerts (booking_id, client_id, alert_type, message, sent_at)
         VALUES ($1, $2, 'NEGATIVE_BALANCE', $3, NOW())`,
        [
          booking.booking_id,
          booking.client_id,
          `Balance negative by Rs.${Math.abs(remainingBalance).toFixed(2)}. Payment required.`
        ]
      );

      alertsSent++;

    } else if (remainingDays !== null && remainingDays <= 1) {
      // Day -1 — balance runs out tomorrow
      console.log(`🟡 EXPIRING SOON: Booking ${booking.booking_id} — Client ${booking.client_name} has ~${remainingDays.toFixed(1)} days left (Rs.${remainingBalance.toFixed(2)})`);

      // Log the alert
      await client.query(
        `INSERT INTO client_alerts (booking_id, client_id, alert_type, message, sent_at)
         VALUES ($1, $2, 'EXPIRING_SOON', $3, NOW())`,
        [
          booking.booking_id,
          booking.client_id,
          `Balance expiring soon. Approximately ${remainingDays.toFixed(1)} days remaining (Rs.${remainingBalance.toFixed(2)}).`
        ]
      );

      alertsSent++;
    }
  }

  return alertsSent;
};

module.exports = startDailyInvoicing;