const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendSms, sendSmsOtp } = require('../utils/sms');
const { sendWhatsAppOtp } = require('../utils/whatsapp');
const { sendServiceRequestConfirmed } = require('../utils/metaWhatsapp');
const { resolveCity } = require('../utils/cityHelper');
const { toE164, isValidPhone } = require('../utils/phone');

// Priority Membership is a registration-fee lead: a normal service_requests row
// tagged with this service_type. Admin then quotes the registration fee, assigns
// a salesperson and sends the quotation exactly like any other registration fee.
const SERVICE_TYPE = 'PRIORITY_MEMBERSHIP';
const OPEN_STATUSES = ['NEW_LEAD', 'PENDING', 'CONFIRMED'];

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const VERIFIED_TOKEN_TTL = '30m';

const CLIENT_TYPES = ['INDIVIDUAL', 'FAMILY', 'CORPORATE_PROXY'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const isMembershipActive = (profile) =>
  ['PAID', 'WAIVED'].includes(profile?.reg_fee_status) &&
  (!profile.reg_fee_expires_at || new Date(profile.reg_fee_expires_at) > new Date());

// Verified-mobile proof handed back by /otp/verify and required by /register.
const signVerifiedToken = (mobile) =>
  jwt.sign({ purpose: 'PRIORITY_MEMBERSHIP', mobile }, process.env.JWT_SECRET, { expiresIn: VERIFIED_TOKEN_TTL });

const readVerifiedToken = (token, mobile) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.purpose === 'PRIORITY_MEMBERSHIP' && decoded.mobile === mobile;
  } catch {
    return false;
  }
};

const notifyClient = async (mobile, name) => {
  const today = new Date().toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' });
  const smsBody = `Hi ${name},\n\nWe have received your Priority Membership request.\n\nOur team will get back to you shortly with your registration fee quotation.\n\nThank you for choosing VCare Nursing.`;
  const [smsRes, waRes] = await Promise.allSettled([
    sendSms(mobile, smsBody),
    sendServiceRequestConfirmed(mobile, name, 'Priority Membership', today),
  ]);
  if (smsRes.status === 'rejected') console.error('[PriorityMembership] SMS failed:', smsRes.reason?.message);
  if (waRes.status === 'rejected') console.error('[PriorityMembership] WhatsApp failed:', waRes.reason?.message);
};

const findOpenRequest = async (mobile, clientId) => {
  const res = await db.query(
    `SELECT request_id FROM service_requests
     WHERE service_type = $1 AND status = ANY($2::text[])
       AND (payer_mobile = $3 OR ($4::uuid IS NOT NULL AND client_id = $4::uuid))
     LIMIT 1`,
    [SERVICE_TYPE, OPEN_STATUSES, mobile, clientId || null]
  );
  return res.rows[0] || null;
};

const insertRequest = async (v) => {
  const result = await db.query(
    `INSERT INTO service_requests (
        client_id, payer_name, payer_mobile, payer_email, payer_gender, client_type,
        company_name, honorific, location_address, city_id, service_type, status, remarks
     ) VALUES ($1, $2, $3, $4, $5::gender_enum, $6::client_type_enum, $7, $8, $9, $10, $11, 'NEW_LEAD', $12)
     RETURNING request_id, service_request_code, created_at`,
    [
      v.clientId, v.name, v.mobile, v.email, v.gender, v.clientType,
      v.companyName, v.honorific, v.address, v.cityId, SERVICE_TYPE,
      'Priority Membership registration (submitted from the website).',
    ]
  );
  return result.rows[0];
};

const logRequest = async (actorUserId, requestId, name, mobile, guest) => {
  try {
    await logActivity({
      actorUserId: actorUserId || null,
      actorName: name,
      actorRole: guest ? 'GUEST' : 'CLIENT',
      actionType: 'SERVICE_REQUEST_CREATED',
      entityType: 'SERVICE_REQUEST',
      entityId: requestId,
      details: { payer_name: name, payer_mobile: mobile, service_type: SERVICE_TYPE, guest },
    });
  } catch (err) {
    console.error('Activity log error (non-fatal):', err);
  }
};

