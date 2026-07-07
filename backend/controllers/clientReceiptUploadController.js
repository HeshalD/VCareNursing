const db = require('../config/db');

// Public (token-gated, no auth): validate token and return minimal client info for the upload portal.
exports.getReceiptUploadPortal = async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      `SELECT full_name, reg_fee_amount, reg_fee_status, reg_fee_receipt_token_expires_at, reg_fee_receipt_url
       FROM client_profiles
       WHERE reg_fee_receipt_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Upload link is invalid or expired.' });
    }

    const { full_name, reg_fee_amount, reg_fee_status, reg_fee_receipt_token_expires_at, reg_fee_receipt_url } = result.rows[0];

    if (reg_fee_receipt_token_expires_at && new Date() > new Date(reg_fee_receipt_token_expires_at)) {
      return res.status(410).json({ message: 'This upload link has expired. Please contact VCare Nursing for a new invoice.' });
    }

    if (reg_fee_status === 'PAID' || reg_fee_status === 'WAIVED') {
      return res.status(409).json({ message: 'Your registration fee has already been settled. No upload is required.' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        full_name,
        reg_fee_amount,
        reg_fee_status,
        already_uploaded: !!reg_fee_receipt_url,
      },
    });
  } catch (error) {
    console.error('Get Receipt Upload Portal Error:', error.message);
    res.status(500).json({ message: 'Error loading upload portal.' });
  }
};

// Public (token-gated, no auth): accept a payment receipt file upload.
exports.uploadPaymentReceipt = async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      `SELECT client_profile_id, reg_fee_status, reg_fee_receipt_token_expires_at
       FROM client_profiles
       WHERE reg_fee_receipt_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Upload link is invalid or expired.' });
    }

    const { client_profile_id, reg_fee_status, reg_fee_receipt_token_expires_at } = result.rows[0];

    if (reg_fee_receipt_token_expires_at && new Date() > new Date(reg_fee_receipt_token_expires_at)) {
      return res.status(410).json({ message: 'This upload link has expired. Please contact VCare Nursing for a new invoice.' });
    }

    if (reg_fee_status === 'PAID' || reg_fee_status === 'WAIVED') {
      return res.status(409).json({ message: 'Your registration fee has already been settled.' });
    }

    const receiptFile = req.file;
    if (!receiptFile) {
      return res.status(400).json({ message: 'No file was uploaded.' });
    }

    const receiptUrl = receiptFile.location;

    await db.query(
      `UPDATE client_profiles
       SET reg_fee_receipt_url = $1, reg_fee_status = 'RECEIPT_UPLOADED'
       WHERE client_profile_id = $2`,
      [receiptUrl, client_profile_id]
    );

    res.status(200).json({
      status: 'success',
      message: 'Receipt uploaded successfully. Our team will confirm your payment shortly.',
      data: { reg_fee_receipt_url: receiptUrl },
    });
  } catch (error) {
    console.error('Upload Payment Receipt Error:', error.message);
    res.status(500).json({ message: 'Error uploading receipt.' });
  }
};
