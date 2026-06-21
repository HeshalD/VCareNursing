const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/email');
const { sendWhatsAppOtp, sendWhatsAppMessage } = require('../utils/whatsapp');
const { sendSmsOtp, sendSms } = require('../utils/sms');
const { sendStaffWelcomeNew, sendStaffWelcomeExisting, sendStaffApplicationRejected, sendStaffAgreement } = require('../utils/metaWhatsapp');
const { logActivity } = require('../utils/activityLogger');

const getUploadedFileUrl = (files, fieldName) => (files && files[fieldName] && files[fieldName][0]) ? files[fieldName][0].path : null;

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

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
      longitude,
      nic_number,
      gender,
      date_of_birth
    } = req.body;
    
   
    let rolesArray = [];
    console.log('Raw applied_roles:', applied_roles);
    console.log('Type of applied_roles:', typeof applied_roles);
    
    if (applied_roles) {
        if (Array.isArray(applied_roles)) {
            // If it's already an array, clean each element
            rolesArray = applied_roles.map(r => r.replace(/\{|\}/g, '').trim());
        } else if (typeof applied_roles === 'string') {
            // If it's a string, try to parse it as JSON first
            try {
                const parsed = JSON.parse(applied_roles);
                if (Array.isArray(parsed)) {
                    rolesArray = parsed.map(r => r.replace(/\{|\}/g, '').trim());
                } else {
                    rolesArray = [applied_roles.replace(/\{|\}/g, '').trim()];
                }
            } catch (e) {
                // If JSON parsing fails, treat as single role
                rolesArray = [applied_roles.replace(/\{|\}/g, '').trim()];
            }
        } else {
            // Handle other types
            rolesArray = [applied_roles.replace(/\{|\}/g, '').trim()];
        }
    }
    rolesArray = rolesArray.filter(role => role.length > 0);
    console.log('Processed rolesArray:', rolesArray);

    console.log('Files received:', req.files);
    const document_urls = req.files && req.files.documents ? req.files.documents.map(file => file.path) : [];
    const profile_picture_url = req.files && req.files.profile_picture ? req.files.profile_picture[0].path : null;
    const nic_front_url = getUploadedFileUrl(req.files, 'nic_front');
    const nic_back_url = getUploadedFileUrl(req.files, 'nic_back');
    console.log('Document URLs:', document_urls);
    console.log('Profile picture URL:', profile_picture_url);

    if (!nic_number || !nic_front_url || !nic_back_url) {
      return res.status(400).json({
        message: 'NIC number, NIC front photo, and NIC back photo are required.'
      });
    }

    const query = `
      INSERT INTO staff_applications 
      (full_name, email, mobile_number, applied_roles, qualifications, document_urls, home_address, location, gps_coordinates, profile_picture_url, nic_number, nic_front_url, nic_back_url, gender, date_of_birth)
      VALUES ($1, $2, $3, $4::user_role_enum[], $5, $6, $7, $8,
        CASE WHEN $9::float IS NOT NULL AND $10::float IS NOT NULL 
             THEN point($10::float, $9::float) 
             ELSE NULL 
        END, $11, $12, $13, $14, $15::gender_enum, $16)
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
      (longitude && longitude !== "") ? longitude : null,
      profile_picture_url,
      nic_number,
      nic_front_url,
      nic_back_url,
      gender,
      date_of_birth
    ]);

    const application = result.rows[0];

    // Generate OTP for phone verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await db.query(
      'INSERT INTO staff_app_otps (application_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [application.application_id, otp, expiresAt]
    );

    // Send OTP via WhatsApp and SMS in parallel
    const [wpResult, smsResult] = await Promise.allSettled([
      sendWhatsAppOtp(mobile_number, otp),
      sendSmsOtp(mobile_number, otp)
    ]);

    if (wpResult.status === 'rejected') console.error('WhatsApp OTP failed:', wpResult.reason?.message);
    if (smsResult.status === 'rejected') console.error('SMS OTP failed:', smsResult.reason?.message);

    console.log(`[DEV ONLY] Staff application OTP for ${mobile_number}: ${otp}`);

    res.status(201).json({
      status: 'success',
      data: {
        application_id: application.application_id,
        mobile_number: mobile_number
      }
    });

  } catch (error) {
    console.error("Submission Error:", error);
    res.status(500).json({ message: "Error submitting application", error: error.message });
  }
};

exports.verifyStaffApplicationOtp = async (req, res) => {
  const { application_id, otp_code } = req.body;

  if (!application_id || !otp_code) {
    return res.status(400).json({ message: 'Application ID and OTP code are required.' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM staff_app_otps
       WHERE application_id = $1 AND otp_code = $2 AND expires_at > NOW()`,
      [application_id, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    // Delete OTP so it can't be reused
    await db.query('DELETE FROM staff_app_otps WHERE application_id = $1', [application_id]);

    // Fetch application details for the success response
    const appResult = await db.query(
      'SELECT full_name, mobile_number, applied_roles FROM staff_applications WHERE application_id = $1',
      [application_id]
    );

    const app = appResult.rows[0];

    res.status(200).json({
      status: 'success',
      message: 'Phone number verified successfully.',
      data: {
        application_id,
        full_name: app.full_name,
        mobile_number: app.mobile_number,
        applied_roles: app.applied_roles
      }
    });

  } catch (error) {
    console.error('Verify Staff OTP Error:', error);
    res.status(500).json({ message: 'Verification failed.' });
  }
};

