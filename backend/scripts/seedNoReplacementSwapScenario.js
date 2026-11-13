/**
 * Seed script: test data for "schedule a swap with NO replacement yet".
 *
 * Creates (fresh rows every run, nothing existing is touched):
 *   1. A LIVE_IN booking, ACTIVE, one staff member (Kumari) on it, paid by the cron up to
 *      yesterday, plus 3 AVAILABLE replacements.
 *   2. A SHIFT_BASED booking, ACTIVE, with a Day shift and a Night shift each staffed, plus
 *      2 AVAILABLE replacements.
 *   3. (--with-scheduled) the same two bookings again, but with the swap ALREADY scheduled
 *      with no replacement, so the badge is there from the start and you can test
 *      "choose replacement" / "do nothing and let the date arrive" straight away.
 *
 * What to try (Bookings -> open the booking):
 *   LIVE_IN
 *     a. Initiate Swap -> "No replacement yet?" -> pick a future date -> Schedule departure.
 *        The amber "No replacement yet" badge appears. Click "Choose replacement", pick one:
 *        it turns into a normal scheduled swap (badge gone, Upcoming Events shows A -> B).
 *     b. Same, then leave it. Run the nightly job on the swap date (see below): Kumari is
 *        logged out and the booking becomes PAUSED. Resume it with staff as usual.
 *     c. Same with "going on leave" = Yes, then pick a replacement: the relief action now
 *        runs from the nightly job too (the STAFF_RELIEVE fix).
 *   SHIFT_BASED
 *     d. Open a slot -> Reassign -> "No replacement yet?" -> future date. Badge appears.
 *        Pick a replacement, or let the date arrive: the slot is emptied (booking NOT paused),
 *        then use the slot's normal Assign.
 *
 * Making a scheduled swap "due" without waiting: after scheduling, rewind its date, e.g.
 *   UPDATE scheduled_actions SET effective_date = CURRENT_DATE
 *   WHERE booking_id = '<booking id>' AND status = 'SCHEDULED';
 * then use "Execute now" on Upcoming Events (or run the nightly job). With --with-scheduled
 * the script prints the exact statement for each booking.
 *
 * SAFETY: refuses to run unless DB_HOST is localhost/127.0.0.1 (pass --allow-remote to override).
 *
 * Usage: node backend/scripts/seedNoReplacementSwapScenario.js [--days=4] [--with-scheduled | --only-scheduled] [--swap-in=5]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { creditStaffSalary } = require('../services/billingService');
const { enqueueScheduledAction } = require('../services/scheduledActions');

const STAFF_RATE = 1500;
const SHIFT_PAY = 1000;
const CLIENT_DAILY_RATE = 2500;
const CLIENT_SHIFT_RATE = 2000;

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
                 'Seeded for no-replacement swap testing — safe to delete.', NOW())
         RETURNING staff_profile_id`,
        [userId, fullName, gender, staffCode, status]
    );
    return { staffProfileId: r.rows[0].staff_profile_id, mobile, staffCode, fullName };
}

async function createClientAndPatient(client, label) {
    const clientUser = await createUser(client, 'CLIENT');
    const clientProfile = (await client.query(
        `INSERT INTO client_profiles (user_id, full_name, primary_address, gender, is_registration_fee_paid)
         VALUES ($1, $2, '12 Test Lane, Colombo 05', 'FEMALE', true)
         RETURNING client_profile_id, client_code`,
        [clientUser.userId, `${label} Client`]
    )).rows[0];
    const patient = (await client.query(
        `INSERT INTO patient_profiles (client_id, full_name, age, gender, relationship_to_client, medical_condition, is_registration_fee_paid)
         VALUES ($1, $2, 78, 'MALE', 'Father', 'Post-stroke care (test data)', true)
         RETURNING patient_id, patient_code`,
        [clientProfile.client_profile_id, `${label} Patient`]
    )).rows[0];
    return { clientProfile, patient };
}

async function main() {
    const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
    const host = process.env.DB_HOST || '';
    if (!['localhost', '127.0.0.1', '::1'].includes(host) && !('allow-remote' in args)) {
        console.error(`Refusing to seed: DB_HOST is "${host}", not localhost. Pass --allow-remote if you really mean it.`);
        process.exit(1);
    }

    const totalDays = Math.max(3, parseInt(args.days, 10) || 4);
    const onlyScheduled = 'only-scheduled' in args;
    const withScheduled = onlyScheduled || 'with-scheduled' in args;
    const swapInDays = Math.max(1, parseInt(args['swap-in'], 10) || 5);

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const today = (await client.query(`SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS d`)).rows[0].d;
        const dayOffset = async (n) => (await client.query(`SELECT ($1::date + $2::int)::text AS d`, [today, n])).rows[0].d;
        const startDate = await dayOffset(-totalDays);
        const swapDate = await dayOffset(swapInDays);

        const admin = (await client.query(`SELECT user_id FROM users WHERE 'SUPER_ADMIN' = ANY(role) ORDER BY created_at NULLS LAST LIMIT 1`)).rows[0];
        if (!admin) throw new Error('No SUPER_ADMIN user found to record as the assigner');

        let code = await nextStaffCode(client);
        const created = [];

        // ── LIVE_IN booking(s) ─────────────────────────────────────────────────────
        const buildLiveIn = async (scheduled) => {
            const tag = scheduled ? 'NoRepl Scheduled' : 'NoRepl LiveIn';
            const { clientProfile, patient } = await createClientAndPatient(client, tag);
            const outgoing = await createStaff(client, { fullName: `Kumari Outgoing (${tag})`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'ASSIGNED' });
            const replacements = [];
            if (!scheduled) {
                for (const n of ['One', 'Two', 'Three']) {
                    replacements.push(await createStaff(client, { fullName: `Replacement ${n} (NoRepl LiveIn)`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'AVAILABLE' }));
                }
            }
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
                [booking.booking_id, outgoing.staffProfileId, startDate, admin.user_id, STAFF_RATE]
            )).rows[0];

            // Auto-paid days, exactly as the nightly cron writes them (first day pro-rated by hand).
            const firstAmount = Math.round(STAFF_RATE * 15 / 24);
            const firstTx = await creditStaffSalary(client, {
                staff_profile_id: outgoing.staffProfileId, booking_id: booking.booking_id, amount: firstAmount,
                notes: `Daily earnings for ${startDate} (15h served) — manually confirmed`,
            });
            await client.query(
                `INSERT INTO staff_daily_attendance (booking_id, assignment_id, staff_profile_id, service_date, in_time, hours_served,
                                                     entry_mode, attendance_status, salary_status, salary_amount, salary_transaction_id,
                                                     decided_by_user_id, decided_by_name, decided_at)
                 VALUES ($1, $2, $3, $4::date, ($4::date + TIME '09:00') AT TIME ZONE 'Asia/Colombo', 15,
                         'MANUAL', 'PRESENT', 'PAID', $5, $6, $7, 'Seed (admin)', NOW())`,
                [booking.booking_id, assignment.assignment_id, outgoing.staffProfileId, startDate, firstAmount, firstTx, admin.user_id]
            );
            for (let n = -totalDays + 1; n <= -1; n++) {
                const day = await dayOffset(n);
                const tx = await creditStaffSalary(client, {
                    staff_profile_id: outgoing.staffProfileId, booking_id: booking.booking_id, amount: STAFF_RATE,
                    notes: `Daily earnings from booking ${booking.booking_id} for ${outgoing.fullName} (${day})`,
                });
                await client.query(
                    `INSERT INTO staff_daily_attendance (booking_id, assignment_id, staff_profile_id, service_date, hours_served,
                                                         entry_mode, salary_status, salary_amount, salary_transaction_id, decided_by_name, decided_at)
                     VALUES ($1, $2, $3, $4::date, 24, 'AUTO', 'PAID', $5, $6, 'SYSTEM (auto — LIVE_IN)', ($4::date + TIME '23:59') AT TIME ZONE 'Asia/Colombo')`,
                    [booking.booking_id, assignment.assignment_id, outgoing.staffProfileId, day, STAFF_RATE, tx]
                );
            }

            if (scheduled) {
                // A swap already scheduled with no replacement — same payload swapStaff writes.
                await enqueueScheduledAction(client, {
                    booking_id: booking.booking_id,
                    action_type: 'STAFF_SWAP',
                    effective_date: swapDate,
                    payload: {
                        old_staff_id: outgoing.staffProfileId,
                        old_assignment_id: assignment.assignment_id,
                        new_staff_id: null,
                        new_assignment_id: null,
                        swap_reason: 'Seeded: finishing contract',
                        out_time: new Date(`${swapDate}T23:59:00+05:30`).toISOString(),
                        swapped_by: admin.user_id,
                        leave: null,
                    },
                    reason: 'Seeded: finishing contract',
                    created_by: admin.user_id,
                });
                // Also two AVAILABLE people to choose from.
                for (const n of ['One', 'Two']) {
                    replacements.push(await createStaff(client, { fullName: `Replacement ${n} (NoRepl Scheduled)`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'AVAILABLE' }));
                }
            }
            created.push({ kind: 'LIVE_IN' + (scheduled ? ' (swap already scheduled, no replacement)' : ''), booking, client: clientProfile, outgoing, replacements, swapDate: scheduled ? swapDate : null });
        };

        // ── SHIFT_BASED booking(s) ─────────────────────────────────────────────────
        const buildShift = async (scheduled) => {
            const tag = scheduled ? 'NoRepl Shift Scheduled' : 'NoRepl Shift';
            const { clientProfile, patient } = await createClientAndPatient(client, tag);
            const dayStaff = await createStaff(client, { fullName: `Dilani Day (${tag})`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'ASSIGNED' });
            const nightStaff = await createStaff(client, { fullName: `Nirmala Night (${tag})`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'ASSIGNED' });
            const replacements = [];
            for (const n of ['One', 'Two']) {
                replacements.push(await createStaff(client, { fullName: `Replacement ${n} (${tag})`, staffCode: `EMP-${code++}`, gender: 'FEMALE', status: 'AVAILABLE' }));
            }
            const booking = (await client.query(
                `INSERT INTO bookings (client_id, patient_id, service_type, service_model, start_date, assigned_staff_id,
                                       status, preferred_gender, daily_rate, shift_rate, ot_rate, amount_quotated, amount_paid)
                 VALUES ($1, $2, 'NURSE', 'SHIFT_BASED', $3::date, NULL, 'ACTIVE', 'ANY', 0, $4, 500, 0, 0)
                 RETURNING booking_id, booking_code`,
                [clientProfile.client_profile_id, patient.patient_id, startDate, CLIENT_SHIFT_RATE]
            )).rows[0];
            const pattern = (await client.query(
                `INSERT INTO booking_shift_patterns (booking_id, shift_count, effective_from_date, status, created_by, notes)
                 VALUES ($1, 2, $2::date, 'ACTIVE', $3, 'Seeded for no-replacement swap testing') RETURNING pattern_id`,
                [booking.booking_id, startDate, admin.user_id]
            )).rows[0];
            const slots = [];
            for (const [num, start, label] of [[1, '08:00', 'Day shift'], [2, '20:00', 'Night shift']]) {
                slots.push((await client.query(
                    `INSERT INTO booking_shift_slots (pattern_id, shift_number, start_time, duration_hours, label)
                     VALUES ($1, $2, $3::time, 12, $4) RETURNING shift_slot_id`,
                    [pattern.pattern_id, num, start, label]
                )).rows[0]);
            }
            const assignments = [];
            for (const [slot, staff] of [[slots[0], dayStaff], [slots[1], nightStaff]]) {
                assignments.push((await client.query(
                    `INSERT INTO booking_staff_assignments (booking_id, staff_profile_id, shift_slot_id, assigned_on, assigned_by, daily_rate,
                                                           service_start_date, amount_allocated, status)
                     VALUES ($1, $2, $3, NOW(), $4, $5, $6::date, $5, 'ACTIVE') RETURNING assignment_id`,
                    [booking.booking_id, staff.staffProfileId, slot.shift_slot_id, admin.user_id, SHIFT_PAY, startDate]
                )).rows[0]);
            }
            if (scheduled) {
                await enqueueScheduledAction(client, {
                    booking_id: booking.booking_id,
                    action_type: 'SHIFT_REASSIGNMENT',
                    effective_date: swapDate,
                    payload: {
                        shift_slot_id: slots[0].shift_slot_id,
                        old_staff_id: dayStaff.staffProfileId,
                        new_staff_id: null,
                        new_assignment_id: null,
                        reason: 'Seeded: day carer leaving',
                        old_staff_out_time: null,
                        new_staff_in_time: null,
                    },
                    reason: 'Seeded: day carer leaving',
                    created_by: admin.user_id,
                });
            }
            created.push({ kind: 'SHIFT_BASED' + (scheduled ? ' (day-shift swap already scheduled, no replacement)' : ''), booking, client: clientProfile, outgoing: dayStaff, other: nightStaff, replacements, swapDate: scheduled ? swapDate : null });
        };

        if (!onlyScheduled) {
            await buildLiveIn(false);
            await buildShift(false);
        }
        if (withScheduled) {
            await buildLiveIn(true);
            await buildShift(true);
        }

        await client.query('COMMIT');

        console.log('\nNo-replacement swap test data created.\n');
        for (const c of created) {
            console.log(`── ${c.kind}`);
            console.log(`  Booking      ${c.booking.booking_code}  (${c.booking.booking_id})`);
            console.log(`  URL          http://localhost:5173/admin/bookings/${c.booking.booking_id}/detail`);
            console.log(`  Leaving      ${c.outgoing.fullName} ${c.outgoing.staffCode}`);
            if (c.other) console.log(`  Other staff  ${c.other.fullName} ${c.other.staffCode}`);
            c.replacements.forEach(r => console.log(`  Replacement  ${r.fullName} ${r.staffCode} - AVAILABLE`));
            if (c.swapDate) {
                console.log(`  Swap date    ${c.swapDate}`);
                console.log(`  Make it due  UPDATE scheduled_actions SET effective_date = CURRENT_DATE WHERE booking_id = '${c.booking.booking_id}' AND status = 'SCHEDULED';`);
            }
            console.log('');
        }
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to seed the no-replacement swap scenario:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

main();
