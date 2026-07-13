const axios = require('axios');

const API_URL = `https://graph.facebook.com/v21.0/${process.env.META_WA_PHONE_NUMBER_ID}/messages`;

const formatNumber = (mobileNumber) => {
  let number = mobileNumber.replace(/\s/g, '');
  if (number.startsWith('+')) number = number.substring(1);
  if (number.startsWith('0')) number = '94' + number.substring(1);
  if (!number.startsWith('94')) number = '94' + number;
  return number;
};

const sendDocument = async (mobileNumber, documentUrl, filename, caption = '') => {
  const to = formatNumber(mobileNumber);
  const response = await axios.post(
    API_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        caption
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const msgId = response.data?.messages?.[0]?.id;
  console.log(`[Meta WA] Document "${filename}" sent to ${to}. Message ID: ${msgId}`);
  return response.data;
};

const sendTemplate = async (to, templateName, languageCode, bodyParams, headerParams = null, buttonComponents = null) => {
  try {
    const components = [];
    if (headerParams) {
      components.push({ type: 'header', parameters: headerParams });
    }
    // Only emit a body component when the template actually has body variables.
    // Meta rejects a body component carrying params a 0-variable template doesn't expect.
    if (bodyParams && bodyParams.length) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((text) => ({ type: 'text', text }))
      });
    }
    if (buttonComponents) {
      for (const btn of buttonComponents) components.push(btn);
    }

    const response = await axios.post(
      API_URL,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const msgId = response.data?.messages?.[0]?.id;
    console.log(`[Meta WA] "${templateName}" sent to ${to}. Message ID: ${msgId}`);
    return response.data;
  } catch (err) {
    console.error(`[Meta WA] "${templateName}" failed (${err.response?.status}):`, JSON.stringify(err.response?.data ?? err.message));
    throw err;
  }
};

// Sent on accept when applicant is a brand-new user
const sendStaffWelcomeNew = (mobileNumber, fullName) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_welcome_new', 'en_US', [fullName]);

// Sent on accept when applicant already has an account
const sendStaffWelcomeExisting = (mobileNumber, fullName) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_welcome_existing', 'en', [fullName]);

// Sent to a brand-new client when their service request is converted into a booking and
// a fresh login account is created for them — {{1}} = name. WhatsApp policy disallows
// sending the temporary password in this message, so the credentials (mobile + temp
// password) are delivered separately via SMS; this just tells them to expect that SMS.
const sendClientWelcomeNew = (mobileNumber, fullName) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_client_welcome_new', 'en', [fullName]);

// Sent on rejection — {{1}} = name, {{2}} = reason
const sendStaffApplicationRejected = (mobileNumber, fullName, reason) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_application_rejected', 'en', [fullName, reason]);

// Sent when a service request is received — {{1}} = name, {{2}} = service type, {{3}} = date
const sendServiceRequestConfirmed = (mobileNumber, payerName, serviceType, date) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_service_request_confirmed', 'en', [payerName, serviceType, date]);

// Sent when a SERVICE (booking) quotation is issued — header: document,
// {{1}} = name, {{2}} = estimate number. Wording talks about "the booking",
// so this is only appropriate for care/service quotations — see
// sendClientProductQuotation below for product/rental quotes.
const sendClientQuotation = (mobileNumber, payerName, estimateNumber, pdfUrl) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_client_quotation',
    'en',
    [payerName, estimateNumber],
    [{ type: 'document', document: { link: pdfUrl, filename: `${estimateNumber}.pdf` } }]
  );

// Sent when a PRODUCT/RENTAL quotation is issued — separate template from
// sendClientQuotation above because that one's approved wording ("...to move
// on with the booking") doesn't fit a product/rental order. Requires a
// distinct Meta-approved template named 'vcare_product_quotation' with the
// same {{1}} = name, {{2}} = estimate number, document-header shape — see
// quoteController.sendProductQuotePDF for the caller.
const sendClientProductQuotation = (mobileNumber, payerName, estimateNumber, pdfUrl) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_product_quotation',
    'en',
    [payerName, estimateNumber],
    [{ type: 'document', document: { link: pdfUrl, filename: `${estimateNumber}.pdf` } }]
  );

// Sent when a payment is recorded — {{1}} = name, {{2}} = amount, {{3}} = date
const sendPaymentRecorded = (mobileNumber, payerName, amount, date) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_payment_recorded', 'en', [payerName, amount, date]);

