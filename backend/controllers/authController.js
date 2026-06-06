const bcrypt = require('bcrypt');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/email');
const { sendWhatsAppOtp } = require('../utils/whatsapp');
const { sendSmsOtp } = require('../utils/sms');

exports.registerClient = async (req, res, next) => {
  const { mobile_number, password, full_name, client_type, terms_accepted, email, gender, primary_address } = req.body;
  const client = await db.pool.connect(); // Get a client for Transaction

  try {
    // 1. Basic Validation
    if (!terms_accepted) {
      return res.status(400).json({ message: "You must accept the Terms & Conditions." });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Valid email address is required." });
    }

    // START TRANSACTION
    await client.query('BEGIN');

    // 2. Check if Mobile Number already exists in 'users'
    const userCheck = await client.query(
      'SELECT user_id FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    let userId;

    if (userCheck.rows.length > 0) {
      // SCENARIO A: User exists (Maybe a Staff member registering as Client)
      userId = userCheck.rows[0].user_id;

      // Update user's email if not already set
      await client.query(
        'UPDATE users SET email = $1 WHERE user_id = $2 AND email IS NULL',
        [email, userId]
      );

      // Check if they ALREADY have a client profile
      const profileCheck = await client.query(
        'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
        [userId]
      );

      if (profileCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "Account already exists for this number." });
      }

    } else {
      // SCENARIO B: New User (Create Identity Layer)
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = await client.query(
        `INSERT INTO users (mobile_number, password_hash, email) 
         VALUES ($1, $2, $3) RETURNING user_id`,
        [mobile_number, hashedPassword, email]
      );
      userId = newUser.rows[0].user_id;
    }

    // 3. Generate OTP and create Client Profile (Data Layer)
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes from now

    // Create Client Profile
    // Note: wallet_balance defaults to 0.00 in DB schema
    // Note: is_registration_fee_paid defaults to FALSE in DB schema
    const newProfile = await client.query(
      `INSERT INTO client_profiles (user_id, full_name, client_type, gender, primary_address) 
       VALUES ($1, $2, $3, $4::gender_enum, $5) RETURNING client_profile_id`,
      [userId, full_name, client_type || 'INDIVIDUAL', gender, primary_address]
    );

    // Store OTP in database
    await client.query(
      'INSERT INTO otp_verifications (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [userId, otp, expiresAt]
    );

    // COMMIT TRANSACTION
    await client.query('COMMIT');

    // Send OTP via WhatsApp and SMS (email temporarily disabled)
    let emailSent = false;
    let whatsappSent = false;
    let smsSent = false;

    const [whatsappResult, smsResult] = await Promise.allSettled([
      sendWhatsAppOtp(mobile_number, otp),
      sendSmsOtp(mobile_number, otp)
    ]);

    whatsappSent = whatsappResult.status === 'fulfilled';
    smsSent = smsResult.status === 'fulfilled';

    if (!whatsappSent) console.error("WhatsApp OTP failed:", whatsappResult.reason?.message);
    if (!smsSent) console.error("SMS OTP failed:", smsResult.reason?.message);
    if (!whatsappSent && !smsSent) console.error("Both WhatsApp and SMS failed to send OTP");

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please verify the OTP sent to your WhatsApp and phone number.',
      data: {
        userId: userId,
        profileId: newProfile.rows[0].client_profile_id,
        payment_required: true,
        amount_due: 10000.00,
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
        sms_sent: smsSent
      }
    });

  } catch (error) {
    await client.query('ROLLBACK'); // Undo everything if any step fails
    console.error(error);
    res.status(500).json({ message: "Registration failed." });
  } finally {
    client.release(); // Release connection back to pool
  }
};

exports.resendOtp = async (req, res) => {
  const { user_id } = req.body;

  try {
    // 1. Fetch user details
    const userResult = await db.query(
      'SELECT email, mobile_number, is_email_verified FROM users WHERE user_id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = userResult.rows[0];

    // 2. Security Check: If already verified, don't send anything
    if (user.is_email_verified) {
      return res.status(400).json({ message: "This account is already verified." });
    }

    // 3. Rate Limiting (Cooldown Check)
    // Check if an OTP was sent in the last 60 seconds
    const lastOtp = await db.query(
      'SELECT created_at FROM otp_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user_id]
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

    // 4. Generate & Refresh OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

    // Clear old codes and insert new one
    await db.query('DELETE FROM otp_verifications WHERE user_id = $1', [user_id]);
    await db.query(
      'INSERT INTO otp_verifications (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [user_id, newOtp, expiresAt]
    );

    // 5. Trigger Multi-Channel Send
    // Use Promise.allSettled so that if one fails, the other can still succeed
    await Promise.allSettled([
      // email sending temporarily disabled
      /* sendEmail({
        email: user.email,
        subject: 'Your New VCare Verification Code',
        message: `Your new verification code is: ${newOtp}. It expires in 10 minutes.`
      }), */
      sendWhatsAppOtp(user.mobile_number, newOtp),
      sendSmsOtp(user.mobile_number, newOtp)
    ]);

    // Log to terminal for easy testing without checking phone
    console.log(`[DEV ONLY] New OTP for User ${user_id}: ${newOtp}`);

    res.status(200).json({
      status: 'success',
      message: 'A new verification code has been sent to your email and WhatsApp.'
    });

  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ message: "Internal server error during OTP resend." });
  }
};

exports.verifyOtp = async (req, res) => {
  const { user_id, otp_code } = req.body;

  try {
    const result = await db.query(
      `SELECT * FROM otp_verifications 
       WHERE user_id = $1 AND otp_code = $2 AND expires_at > NOW()`,
      [user_id, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    // Mark email as verified
    await db.query('UPDATE users SET is_email_verified = TRUE WHERE user_id = $1', [user_id]);

    // Delete the OTP so it can't be used again
    await db.query('DELETE FROM otp_verifications WHERE user_id = $1', [user_id]);

    res.status(200).json({ status: 'success', message: "Email verified successfully." });

  } catch (error) {
    res.status(500).json({ message: "Verification failed." });
  }
};

exports.login = async (req, res) => {
  const { mobile_number, password } = req.body;

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
    // We embed the user_id, full_name, mobile_number, gender, and primary_address in the JWT payload
    // Priority: client profile full_name > staff profile full_name > fallback
    const fullName = clientProfile?.full_name || staffProfile?.full_name || null;
    
    const tokenPayload = { 
      id: user.user_id, 
      role: user.role,
      full_name: fullName,
      mobile_number: mobile_number,
      gender: clientProfile?.gender || null,
      primary_address: clientProfile?.primary_address || null
    };
    
    console.log('JWT Payload:', tokenPayload); // Debug log
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 5. Send Response
    // The Frontend uses 'roles' to decide which screen to show next.
    res.status(200).json({
      status: 'success',
      token,
      requires_password_change: isTempPassword && !!staffProfile,
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