const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/db');
const { createOverdueInvoice } = require('./overdueInvoices');
const { creditSalespersonForRegistration } = require('./clientSalespersonService');
const { sendSms } = require('../utils/sms');
const { sendClientWelcomeNew } = require('../utils/metaWhatsapp');

const getOrCreateClientProfileForQuotation = async (client, quotation) => {
  const requestResult = await client.query(
    `SELECT request_id, client_id, payer_name, payer_mobile, location_address,
            payer_email, payer_gender, client_type, company_name, honorific, city_id
     FROM service_requests
     WHERE request_id = $1`,
    [quotation.request_id]
  );

  if (requestResult.rows.length === 0) {
    throw new Error('Service request not found for this quotation');
  }

  const serviceRequest = requestResult.rows[0];

  if (serviceRequest.client_id) {
    return {
      client_id: serviceRequest.client_id,
      client_profile_created: false,
      temp_password: null,
      payer_mobile: serviceRequest.payer_mobile,
      payer_name: serviceRequest.payer_name
    };
  }

  if (!serviceRequest.payer_mobile) {
    throw new Error('Service request is missing payer mobile number');
  }

  const payerName = serviceRequest.payer_name || 'New Client';
  const payerAddress = serviceRequest.location_address || null;

  let userId = null;
  // Only set when THIS call creates a brand-new login account — used to send the
  // welcome message with credentials after the transaction commits.
  let tempPassword = null;
  const userCheck = await client.query(
    `SELECT user_id FROM users WHERE mobile_number = $1`,
    [serviceRequest.payer_mobile]
  );

  if (userCheck.rows.length > 0) {
    // Existing user (matched by mobile) — reuse it, never create a duplicate account.
    userId = userCheck.rows[0].user_id;
  } else {
    tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // users.email is UNIQUE — only carry the request's email over if nobody owns it yet,
    // so a clash can never block recording a payment.
    let accountEmail = null;
    if (serviceRequest.payer_email) {
      const emailCheck = await client.query(`SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`, [serviceRequest.payer_email]);
      if (emailCheck.rows.length === 0) accountEmail = serviceRequest.payer_email;
    }

    const newUser = await client.query(
      `INSERT INTO users (mobile_number, password_hash, email, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id`,
      [serviceRequest.payer_mobile, hashedPassword, accountEmail, ['CLIENT'], true]
    );

    userId = newUser.rows[0].user_id;
  }

  const profileCheck = await client.query(
    `SELECT client_profile_id FROM client_profiles WHERE user_id = $1`,
    [userId]
  );

  let clientProfileId = null;
  let clientProfileCreated = false;

  if (profileCheck.rows.length > 0) {
    clientProfileId = profileCheck.rows[0].client_profile_id;
  } else {
    const newProfile = await client.query(
      `INSERT INTO client_profiles (user_id, full_name, primary_address, is_registration_fee_paid,
                                    gender, client_type, company_name, honorific, city_id)
       VALUES ($1, $2, $3, $4, $5::gender_enum, COALESCE($6::client_type_enum, 'INDIVIDUAL'), $7, $8, $9)
       RETURNING client_profile_id`,
      [
        userId, payerName, payerAddress, false,
        serviceRequest.payer_gender || null, serviceRequest.client_type || null,
        serviceRequest.company_name || null, serviceRequest.honorific || null, serviceRequest.city_id || null,
      ]
    );

    clientProfileId = newProfile.rows[0].client_profile_id;
    clientProfileCreated = true;
  }

  await client.query(
    `UPDATE service_requests SET client_id = $1 WHERE request_id = $2`,
    [clientProfileId, serviceRequest.request_id]
  );

  return {
    client_id: clientProfileId,
    client_profile_created: clientProfileCreated,
    temp_password: tempPassword,
    payer_mobile: serviceRequest.payer_mobile,
    payer_name: payerName
  };
};

