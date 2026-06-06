const axios = require('axios');

const formatSriLankaNumber = (mobileNumber) => {
  let number = mobileNumber.replace(/\s/g, '');
  if (number.startsWith('+')) number = number.substring(1);
  if (number.startsWith('0')) number = '94' + number.substring(1);
  if (!number.startsWith('94')) number = '94' + number;
  return number;
};

const sendSmsOtp = async (mobileNumber, otp) => {
  const number = formatSriLankaNumber(mobileNumber);

  const response = await axios.post(
    'https://dashboard.smsapi.lk/api/v3/sms/send',
    {
      recipient: number,
      sender_id: process.env.SMSAPI_LK_SENDER_ID,
      type: 'plain',
      message: `Your VCare verification code is: ${otp}. It expires in 10 minutes.`
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SMSAPI_LK_API_KEY?.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    }
  );

  console.log(`SMS OTP sent to ${number}. Response:`, response.data);
  return response.data;
};

const sendSms = async (mobileNumber, message) => {
  const number = formatSriLankaNumber(mobileNumber);

  const response = await axios.post(
    'https://dashboard.smsapi.lk/api/v3/sms/send',
    {
      recipient: number,
      sender_id: process.env.SMSAPI_LK_SENDER_ID,
      type: 'plain',
      message
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SMSAPI_LK_API_KEY?.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    }
  );

  console.log(`SMS sent to ${number}. Response:`, response.data);
  return response.data;
};

module.exports = { sendSmsOtp, sendSms };
