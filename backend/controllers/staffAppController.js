const db = require('../config/db');
const bcrypt = require('bcryptjs');
const sendEmail = require('../utils/email');
const sendWhatsAppOtp = require('../utils/whatsapp');

exports.submitApplication = async (req, res) => {
  try {
    const { 
      full_name, 
      email, 
      mobile_number, 
      applied_roles, 
      qualifications, 
      home_address,
      location, 
      latitude, 
      longitude 
    } = req.body;
    
   
    let rolesArray = [];
    if (applied_roles) {
        if (Array.isArray(applied_roles)) {
            rolesArray = applied_roles.map(r => r.replace(/\{|\}/g, '').trim());
        } else {
            rolesArray = [applied_roles.replace(/\{|\}/g, '').trim()];
        }
    }
    rolesArray = rolesArray.filter(role => role.length > 0);

    const document_urls = req.files ? req.files.map(file => file.path) : [];

    const query = `
      INSERT INTO staff_applications 
      (full_name, email, mobile_number, applied_roles, qualifications, document_urls, home_address, location, gps_coordinates)
      VALUES ($1, $2, $3, $4::user_role_enum[], $5, $6, $7, $8,
        CASE WHEN $9::float IS NOT NULL AND $10::float IS NOT NULL 
             THEN point($10::float, $9::float) 
             ELSE NULL 
        END)
      RETURNING *;
    `;

    // Note: We added $8 for location, so latitude/longitude moved to $9 and $10
    const result = await db.query(query, [
      full_name, 
      email, 
      mobile_number, 
      rolesArray,
      qualifications, 
      document_urls,
      home_address,
      location, 
      (latitude && latitude !== "") ? latitude : null,
      (longitude && longitude !== "") ? longitude : null
    ]);

    res.status(201).json({ status: 'success', data: result.rows[0] });

  } catch (error) {
    console.error("Submission Error:", error);
    res.status(500).json({ message: "Error submitting application", error: error.message });
  }
};

