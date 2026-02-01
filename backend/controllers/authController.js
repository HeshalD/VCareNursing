const bcrypt = require('bcrypt');
const db = require('../config/db');

exports.registerClient = async (req, res, next) => {
  const { mobile_number, password, full_name, client_type, terms_accepted } = req.body;
  const client = await db.pool.connect(); // Get a client for Transaction

  try {
    // 1. Basic Validation
    if (!terms_accepted) {
      return res.status(400).json({ message: "You must accept the Terms & Conditions." });
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
        `INSERT INTO users (mobile_number, password_hash) 
         VALUES ($1, $2) RETURNING user_id`,
        [mobile_number, hashedPassword]
      );
      userId = newUser.rows[0].user_id;
    }

    // 3. Create Client Profile (Data Layer)
    // Note: wallet_balance defaults to 0.00 in DB schema
    // Note: is_registration_fee_paid defaults to FALSE in DB schema
    const newProfile = await client.query(
      `INSERT INTO client_profiles (user_id, full_name, client_type) 
       VALUES ($1, $2, $3) RETURNING client_profile_id`,
      [userId, full_name, client_type || 'INDIVIDUAL']
    );

    // COMMIT TRANSACTION
    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please pay registration fee.',
      data: {
        userId: userId,
        profileId: newProfile.rows[0].client_profile_id,
        payment_required: true,
        amount_due: 10000.00
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