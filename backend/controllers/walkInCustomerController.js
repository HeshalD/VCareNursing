const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendClientWelcomeNew } = require('../utils/metaWhatsapp');
const { sendSms } = require('../utils/sms');

async function safeLog(params) {
  try {
    await logActivity(params);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

// Walk-in customers are registered as full clients (users + client_profiles), just
// like an admin-created client — they are not one-off/anonymous records. Their
// registration fee is left at its default PENDING status; nothing in the system
// blocks a PENDING client from purchasing or renting, so they can transact
// immediately and settle the fee later.
exports.createWalkInCustomer = async (req, res) => {
  const {
    full_name, mobile_number, gender, email, primary_address,
    client_type, honorific, company_name, display_name_source,
  } = req.body;

  if (!full_name || !mobile_number || !gender) {
    return res.status(400).json({ message: 'full_name, mobile_number, and gender are required' });
  }

  const resolvedDisplayNameSource =
    client_type === 'CORPORATE_PROXY' && company_name && display_name_source === 'COMPANY_NAME'
      ? 'COMPANY_NAME'
      : 'FULL_NAME';

  const dbClient = await db.pool.connect();
  try {
    const existing = await dbClient.query(
      `SELECT cp.client_profile_id, cp.full_name, u.mobile_number
       FROM users u JOIN client_profiles cp ON cp.user_id = u.user_id
       WHERE u.mobile_number = $1 OR ($2::varchar IS NOT NULL AND u.email = $2)`,
      [mobile_number, email || null]
    );
    if (existing.rows.length > 0) {
      // Already a registered client (e.g. a repeat walk-in) — reuse their record
      // instead of creating a duplicate account.
      return res.status(200).json({
        status: 'success',
        data: { ...existing.rows[0], existing: true },
      });
    }

    // 8 lowercase alphanumeric chars — the login endpoint recognises this shape as a
    // temporary password and forces a password change on first login.
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await dbClient.query('BEGIN');

    const userRes = await dbClient.query(
      `INSERT INTO users (mobile_number, password_hash, email, is_email_verified)
       VALUES ($1, $2, $3, $4) RETURNING user_id`,
      [mobile_number, hashedPassword, email || null, !!email]
    );
    const userId = userRes.rows[0].user_id;

    const profileRes = await dbClient.query(
      `INSERT INTO client_profiles (user_id, full_name, client_type, gender, primary_address, company_name, honorific, display_name_source)
       VALUES ($1, $2, $3, $4::gender_enum, $5, $6, $7, $8) RETURNING client_profile_id`,
      [
        userId, full_name, client_type || 'INDIVIDUAL',
        gender.toUpperCase(), primary_address || null,
        company_name || null, honorific || null, resolvedDisplayNameSource,
      ]
    );
    const clientProfileId = profileRes.rows[0].client_profile_id;

    await dbClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'CLIENT_PROFILE_CREATED',
      entityType: 'CLIENT',
      entityId: String(clientProfileId),
      details: { full_name, mobile_number, client_type: client_type || 'INDIVIDUAL', source: 'WALK_IN' },
    });

    const welcomeSms = `Welcome to VCare Nursing, ${full_name}! An account has been created for you. Log in at https://vcarenursing.com/login\n\nUsername (mobile): ${mobile_number}\nTemporary password: ${tempPassword}\n\nYou'll be asked to set your own password on first login. - VCare Nursing`;

    Promise.allSettled([
      sendSms(mobile_number, welcomeSms),
      sendClientWelcomeNew(mobile_number, full_name),
    ]).then(([smsResult, waResult]) => {
      if (smsResult.status === 'rejected') console.error('Client welcome SMS failed:', smsResult.reason?.message);
      if (waResult.status === 'rejected') console.error('Client welcome WhatsApp failed:', waResult.reason?.message);
    });

    res.status(201).json({
      status: 'success',
      message: 'Client registered. Login credentials sent via SMS and a welcome message via WhatsApp.',
      data: { client_profile_id: clientProfileId, user_id: userId, full_name, mobile_number, existing: false },
    });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Create Walk-In Customer Error:', error);
    res.status(500).json({ message: 'Error registering walk-in customer' });
  } finally {
    dbClient.release();
  }
};

exports.searchWalkInCustomers = async (req, res) => {
  const { q } = req.query;

  try {
    const result = await db.query(
      `SELECT * FROM walk_in_customers
       WHERE ($1::text IS NULL OR full_name ILIKE '%' || $1 || '%' OR mobile_number ILIKE '%' || $1 || '%')
       ORDER BY created_at DESC
       LIMIT 50`,
      [q || null]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Search Walk-In Customers Error:', error);
    res.status(500).json({ message: 'Error searching walk-in customers' });
  }
};
