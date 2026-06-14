const axios = require('axios');

const API_URL = `https://graph.facebook.com/v21.0/${process.env.META_WA_PHONE_NUMBER_ID}/messages`;

const formatNumber = (mobileNumber) => {
  let number = mobileNumber.replace(/\s/g, '');
  if (number.startsWith('+')) number = number.substring(1);
  if (number.startsWith('0')) number = '94' + number.substring(1);
  if (!number.startsWith('94')) number = '94' + number;
  return number;
};

const sendTemplate = async (to, templateName, languageCode, bodyParams) => {
  const response = await axios.post(
    API_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text }))
          }
        ]
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

// Sent when a quotation is issued — {{1}} = name, {{2}} = estimate number, {{3}} = total amount
const sendClientQuotation = (mobileNumber, payerName, estimateNumber, totalAmount) =>
  sendTemplate(formatNumber(mobileNumber), 'vcare_client_quotation', 'en', [payerName, estimateNumber, totalAmount]);

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

module.exports = { sendStaffWelcomeNew, sendStaffWelcomeExisting, sendStaffApplicationRejected, sendServiceRequestConfirmed, sendClientQuotation, sendPaymentRecorded, sendBookingConfirmed, sendStaffNewAssignment, sendClientTerminationRequested, sendClientTerminationApproved };