exports.resendStaffApplicationOtp = async (req, res) => {
  const { application_id } = req.body;

  if (!application_id) {
    return res.status(400).json({ message: 'Application ID is required.' });
  }

  try {
    const appResult = await db.query(
      'SELECT mobile_number FROM staff_applications WHERE application_id = $1',
      [application_id]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    const { mobile_number } = appResult.rows[0];

    // Rate limiting: 60-second cooldown
    const lastOtp = await db.query(
      'SELECT created_at FROM staff_app_otps WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1',
      [application_id]
    );

    if (lastOtp.rows.length > 0) {
      const secondsAgo = (new Date() - new Date(lastOtp.rows[0].created_at)) / 1000;
      if (secondsAgo < 60) {
        return res.status(429).json({
          message: `Please wait ${Math.round(60 - secondsAgo)} seconds before requesting a new code.`
        });
      }
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await db.query('DELETE FROM staff_app_otps WHERE application_id = $1', [application_id]);
    await db.query(
      'INSERT INTO staff_app_otps (application_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [application_id, newOtp, expiresAt]
    );

    await Promise.allSettled([
      sendWhatsAppOtp(mobile_number, newOtp),
      sendSmsOtp(mobile_number, newOtp)
    ]);

    console.log(`[DEV ONLY] Resent staff OTP for ${application_id}: ${newOtp}`);

    res.status(200).json({ status: 'success', message: 'A new verification code has been sent.' });

  } catch (error) {
    console.error('Resend Staff OTP Error:', error);
    res.status(500).json({ message: 'Failed to resend OTP.' });
  }
};

// Suggests the next auto-generated Staff ID. New staff are numbered EMP-5000 onwards;
// everything below EMP-5000 is reserved for employees already registered in the system.
exports.getNextStaffCode = async (req, res) => {
  const START = 5000;
  try {
    const result = await db.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(staff_code FROM 'EMP-([0-9]+)$') AS INTEGER)), 0) AS max_num
      FROM staff_profiles
      WHERE staff_code ~ '^EMP-[0-9]+$'
    `);
    const maxNum = parseInt(result.rows[0].max_num, 10) || 0;
    const next = maxNum >= START ? maxNum + 1 : START;
    res.status(200).json({ staff_id: `EMP-${next}` });
  } catch (error) {
    console.error('Get Next Staff Code Error:', error);
    res.status(500).json({ message: 'Failed to generate a Staff ID', error: error.message });
  }
};

exports.acceptApplication = async (req, res) => {
  const { application_id, custom_staff_id, admin_remarks } = req.body;

  if (!custom_staff_id || !custom_staff_id.trim()) {
    return res.status(400).json({ message: 'A Staff ID must be assigned before approving.' });
  }

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

    // 2. Check if User Already Exists (by Email OR Mobile)
    // This lets an existing client (matched by email or mobile) be linked
    // to a staff profile instead of creating a duplicate user.
    const existingUserResult = await client.query(
      'SELECT * FROM users WHERE email = $1 OR mobile_number = $2',
      [app.email, app.mobile_number]
    );

    let userId;
    let tempPassword = null; // Only generated for NEW users
    let isNewUser = false;

    if (existingUserResult.rows.length > 0) {
      // --- SCENARIO A: EXISTING USER (Client applying for Staff) ---
        const existingUser = existingUserResult.rows[0];
      userId = existingUser.user_id;
      isNewUser = false;

        // If the existing user record lacks an email but the application provides one,
        // update the user's email so future logins use the provided email.
        if ((!existingUser.email || existingUser.email.trim() === '') && app.email) {
          try {
            await client.query('UPDATE users SET email = $1 WHERE user_id = $2', [app.email, userId]);
          } catch (err) {
            // Ignore update errors here — if the email conflicts with another record
            // the unique constraint will be handled by the outer transaction catch.
            console.warn('Could not update user email while accepting application:', err.message);
          }
        }

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
        // Process applied_roles to create designation string
        let designation = '';
        if (app.applied_roles) {
            let rolesToProcess = app.applied_roles;
            if (typeof app.applied_roles === 'string') {
                // Remove outer braces and split by comma for PostgreSQL array format
                rolesToProcess = app.applied_roles.replace(/^\{|\}$/g, '').split(',');
            }
            
            if (Array.isArray(rolesToProcess)) {
                designation = rolesToProcess.map(r => r.replace(/\{|\}/g, '').trim()).filter(role => role.length > 0).join(', ');
            } else {
                designation = rolesToProcess.replace(/\{|\}/g, '').trim();
            }
        }

        const profileInsertQuery = `
          INSERT INTO staff_profiles (staff_code, user_id, full_name, designation, verification_status, qualifications, document_urls, home_address, location, gps_coordinates, profile_picture_url, nic_number, nic_front_url, nic_back_url, gender, willing_to_live_in, date_of_birth, admin_remarks)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::gender_enum, $16, $17, $18)
          RETURNING staff_profile_id
        `;
        const profileResult = await client.query(profileInsertQuery, [
          custom_staff_id.trim(),
          userId,
          app.full_name,
          designation,
          'VERIFIED',
          app.qualifications,
          app.document_urls,
          app.home_address,
          app.location,
          app.gps_coordinates,
          app.profile_picture_url,
          app.nic_number,
          app.nic_front_url,
          app.nic_back_url,
          app.gender,
          app.willing_to_live_in || false,
          app.date_of_birth,
          admin_remarks || null
        ]);

        // Auto-create staff wallet on approval
        const staff_profile_id = profileResult.rows[0].staff_profile_id;
        await client.query(
          `INSERT INTO staff_wallet (staff_profile_id, balance, updated_at)
           VALUES ($1, 0, NOW())
           ON CONFLICT (staff_profile_id) DO NOTHING`,
          [staff_profile_id]
        );
    } else {
        // Optional: Update existing profile if needed, or just log it
        console.log(`Staff profile already exists for User ${userId}. Skipping creation.`);

        if (app.nic_number || app.nic_front_url || app.nic_back_url) {
          const existingProfile = staffProfileCheck.rows[0];
          await client.query(
            `UPDATE staff_profiles
             SET nic_number = COALESCE(nic_number, $1),
                 nic_front_url = COALESCE(nic_front_url, $2),
                 nic_back_url = COALESCE(nic_back_url, $3)
             WHERE staff_profile_id = $4`,
            [app.nic_number, app.nic_front_url, app.nic_back_url, existingProfile.staff_profile_id]
          );
        }
        
        // Ensure wallet exists for existing staff profile
        const existingProfile = staffProfileCheck.rows[0];
        await client.query(
          `INSERT INTO staff_wallet (staff_profile_id, balance, updated_at)
           VALUES ($1, 0, NOW())
           ON CONFLICT (staff_profile_id) DO NOTHING`,
          [existingProfile.staff_profile_id]
        );
    }

    // 4. Update Application Status
    await client.query(
      "UPDATE staff_applications SET status = 'ACCEPTED' WHERE application_id = $1",
      [application_id]
    );

    await client.query('COMMIT');

    // 5. Activity log (non-fatal)
    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'APPLICATION_ACCEPTED',
        entityType: 'STAFF_APPLICATION',
        entityId: String(application_id),
        details: { applicant_name: app.full_name, assigned_staff_id: custom_staff_id.trim(), is_new_user: isNewUser },
      });
    } catch (logErr) {
      console.error('Activity log failed (accept):', logErr.message);
    }

    // 6. Send Appropriate Notification
    let messageBody = '';
    if (isNewUser) {
        messageBody = ` Congratulations ${app.full_name}! Welcome to the VCare Family! \n\nYour staff application has been approved! Here's what you need to do:\n\nSTEP 1: Go to the VCare website\nSTEP 2: Click "Login" \nSTEP 3: Enter your PHONE NUMBER: ${app.mobile_number}\nSTEP 4: Enter your temporary password: ${tempPassword}\nSTEP 5: You'll be automatically prompted to set your own permanent password\n\nWe're excited to have you join our team of dedicated healthcare professionals!\n\nWith love,\nThe VCare Team `;
    } else {
        messageBody = ` Congratulations ${app.full_name}! Welcome to the VCare Staff Team! \n\nGreat news! Your staff application has been approved and your account has been upgraded with staff privileges.\n\nYou can now log in with your existing credentials and access the Staff Dashboard to manage your schedule and services.\n\nWe're thrilled to have you as part of our healthcare team!\n\nWith love,\nThe VCare Team `;
    }

    Promise.allSettled([
        // email notification temporarily disabled
        /* sendEmail({ email: app.email, subject: 'VCare Staff Application Accepted', message: messageBody }), */
        sendSms(app.mobile_number, messageBody),
        isNewUser
            ? sendStaffWelcomeNew(app.mobile_number, app.full_name)
            : sendStaffWelcomeExisting(app.mobile_number, app.full_name)
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

// Admin/internal staff manually sends the Independent Contractor Agreement (terms & conditions)
// PDF to an approved applicant via WhatsApp.
exports.sendApplicationAgreement = async (req, res) => {
  const { applicationId } = req.params;

  try {
    const appResult = await db.query(
      'SELECT * FROM staff_applications WHERE application_id = $1',
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const app = appResult.rows[0];

    if (app.status !== 'ACCEPTED') {
      return res.status(400).json({ message: 'The agreement can only be sent after the application is approved.' });
    }

    if (app.agreement_sent_at) {
      return res.status(409).json({
        message: 'The agreement has already been sent to this applicant.',
        agreement_sent_at: app.agreement_sent_at,
      });
    }

    if (!app.mobile_number) {
      return res.status(400).json({ message: 'This applicant does not have a mobile number on file.' });
    }

    await sendStaffAgreement(app.mobile_number, app.full_name);

    const updated = await db.query(
      'UPDATE staff_applications SET agreement_sent_at = CURRENT_TIMESTAMP WHERE application_id = $1 RETURNING agreement_sent_at',
      [applicationId]
    );

    // Activity log (non-fatal)
    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'APPLICATION_AGREEMENT_SENT',
        entityType: 'STAFF_APPLICATION',
        entityId: String(applicationId),
        details: { applicant_name: app.full_name, mobile_number: app.mobile_number },
      });
    } catch (logErr) {
      console.error('Activity log failed (send agreement):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: `Agreement sent to ${app.full_name} on WhatsApp.`,
      agreement_sent_at: updated.rows[0].agreement_sent_at,
    });
  } catch (error) {
    console.error('Send Agreement Error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to send the agreement via WhatsApp.', error: error.message });
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

    // 3. Activity log (non-fatal)
    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'APPLICATION_REJECTED',
        entityType: 'STAFF_APPLICATION',
        entityId: String(application_id),
        details: { applicant_name: app.full_name, reason },
      });
    } catch (logErr) {
      console.error('Activity log failed (reject):', logErr.message);
    }

    // 4. Send Notifications (Parallel)
    const emailSubject = 'Update on your VCare Staff Application';
    const messageBody = `Dear ${app.full_name},\n\nThank you so much for your interest in joining the VCare family! We truly appreciate the time and effort you put into your application.\n\nAfter careful consideration, we regret to inform you that we cannot proceed with your application at this time.\n\nReason: ${reason}\n\nPlease don't be discouraged! We encourage you to apply again in the future when your qualifications or experience may better match our current needs.\n\nWe wish you the very best in your healthcare career journey.\n\nWith warm regards,\nThe VCare Team`;

    Promise.allSettled([
        // email notification temporarily disabled
        /* sendEmail({
            email: app.email,
            subject: emailSubject,
            message: messageBody
        }), */
        sendSms(app.mobile_number, messageBody),
        sendStaffApplicationRejected(app.mobile_number, app.full_name, reason)
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

exports.updateApplication = async (req, res) => {
  const { applicationId } = req.params;
  const {
    full_name, email, mobile_number, applied_roles, qualifications,
    home_address, location, nic_number, gender, date_of_birth
  } = req.body;

  try {
    const appResult = await db.query(
      'SELECT * FROM staff_applications WHERE application_id = $1',
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const current = appResult.rows[0];

    if (current.status !== 'PENDING') {
      return res.status(400).json({ message: 'Only PENDING applications can be edited' });
    }

    let rolesArray = [];
    if (applied_roles) {
      if (Array.isArray(applied_roles)) {
        rolesArray = applied_roles.map(r => r.replace(/\{|\}/g, '').trim());
      } else if (typeof applied_roles === 'string') {
        try {
          const parsed = JSON.parse(applied_roles);
          rolesArray = Array.isArray(parsed)
            ? parsed.map(r => r.replace(/\{|\}/g, '').trim())
            : [applied_roles.replace(/\{|\}/g, '').trim()];
        } catch {
          rolesArray = applied_roles.split(',').map(r => r.replace(/\{|\}/g, '').trim());
        }
      }
      rolesArray = rolesArray.filter(r => r.length > 0);
    }

    // If a new profile picture was uploaded, use its Cloudinary URL; otherwise keep the existing one
    const newProfilePicture = req.files?.profile_picture?.[0];
    const profilePictureUrl = newProfilePicture ? newProfilePicture.path : current.profile_picture_url;

    await db.query(
      `UPDATE staff_applications
       SET full_name = $1, email = $2, mobile_number = $3,
           applied_roles = $4::user_role_enum[], qualifications = $5,
           home_address = $6, location = $7, nic_number = $8,
           gender = $9::gender_enum, date_of_birth = $10,
           profile_picture_url = $11
       WHERE application_id = $12`,
      [full_name, email, mobile_number, rolesArray, qualifications,
       home_address, location, nic_number, gender, date_of_birth,
       profilePictureUrl, applicationId]
    );

    const updated = await db.query(
      'SELECT * FROM staff_applications WHERE application_id = $1', [applicationId]
    );

    // Build a diff of only changed fields
    const changes = {};
    const diff = (field, oldVal, newVal) => {
      const o = oldVal ?? null;
      const n = newVal ?? null;
      if ((o ?? '') !== (n ?? '')) changes[field] = { from: o, to: n };
    };

    diff('full_name',      current.full_name,      full_name);
    diff('email',          current.email,           email);
    diff('mobile_number',  current.mobile_number,   mobile_number);
    diff('qualifications', current.qualifications,  qualifications);
    diff('home_address',   current.home_address,    home_address);
    diff('location',       current.location,        location);
    diff('nic_number',     current.nic_number,      nic_number);
    diff('gender',         current.gender,          gender);

    if (newProfilePicture && current.profile_picture_url !== profilePictureUrl) {
      changes['profile_picture'] = { from: current.profile_picture_url, to: profilePictureUrl };
    }

    const oldDob = current.date_of_birth ? new Date(current.date_of_birth).toISOString().substring(0, 10) : null;
    const newDob = date_of_birth || null;
    if (oldDob !== newDob) changes['date_of_birth'] = { from: oldDob, to: newDob };

    const oldRoles = (Array.isArray(current.applied_roles) ? current.applied_roles : [])
      .map(r => r.replace(/\{|\}/g, '').trim()).filter(Boolean).sort();
    const newRoles = [...rolesArray].sort();
    if (oldRoles.join(',') !== newRoles.join(',')) {
      changes['applied_roles'] = { from: oldRoles, to: newRoles };
    }

    if (Object.keys(changes).length > 0) {
      try {
        const actorName = await getActorName(req.user.user_id);
        await logActivity({
          actorUserId: req.user.user_id,
          actorName,
          actorRole: extractActorRole(req.user.role),
          actionType: 'APPLICATION_UPDATED',
          entityType: 'STAFF_APPLICATION',
          entityId: String(applicationId),
          details: { applicant_name: current.full_name, changes },
        });
      } catch (logErr) {
        console.error('Activity log failed (update):', logErr.message);
      }
    }

    res.status(200).json({ status: 'success', data: updated.rows[0] });
  } catch (error) {
    console.error('Update Application Error:', error);
    res.status(500).json({ message: 'Error updating application', error: error.message });
  }
};

exports.getAvailableStaffByRole = async (req, res) => {
    const { role } = req.query; // ?role=CAREGIVER or ?role=NURSE

    try {
        // We join users table to check the role, and staff_profiles for the status
        const query = `
            SELECT 
                s.staff_profile_id as staff_id, 
                s.full_name, 
                s.profile_picture_url,
                s.gender,
                s.willing_to_live_in,
                u.mobile_number
            FROM staff_profiles s
            JOIN users u ON s.user_id = u.user_id
            WHERE s.current_status = 'AVAILABLE' 
            AND u.role @> ARRAY[$1]::user_role_enum[] -- Checks if the role array contains the requested role
        `;

        const result = await db.query(query, [role]);

        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: result.rows
        });

    } catch (error) {
        console.error("Fetch Staff Error:", error);
        res.status(500).json({ message: "Error fetching available staff" });
    }
};

// Staff login with temporary password handling
exports.staffLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Find User by Email (staff login uses email, not mobile)
        const userResult = await db.query(
            'SELECT user_id, password_hash, role, is_active, is_email_verified FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = userResult.rows[0];

        // 2. Security Checks
        if (!user.is_active) {
            return res.status(403).json({ message: "Account is deactivated. Contact admin." });
        }

        if (!user.is_email_verified) {
            return res.status(403).json({ message: "Please verify your email first." });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // 3. Check if user has staff profile
        const staffProfileResult = await db.query(
            'SELECT staff_profile_id, full_name, verification_status FROM staff_profiles WHERE user_id = $1',
            [user.user_id]
        );

        if (staffProfileResult.rows.length === 0) {
            return res.status(403).json({ message: "No staff profile found. Please complete your application first." });
        }

        // 4. Check if this is a temporary password
        // We use a more robust approach to detect temp passwords:
        // 1. Check if the password matches our temp password pattern (8 chars, lowercase letters and numbers only)
        // 2. Temp passwords are only generated for new users during application acceptance
        const isTempPassword = /^[a-z0-9]{8}$/.test(password) && 
                               password.length === 8 && 
                               !/[A-Z]/.test(password) && // No uppercase letters
                               !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password); // No special characters
        
        // 5. Generate JWT Token
        const staffProfile = staffProfileResult.rows[0];
        const token = jwt.sign(
            { 
                id: user.user_id, 
                role: user.role,
                full_name: staffProfile.full_name,
                mobile_number: null // Staff login uses email, so mobile_number is not available here
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        // 6. Send Response
        res.status(200).json({
            status: 'success',
            token,
            requires_password_change: isTempPassword,
            data: {
                user_id: user.user_id,
                email: email,
                staff_info: {
                    staff_id: staffProfileResult.rows[0].staff_profile_id,
                    name: staffProfileResult.rows[0].full_name,
                    status: staffProfileResult.rows[0].verification_status
                }
            }
        });

    } catch (error) {
        console.error("Staff Login Error:", error);
        res.status(500).json({ message: "Server error during login" });
    }
};

// Change password for staff members (first-time or subsequent)
exports.changeStaffPassword = async (req, res) => {
    const { current_password, new_password } = req.body;
    const userId = req.user.user_id; // Get user ID from JWT token

    try {
        // 1. Validate input
        if (!current_password || !new_password) {
            return res.status(400).json({ message: "Current password and new password are required." });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters long." });
        }

        // 2. Get current user password
        const userResult = await db.query(
            'SELECT password_hash FROM users WHERE user_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        // 3. Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ message: "Current password is incorrect." });
        }

        // 4. Hash new password
        const salt = await bcrypt.genSalt(12);
        const hashedNewPassword = await bcrypt.hash(new_password, salt);

        // 5. Update password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE user_id = $2',
            [hashedNewPassword, userId]
        );

        // 6. Generate new token (optional, but good practice)
        // Get user details for token payload
        const userDetailsResult = await db.query(
            'SELECT mobile_number FROM users WHERE user_id = $1',
            [userId]
        );
        
        const staffProfileResult = await db.query(
            'SELECT full_name FROM staff_profiles WHERE user_id = $1',
            [userId]
        );
        
        const userMobile = userDetailsResult.rows[0]?.mobile_number || null;
        const userFullName = staffProfileResult.rows[0]?.full_name || null;
        
        const token = jwt.sign(
            { 
                id: userId, 
                role: req.user.role,
                full_name: userFullName,
                mobile_number: userMobile
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(200).json({
            status: 'success',
            message: 'Password changed successfully.',
            token,
            requires_password_change: false
        });

    } catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ message: "Server error during password change." });
    }
};