// Sent when a payment receipt is issued — header: receipt PDF, body vars:
//   {{1}} = client name, {{2}} = receipt number (e.g. "RCP-0000123"),
//   {{3}} = amount received (LKR formatted), {{4}} = payment date, {{5}} = payment method
//
// META TEMPLATE SPEC — vcare_payment_receipt (UTILITY, en)
// Header: DOCUMENT
// Body:
//   Hi {{1}},
//
//   Thank you! We've received your payment and attached your official receipt.
//
//   🧾 *Receipt No:* {{2}}
//   💰 *Amount:* LKR {{3}}
//   📅 *Date:* {{4}}
//   💳 *Method:* {{5}}
//
//   Please find the detailed receipt attached as a PDF. Keep it for your records.
//
//   Thank you for choosing VCare Nursing.
const sendPaymentReceipt = (mobileNumber, clientName, receiptNumber, amount, date, method, pdfUrl, filename) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_payment_receipt',
    'en',
    [clientName, receiptNumber, amount, date, method],
    [{ type: 'document', document: { link: pdfUrl, filename: filename || `${receiptNumber}.pdf` } }]
  );

// Sent alongside the payment receipt the first time any payment is recorded
// against a SERVICE quote and/or its linked PRODUCT quote (e.g. daily-rate
// charges + a rental + its deposit) — a single combined Invoice document for
// the full quoted total, distinct from the Quotation (sent pre-acceptance)
// and the Receipt (sent per-payment). See quoteController.ensureCombinedInvoice
// for generation and receiptController.sendReceiptWhatsApp for the send hook.
// Requires a distinct Meta-approved template named 'vcare_client_invoice' —
// NOT YET APPROVED as of writing; sends will 404 until it is.
//
// META TEMPLATE SPEC — vcare_client_invoice (UTILITY, en) — TO BE SUBMITTED
// Header: DOCUMENT → Variable (dynamic PDF URL)
// Body:
//   Hi {{1}}, please find attached your invoice.
//
//   🧾 *Invoice No:* {{2}}
//   💰 *Total Amount:* LKR {{3}}
//
//   Thank you for choosing VCare Nursing.
const sendClientInvoice = (mobileNumber, clientName, invoiceNumber, totalAmount, pdfUrl) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_client_invoice',
    'en',
    [clientName, invoiceNumber, String(totalAmount)],
    [{ type: 'document', document: { link: pdfUrl, filename: `${invoiceNumber}.pdf` } }]
  );

// Sent when staff is assigned to a booking — {{1}} = client name, {{2}} = staff name, {{3}} = date, {{4}} = staff profile URL.
const sendBookingConfirmed = (mobileNumber, clientName, staffName, date, staffProfileUrl) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_booking_confirmed', 'en', [clientName, staffName, date, staffProfileUrl]);