// Welcome a brand-new client: when this bootstrap created their login account, send
// their login id (mobile number) and temporary password so they can sign in and set
// their own password. Only fires when a fresh user account was created (temp_password
// is set), so existing customers are never re-notified. Fire-and-forget.
const sendClientWelcomeCredentials = (bootstrap) => {
  if (!bootstrap?.temp_password) return;
  const welcomeSms = `Welcome to VCare Nursing, ${bootstrap.payer_name}! An account has been created for you. Log in at https://vcarenursing.com/login

Username (mobile): ${bootstrap.payer_mobile}
Temporary password: ${bootstrap.temp_password}

You'll be asked to set your own password on first login. - VCare Nursing`;

  Promise.allSettled([
    sendSms(bootstrap.payer_mobile, welcomeSms),
    sendClientWelcomeNew(bootstrap.payer_mobile, bootstrap.payer_name),
  ]).then(([smsResult, waResult]) => {
    if (smsResult.status === 'rejected') console.error('Client welcome SMS failed:', smsResult.reason?.message);
    if (waResult.status === 'rejected') console.error('Client welcome WhatsApp failed:', waResult.reason?.message);
  });
};

// Priority Membership: the quotation IS the registration fee invoice. Once it has been
// sent, put the client straight into the same state the standalone "Send registration fee
// invoice" action produces (reg_fee_status INVOICED + a SENT invoice record + an overdue
// entry + salesperson credit) — without sending a second message. Only the payment is left.
// The invoice record uses the REGFEE-<quote> code so that recording the payment against the
// quotation finds and settles it (see quoteController.ensureRegFeeInvoiceRecord).
// Idempotent: a repeat send just restates the amount while the fee is still unpaid.
const markRegFeeInvoicedFromQuote = async ({ quoteId, clientId, pdfUrl, sentBy }) => {
  const itemRes = await db.query(
    `SELECT amount, salesperson_id FROM quote_line_items
     WHERE quote_id = $1 AND is_registration_fee = true LIMIT 1`,
    [quoteId]
  );
  const item = itemRes.rows[0];
  if (!item || !(parseFloat(item.amount) > 0)) return null;

  const statusRes = await db.query(
    `SELECT reg_fee_status FROM client_profiles WHERE client_profile_id = $1`,
    [clientId]
  );
  const status = statusRes.rows[0]?.reg_fee_status;
  if (!status || !['PENDING', 'INVOICED'].includes(status)) return null; // already settled/waived/uploaded

  const amount = parseFloat(item.amount).toFixed(2);
  const invoiceCode = `REGFEE-${quoteId.slice(0, 8).toUpperCase()}`;
  const receiptToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.query(
    `UPDATE client_profiles
     SET reg_fee_status = 'INVOICED',
         reg_fee_amount = $1,
         reg_fee_invoiced_at = COALESCE(reg_fee_invoiced_at, NOW()),
         reg_fee_receipt_token = COALESCE(reg_fee_receipt_token, $2),
         reg_fee_receipt_token_expires_at = COALESCE(reg_fee_receipt_token_expires_at, $3)
     WHERE client_profile_id = $4`,
    [amount, receiptToken, tokenExpiry, clientId]
  );

  const existing = await db.query(
    `SELECT invoice_id FROM client_reg_fee_invoices WHERE client_id = $1 AND invoice_code = $2`,
    [clientId, invoiceCode]
  );
  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE client_reg_fee_invoices SET amount = $1, pdf_url = $2 WHERE invoice_id = $3`,
      [amount, pdfUrl, existing.rows[0].invoice_id]
    );
    await db.query(
      `UPDATE overdue_invoices SET amount = $1
       WHERE client_id = $2 AND source_type = 'REGISTRATION_FEE' AND status = 'OVERDUE'`,
      [amount, clientId]
    );
  } else {
    const saved = await db.query(
      `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, bank_account_id, status, sent_by)
       VALUES ($1, $2, $3, $4, NULL, 'SENT', $5)
       RETURNING invoice_id`,
      [clientId, invoiceCode, amount, pdfUrl, sentBy || null]
    );
    await createOverdueInvoice(db, {
      client_id: clientId,
      source_type: 'REGISTRATION_FEE',
      source_id: saved.rows[0].invoice_id,
      invoice_code: invoiceCode,
      amount,
    });
  }

  // Credit the salesperson the moment the invoice goes out, same as the standalone flow.
  if (item.salesperson_id) {
    try {
      await creditSalespersonForRegistration(db, {
        client_id: clientId,
        salesperson_id: item.salesperson_id,
        assigned_by: sentBy || null,
      });
    } catch (creditErr) {
      console.error('Failed to credit salesperson for registration:', creditErr.message);
    }
  }

  return { invoice_code: invoiceCode, amount };
};

module.exports = { getOrCreateClientProfileForQuotation, sendClientWelcomeCredentials, markRegFeeInvoicedFromQuote };
