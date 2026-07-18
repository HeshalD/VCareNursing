const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/email');
const { sendWhatsAppOtp } = require('../utils/whatsapp');
const { sendSmsOtp } = require('../utils/sms');

// Roles that may only log into the admin dashboard from a device the SUPER_ADMIN has assigned them.
const DEVICE_RESTRICTED_ROLES = new Set(['COORDINATOR', 'ACCOUNTS']);

function parseRoles(rawRole) {
  if (Array.isArray(rawRole)) {
    return rawRole.map(r => (typeof r === 'string' ? r.replace(/\{|\}/g, '').trim() : String(r)));
  }
  if (typeof rawRole === 'string') {
    return rawRole.replace(/\{|\}/g, '').split(',').map(r => r.trim()).filter(Boolean);
  }
  return [];
}

exports.registerClient = async (req, res, next) => {
  const { mobile_number, password, full_name, client_type, terms_accepted, email, gender, primary_address, company_name, honorific, display_name_source } = req.body;

  try {
    if (!terms_accepted) {
      return res.status(400).json({ message: "You must accept the Terms & Conditions." });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Valid email address is required." });
    }

    // Display name only makes sense once a company name exists; otherwise it's always the person's name.
    const resolvedDisplayNameSource =
      client_type === 'CORPORATE_PROXY' && company_name && display_name_source === 'COMPANY_NAME'
        ? 'COMPANY_NAME'
        : 'FULL_NAME';

    // Block mobile numbers already registered in users table
    const userCheck = await db.query(
      'SELECT user_id FROM users WHERE mobile_number = $1',
      [mobile_number]
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: "An account with this mobile number already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);

    // Upsert into pending_registrations — overwrite any previous attempt from the same number
    await db.query(
      `INSERT INTO pending_registrations
         (mobile_number, password_hash, email, full_name, client_type, gender, primary_address, company_name, honorific, display_name_source, otp_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (mobile_number) DO UPDATE
         SET password_hash       = EXCLUDED.password_hash,
             email               = EXCLUDED.email,
             full_name           = EXCLUDED.full_name,
             client_type         = EXCLUDED.client_type,
             gender              = EXCLUDED.gender,
             primary_address     = EXCLUDED.primary_address,
             company_name        = EXCLUDED.company_name,
             honorific           = EXCLUDED.honorific,
             display_name_source = EXCLUDED.display_name_source,
             otp_code            = EXCLUDED.otp_code,
             expires_at          = EXCLUDED.expires_at,
             created_at          = NOW()`,
      [
        mobile_number, hashedPassword, email, full_name,
        client_type || 'INDIVIDUAL', gender, primary_address,
        company_name || null, honorific || null, resolvedDisplayNameSource, otp, expiresAt,
      ]
    );

    const [whatsappResult, smsResult] = await Promise.allSettled([
      sendWhatsAppOtp(mobile_number, otp),
      sendSmsOtp(mobile_number, otp)
    ]);

    if (whatsappResult.status === 'rejected') console.error("WhatsApp OTP failed:", whatsappResult.reason?.message);
    if (smsResult.status === 'rejected') console.error("SMS OTP failed:", smsResult.reason?.message);

    res.status(200).json({
      status: 'success',
      message: 'OTP sent. Please verify your mobile number to complete registration.',
      data: { mobile_number },
    });

  } catch (error) {
    console.error('registerClient error:', error);
    res.status(500).json({ message: "Registration failed." });
  }
};

exports.resendOtp = async (req, res) => {
  const { mobile_number } = req.body;

  try {
    const pendingRes = await db.query(
      'SELECT created_at FROM pending_registrations WHERE mobile_number = $1',
      [mobile_number]
    );

    if (pendingRes.rows.length === 0) {
      return res.status(404).json({ message: "No pending registration found for this number." });
    }

    const lastSentTime = new Date(pendingRes.rows[0].created_at);
    const secondsAgo = (new Date() - lastSentTime) / 1000;
    if (secondsAgo < 60) {
      return res.status(429).json({
        message: `Please wait ${Math.round(60 - secondsAgo)} seconds before requesting a new code.`
      });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await db.query(
      'UPDATE pending_registrations SET otp_code = $1, expires_at = $2, created_at = NOW() WHERE mobile_number = $3',
      [newOtp, expiresAt, mobile_number]
    );

    await Promise.allSettled([
      sendWhatsAppOtp(mobile_number, newOtp),
      sendSmsOtp(mobile_number, newOtp)
    ]);

    console.log(`[DEV ONLY] Resend OTP for ${mobile_number}: ${newOtp}`);

    res.status(200).json({
      status: 'success',
      message: 'A new verification code has been sent to your mobile number.'
    });

  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ message: "Internal server error during OTP resend." });
  }
};