// Sent to staff when assigned to a booking — {{1}} = staff name, {{2}} = patient name, {{3}} = location, {{4}} = conditions, {{5}} = start date (with start time appended when set, e.g. "25 June 2026, 9:00 AM")
const sendStaffNewAssignment = (mobileNumber, staffName, patientName, location, conditions, startDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_new_assignment', 'en', [staffName, patientName, location, conditions, startDate]);

// Sent to client when they submit a termination request — {{1}} = client name, {{2}} = booking reference, {{3}} = requested end date
const sendClientTerminationRequested = (mobileNumber, clientName, bookingReference, requestedEndDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_client_termination_requested', 'en', [clientName, bookingReference, requestedEndDate]);

// Sent to client when their termination request is approved — {{1}} = client name, {{2}} = booking reference, {{3}} = official end date
const sendClientTerminationApproved = (mobileNumber, clientName, bookingReference, officialEndDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_client_termination_approved', 'en', [clientName, bookingReference, officialEndDate]);

// Sent to client when their assigned staff is swapped — {{1}} = client name, {{2}} = patient name, {{3}} = new staff name, {{4}} = effective date
// Template: "Staff Update\nHi {{1}},\n\nWe'd like to let you know that your assigned caregiver has been updated.\n\nPatient: {{2}}\nNew Staff: {{3}}\nEffective: {{4}}\n\nIf you have any concerns, please don't hesitate to contact us.\n\nThank you for choosing VCare."
const sendClientStaffSwapped = (mobileNumber, clientName, patientName, newStaffName, effectiveDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_client_staff_swapped', 'en', [clientName, patientName, newStaffName, effectiveDate]);

// Sent to staff when a client-requested termination is approved — {{1}} = staff name, {{2}} = patient name, {{3}} = end date
// Template: "Assignment Ended\nHi {{1}},\nYour assignment has come to an end.\n\nPatient: {{2}}\nEnd Date: {{3}}\n\nThank you for your dedication and service."
const sendStaffAssignmentTerminated = (mobileNumber, staffName, patientName, endDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_assignment_terminated', 'en', [staffName, patientName, endDate]);

// Sent to client when admin force-stops a booking — {{1}} = client name, {{2}} = patient name, {{3}} = end date
// Template: "Service Update\nHi {{1}},\n\nYour care arrangement for {{2}} has been ended effective {{3}}.\n\nPlease contact us if you have any questions or require further assistance.\n\nThank you for choosing VCare."
const sendClientForceTerminated = (mobileNumber, clientName, patientName, endDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_client_force_terminated', 'en', [clientName, patientName, endDate]);

// Sent to staff when admin force-stops a booking — {{1}} = staff name, {{2}} = patient name, {{3}} = end date
// Template: "Assignment Update\nHi {{1}},\n\nYour assignment for {{2}} has been ended effective {{3}}.\n\nPlease contact the VCare office to confirm your availability.\n\nThank you for your service."
const sendStaffForceTerminated = (mobileNumber, staffName, patientName, endDate) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_force_terminated', 'en', [staffName, patientName, endDate]);

// Sent to staff when a deduction is applied — {{1}} = staff name, {{2}} = amount, {{3}} = reason, {{4}} = date
// Template name: vcare_staff_deduction
// Template body:
//   "Hi {{1}},
//
//   A deduction of {{2}} has been applied to your VCare earnings.
//
//   Reason: {{3}}
//   Date: {{4}}
//
//   If you have any questions, please contact the VCare office.
//
//   Thank you for being part of the VCare team."
const sendStaffDeductionNotice = (mobileNumber, staffName, amount, reason, date) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_deduction', 'en', [staffName, amount, reason, date]);

// Sent to client requesting a review for a completed booking — {{1}} = client name, {{2}} = service type, {{3}} = staff name
const sendReviewRequest = (mobileNumber, clientName, serviceType, staffName) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_review_request', 'en', [clientName, serviceType, staffName]);

// Sent to staff when their advance request is submitted — {{1}} = staff name, {{2}} = amount requested
const sendStaffAdvanceRequestSent = (mobileNumber, staffName, amountRequested) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_advance_request_sent', 'en', [staffName, String(amountRequested)]);

// Sent to staff when their advance is approved — {{1}} = staff name, {{2}} = amount approved, {{3}} = new wallet balance
const sendStaffAdvanceApproved = (mobileNumber, staffName, amount, newBalance) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_advance_approved', 'en', [staffName, String(amount), String(newBalance)]);

// Sent to staff when their advance is rejected — {{1}} = staff name, {{2}} = amount requested, {{3}} = reason
const sendStaffAdvanceRejected = (mobileNumber, staffName, amount, reason) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_advance_rejected', 'en', [staffName, String(amount), reason || 'No reason provided']);

// Sent when a booking statement is ready — header: statement PDF, body vars:
//   {{1}} = client name, {{2}} = period start (e.g. "01 Jan 2026"), {{3}} = period end,
//   {{4}} = booking code, {{5}} = patient name,
//   {{6}} = total invoiced (LKR), {{7}} = total paid (LKR), {{8}} = balance due (LKR)
//
// META TEMPLATE SPEC — vcare_client_booking_statement (UTILITY, en)
// Header: DOCUMENT
// Body:
//   Hi {{1}},
//
//   Your booking statement is ready for the period *{{2}}* to *{{3}}*.
//
//   📋 *Booking Ref:* {{4}}
//   👤 *Patient:* {{5}}
//
//   📊 *Account Summary:*
//   • Invoiced:  LKR {{6}}
//   • Paid:      LKR {{7}}
//   • Balance:   LKR {{8}}
//
//   Please refer to the attached PDF for the full transaction details.
//
//   Thank you for choosing VCare Nursing.
const sendClientBookingStatement = (mobileNumber, clientName, periodStart, periodEnd, bookingCode, patientName, invoiced, paid, balance, pdfUrl, filename) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_client_booking_statement',
    'en',
    [clientName, periodStart, periodEnd, bookingCode, patientName, invoiced, paid, balance],
    [{ type: 'document', document: { link: pdfUrl, filename } }]
  );

// Sent when a salary payout is processed — header: salary sheet PDF, body vars:
//   {{1}} = staff name, {{2}} = month (e.g. "June 2026"),
//   {{3}} = net payable / current earnings (LKR formatted),
//   {{4}} = amount paid this transaction (LKR formatted),
//   {{5}} = payment date, {{6}} = payment method, {{7}} = reference number (or "N/A")
const sendStaffSalarySheet = (mobileNumber, fullName, monthLabel, netPayable, amount, paymentDate, paymentMethod, referenceNumber, pdfUrl) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_staff_salary_sheet_v3',
    'en',
    [fullName, monthLabel, netPayable, amount, paymentDate, paymentMethod, referenceNumber || 'N/A'],
    [{ type: 'document', document: { link: pdfUrl, filename: `Salary_Sheet_${monthLabel.replace(/\s+/g, '_')}.pdf` } }]
  );

// The company's Independent Contractor Agreement (terms & conditions) PDF.
// Hosted on Cloudinary; sent as a real PDF document attachment (not a text link).
const STAFF_AGREEMENT_PDF_URL = 'https://res.cloudinary.com/dohaktkth/image/upload/v1780652809/INDEPENDENT_CONTRACTOR_AGREEMENT_knloa6.pdf';

// Sent to an approved applicant — header: agreement PDF. No body variables: the
// approved Meta template has a static body (no {{1}}), so we pass no body params.
// META TEMPLATE SPEC — vcare_staff_agreement (UTILITY, en)
// Header: DOCUMENT
// Body (static, no variables):
//   Welcome aboard! As part of joining the VCare Nursing team, please review the attached
//   Independent Contractor Agreement, which outlines the terms and conditions of your engagement.
//
//   Kindly read it carefully. If you have any questions, reach out to the VCare office before signing.
//
//   Thank you for choosing to work with VCare Nursing.
// eslint-disable-next-line no-unused-vars -- fullName kept for call-site compatibility
const sendStaffAgreement = (mobileNumber, fullName) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_staff_agreement',
    'en',
    [],
    [{ type: 'document', document: { link: STAFF_AGREEMENT_PDF_URL, filename: 'VCare_Independent_Contractor_Agreement.pdf' } }]
  );

// Sent to a client suggesting a candidate staff member.
// Body vars: {{1}} = client/payer name, {{2}} = patient name, {{3}} = candidate name, {{4}} = role/designation
// NOTE: the live template's "View Profile" button is a STATIC URL — it takes no parameters,
// so we send no button component (Meta renders the button from the approved template itself).
//
// META TEMPLATE SPEC — vcare_candidate_profile (UTILITY, en)
// Header: NONE
// Body:
//   Hi {{1}},
//
//   We'd like to suggest a candidate for *{{2}}*'s care:
//
//   👤 *{{3}}*
//   🩺 {{4}}
//
//   Tap the button below to view their full profile.
//
//   Let us know if you'd like to proceed with this candidate or if you'd prefer to see other options.
const sendCandidateProfile = (mobileNumber, payerName, patientName, staffName, designation) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_candidate_profile',
    'en',
    [payerName, patientName, staffName, designation || 'Care Professional']
  );

// Sent to staff when their leave request is approved.
// Body vars: {{1}} = staff name, {{2}} = start date, {{3}} = end date, {{4}} = number of days
//
// META TEMPLATE SPEC — vcare_leave_approved (UTILITY, en)
// Header: NONE
// Body:
//   Hi {{1}},
//
//   Good news! Your leave request has been *approved*.
//
//   🗓️ *From:* {{2}}
//   🗓️ *To:* {{3}}
//   ⏳ *Duration:* {{4}} day(s)
//
//   Enjoy your time off. Please reach out to the VCare Nursing office if you have any questions.
const sendStaffLeaveApproved = (mobileNumber, staffName, startDate, endDate, days) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_leave_approved', 'en', [staffName, startDate, endDate, days]);

// Sent to accepted staff asking them to upload their Grama Niladhari Report and Police Report.
// Body vars: {{1}} = staff name only.
// CTA button: "Upload Documents" — Visit Website (Dynamic URL).
//   Static URL base set in Meta template: https://vcarenursing.com/staff/documents/
//   Dynamic suffix (button parameter): doc_upload_token
//
// META TEMPLATE SPEC — vcare_staff_doc_upload_request (UTILITY, en)
// Header: None
// Body:
//   Hi {{1}},
//
//   To complete your registration with VCare Nursing, please upload your Grama Niladhari
//   Report and Police Report. Tap the button below to open your secure upload portal.
//
//   Please complete this at your earliest convenience. Thank you for joining VCare.
// Button: Call to Action → Visit Website → Dynamic URL
//   Label: Upload Documents
//   URL:   https://vcarenursing.com/staff/documents/{{1}}
const sendDocumentUploadRequest = (mobileNumber, staffName, docUploadToken) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_staff_doc_upload_request',
    'en',
    [staffName],
    null,
    [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: docUploadToken }] }]
  );

