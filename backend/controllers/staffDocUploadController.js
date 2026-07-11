const db = require('../config/db');
const { sendDocumentUploadRequest } = require('../utils/metaWhatsapp');
const { logActivity } = require('../utils/activityLogger');

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

// Admin: send WhatsApp document upload request to an accepted applicant.
// Records doc_request_sent_at on staff_profiles. Can be re-sent (no 409 guard).
exports.sendDocumentRequest = async (req, res) => {
  const { applicationId } = req.params;

  try {
    // Fetch application + linked staff profile via mobile number
    const appResult = await db.query(
      `SELECT sa.full_name, sa.mobile_number, sa.status,
              sp.staff_profile_id, sp.doc_upload_token
       FROM staff_applications sa
       LEFT JOIN users u ON u.mobile_number = sa.mobile_number
       LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
       WHERE sa.application_id = $1`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    const app = appResult.rows[0];

    if (app.status !== 'ACCEPTED') {
      return res.status(400).json({ message: 'Document requests can only be sent for accepted applications.' });
    }

    if (!app.mobile_number) {
      return res.status(400).json({ message: 'This applicant does not have a mobile number on file.' });
    }

    if (!app.staff_profile_id || !app.doc_upload_token) {
      return res.status(400).json({ message: 'Staff profile not found for this application.' });
    }

    await sendDocumentUploadRequest(app.mobile_number, app.full_name, app.doc_upload_token);

    const updated = await db.query(
      `UPDATE staff_profiles SET doc_request_sent_at = CURRENT_TIMESTAMP
       WHERE staff_profile_id = $1 RETURNING doc_request_sent_at`,
      [app.staff_profile_id]
    );

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'DOC_REQUEST_SENT',
        entityType: 'STAFF_APPLICATION',
        entityId: String(applicationId),
        details: { applicant_name: app.full_name, mobile_number: app.mobile_number },
      });
    } catch (logErr) {
      console.error('Activity log failed (send doc request):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: `Document upload request sent to ${app.full_name} on WhatsApp.`,
      doc_request_sent_at: updated.rows[0].doc_request_sent_at,
    });
  } catch (error) {
    console.error('Send Document Request Error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to send the document request via WhatsApp.', error: error.message });
  }
};

// Admin: send WhatsApp document upload request, looked up by staff_profile_id
// instead of application_id — used from the staff detail page (Documents tab).
exports.sendDocumentRequestByStaffId = async (req, res) => {
  const { staff_profile_id } = req.params;

  try {
    const staffRes = await db.query(
      `SELECT sp.full_name, sp.doc_upload_token, u.mobile_number
       FROM staff_profiles sp
       JOIN users u ON sp.user_id = u.user_id
       WHERE sp.staff_profile_id = $1`,
      [staff_profile_id]
    );

    if (staffRes.rows.length === 0) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    const { full_name, doc_upload_token, mobile_number } = staffRes.rows[0];

    if (!mobile_number) {
      return res.status(400).json({ message: 'This staff member does not have a mobile number on file.' });
    }

    if (!doc_upload_token) {
      return res.status(400).json({ message: 'This staff member does not have a document upload link.' });
    }

    await sendDocumentUploadRequest(mobile_number, full_name, doc_upload_token);

    const updated = await db.query(
      `UPDATE staff_profiles SET doc_request_sent_at = CURRENT_TIMESTAMP
       WHERE staff_profile_id = $1 RETURNING doc_request_sent_at`,
      [staff_profile_id]
    );

    try {
      const actorName = await getActorName(req.user.user_id);
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: extractActorRole(req.user.role),
        actionType: 'DOC_REQUEST_SENT',
        entityType: 'STAFF_PROFILE',
        entityId: String(staff_profile_id),
        details: { applicant_name: full_name, mobile_number },
      });
    } catch (logErr) {
      console.error('Activity log failed (send doc request):', logErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: `Document upload request sent to ${full_name} on WhatsApp.`,
      doc_request_sent_at: updated.rows[0].doc_request_sent_at,
    });
  } catch (error) {
    console.error('Send Document Request (by staff id) Error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to send the document request via WhatsApp.', error: error.message });
  }
};

