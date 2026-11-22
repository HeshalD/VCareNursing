const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Decides which existing client (if any) a public service request belongs to, and proves
// that a guest really owns the mobile number they typed before the request is attached to
// that client's account. Without this, a returning client who submits a form while logged
// out gets a duplicate client record created when the quote is accepted.

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const VERIFIED_TOKEN_TTL = '30m';
const TOKEN_PURPOSE = 'SERVICE_REQUEST';

// Client profile that owns `mobile`, matched on:
//  - users.mobile_number exactly, or a legacy local-format number ("0771234567") with the same
//    last 9 digits (old rows were never normalised to E.164)
//  - one of the client's secondary phone numbers
// Returns { client_profile_id, user_id } or null.
const findClientByMobile = async (mobile) => {
  if (!mobile) return null;
  const last9 = mobile.replace(/\D/g, '').slice(-9);
  const res = await db.query(
    `SELECT cp.client_profile_id, cp.user_id
       FROM client_profiles cp
       JOIN users u ON u.user_id = cp.user_id
      WHERE u.mobile_number = $1
         OR (u.mobile_number !~ '^[+]' AND right(regexp_replace(u.mobile_number, '[^0-9]', '', 'g'), 9) = $2)
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(cp.secondary_phone_numbers, '[]'::jsonb)) e
               WHERE COALESCE(e->>'number', e#>>'{}') = $1)
      ORDER BY (u.mobile_number = $1) DESC, cp.created_at ASC
      LIMIT 1`,
    [mobile, last9]
  );
  return res.rows[0] || null;
};

// Client profile of the logged-in user, or null (guest, staff/admin without a client profile).
const findClientByUserId = async (userId) => {
  if (!userId) return null;
  const res = await db.query(
    'SELECT client_profile_id, user_id FROM client_profiles WHERE user_id = $1',
    [userId]
  );
  return res.rows[0] || null;
};

const signVerifiedToken = (mobile) =>
  jwt.sign({ purpose: TOKEN_PURPOSE, mobile }, process.env.JWT_SECRET, { expiresIn: VERIFIED_TOKEN_TTL });

const isVerifiedToken = (token, mobile) => {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.purpose === TOKEN_PURPOSE && decoded.mobile === mobile;
  } catch {
    return false;
  }
};

// Stores a fresh code for `mobile`. Returns { code } or { retryAfter } when asked again too soon.
const issueOtp = async (mobile) => {
  const existing = await db.query('SELECT created_at FROM service_request_otps WHERE mobile_number = $1', [mobile]);
  if (existing.rows.length > 0) {
    const secondsAgo = (Date.now() - new Date(existing.rows[0].created_at).getTime()) / 1000;
    if (secondsAgo < OTP_RESEND_SECONDS) return { retryAfter: Math.ceil(OTP_RESEND_SECONDS - secondsAgo) };
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.query(
    `INSERT INTO service_request_otps (mobile_number, otp_code, expires_at, attempts, created_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, 0, NOW())
     ON CONFLICT (mobile_number) DO UPDATE
       SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = NOW()`,
    [mobile, code, String(OTP_TTL_MINUTES)]
  );
  return { code };
};

// Checks a submitted code. Returns { ok: true, token } or { ok: false, status, message }.
const checkOtp = async (mobile, submitted) => {
  const code = String(submitted || '').trim();
  const rowRes = await db.query(
    'SELECT otp_code, expires_at, attempts FROM service_request_otps WHERE mobile_number = $1',
    [mobile]
  );
  const row = rowRes.rows[0];
  if (!row || new Date(row.expires_at) <= new Date()) {
    return { ok: false, status: 400, message: 'Invalid or expired code. Please request a new one.' };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
  }
  const a = Buffer.from(code);
  const b = Buffer.from(row.otp_code);
  if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) {
    await db.query('UPDATE service_request_otps SET attempts = attempts + 1 WHERE mobile_number = $1', [mobile]);
    return { ok: false, status: 400, message: 'Invalid or expired code.' };
  }
  await db.query('DELETE FROM service_request_otps WHERE mobile_number = $1', [mobile]);
  return { ok: true, token: signVerifiedToken(mobile) };
};

module.exports = { findClientByMobile, findClientByUserId, isVerifiedToken, issueOtp, checkOtp };