exports.verifyOtp = async (req, res) => {
  const { mobile_number, otp_code } = req.body;
  const dbClient = await db.pool.connect();

  try {
    const pendingRes = await dbClient.query(
      `SELECT * FROM pending_registrations
       WHERE mobile_number = $1 AND otp_code = $2 AND expires_at > NOW()`,
      [mobile_number, otp_code]
    );

    if (pendingRes.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const pending = pendingRes.rows[0];

    await dbClient.query('BEGIN');

    const newUser = await dbClient.query(
      `INSERT INTO users (mobile_number, password_hash, email, is_email_verified)
       VALUES ($1, $2, $3, TRUE) RETURNING user_id`,
      [pending.mobile_number, pending.password_hash, pending.email]
    );
    const userId = newUser.rows[0].user_id;

    const newProfile = await dbClient.query(
      `INSERT INTO client_profiles (user_id, full_name, client_type, gender, primary_address, company_name, honorific, display_name_source)
       VALUES ($1, $2, $3, $4::gender_enum, $5, $6, $7, $8) RETURNING client_profile_id`,
      [
        userId, pending.full_name, pending.client_type,
        pending.gender, pending.primary_address,
        pending.company_name, pending.honorific, pending.display_name_source,
      ]
    );
    const profileId = newProfile.rows[0].client_profile_id;

    await dbClient.query(
      'DELETE FROM pending_registrations WHERE mobile_number = $1',
      [pending.mobile_number]
    );

    await dbClient.query('COMMIT');

    res.status(200).json({
      status: 'success',
      message: "Mobile number verified. Registration complete.",
      data: { userId, profileId, payment_required: true, amount_due: 10000.00 },
    });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('verifyOtp error:', error);
    res.status(500).json({ message: "Verification failed." });
  } finally {
    dbClient.release();
  }
};

exports.login = async (req, res) => {
  const { mobile_number, password, device_id } = req.body;

  try {
    // 1. Find User by Mobile Number
    const userResult = await db.query(
      'SELECT user_id, password_hash, role, is_active, email FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    // 2. Security Checks
    if (!user.is_active) {
      return res.status(403).json({ message: "Account is deactivated. Contact admin." });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isTempPassword = /^[a-z0-9]{8}$/.test(password) &&
                           !/[A-Z]/.test(password) &&
                           !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    // 2b. Device binding for admin-dashboard roles (SUPER_ADMIN is exempt)
    const roles = parseRoles(user.role);
    const isDeviceRestricted = roles.some(r => DEVICE_RESTRICTED_ROLES.has(r));
    let boundDeviceId = null;

    if (isDeviceRestricted) {
      if (!device_id) {
        return res.status(403).json({ code: 'DEVICE_REQUIRED', message: 'This account requires a registered device to log in.' });
      }

      const deviceResult = await db.query(
        `SELECT id FROM staff_devices WHERE user_id = $1 AND device_id = $2 AND status = 'ACTIVE'`,
        [user.user_id, device_id]
      );

      if (!deviceResult.rows.length) {
        return res.status(403).json({ code: 'DEVICE_NOT_AUTHORIZED', message: 'This device is not authorized for this account. Contact your SUPER_ADMIN for an activation code.' });
      }

      boundDeviceId = device_id;
    }

    // Update last_login timestamp
    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
      [user.user_id]
    );

    // 3. DUAL ROLE DISCOVERY (The Critical Step)
    // We check both tables to see what "hats" this user wears.
    const clientProfilePromise = db.query(
      'SELECT client_profile_id, full_name, client_type, gender, primary_address FROM client_profiles WHERE user_id = $1',
      [user.user_id]
    );

    const staffProfilePromise = db.query(
      'SELECT staff_profile_id, full_name, verification_status, profile_picture_url FROM staff_profiles WHERE user_id = $1',
      [user.user_id]
    );

    // Run queries in parallel for speed
    const [clientRes, staffRes] = await Promise.all([clientProfilePromise, staffProfilePromise]);

    const clientProfile = clientRes.rows[0] || null;
    const staffProfile = staffRes.rows[0] || null;

    // 4. Generate JWT Token
    // Priority: client profile > staff profile > internal_staff (for COORDINATOR/ACCOUNTS)
    let fullName = clientProfile?.full_name || staffProfile?.full_name || null;

    if (!fullName) {
      const internalStaffRes = await db.query(
        'SELECT full_name FROM internal_staff WHERE user_id = $1',
        [user.user_id]
      );
      fullName = internalStaffRes.rows[0]?.full_name || null;
    }
    
    const jti = boundDeviceId ? crypto.randomUUID() : undefined;

    const tokenPayload = {
      id: user.user_id,
      role: user.role,
      full_name: fullName,
      mobile_number: mobile_number,
      gender: clientProfile?.gender || null,
      primary_address: clientProfile?.primary_address || null,
      ...(boundDeviceId ? { device_id: boundDeviceId, jti } : {})
    };

    console.log('JWT Payload:', tokenPayload); // Debug log

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    if (boundDeviceId) {
      await db.query(
        `INSERT INTO staff_sessions (user_id, device_id, jti, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.user_id, boundDeviceId, jti, req.ip, req.headers['user-agent'] || null]
      );
    }

    // 5. Send Response
    // The Frontend uses 'roles' to decide which screen to show next.
    res.status(200).json({
      status: 'success',
      token,
      // Prompt a forced password change for both staff and freshly-onboarded clients
      // who are still using their system-generated temporary password.
      requires_password_change: isTempPassword && (!!staffProfile || !!clientProfile),
      data: {
        user_id: user.user_id,
        mobile_number: mobile_number,
        email: user.email || null,
        // Top-level staff_info mirrors staffLogin response shape for the password-change redirect
        is_staff: !!staffProfile,
        staff_info: staffProfile ? {
          staff_id: staffProfile.staff_profile_id,
          name: staffProfile.full_name,
          status: staffProfile.verification_status
        } : null,
        roles: {
          is_client: !!clientProfile,
          client_id: clientProfile ? clientProfile.client_profile_id : null,
          client_info: clientProfile ? {
            name: clientProfile.full_name,
            type: clientProfile.client_type
          } : null,
          is_staff: !!staffProfile,
          staff_id: staffProfile ? staffProfile.staff_profile_id : null,
          staff_info: staffProfile ? {
            name: staffProfile.full_name,
            status: staffProfile.verification_status
          } : null
        }
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT user_id, mobile_number, email, is_email_verified, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.status(200).json({ status: 'success', count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

exports.getAllClients = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM client_profiles ORDER BY created_at DESC'
    );
    res.status(200).json({ status: 'success', count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ message: "Error fetching client profiles" });
  }
};

exports.getAllStaff = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM staff_profiles ORDER BY created_at DESC'
    );
    res.status(200).json({ status: 'success', count: result.rowCount, data: result.rows });
  } catch (error) {
    res.status(500).json({ message: "Error fetching staff profiles" });
  }
};

// Returns the current authenticated user's known account details (from
// client_profiles / staff_profiles) — used to prefill and lock fields when a
// staff member without a client profile creates one for themselves.
exports.getMyAccountInfo = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const userRes = await db.query(
      'SELECT user_id, mobile_number, email FROM users WHERE user_id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const account = userRes.rows[0];

    const [clientRes, staffRes] = await Promise.all([
      db.query('SELECT client_profile_id, full_name, gender, primary_address FROM client_profiles WHERE user_id = $1', [userId]),
      db.query('SELECT staff_profile_id, full_name, gender, home_address FROM staff_profiles WHERE user_id = $1', [userId]),
    ]);

    const clientProfile = clientRes.rows[0] || null;
    const staffProfile = staffRes.rows[0] || null;

    res.status(200).json({
      status: 'success',
      data: {
        user_id: account.user_id,
        mobile_number: account.mobile_number,
        email: account.email,
        full_name: clientProfile?.full_name || staffProfile?.full_name || null,
        gender: clientProfile?.gender || staffProfile?.gender || null,
        primary_address: clientProfile?.primary_address || staffProfile?.home_address || null,
        has_client_profile: !!clientProfile,
        has_staff_profile: !!staffProfile,
      },
    });
  } catch (error) {
    console.error('getMyAccountInfo error:', error);
    res.status(500).json({ message: 'Failed to load account info.' });
  }
};

// Creates a client_profiles row for the currently authenticated user (e.g. a staff
// member who wants to also book care as a client) and adds the CLIENT role to their
// account. Locked/known fields (name, gender, address) are always read server-side
// from staff_profiles — never taken from the request body — so they can't be tampered with.
exports.createClientProfileForExistingUser = async (req, res) => {
  const { client_type, company_name, honorific, terms_accepted, display_name_source } = req.body;
  const userId = req.user.user_id;
  const resolvedDisplayNameSource =
    client_type === 'CORPORATE_PROXY' && company_name && display_name_source === 'COMPANY_NAME'
      ? 'COMPANY_NAME'
      : 'FULL_NAME';

  if (!terms_accepted) {
    return res.status(400).json({ message: 'You must accept the Terms & Conditions.' });
  }

  const dbClient = await db.pool.connect();
  try {
    await dbClient.query('BEGIN');

    const existing = await dbClient.query(
      'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0) {
      await dbClient.query('ROLLBACK');
      return res.status(409).json({ message: 'You already have a client profile.' });
    }

    const staffRes = await dbClient.query(
      'SELECT full_name, gender, home_address FROM staff_profiles WHERE user_id = $1',
      [userId]
    );
    const staffProfile = staffRes.rows[0];
    if (!staffProfile) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ message: 'No staff profile found for this account.' });
    }

    const newProfile = await dbClient.query(
      `INSERT INTO client_profiles (user_id, full_name, client_type, gender, primary_address, company_name, honorific, display_name_source)
       VALUES ($1, $2, $3, $4::gender_enum, $5, $6, $7, $8) RETURNING client_profile_id`,
      [
        userId,
        staffProfile.full_name,
        client_type || 'INDIVIDUAL',
        staffProfile.gender,
        staffProfile.home_address,
        client_type === 'CORPORATE_PROXY' ? (company_name || null) : null,
        honorific || null,
        resolvedDisplayNameSource,
      ]
    );

    const userRoleRes = await dbClient.query('SELECT role FROM users WHERE user_id = $1', [userId]);
    let currentRoles = userRoleRes.rows[0]?.role || [];
    if (typeof currentRoles === 'string') {
      currentRoles = currentRoles.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean);
    }
    const newRoles = [...new Set([...currentRoles, 'CLIENT'])];
    await dbClient.query('UPDATE users SET role = $1::user_role_enum[] WHERE user_id = $2', [newRoles, userId]);

    await dbClient.query('COMMIT');

    res.status(201).json({
      status: 'success',
      message: 'Client profile created successfully.',
      data: {
        client_profile_id: newProfile.rows[0].client_profile_id,
        payment_required: true,
        amount_due: 10000.00,
      },
    });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('createClientProfileForExistingUser error:', error);
    res.status(500).json({ message: 'Failed to create client profile.' });
  } finally {
    dbClient.release();
  }
};

exports.getUnifiedOverview = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.user_id, u.mobile_number, u.email, u.is_active,
        cp.client_profile_id, cp.full_name AS client_name, cp.client_type, cp.wallet_balance,
        sp.staff_profile_id, sp.full_name AS staff_name, sp.designation, sp.verification_status, sp.profile_picture_url
      FROM users u
      LEFT JOIN client_profiles cp ON u.user_id = cp.user_id
      LEFT JOIN staff_profiles sp ON u.user_id = sp.user_id
      ORDER BY u.created_at DESC;
    `;
    const result = await db.query(query);

    res.status(200).json({
      status: 'success',
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching unified overview" });
  }
};

// ============================================
// FORGOT PASSWORD FLOW
// ============================================

/**
 * Step 1: Request OTP for Password Reset
 * User enters phone number, system checks if it exists and sends OTP
 */
exports.requestForgotPasswordOtp = async (req, res) => {
  const { mobile_number } = req.body;

  try {
    // 1. Validation
    if (!mobile_number) {
      return res.status(400).json({ message: "Mobile number is required." });
    }

    // 2. Check if user exists
    const userResult = await db.query(
      'SELECT user_id, email FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Phone number not found in the system." });
    }

    const user = userResult.rows[0];

    // 3. Rate limiting check (prevent OTP spam)
    const lastOtp = await db.query(
      'SELECT created_at FROM password_reset_otps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.user_id]
    );

    if (lastOtp.rows.length > 0) {
      const lastSentTime = new Date(lastOtp.rows[0].created_at);
      const secondsAgo = (new Date() - lastSentTime) / 1000;

      if (secondsAgo < 60) {
        return res.status(429).json({
          message: `Please wait ${Math.round(60 - secondsAgo)} seconds before requesting a new code.`
        });
      }
    }

    // 4. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

    // 5. Store OTP in a separate table for password resets
    // Delete any old OTPs first to keep table clean
    await db.query(
      'DELETE FROM password_reset_otps WHERE user_id = $1',
      [user.user_id]
    );

    await db.query(
      'INSERT INTO password_reset_otps (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [user.user_id, otp, expiresAt]
    );

    // 6. Send OTP via WhatsApp and SMS
    const [wpReset, smsReset] = await Promise.allSettled([
      sendWhatsAppOtp(mobile_number, otp),
      sendSmsOtp(mobile_number, otp)
    ]);

    if (wpReset.status === 'fulfilled') console.log('Password reset OTP sent via WhatsApp');
    else console.error("WhatsApp failed to send password reset OTP:", wpReset.reason?.message);
    if (smsReset.status === 'fulfilled') console.log('Password reset OTP sent via SMS');
    else console.error("SMS failed to send password reset OTP:", smsReset.reason?.message);

    // Log OTP for development/testing
    console.log(`[DEV ONLY] Password reset OTP for User ${user.user_id}: ${otp}`);

    res.status(200).json({
      status: 'success',
      message: 'OTP has been sent to your registered phone number.',
      data: {
        user_id: user.user_id,
        mobile_number: mobile_number
      }
    });

  } catch (error) {
    console.error("Request Forgot Password OTP Error:", error);
    res.status(500).json({ message: "Internal server error while sending OTP." });
  }
};

/**
 * Step 2: Verify OTP for Password Reset
 * User enters the OTP they received
 */
exports.verifyForgotPasswordOtp = async (req, res) => {
  const { user_id, otp_code } = req.body;

  try {
    // 1. Validation
    if (!user_id || !otp_code) {
      return res.status(400).json({ message: "User ID and OTP code are required." });
    }

    // 2. Verify OTP exists and is not expired
    const otpResult = await db.query(
      `SELECT * FROM password_reset_otps 
       WHERE user_id = $1 AND otp_code = $2 AND expires_at > NOW()`,
      [user_id, otp_code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    // 3. OTP is valid - don't delete yet, let resetPassword handle cleanup
    // This allows frontend to proceed to password entry screen
    res.status(200).json({
      status: 'success',
      message: "OTP verified successfully. You can now set a new password.",
      data: {
        user_id: user_id,
        otp_verified: true
      }
    });

  } catch (error) {
    console.error("Verify Forgot Password OTP Error:", error);
    res.status(500).json({ message: "Error verifying OTP." });
  }
};

/**
 * Step 3: Reset Password
 * After OTP verification, user sets their new password
 */
exports.resetPassword = async (req, res) => {
  const { user_id, otp_code, new_password, confirm_password } = req.body;

  try {
    // 1. Validation
    if (!user_id || !otp_code || !new_password || !confirm_password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    // 2. Verify OTP is still valid
    const otpResult = await db.query(
      `SELECT * FROM password_reset_otps 
       WHERE user_id = $1 AND otp_code = $2 AND expires_at > NOW()`,
      [user_id, otp_code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired OTP. Please request a new one." });
    }

    // 3. Check if user exists
    const userResult = await db.query(
      'SELECT user_id FROM users WHERE user_id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    // 4. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    // 5. Update password in database
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2',
      [hashedPassword, user_id]
    );

    // 6. Delete the used OTP to prevent reuse
    await db.query(
      'DELETE FROM password_reset_otps WHERE user_id = $1',
      [user_id]
    );

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });

  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Error resetting password." });
  }
};