// Sent to client as a first-touch notice that their registration fee is outstanding.
// Body vars: {{1}} = client name
//
// META TEMPLATE SPEC — vcare_reg_fee_notice (UTILITY, en)
// Header: NONE
// Body:
//   Hi {{1}}, This is a reminder that your VCare Nursing registration fee is still outstanding.
//   An invoice will be sent to you shortly as well as bank account details to complete your payment.
//   Thank you for choosing VCare Nursing.
const sendRegFeeNotice = (mobileNumber, clientName) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_reg_fee_notice', 'en', [clientName]);

// Sent to client as the invoice PDF with bank details in the body and a CTA button to upload their receipt.
// Header: Document (dynamic PDF URL — the generated invoice PDF)
// Body vars: {{1}}=clientName, {{2}}=amount, {{3}}=bankName,
//            {{4}}=accountHolderName, {{5}}=accountNumber, {{6}}=branchName
// Button: Call to Action → Visit Website → Dynamic URL
//   Label: Upload Receipt
//   URL:   https://vcarenursing.com/client/pay-receipt/{{1}}
//
// META TEMPLATE SPEC — vcare_reg_fee_invoice (UTILITY, en)
// Header: DOCUMENT → Variable (dynamic URL, filename set in the API call)
// Body:
//   Hi {{1}}, please find your registration fee invoice attached.
//
//   💰 *Amount Due:* LKR {{2}}
//
//   Please make your bank transfer to:
//   🏦 *Bank:* {{3}}
//   👤 *Account Name:* {{4}}
//   🔢 *Account No:* {{5}}
//   🏢 *Branch:* {{6}}
//
//   Once paid, tap the button below to upload your payment receipt. Thank you for choosing VCare Nursing.
// Button: Call to Action → Visit Website → Dynamic URL
//   Label: Upload Receipt
//   URL:   https://vcarenursing.com/client/pay-receipt/{{1}}
const sendRegFeeInvoice = (mobileNumber, clientName, amount, bankName, accountHolderName, accountNumber, branchName, invoicePdfUrl, receiptToken) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_reg_fee_invoice',
    'en',
    [clientName, amount, bankName, accountHolderName, accountNumber, branchName],
    [{ type: 'document', document: { link: invoicePdfUrl, filename: 'VCare_Registration_Fee_Invoice.pdf' } }],
    [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: receiptToken }] }]
  );

