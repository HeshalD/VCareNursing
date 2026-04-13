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
     WHERE category = 'SERVICE_INVOICE' 
     AND DATE(created_at) = CURRENT_DATE`
  );

  const sequence = (parseInt(result.rows[0].count) + 1).toString().padStart(4, '0');
  return `INV-${datePart}-${sequence}`;
};

// ─── Overdue Detection ─────────────────────────────────────────────────────────

const flagOverdueBookings = async (client) => {
  // Find ACTIVE bookings where scheduled_end_time has passed
  const overdueRes = await client.query(
    `SELECT booking_id, client_id, assigned_staff_id
     FROM bookings
     WHERE status = 'ACTIVE'
       AND scheduled_end_time IS NOT NULL
       AND scheduled_end_time < NOW()`
  );

  if (overdueRes.rows.length === 0) return 0;

  for (const booking of overdueRes.rows) {
    // Flag booking as OVERDUE
    await client.query(
      `UPDATE bookings SET status = 'OVERDUE' WHERE booking_id = $1`,
      [booking.booking_id]
    );

    console.log(`⚠️  Booking ${booking.booking_id} flagged as OVERDUE — scheduled end date has passed.`);

    // TODO: Plug in WhatsApp/SMS admin alert here in Sprint 2
    // await sendWhatsAppMessage(adminNumber, `Booking ${booking.booking_id} has exceeded its paid days. Please extend or terminate.`);
  }

  return overdueRes.rows.length;
};

// ─── Cron Job ──────────────────────────────────────────────────────────────────

const startDailyInvoicing = () => {
  cron.schedule('59 23 * * *', async () => {
    console.log('─── Daily Invoicing Cron Started ───');
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Step 1 — Flag any overdue bookings first
      const overdueCount = await flagOverdueBookings(client);
      if (overdueCount > 0) {
        console.log(`⚠️  ${overdueCount} booking(s) flagged as OVERDUE and skipped from invoicing.`);
      }

      // Step 2 — Fetch all ACTIVE bookings that are NOT overdue
      // (overdue ones were just updated above so they won't appear here)
      const activeBookingsRes = await client.query(
        `SELECT
          b.booking_id,
          b.client_id,
          b.service_model,
          b.daily_rate,
          b.ot_rate,
          b.scheduled_end_time,
          b.actual_end_time
         FROM bookings b
         WHERE b.status = 'ACTIVE'
           AND b.daily_rate IS NOT NULL`
      );

      const activeBookings = activeBookingsRes.rows;

      if (activeBookings.length === 0) {
        console.log('No active bookings to invoice today.');
        await client.query('COMMIT');
        return;
      }

      // Step 3 — Generate invoices
      let successCount = 0;

      for (const booking of activeBookings) {
        try {
          const { amount, notes } = getBillingCharge(booking);
          const invoiceNumber = await generateInvoiceNumber(client);
          const fullNotes = `${invoiceNumber} — ${notes}`;

          await client.query(
            `INSERT INTO transactions (
              client_id,
              booking_id,
              category,
              transaction_type,
              amount,
              status,
              notes
            ) VALUES ($1, $2, 'SERVICE_INVOICE', 'DEBIT', $3, 'COMPLETED', $4)`,
            [booking.client_id, booking.booking_id, amount, fullNotes]
          );

          successCount++;
        } catch (bookingError) {
          console.error(`❌ Failed to invoice booking ${booking.booking_id}:`, bookingError);
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Invoiced ${successCount}/${activeBookings.length} active bookings.`);
      console.log('─── Daily Invoicing Cron Finished ───');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Fatal error in daily invoicing cron:', error);
    } finally {
      client.release();
    }
  });
};
module.exports = startDailyInvoicing;