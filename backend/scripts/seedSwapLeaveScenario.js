/**
 * Seed script: a LIVE_IN booking for testing "outgoing staff goes on leave" in the swap flow.
 *
 * Scenario: the outgoing staff member has been on the booking for a few days (paid by the
 * cron up to yesterday). Open the booking, Swap Staff, pick a replacement, answer
 * "Yes - going on leave" and try: leave starting today (relieved at once), leave starting
 * in a few days (scheduled relief), and a backdated swap.
 * Three AVAILABLE replacements are created so each try can use a fresh one.
 *
 * Creates fresh rows every run and touches nothing that already exists.
 *
 * Usage: node backend/scripts/seedSwapLeaveScenario.js [--days=4]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { creditStaffSalary } = require('../services/billingService');

const OUTGOING_RATE = 1500;
const REPLACEMENT_RATE = 1500;
const CLIENT_DAILY_RATE = 2500;

const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

async function uniqueMobile(client) {
    for (;;) {
        const mobile = `+9470${randomDigits(7)}`;
        const r = await client.query('SELECT 1 FROM users WHERE mobile_number = $1', [mobile]);
        if (r.rows.length === 0) return mobile;
    }
}

async function nextStaffCode(client) {
    const r = await client.query(
        `SELECT COALESCE(MAX((regexp_replace(staff_code, '\\D', '', 'g'))::int), 4999) + 1 AS n
         FROM staff_profiles WHERE staff_code ~ '^EMP-[0-9]+$'`
    );
    return r.rows[0].n;
}

async function createUser(client, role) {
    const mobile = await uniqueMobile(client);
    const hash = await bcrypt.hash(Math.random().toString(36).slice(-10), 10);
    const r = await client.query(
        `INSERT INTO users (email, password_hash, mobile_number, role, is_email_verified)
         VALUES (NULL, $1, $2, $3::user_role_enum[], true) RETURNING user_id`,
        [hash, mobile, [role]]
    );
    return { userId: r.rows[0].user_id, mobile };
}

async function createStaff(client, { fullName, staffCode, gender, status }) {
    const { userId, mobile } = await createUser(client, 'NURSE');
    const r = await client.query(
        `INSERT INTO staff_profiles (user_id, full_name, designation, gender, staff_code, location,
                                     willing_to_live_in, current_status, verification_status, admin_remarks, created_at)
         VALUES ($1, $2, 'Nurse', $3, $4, 'Colombo', true, $5, 'VERIFIED',
                 'Seeded for swap-leave testing — safe to delete.', NOW())
         RETURNING staff_profile_id`,
        [userId, fullName, gender, staffCode, status]
    );
    return { staffProfileId: r.rows[0].staff_profile_id, mobile, staffCode, fullName };
}

async function main() {
    const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
    const totalDays = Math.max(3, parseInt(args.days, 10) || 4);

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const today = (await client.query(`SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS d`)).rows[0].d;
        const dayOffset = async (n) => (await client.query(`SELECT ($1::date + $2::int)::text AS d`, [today, n])).rows[0].d;
        const startDate = await dayOffset(-totalDays);
        const yesterday = await dayOffset(-1);

        const admin = (await client.query(`SELECT user_id FROM users WHERE 'SUPER_ADMIN' = ANY(role) ORDER BY created_at NULLS LAST LIMIT 1`)).rows[0];
        if (!admin) throw new Error('No SUPER_ADMIN user found to record as the assigner');

        // Client + patient
        const clientUser = await createUser(client, 'CLIENT');
        const clientProfile = (await client.query(
            `INSERT INTO client_profiles (user_id, full_name, primary_address, gender, is_registration_fee_paid)
             VALUES ($1, 'Leave Swap Test Client', '12 Test Lane, Colombo 05', 'FEMALE', true)
             RETURNING client_profile_id, client_code`,
            [clientUser.userId]
        )).rows[0];
        const patient = (await client.query(
            `INSERT INTO patient_profiles (client_id, full_name, age, gender, relationship_to_client, medical_condition, is_registration_fee_paid)
             VALUES ($1, 'Leave Swap Test Patient', 78, 'MALE', 'Father', 'Post-stroke care (test data)', true)
             RETURNING patient_id, patient_code`,
            [clientProfile.client_profile_id]
        )).rows[0];

        // Staff
        let code = await nextStaffCode(client);
        const outgoing = await createStaff(client, { fullName: 'Kumari Outgoing (Leave Test)', staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'ASSIGNED' });
        const replacements = [];
        for (const n of ['One', 'Two', 'Three']) {
            replacements.push(await createStaff(client, { fullName: `Replacement ${n} (Leave Test)`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'AVAILABLE' }));
        }

        // Booking + outgoing staff's assignment
        const booking = (await client.query(
            `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id,
                                   status, preferred_gender, daily_rate, ot_rate, amount_quotated, amount_paid, invoicing_mode)
             VALUES ($1, $2, 'NURSE', 'LIVE_IN', $3::date, $4, 'ACTIVE', 'ANY', $5, 500, 0, 0, 'AUTO')
             RETURNING booking_id, booking_code`,
            [clientProfile.client_profile_id, patient.patient_id, startDate, outgoing.staffProfileId, CLIENT_DAILY_RATE]
        )).rows[0];
        const assignment = (await client.query(
            `INSERT INTO booking_staff_assignments (booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
                                                   service_start_date, status, service_start_time)
             VALUES ($1, $2, ($3::date + TIME '09:00') AT TIME ZONE 'Asia/Colombo', $4, $5, $3::date, 'ACTIVE', '09:00')
             RETURNING assignment_id`,
            [booking.booking_id, outgoing.staffProfileId, startDate, admin.user_id, OUTGOING_RATE]
        )).rows[0];

        // First day: the boundary day an admin settled by hand (arrived 09:00, 15h → pro-rated).
        const firstDayAmount = Math.round(OUTGOING_RATE * 15 / 24);
        const firstTx = await creditStaffSalary(client, {
            staff_profile_id: outgoing.staffProfileId, booking_id: booking.booking_id, amount: firstDayAmount,
            notes: `Daily earnings for ${startDate} (15h served) — manually confirmed`,
        });
        await client.query(
            `INSERT INTO staff_daily_attendance (booking_id, assignment_id, staff_profile_id, service_date, in_time, hours_served,
                                                 entry_mode, attendance_status, salary_status, salary_amount, salary_transaction_id,
                                                 decided_by_user_id, decided_by_name, decided_at)
             VALUES ($1, $2, $3, $4::date, ($4::date + TIME '09:00') AT TIME ZONE 'Asia/Colombo', 15,
                     'MANUAL', 'PRESENT', 'PAID', $5, $6, $7, 'Seed (admin)', NOW())`,
            [booking.booking_id, assignment.assignment_id, outgoing.staffProfileId, startDate, firstDayAmount, firstTx, admin.user_id]
        );

        // Every following day up to and including yesterday: the cron's auto-pay, exactly
        // as cron/dailyInvoicing.js writes it. Yesterday's row is the one that shouldn't exist.
        for (let n = -totalDays + 1; n <= -1; n++) {
            const day = await dayOffset(n);
            const tx = await creditStaffSalary(client, {
                staff_profile_id: outgoing.staffProfileId, booking_id: booking.booking_id, amount: OUTGOING_RATE,
                notes: `Daily earnings from booking ${booking.booking_id} for ${outgoing.fullName} (${day})`,
            });
            await client.query(
                `INSERT INTO staff_daily_attendance (booking_id, assignment_id, staff_profile_id, service_date, hours_served,
                                                     entry_mode, salary_status, salary_amount, salary_transaction_id, decided_by_name, decided_at)
                 VALUES ($1, $2, $3, $4::date, 24, 'AUTO', 'PAID', $5, $6, 'SYSTEM (auto — LIVE_IN)', ($4::date + TIME '23:59') AT TIME ZONE 'Asia/Colombo')`,
                [booking.booking_id, assignment.assignment_id, outgoing.staffProfileId, day, OUTGOING_RATE, tx]
            );
        }

        await client.query('COMMIT');

        console.log('\nSwap-with-leave test booking created.\n');
        console.log(`  Booking        ${booking.booking_code}  (${booking.booking_id})`);
        console.log(`  URL            http://localhost:5173/admin/bookings/${booking.booking_id}/detail`);
        console.log(`  Client         Leave Swap Test Client ${clientProfile.client_code}`);
        console.log(`  Outgoing staff ${outgoing.fullName} ${outgoing.staffCode} - Rs.${OUTGOING_RATE}/day, on since ${startDate}, paid through ${yesterday}`);
        replacements.forEach(r => console.log(`  Replacement    ${r.fullName} ${r.staffCode} - AVAILABLE`));
        console.log('');
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to seed the swap-leave scenario:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

main();