// Sent to staff when their leave request is rejected.
// Body vars: {{1}} = staff name, {{2}} = start date, {{3}} = end date, {{4}} = reason
//
// META TEMPLATE SPEC — vcare_leave_rejected (UTILITY, en)
// Header: NONE
// Body:
//   Hi {{1}},
//
//   We're sorry, but your leave request from {{2}} to {{3}} could not be approved.
//
//   📝 *Reason:* {{4}}
//
//   Please contact the VCare Nursing office for more information.
const sendStaffLeaveRejected = (mobileNumber, staffName, startDate, endDate, reason) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_leave_rejected', 'en', [staffName, startDate, endDate, reason]);

module.exports = { sendDocument, sendStaffWelcomeNew, sendStaffWelcomeExisting, sendClientWelcomeNew, sendStaffApplicationRejected, sendServiceRequestConfirmed, sendClientQuotation, sendClientProductQuotation, sendPaymentRecorded, sendPaymentReceipt, sendClientInvoice, sendBookingConfirmed, sendStaffNewAssignment, sendClientTerminationRequested, sendClientTerminationApproved, sendStaffAssignmentTerminated, sendClientForceTerminated, sendStaffForceTerminated, sendClientStaffSwapped, sendStaffDeductionNotice, sendStaffSalarySheet, sendReviewRequest, sendStaffAdvanceRequestSent, sendStaffAdvanceApproved, sendStaffAdvanceRejected, sendClientBookingStatement, sendStaffAgreement, sendCandidateProfile, sendStaffLeaveApproved, sendStaffLeaveRejected, sendDocumentUploadRequest, sendRegFeeNotice, sendRegFeeInvoice };
