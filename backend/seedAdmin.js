// Seeds (or restores) the default SUPER_ADMIN account.
// Safe to run multiple times — it upserts by mobile number.
//
// Usage:  node seedAdmin.js   (run from the backend/ folder)

const bcrypt = require('bcryptjs');
const db = require('./config/db');

const ADMIN = {
  mobile_number: '0000000000',
  password: 'admin@vcare',
  email: 'admin@vcare.com',
  full_name: 'admin00',
  role: 'SUPER_ADMIN',
};

async function seedAdmin() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const password_hash = await bcrypt.hash(ADMIN.password, 12);

    // Upsert the user row (keeps the same account if it already exists).
    // The super admin is a system account, not a registered worker, so it
    // intentionally lives only in the users table — no staff_profiles row.
    await client.query(
      `INSERT INTO users
         (mobile_number, password_hash, email, is_active, is_email_verified, role)
       VALUES ($1, $2, $3, true, true, ARRAY[$4]::user_role_enum[])
       ON CONFLICT (mobile_number) DO UPDATE SET
         password_hash    = EXCLUDED.password_hash,
         email            = EXCLUDED.email,
         is_active        = true,
         is_email_verified = true,
         role             = EXCLUDED.role`,
      [ADMIN.mobile_number, password_hash, ADMIN.email, ADMIN.role]
    );

    await client.query('COMMIT');

    console.log('✅ Admin account ready:');
    console.log(`   Mobile:   ${ADMIN.mobile_number}`);
    console.log(`   Password: ${ADMIN.password}`);
    console.log(`   Email:    ${ADMIN.email}`);
    console.log(`   Name:     ${ADMIN.full_name}`);
    console.log(`   Role:     ${ADMIN.role}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed admin:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

seedAdmin();
