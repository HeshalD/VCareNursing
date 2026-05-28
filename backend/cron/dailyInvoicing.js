// cron/dailyInvoicing.js
const cron = require('node-cron');
const db = require('../config/db');

// ─── Billing Engine ────────────────────────────────────────────────────────────

const calculateLiveInCharge = (booking) => {
  if (!booking.actual_end_time) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: 'Live-in daily charge'
    };
  }

  const scheduled = new Date(booking.scheduled_end_time);
  const actual = new Date(booking.actual_end_time);
  const overrunHours = (actual - scheduled) / (1000 * 60 * 60);

  if (overrunHours < 2) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: `Live-in daily charge (overrun ${overrunHours.toFixed(1)}h — waived)`
    };
  }

  return {
    amount: parseFloat(booking.daily_rate) * 2,
    notes: `Live-in daily charge + extra day (overrun ${overrunHours.toFixed(1)}h)`
  };
};

const calculateShiftCharge = (booking) => {
  if (!booking.actual_end_time || !booking.scheduled_end_time) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: 'Shift-based daily charge'
    };
  }

  const scheduled = new Date(booking.scheduled_end_time);
  const actual = new Date(booking.actual_end_time);
  const overtimeHours = (actual - scheduled) / (1000 * 60 * 60);

  if (overtimeHours <= 0) {
    return {
      amount: parseFloat(booking.daily_rate),
      notes: 'Shift-based daily charge (no overtime)'
    };
  }

  const otCharge = overtimeHours * parseFloat(booking.ot_rate);
  const total = parseFloat(booking.daily_rate) + otCharge;

  return {
    amount: total,
    notes: `Shift charge + OT ${overtimeHours.toFixed(1)}h × Rs.${booking.ot_rate} = Rs.${otCharge.toFixed(2)}`
  };
};

const calculateVisitingCharge = (booking) => {
  return {
    amount: parseFloat(booking.daily_rate),
    notes: 'Visiting service daily charge'
  };
};

const getBillingCharge = (booking) => {
  switch (booking.service_model) {
    case 'LIVE_IN':     return calculateLiveInCharge(booking);
    case 'SHIFT_BASED': return calculateShiftCharge(booking);
    case 'VISITING':    return calculateVisitingCharge(booking);
    default:
      return {
        amount: parseFloat(booking.daily_rate),
        notes: 'Daily charge'
      };
  }
};

// ─── Invoice Number Generator ──────────────────────────────────────────────────

const generateInvoiceNumber = async (client) => {
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');

  const result = await client.query(
    `SELECT COUNT(*) as count 
     FROM transactions 
      WHERE category IN ('SERVICE_INVOICE', 'REGISTRATION_FEE') 
     AND DATE(created_at) = CURRENT_DATE`
  );

  const sequence = (parseInt(result.rows[0].count) + 1).toString().padStart(4, '0');
  return `INV-${datePart}-${sequence}`;
};

const getActiveBookingBalances = async (client) => {
  return client.query(
    `SELECT 
        b.booking_id,
        b.client_id,
        b.daily_rate,
        cp.full_name as client_name,
        uc.mobile_number as client_mobile,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' AND COALESCE(t.category, '') != 'STAFF_SALARY' THEN t.amount ELSE 0 END), 0) as total_paid,
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
        `SELECT DATE(NOW() AT TIME ZONE 'Asia/Colombo') AS business_date`
      );
      const today = businessDateResult.rows[0].business_date;

      // Step 1 — Flag any overdue bookings first
      const overdueCount = await flagOverdueBookings(client);
      if (overdueCount > 0) {
        console.log(`⚠️  ${overdueCount} booking(s) flagged as OVERDUE and skipped from invoicing.`);
      }

      // Step 2 — Fetch active and overdue bookings, then their active staff assignments
      const activeBookingsRes = await client.query(
        `SELECT booking_id, client_id, service_model, ot_rate, scheduled_end_time, actual_end_time
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

      // ===== PROCESS STAFF EARNINGS =====
      // For each active assignment, add daily_rate to staff's current_earnings
      for (const assignment of activeAssignments) {
        try {
          // 1. Update staff_profiles.current_earnings
          await client.query(
            `UPDATE staff_profiles
             SET current_earnings = current_earnings + $1
             WHERE staff_profile_id = $2`,
            [parseFloat(assignment.daily_rate), assignment.staff_profile_id]
          );

          // 2. Create STAFF_SALARY transaction (CREDIT) for staff wallet tracking
          await client.query(
            `INSERT INTO transactions (
              staff_profile_id,
              booking_id,
              category,
              transaction_type,
              amount,
              status,
              notes,
              created_at
            ) VALUES ($1, $2, 'STAFF_SALARY', 'CREDIT', $3, 'COMPLETED', $4, NOW())`,
            [
              assignment.staff_profile_id,
              assignment.booking_id,
              parseFloat(assignment.daily_rate),
              `Daily earnings from booking ${assignment.booking_id} for ${assignment.staff_name} (${today})`
            ]
          );

          staffEarningsCount++;
          console.log(`✅ Staff Earnings: ${assignment.staff_name} earned Rs.${assignment.daily_rate} for ${today}`);
        } catch (staffError) {
          console.error(`❌ Failed to process earnings for staff ${assignment.staff_profile_id}:`, staffError);
        }
      }

      // ===== PROCESS CLIENT INVOICES =====
      // For each unique booking, create a single SERVICE_INVOICE with sum of all staff rates
      for (const [bookingId, bookingData] of bookingMap.entries()) {
        try {
          const { amount, notes } = getBillingCharge(bookingData);
          const invoiceNumber = await generateInvoiceNumber(client);
          const fullNotes = `${invoiceNumber} — ${notes} (${activeAssignments.filter(a => a.booking_id === bookingId).length} staff member(s))`;

          await client.query(
            `INSERT INTO transactions (
              client_id,
              booking_id,
              category,
              transaction_type,
              amount,
              status,
              notes,
              created_at
            ) VALUES ($1, $2, 'SERVICE_INVOICE', 'DEBIT', $3, 'COMPLETED', $4, NOW())`,
            [bookingData.client_id, bookingId, amount, fullNotes]
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