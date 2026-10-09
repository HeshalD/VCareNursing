/**
 * Seed script: two service requests for testing weekly repeat days on the staff
 * assignment page — one LIVE_IN, one SHIFT_BASED.
 *
 * Each request is taken through the normal pipeline up to "Booking Created": an
 * ACCEPTED quote, the client's wallet funded against that quote (earmarked to the
 * booking), and a PENDING booking with no staff — i.e. exactly the state the admin
 * is in when they open /admin/bookings/:id/staff-assignment. Four AVAILABLE staff
 * are created so the LIVE_IN booking and up to three shifts can each get someone fresh.
 *
 * Creates fresh rows every run and touches nothing that already exists.
 *
 * Usage: node backend/scripts/seedRepeatDaysScenario.js [--start=YYYY-MM-DD]
 *        (start date defaults to today, Asia/Colombo)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { creditClientWallet } = require('../services/walletService');

const LIVE_IN_DAILY_RATE = 3500;
const LIVE_IN_DAYS = 28;
const SHIFT_RATE = 2000;
const SHIFTS_PER_DAY = 2;
const SHIFT_DAYS = 28;

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

async function createStaff(client, { fullName, staffCode, gender }) {
    const { userId, mobile } = await createUser(client, 'NURSE');
    const r = await client.query(
        `INSERT INTO staff_profiles (user_id, full_name, designation, gender, staff_code, location,
                                     willing_to_live_in, current_status, verification_status, admin_remarks, created_at)
         VALUES ($1, $2, 'Nurse', $3, $4, 'Colombo', true, 'AVAILABLE', 'VERIFIED',
                 'Seeded for repeat-days testing — safe to delete.', NOW())
         RETURNING staff_profile_id`,
        [userId, fullName, gender, staffCode]
    );
    return { staffProfileId: r.rows[0].staff_profile_id, mobile, staffCode, fullName };
}

// One service request → ACCEPTED quote → funded wallet → PENDING booking.
async function createRequestToBooking(client, { clientProfile, payerMobile, patient, startDate, model, adminUserId }) {
    const isShift = model === 'SHIFT_BASED';
    const serviceType = isShift ? 'CARETAKER' : 'NURSE';
    const total = isShift ? SHIFT_RATE * SHIFTS_PER_DAY * SHIFT_DAYS : LIVE_IN_DAILY_RATE * LIVE_IN_DAYS;

    const request = (await client.query(
        `INSERT INTO service_requests (client_id, patient_id, payer_name, payer_mobile, patient_name, patient_age,
                                       patient_condition, service_type, location_address, start_date, status,
                                       relationship_to_client, service_model, preferred_gender, gender, remarks, entered_via)
         VALUES ($1, $2, 'Repeat Days Test Client', $3, $4, $5, $6, $7, '45 Test Road, Colombo 07', $8::date,
                 'BOOKING_CREATED', 'Mother', $9::service_model_enum, 'ANY', 'FEMALE',
                 'Seeded for repeat-days testing — safe to delete.', 'ADMIN')
         RETURNING request_id, service_request_code`,
        [clientProfile.client_profile_id, patient.patient_id, payerMobile, patient.full_name, patient.age,
         patient.medical_condition, serviceType, startDate, model]
    )).rows[0];

    const quote = (await client.query(
        `INSERT INTO quotations (request_id, client_id, quote_type, registration_fee, daily_rate, qty_days,
                                 per_shift_rate, qty_shifts, transport_fee, sub_total, total_amount, status)
         VALUES ($1, $2, 'SERVICE', 0, $3, $4, $5, $6, 0, $7, $7, 'ACCEPTED')
         RETURNING quote_id, estimate_number`,
        [request.request_id, clientProfile.client_profile_id,
         isShift ? SHIFT_RATE * SHIFTS_PER_DAY : LIVE_IN_DAILY_RATE,
         isShift ? SHIFT_DAYS : LIVE_IN_DAYS,
         isShift ? SHIFT_RATE : null,
         isShift ? SHIFTS_PER_DAY * SHIFT_DAYS : null,
         total]
    )).rows[0];

    await client.query(
        `UPDATE service_requests SET active_quote_id = $1 WHERE request_id = $2`,
        [quote.quote_id, request.request_id]
    );

    // Mirrors bookingController's convert-to-booking insert: PENDING, no staff, SHIFT_BASED
    // without an end date, LIVE_IN ending start + qty_days.
    const booking = (await client.query(
        `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id, status,
                               preferred_gender, request_id, scheduled_end_time, ot_rate, daily_rate, shift_rate,
                               amount_quotated, amount_paid)
         VALUES ($1, $2, $3, $4::service_model_enum, $5::date, NULL, 'PENDING', 'ANY', $6,
                 CASE WHEN $7 THEN NULL ELSE ($5::date + $8::int)::timestamp END,
                 500, $9, $10, $11, $11)
         RETURNING booking_id, booking_code`,
        [clientProfile.client_profile_id, patient.patient_id, serviceType, model, startDate, request.request_id,
         isShift, LIVE_IN_DAYS,
         isShift ? SHIFT_RATE * SHIFTS_PER_DAY : LIVE_IN_DAILY_RATE,
         isShift ? SHIFT_RATE : null,
         total]
    )).rows[0];

    await client.query(`UPDATE quotations SET booking_id = $1 WHERE quote_id = $2`, [booking.booking_id, quote.quote_id]);

    // The client's payment for this quote, sitting in their wallet and reserved for this booking —
    // assignStaffToBooking refuses to assign until the wallet holds money.
    await creditClientWallet(client, {
        client_id: clientProfile.client_profile_id,
        quote_id: quote.quote_id,
        earmark_booking_id: booking.booking_id,
        amount: total,
        payment_method: 'BANK_TRANSFER',
        reference_number: `SEED-${randomDigits(6)}`,
        notes: `Seeded payment for ${model} repeat-days test (${quote.estimate_number || quote.quote_id})`,
        verified_by: adminUserId,
    });

    return { request, quote, booking, total, serviceType };
}

async function main() {
    const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const today = (await client.query(`SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS d`)).rows[0].d;
        const startDate = args.start && /^\d{4}-\d{2}-\d{2}$/.test(args.start) ? args.start : today;

        const admin = (await client.query(`SELECT user_id FROM users WHERE 'SUPER_ADMIN' = ANY(role) ORDER BY created_at NULLS LAST LIMIT 1`)).rows[0];
        if (!admin) throw new Error('No SUPER_ADMIN user found to record as the payment verifier');

        // Client + one patient per request
        const clientUser = await createUser(client, 'CLIENT');
        const clientProfile = (await client.query(
            `INSERT INTO client_profiles (user_id, full_name, primary_address, gender, is_registration_fee_paid)
             VALUES ($1, 'Repeat Days Test Client', '45 Test Road, Colombo 07', 'FEMALE', true)
             RETURNING client_profile_id, client_code`,
            [clientUser.userId]
        )).rows[0];
        const createPatient = async (fullName, age, condition) => (await client.query(
            `INSERT INTO patient_profiles (client_id, full_name, age, gender, relationship_to_client, medical_condition, is_registration_fee_paid)
             VALUES ($1, $2, $3, 'FEMALE', 'Mother', $4, true)
             RETURNING patient_id, patient_code, full_name, age, medical_condition`,
            [clientProfile.client_profile_id, fullName, age, condition]
        )).rows[0];
        const liveInPatient = await createPatient('Live-In Repeat Days Patient', 81, 'Dementia, needs weekday live-in support (test data)');
        const shiftPatient = await createPatient('Shift Repeat Days Patient', 74, 'Post-surgery recovery, day/night shifts (test data)');

        // Staff
        let code = await nextStaffCode(client);
        const staff = [];
        for (const n of ['One', 'Two', 'Three', 'Four']) {
            staff.push(await createStaff(client, { fullName: `Repeat Days Nurse ${n}`, staffCode: `EMP-${code++}`, gender: 'FEMALE' }));
        }

        const liveIn = await createRequestToBooking(client, {
            clientProfile, payerMobile: clientUser.mobile, patient: liveInPatient, startDate, model: 'LIVE_IN', adminUserId: admin.user_id,
        });
        const shift = await createRequestToBooking(client, {
            clientProfile, payerMobile: clientUser.mobile, patient: shiftPatient, startDate, model: 'SHIFT_BASED', adminUserId: admin.user_id,
        });

        await client.query('COMMIT');

        const weekday = new Date(`${startDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
        console.log('\nRepeat-days test service requests created.\n');
        console.log(`  Client          Repeat Days Test Client ${clientProfile.client_code || ''}  (wallet Rs.${liveIn.total + shift.total})`);
        console.log(`  Start date      ${startDate} (${weekday})\n`);
        for (const [label, r, detail] of [
            ['LIVE_IN', liveIn, `Rs.${LIVE_IN_DAILY_RATE}/day × ${LIVE_IN_DAYS} days`],
            ['SHIFT_BASED', shift, `Rs.${SHIFT_RATE}/shift × ${SHIFTS_PER_DAY}/day × ${SHIFT_DAYS} days`],
        ]) {
            console.log(`  ${label}`);
            console.log(`    Request       ${r.request.service_request_code || r.request.request_id}`);
            console.log(`    Booking       ${r.booking.booking_code || ''}  (${r.booking.booking_id}) — PENDING, ${detail}, paid Rs.${r.total}`);
            console.log(`    Assign at     http://localhost:5173/admin/bookings/${r.booking.booking_id}/staff-assignment\n`);
        }
        staff.forEach(s => console.log(`  Staff           ${s.fullName} ${s.staffCode} - AVAILABLE`));
        console.log('');
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to seed the repeat-days scenario:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

main();
