const bcrypt = require('bcrypt');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/email');
const sendWhatsAppOtp = require('../utils/whatsapp');

exports.registerClient = async (req, res, next) => {
  const { mobile_number, password, full_name, client_type, terms_accepted, email } = req.body;
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
      `INSERT INTO client_profiles (user_id, full_name, client_type) 
       VALUES ($1, $2, $3) RETURNING client_profile_id`,
      [userId, full_name, client_type || 'INDIVIDUAL']
    );

    // Store OTP in database
    await client.query(
      'INSERT INTO otp_verifications (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [userId, otp, expiresAt]
    );

    // COMMIT TRANSACTION
    await client.query('COMMIT');

    // Send OTP email and WhatsApp
    let emailSent = false;
    let whatsappSent = false;

    try {
      // Try sending email first
      await sendEmail({ email: email, subject: 'VCare OTP', message: `Your code: ${otp}` });
      emailSent = true;
      console.log('Email sent successfully');
    } catch (emailError) {
      console.error("Email failed to send:", emailError);
      console.error("Notification Error:", emailError.message);
    }

    try {
      // Try sending WhatsApp
      await sendWhatsAppOtp(mobile_number, otp);
      whatsappSent = true;
      console.log('WhatsApp sent successfully');
    } catch (whatsappError) {
      console.error("WhatsApp failed to send:", whatsappError);
      console.error("WhatsApp Error:", whatsappError.message);
    }

    // Log overall notification status
    if (!emailSent && !whatsappSent) {
      console.error("Both email and WhatsApp failed to send");
    } else if (!emailSent) {
      console.warn("Email failed but WhatsApp succeeded");
    } else if (!whatsappSent) {
      console.warn("WhatsApp failed but email succeeded");
    } else {
      console.log("Both email and WhatsApp sent successfully");
    }

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please verify the OTP sent to your email.',
      data: {
        userId: userId,
        profileId: newProfile.rows[0].client_profile_id,
        payment_required: true,
        amount_due: 10000.00,
        email_sent: true
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
      sendEmail({
        email: user.email,
        subject: 'Your New VCare Verification Code',
        message: `Your new verification code is: ${newOtp}. It expires in 10 minutes.`
      }),
      sendWhatsAppOtp(user.mobile_number, newOtp)
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
      'SELECT user_id, password_hash, role, is_active FROM users WHERE mobile_number = $1',
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

    // 3. DUAL ROLE DISCOVERY (The Critical Step)
    // We check both tables to see what "hats" this user wears.
    const clientProfilePromise = db.query(
      'SELECT client_profile_id, full_name, client_type FROM client_profiles WHERE user_id = $1',
      [user.user_id]
    );

    const staffProfilePromise = db.query(
      'SELECT staff_profile_id, full_name, verification_status FROM staff_profiles WHERE user_id = $1',
      [user.user_id]
    );

    // Run queries in parallel for speed
    const [clientRes, staffRes] = await Promise.all([clientProfilePromise, staffProfilePromise]);

    const clientProfile = clientRes.rows[0] || null;
    const staffProfile = staffRes.rows[0] || null;

    // 4. Generate JWT Token
    // We embed the user_id. We do NOT embed profile IDs because they might switch roles.
    const token = jwt.sign(
      { id: user.user_id, role: user.role }, // Adding role to payload
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 5. Send Response
    // The Frontend uses 'roles' to decide which screen to show next.
    res.status(200).json({
      status: 'success',
      token,
      data: {
        user_id: user.user_id,
        mobile_number: mobile_number,
        roles: {
          is_client: !!clientProfile, // Boolean: true if they have a client profile
          client_id: clientProfile ? clientProfile.client_profile_id : null,
          client_info: clientProfile ? {
            name: clientProfile.full_name,
            type: clientProfile.client_type
          } : null,

          is_staff: !!staffProfile, // Boolean: true if they have a staff profile
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
        sp.staff_profile_id, sp.full_name AS staff_name, sp.designation, sp.verification_status
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