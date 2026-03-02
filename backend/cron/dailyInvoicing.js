// cron/dailyInvoicing.js
const cron = require('node-cron');
const db = require('../config/db'); // Adjust this path to your DB config

const startDailyInvoicing = () => {
    // Run every minute using cron
    cron.schedule('59 23 * * *', async () => {
        console.log('Running daily automated invoicing...');
        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            // DEBUG: First check if there are any active bookings at all
            console.log('DEBUG: Checking for active bookings...');
            const debugRes = await client.query('SELECT COUNT(*) as count FROM bookings WHERE status = $1', ['ACTIVE']);
            console.log('DEBUG: Active bookings count:', debugRes.rows[0].count);

            // 1. Find all ACTIVE bookings.
            // NOTE: We join the transactions table to figure out which quote 
            // started this booking so we can grab the daily rate.
            // (If your bookings table already has a daily_rate or quote_id column, use that instead!)
            const activeBookingsRes = await client.query(`
                SELECT
                    b.booking_id, 
                    b.client_id, 
                    q.daily_rate -- Make sure 'daily_rate' matches your column name in the quotations table
                FROM bookings b
                JOIN transactions t ON b.booking_id = t.booking_id AND t.category = 'CLIENT_PAYMENT'
                JOIN quotations q ON t.quote_id = q.quote_id
                WHERE b.status = 'ACTIVE'
            `);

            const activeBookings = activeBookingsRes.rows;

            if (activeBookings.length === 0) {
                console.log('No active bookings found. Skipping invoicing.');
                await client.query('ROLLBACK');
                return;
            }

            // 2. Format today's date exactly like the PDF (e.g., "01 Jan 2026")
            const today = new Date();
            const formattedDate = today.toLocaleDateString('en-GB', { 
                day: '2-digit', month: 'short', year: 'numeric' 
            });

            // 3. Loop through every active booking and create a DEBIT invoice
            for (const booking of activeBookings) {
                // Generate a random 6-digit invoice number
                const invoiceNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
                const notes = `${invoiceNumber}-due on ${formattedDate}`;

                // Insert the daily charge!
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
                    [booking.client_id, booking.booking_id, booking.daily_rate, notes]
                );
            }

            await client.query('COMMIT');
            console.log(`✅ Successfully generated daily invoices for ${activeBookings.length} active bookings.`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error running daily invoicing cron job:', error);
        } finally {
            client.release();
        }
    });
};

module.exports = startDailyInvoicing;