// Public (token-gated, no auth): return staff name + document upload status.
exports.getDocUploadPortal = async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      `SELECT full_name, grama_niladhari_url, police_report_url
       FROM staff_profiles WHERE doc_upload_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Upload link is invalid or expired.' });
    }

    const { full_name, grama_niladhari_url, police_report_url } = result.rows[0];

    res.status(200).json({
      status: 'success',
      data: { full_name, grama_niladhari_url, police_report_url },
    });
  } catch (error) {
    console.error('Get Doc Upload Portal Error:', error.message);
    res.status(500).json({ message: 'Error loading upload portal.' });
  }
};

// Admin (protected): upload grama_niladhari and/or police_report on behalf of the staff member.
exports.adminUploadDocuments = async (req, res) => {
  const { applicationId } = req.params;
  try {
    const appResult = await db.query(
      `SELECT sp.staff_profile_id
       FROM staff_applications sa
       LEFT JOIN users u ON u.mobile_number = sa.mobile_number
       LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
       WHERE sa.application_id = $1 AND sa.status = 'ACCEPTED'`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ message: 'Accepted application with linked staff profile not found.' });
    }

    const { staff_profile_id } = appResult.rows[0];
    if (!staff_profile_id) {
      return res.status(400).json({ message: 'Staff profile not found for this application.' });
    }

    const gramaNiladhariFile = req.files?.grama_niladhari?.[0];
    const policeReportFile = req.files?.police_report?.[0];

    if (!gramaNiladhariFile && !policeReportFile) {
      return res.status(400).json({ message: 'No files were uploaded.' });
    }

    const updates = [];
    const values = [];
    if (gramaNiladhariFile) {
      updates.push(`grama_niladhari_url = $${values.length + 1}`);
      values.push(gramaNiladhariFile.location);
    }
    if (policeReportFile) {
      updates.push(`police_report_url = $${values.length + 1}`);
      values.push(policeReportFile.location);
    }
    values.push(staff_profile_id);

    const updated = await db.query(
      `UPDATE staff_profiles SET ${updates.join(', ')} WHERE staff_profile_id = $${values.length} RETURNING grama_niladhari_url, police_report_url`,
      values
    );

    res.status(200).json({ status: 'success', data: updated.rows[0] });
  } catch (error) {
    console.error('Admin Upload Documents Error:', error.message);
    res.status(500).json({ message: 'Error uploading documents.' });
  }
};

// Public (token-gated, no auth): accept grama_niladhari and/or police_report file uploads.
exports.uploadDocuments = async (req, res) => {
  const { token } = req.params;

  try {
    const profileResult = await db.query(
      `SELECT staff_profile_id FROM staff_profiles WHERE doc_upload_token = $1`,
      [token]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ message: 'Upload link is invalid or expired.' });
    }

    const { staff_profile_id } = profileResult.rows[0];

    const gramaNiladhariFile = req.files?.grama_niladhari?.[0];
    const policeReportFile = req.files?.police_report?.[0];

    if (!gramaNiladhariFile && !policeReportFile) {
      return res.status(400).json({ message: 'No files were uploaded.' });
    }

    const updates = [];
    const values = [];

    if (gramaNiladhariFile) {
      updates.push(`grama_niladhari_url = $${values.length + 1}`);
      values.push(gramaNiladhariFile.location);
    }
    if (policeReportFile) {
      updates.push(`police_report_url = $${values.length + 1}`);
      values.push(policeReportFile.location);
    }

    values.push(staff_profile_id);

    const updated = await db.query(
      `UPDATE staff_profiles SET ${updates.join(', ')}
       WHERE staff_profile_id = $${values.length}
       RETURNING grama_niladhari_url, police_report_url`,
      values
    );

    res.status(200).json({
      status: 'success',
      message: 'Documents uploaded successfully.',
      data: updated.rows[0],
    });
  } catch (error) {
    console.error('Upload Documents Error:', error.message);
    res.status(500).json({ message: 'Error uploading documents.' });
  }
};