exports.acceptApplication = async (req, res) => {
  const { application_id } = req.body;
  
  const client = await db.pool.connect(); 

  try {
    await client.query('BEGIN');

    // 1. Fetch the Application
    const appResult = await client.query(
      'SELECT * FROM staff_applications WHERE application_id = $1', 
      [application_id]
    );

    if (appResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Application not found" });
    }
    const app = appResult.rows[0];

    // 2. Check if User Already Exists (by Email)
    const existingUserResult = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [app.email]
    );

    let userId;
    let tempPassword = null; // Only generated for NEW users
    let isNewUser = false;

    if (existingUserResult.rows.length > 0) {
      // --- SCENARIO A: EXISTING USER (Client applying for Staff) ---
      const existingUser = existingUserResult.rows[0];
      userId = existingUser.user_id;
      isNewUser = false;

      // Merge new roles with existing roles (avoiding duplicates)
      // We use a Set in JS to ensure uniqueness, then convert back to array
      // Note: existingUser.role might be null or an array
      let currentRoles = existingUser.role || [];
      
      // Clean existing roles as well since they might be in PostgreSQL array format
      if (currentRoles && currentRoles.length > 0) {
          console.log("Original currentRoles:", currentRoles, "Type:", typeof currentRoles);
          if (typeof currentRoles === 'string') {
              currentRoles = currentRoles.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(role => role.length > 0);
          } else if (Array.isArray(currentRoles)) {
              currentRoles = currentRoles.map(r => {
                  if (typeof r === 'string') {
                      return r.replace(/\{|\}/g, '').trim();
                  }
                  return r;
              }).filter(role => role.length > 0);
          }
          console.log("Cleaned currentRoles:", currentRoles);
      }
      
      // Clean applied_roles to remove curly braces before merging
      let cleanedRoles = [];
      if (app.applied_roles) {
          console.log("Original applied_roles:", app.applied_roles, "Type:", typeof app.applied_roles);
          // Handle PostgreSQL array string format like "{NURSE,COORDINATOR}"
          let rolesToProcess = app.applied_roles;
          if (typeof app.applied_roles === 'string') {
              // Remove outer braces and split by comma
              rolesToProcess = app.applied_roles.replace(/^\{|\}$/g, '').split(',');
              console.log("After parsing string:", rolesToProcess);
          }
          
          if (Array.isArray(rolesToProcess)) {
              cleanedRoles = rolesToProcess.map(r => r.replace(/\{|\}/g, '').trim()).filter(role => role.length > 0);
          } else {
              cleanedRoles = [rolesToProcess.replace(/\{|\}/g, '').trim()].filter(role => role.length > 0);
          }
          console.log("Final cleanedRoles:", cleanedRoles);
      }
      
      const newRoles = [...new Set([...currentRoles, ...cleanedRoles])];

      // Update the User's roles in the DB
      await client.query(
        'UPDATE users SET role = $1::user_role_enum[] WHERE user_id = $2',
        [newRoles, userId]
      );

    } else {
      // --- SCENARIO B: NEW USER (Brand new person) ---
      isNewUser = true;
      tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const userInsertQuery = `
        INSERT INTO users (email, password_hash, mobile_number, role, is_email_verified)
        VALUES ($1, $2, $3, $4::user_role_enum[], true) 
        RETURNING user_id;
      `;
      
      // Clean applied_roles to remove curly braces before using in user creation
      let cleanedRoles = [];
      if (app.applied_roles) {
          // Handle PostgreSQL array string format like "{NURSE,COORDINATOR}"
          let rolesToProcess = app.applied_roles;
          if (typeof app.applied_roles === 'string') {
              // Remove outer braces and split by comma
              rolesToProcess = app.applied_roles.replace(/^\{|\}$/g, '').split(',');
          }
          
          if (Array.isArray(rolesToProcess)) {
              cleanedRoles = rolesToProcess.map(r => r.replace(/\{|\}/g, '').trim()).filter(role => role.length > 0);
          } else {
              cleanedRoles = [rolesToProcess.replace(/\{|\}/g, '').trim()].filter(role => role.length > 0);
          }
      }

      const userResult = await client.query(userInsertQuery, [
        app.email,
        hashedPassword,
        app.mobile_number,
        cleanedRoles
      ]);
      userId = userResult.rows[0].user_id;
    }

    // 3. Create/Ensure Staff Profile Exists
    // We check if a staff profile already exists to prevent unique constraint errors 
    // (e.g. if they applied twice)
    const staffProfileCheck = await client.query(
        'SELECT * FROM staff_profiles WHERE user_id = $1', 
        [userId]
    );

    if (staffProfileCheck.rows.length === 0) {
        const profileInsertQuery = `
          INSERT INTO staff_profiles (user_id, full_name, qualifications, document_urls, home_address, gps_coordinates)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(profileInsertQuery, [
          userId,
          app.full_name,
          app.qualifications,
          app.document_urls,
          app.home_address,
          app.gps_coordinates
        ]);
    } else {
        // Optional: Update existing profile if needed, or just log it
        console.log(`Staff profile already exists for User ${userId}. Skipping creation.`);
    }

    // 4. Update Application Status
    await client.query(
      "UPDATE staff_applications SET status = 'ACCEPTED' WHERE application_id = $1",
      [application_id]
    );

    await client.query('COMMIT');

    // 5. Send Appropriate Notification
    let messageBody = '';
    if (isNewUser) {
        messageBody = `Welcome to VCare Staff! Your application is accepted. \nLogin with: \nEmail: ${app.email} \nPassword: ${tempPassword}`;
    } else {
        messageBody = `Congratulations! Your application to join VCare Staff has been accepted. Your existing account has been upgraded. Please log in with your current password to access the Staff Dashboard.`;
    }

    Promise.allSettled([
        sendEmail({ email: app.email, subject: 'VCare Staff Application Accepted', message: messageBody }),
        sendWhatsAppOtp(app.mobile_number, messageBody)
    ]);

    res.status(200).json({
      status: 'success',
      message: isNewUser ? 'New account created and staff profile added.' : 'Existing account upgraded with staff privileges.',
      tempPassword: tempPassword // Will be null for existing users
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Accept Application Error:", error);
    // Handle unique constraint violation just in case race conditions happen
    if (error.code === '23505') { 
        return res.status(409).json({ message: "Data conflict: User or Profile already exists." });
    }
    res.status(500).json({ message: "Internal server error processing application." });
  } finally {
    client.release();
  }
};

exports.rejectApplication = async (req, res) => {
  const { application_id, reason } = req.body;

  // Validate input
  if (!reason) {
    return res.status(400).json({ message: "A rejection reason is required." });
  }

  try {
    // 1. Check if Application Exists
    const appResult = await db.query(
      'SELECT * FROM staff_applications WHERE application_id = $1', 
      [application_id]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ message: "Application not found" });
    }

    const app = appResult.rows[0];

    // 2. Update Status and Save Reason
    await db.query(
      "UPDATE staff_applications SET status = 'REJECTED', rejection_reason = $1 WHERE application_id = $2",
      [reason, application_id]
    );

    // 3. Send Notifications (Parallel)
    const emailSubject = 'Update on your VCare Staff Application';
    const messageBody = `Dear ${app.full_name},\n\nThank you for your interest in joining VCare. After careful review, we regret to inform you that we cannot proceed with your application at this time.\n\nReason: ${reason}\n\nWe encourage you to apply again in the future if your qualifications change.\n\nBest regards,\nThe VCare Team`;

    Promise.allSettled([
        sendEmail({ 
            email: app.email, 
            subject: emailSubject, 
            message: messageBody 
        }),
        // Note: Ensure your WhatsApp provider supports free-form text or use a pre-approved "Rejection" template
        sendWhatsAppOtp(app.mobile_number, messageBody) 
    ]);

    res.status(200).json({
      status: 'success',
      message: 'Application rejected and applicant notified.'
    });

  } catch (error) {
    console.error("Reject Application Error:", error);
    res.status(500).json({ message: "Internal server error processing rejection." });
  }
};