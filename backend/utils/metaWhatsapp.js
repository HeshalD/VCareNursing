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

module.exports = { sendStaffWelcomeNew, sendStaffWelcomeExisting, sendStaffApplicationRejected };