// POST /api/priority-membership/otp/send   { mobile_number }
exports.sendOtp = async (req, res) => {
  try {
    if (!isValidPhone(req.body.mobile_number)) {
      return res.status(400).json({ message: 'Enter a valid mobile number.' });
    }
    const mobile = toE164(req.body.mobile_number);

    const existing = await db.query(
      'SELECT created_at FROM priority_membership_otps WHERE mobile_number = $1',
      [mobile]
    );
    if (existing.rows.length > 0) {
      const secondsAgo = (Date.now() - new Date(existing.rows[0].created_at).getTime()) / 1000;
      if (secondsAgo < OTP_RESEND_SECONDS) {
        return res.status(429).json({
          message: `Please wait ${Math.ceil(OTP_RESEND_SECONDS - secondsAgo)} seconds before requesting a new code.`,
        });
      }
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    await db.query(
      `INSERT INTO priority_membership_otps (mobile_number, otp_code, expires_at, attempts, created_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, 0, NOW())
       ON CONFLICT (mobile_number) DO UPDATE
         SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at,
             attempts = 0, created_at = NOW()`,
      [mobile, otp, String(OTP_TTL_MINUTES)]
    );

    await Promise.allSettled([sendWhatsAppOtp(mobile, otp), sendSmsOtp(mobile, otp)]);
    if (process.env.NODE_ENV !== 'production') console.log(`[DEV ONLY] Priority Membership OTP for ${mobile}: ${otp}`);

    res.status(200).json({ status: 'success', message: 'A verification code has been sent to your mobile number.' });
  } catch (error) {
    console.error('Priority Membership sendOtp error:', error);
    res.status(500).json({ message: 'Could not send the verification code. Please try again.' });
  }
};

// POST /api/priority-membership/otp/verify   { mobile_number, otp_code }
exports.verifyOtp = async (req, res) => {
  try {
    if (!isValidPhone(req.body.mobile_number)) {
      return res.status(400).json({ message: 'Enter a valid mobile number.' });
    }
    const mobile = toE164(req.body.mobile_number);
    const code = String(req.body.otp_code || '').trim();

    const rowRes = await db.query(
      'SELECT otp_code, expires_at, attempts FROM priority_membership_otps WHERE mobile_number = $1',
      [mobile]
    );
    const row = rowRes.rows[0];
    if (!row || new Date(row.expires_at) <= new Date()) {
      return res.status(400).json({ message: 'Invalid or expired code. Please request a new one.' });
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    const a = Buffer.from(code);
    const b = Buffer.from(row.otp_code);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      await db.query('UPDATE priority_membership_otps SET attempts = attempts + 1 WHERE mobile_number = $1', [mobile]);
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }

    // One-time: burn the code, hand back a short-lived proof of ownership.
    await db.query('DELETE FROM priority_membership_otps WHERE mobile_number = $1', [mobile]);
    res.status(200).json({ status: 'success', verification_token: signVerifiedToken(mobile) });
  } catch (error) {
    console.error('Priority Membership verifyOtp error:', error);
    res.status(500).json({ message: 'Could not verify the code. Please try again.' });
  }
};

// POST /api/priority-membership/register   (guest; needs verification_token)
exports.registerGuest = async (req, res) => {
  try {
    const {
      verification_token, full_name, email, gender, honorific, client_type,
      company_name, primary_address, terms_accepted,
    } = req.body;

    if (!isValidPhone(req.body.mobile_number)) {
      return res.status(400).json({ message: 'Enter a valid mobile number.' });
    }
    const mobile = toE164(req.body.mobile_number);

    if (!readVerifiedToken(verification_token, mobile)) {
      return res.status(401).json({ message: 'Please verify your mobile number again.' });
    }
    if (!terms_accepted) return res.status(400).json({ message: 'You must accept the Terms & Conditions.' });
    if (!full_name || !String(full_name).trim()) return res.status(400).json({ message: 'Full name is required.' });
    if (!isEmail(email)) return res.status(400).json({ message: 'Valid email address is required.' });
    if (!GENDERS.includes(gender)) return res.status(400).json({ message: 'Gender is required.' });
    if (!primary_address || !String(primary_address).trim()) return res.status(400).json({ message: 'Address is required.' });

    const finalClientType = client_type || 'INDIVIDUAL';
    if (!CLIENT_TYPES.includes(finalClientType)) return res.status(400).json({ message: 'Invalid client type.' });
    if (finalClientType === 'CORPORATE_PROXY' && !String(company_name || '').trim()) {
      return res.status(400).json({ message: 'Company name is required for a company account.' });
    }

    let city;
    try {
      city = await resolveCity(req.body.city_id);
    } catch (cityError) {
      return res.status(400).json({ message: cityError.message });
    }
    if (!city) return res.status(400).json({ message: 'Please select your city from the list.' });

    // The OTP proves the number is theirs, so an existing account can be linked.
    const profileRes = await db.query(
      `SELECT cp.client_profile_id, cp.reg_fee_status, cp.reg_fee_expires_at
       FROM users u JOIN client_profiles cp ON cp.user_id = u.user_id
       WHERE u.mobile_number = $1`,
      [mobile]
    );
    const profile = profileRes.rows[0] || null;

    if (isMembershipActive(profile)) {
      return res.status(409).json({ message: 'This number already has an active membership. Please log in to your account.' });
    }
    if (await findOpenRequest(mobile, profile?.client_profile_id)) {
      return res.status(409).json({ message: 'You already have a Priority Membership request in progress. Our team will contact you shortly.' });
    }

    const created = await insertRequest({
      clientId: profile?.client_profile_id || null,
      name: String(full_name).trim(),
      mobile,
      email: String(email).trim(),
      gender,
      clientType: finalClientType,
      companyName: finalClientType === 'CORPORATE_PROXY' ? String(company_name).trim() : null,
      honorific: honorific || null,
      address: String(primary_address).trim(),
      cityId: city.city_id,
    });

    await logRequest(null, created.request_id, String(full_name).trim(), mobile, true);
    notifyClient(mobile, String(full_name).trim()).catch(() => {});

    res.status(201).json({ status: 'success', message: 'Your Priority Membership request has been received.', data: created });
  } catch (error) {
    console.error('Priority Membership registerGuest error:', error);
    res.status(500).json({ message: 'Could not submit your request. Please try again.' });
  }
};

// POST /api/priority-membership/register/me   (logged-in client; details come from their profile)
exports.registerAuthenticated = async (req, res) => {
  try {
    const profileRes = await db.query(
      `SELECT cp.client_profile_id, cp.full_name, cp.gender, cp.primary_address, cp.city_id,
              cp.client_type, cp.company_name, cp.honorific, cp.reg_fee_status, cp.reg_fee_expires_at,
              u.mobile_number, u.email
       FROM users u JOIN client_profiles cp ON cp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );
    const p = profileRes.rows[0];
    if (!p) {
      return res.status(400).json({ message: 'Please complete your client profile first.', code: 'NO_CLIENT_PROFILE' });
    }
    if (isMembershipActive(p)) {
      return res.status(409).json({ message: 'Your membership is already active.' });
    }
    if (await findOpenRequest(p.mobile_number, p.client_profile_id)) {
      return res.status(409).json({ message: 'You already have a Priority Membership request in progress. Our team will contact you shortly.' });
    }

    const created = await insertRequest({
      clientId: p.client_profile_id,
      name: p.full_name,
      mobile: p.mobile_number,
      email: p.email || null,
      gender: p.gender || null,
      clientType: p.client_type || 'INDIVIDUAL',
      companyName: p.company_name || null,
      honorific: p.honorific || null,
      address: p.primary_address || null,
      cityId: p.city_id || null,
    });

    await logRequest(req.user.user_id, created.request_id, p.full_name, p.mobile_number, false);
    notifyClient(p.mobile_number, p.full_name).catch(() => {});

    res.status(201).json({ status: 'success', message: 'Your Priority Membership request has been received.', data: created });
  } catch (error) {
    console.error('Priority Membership registerAuthenticated error:', error);
    res.status(500).json({ message: 'Could not submit your request. Please try again.' });
  }
};
