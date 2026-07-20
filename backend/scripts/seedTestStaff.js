/**
 * Seed script: creates test staff members, one (or more) per staff role,
 * reusing the profile picture / NIC / document images already uploaded
 * against an existing staff member's staff_code (default: EMP-5002).
 *
 * Usage:
 *   node backend/scripts/seedTestStaff.js
 *   node backend/scripts/seedTestStaff.js --template=EMP-5000
 *   node backend/scripts/seedTestStaff.js --count=14
 *
 * Safe to re-run: staff_code / mobile_number are freshly generated each run,
 * so it will not collide with previously seeded rows.
 */

const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROLES = [
    'NURSE',
    'NANNY',
    'CARETAKER',
    'COORDINATOR',
    'NURSING_ASSISTANT',
    'PHYSIOTHERAPIST',
    'COUNSELLOR',
];

const DESIGNATIONS = {
    NURSE: 'Nurse',
    NANNY: 'Nanny',
    CARETAKER: 'Caretaker',
    COORDINATOR: 'Coordinator',
    NURSING_ASSISTANT: 'Nursing Assistant',
    PHYSIOTHERAPIST: 'Physiotherapist',
    COUNSELLOR: 'Counsellor',
};

const EXPERIENCE_LEVELS = ['1_YEAR', '2_YEARS', '3_YEARS', '4_YEARS', '5_YEARS', 'MORE_THAN_5_YEARS'];
const LOCATIONS = ['Colombo', 'Kandy', 'Galle', 'Negombo', 'Gampaha', 'Kurunegala', 'Matara', 'Jaffna'];
const GENDERS = ['MALE', 'FEMALE'];

const FIRST_NAMES = {
    MALE: ['Nimal', 'Sunil', 'Kasun', 'Ruwan', 'Chamara', 'Dinesh', 'Saman', 'Tharindu', 'Lahiru', 'Pradeep'],
    FEMALE: ['Nadeesha', 'Kumari', 'Chathurika', 'Dilani', 'Ishara', 'Sanduni', 'Malki', 'Priyanka', 'Rashmi', 'Vindya'],
};
const LAST_NAMES = ['Perera', 'Fernando', 'Silva', 'Jayawardena', 'Rathnayake', 'Wickramasinghe', 'Gunasekara', 'Bandara', 'Dissanayake', 'Weerasinghe'];

function pick(arr, i) {
    return arr[i % arr.length];
}

function randomDigits(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
}

function randomMobile() {
    // Sri Lankan mobile format: 07XXXXXXXX
    const prefixes = ['070', '071', '072', '074', '075', '076', '077', '078'];
    return pick(prefixes, Math.floor(Math.random() * prefixes.length)) + randomDigits(7);
}

function randomNic() {
    // New-format NIC: 12 digits
    return '19' + randomDigits(10);
}

function randomDob(minAge, maxAge) {
    const age = minAge + Math.floor(Math.random() * (maxAge - minAge));
    const year = new Date().getFullYear() - age;
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function getTemplateStaff(templateCode) {
    const result = await db.query(
        `SELECT profile_picture_url, nic_front_url, nic_back_url, document_urls, qualifications
         FROM staff_profiles WHERE staff_code = $1`,
        [templateCode]
    );
    if (result.rows.length === 0) {
        throw new Error(`Template staff_code "${templateCode}" not found. Check the code and try again.`);
    }
    return result.rows[0];
}

async function getNextStaffCodeStart() {
    const result = await db.query(
        `SELECT staff_code FROM staff_profiles
         WHERE staff_code ~ '^EMP-[0-9]+$'
         ORDER BY (regexp_replace(staff_code, '\\D', '', 'g'))::int DESC
         LIMIT 1`
    );
    if (result.rows.length === 0) return 5000;
    const n = parseInt(result.rows[0].staff_code.replace('EMP-', ''), 10);
    return n + 1;
}

async function mobileExists(mobile) {
    const r = await db.query('SELECT 1 FROM users WHERE mobile_number = $1', [mobile]);
    return r.rows.length > 0;
}

async function uniqueMobile() {
    let mobile = randomMobile();
    while (await mobileExists(mobile)) {
        mobile = randomMobile();
    }
    return mobile;
}

async function createStaffMember({ role, index, staffCode, template }) {
    const gender = pick(GENDERS, index);
    const firstName = pick(FIRST_NAMES[gender], index);
    const lastName = pick(LAST_NAMES, index + 3);
    const fullName = `${firstName} ${lastName}`;

    const mobile = await uniqueMobile();
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const userResult = await db.query(
        `INSERT INTO users (email, password_hash, mobile_number, role, is_email_verified)
         VALUES (NULL, $1, $2, $3::user_role_enum[], true)
         RETURNING user_id`,
        [hashedPassword, mobile, [role]]
    );
    const userId = userResult.rows[0].user_id;

    const insertResult = await db.query(
        `INSERT INTO staff_profiles (
            user_id, full_name, designation, qualifications, document_urls,
            home_address, location, profile_picture_url, nic_number,
            nic_front_url, nic_back_url, gender, willing_to_live_in,
            date_of_birth, staff_code, experience_level, admin_remarks,
            current_status, verification_status, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            'AVAILABLE', 'VERIFIED', NOW()
        )
        RETURNING staff_profile_id, staff_code, full_name, designation`,
        [
            userId,
            fullName,
            DESIGNATIONS[role],
            template.qualifications,
            template.document_urls,
            `${pick(LOCATIONS, index + 1)}, Sri Lanka`,
            pick(LOCATIONS, index),
            template.profile_picture_url,
            randomNic(),
            template.nic_front_url,
            template.nic_back_url,
            gender,
            Math.random() > 0.5,
            randomDob(22, 55),
            staffCode,
            pick(EXPERIENCE_LEVELS, index),
            'Seeded test staff member — safe to delete.',
        ]
    );

    return {
        ...insertResult.rows[0],
        role,
        mobile_number: mobile,
        temp_password: tempPassword,
    };
}

async function main() {
    const args = Object.fromEntries(
        process.argv.slice(2).map((a) => {
            const [k, v] = a.replace(/^--/, '').split('=');
            return [k, v ?? true];
        })
    );

    const templateCode = args.template || 'EMP-5002';
    const count = parseInt(args.count, 10) || 10;

    console.log(`Using staff_code "${templateCode}" as the image/document template.`);
    console.log(`Creating ${count} test staff members across ${ROLES.length} roles...\n`);

    const template = await getTemplateStaff(templateCode);
    let nextCodeNum = await getNextStaffCodeStart();

    const created = [];
    for (let i = 0; i < count; i++) {
        const role = pick(ROLES, i);
        const staffCode = `EMP-${nextCodeNum++}`;
        const staff = await createStaffMember({ role, index: i, staffCode, template });
        created.push(staff);
        console.log(`Created ${staff.staff_code} — ${staff.full_name} (${staff.role}) — mobile: ${staff.mobile_number} — temp password: ${staff.temp_password}`);
    }

    console.log('\nDone. Save the temp passwords above if you need to log in as any of these accounts — they are not stored anywhere else.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to seed test staff:', err);
    process.exit(1);
});
