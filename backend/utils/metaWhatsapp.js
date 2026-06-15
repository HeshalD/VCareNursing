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

const sendTemplate = async (to, templateName, languageCode, bodyParams, headerParams = null) => {
  try {
    const components = [];
    if (headerParams) {
      components.push({ type: 'header', parameters: headerParams });
    }
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text }))
    });

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

// Sent on rejection — {{1}} = name, {{2}} = reason
const sendStaffApplicationRejected = (mobileNumber, fullName, reason) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_staff_application_rejected', 'en', [fullName, reason]);

// Sent when a service request is received — {{1}} = name, {{2}} = service type, {{3}} = date
const sendServiceRequestConfirmed = (mobileNumber, payerName, serviceType, date) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_service_request_confirmed', 'en', [payerName, serviceType, date]);

// Sent when a quotation is issued — header: document, {{1}} = name, {{2}} = estimate number
const sendClientQuotation = (mobileNumber, payerName, estimateNumber, pdfUrl) =>
  sendTemplate(
    formatNumber(mobileNumber),
    'vcare_client_quotation',
    'en',
    [payerName, estimateNumber],
    [{ type: 'document', document: { link: pdfUrl, filename: `${estimateNumber}.pdf` } }]
  );

// Sent when a payment is recorded — {{1}} = name, {{2}} = amount, {{3}} = date
const sendPaymentRecorded = (mobileNumber, payerName, amount, date) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_payment_recorded', 'en', [payerName, amount, date]);

// Sent when staff is assigned to a booking — {{1}} = client name, {{2}} = staff name, {{3}} = date, {{4}} = time, {{5}} = staff profile URL
const sendBookingConfirmed = (mobileNumber, clientName, staffName, date, time, staffProfileUrl) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_booking_confirmed', 'en', [clientName, staffName, date, time, staffProfileUrl]);

// Sent to staff when assigned to a booking — {{1}} = staff name, {{2}} = patient name, {{3}} = location, {{4}} = conditions, {{5}} = start date
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

module.exports = { sendDocument, sendStaffWelcomeNew, sendStaffWelcomeExisting, sendStaffApplicationRejected, sendServiceRequestConfirmed, sendClientQuotation, sendPaymentRecorded, sendBookingConfirmed, sendStaffNewAssignment, sendClientTerminationRequested, sendClientTerminationApproved, sendStaffAssignmentTerminated, sendClientForceTerminated, sendStaffForceTerminated, sendClientStaffSwapped, sendStaffDeductionNotice, sendStaffSalarySheet, sendReviewRequest };
