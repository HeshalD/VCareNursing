const axios = require('axios');
const { toMessagingDigits } = require('./phone');

// TEMPORARY KILL SWITCH — SMS sending is blocked. Remove this block to re-enable.
const MESSAGING_BLOCKED = false;

const sendSmsOtp = async (mobileNumber, otp) => {
  if (MESSAGING_BLOCKED) {
    console.log(`[SMS] BLOCKED (messaging disabled): OTP to ${mobileNumber}`);
    return { blocked: true };
  }
  const number = toMessagingDigits(mobileNumber);

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
  if (MESSAGING_BLOCKED) {
    console.log(`[SMS] BLOCKED (messaging disabled): to ${mobileNumber}`);
    return { blocked: true };
  }
  const number = toMessagingDigits(mobileNumber);

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

const sendStaffAdvanceApprovedSms = (mobileNumber, staffName, amount, newBalance) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your advance request of LKR ${amount} has been approved. Your new wallet balance is LKR ${newBalance}. Log in to the VCare staff portal to view your wallet. - VCare Nursing`
  );

const sendStaffAdvanceRejectedSms = (mobileNumber, staffName, amount, reason) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your advance request of LKR ${amount} could not be approved. Reason: ${reason || 'No reason provided'}. Please contact the VCare Nursing office for more information. - VCare Nursing`
  );

const sendStaffLeaveApprovedSms = (mobileNumber, staffName, startDate, endDate, days) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your leave request from ${startDate} to ${endDate} (${days} day${days === 1 ? '' : 's'}) has been approved. - VCare Nursing`
  );

const sendStaffLeaveRejectedSms = (mobileNumber, staffName, startDate, endDate, reason) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your leave request from ${startDate} to ${endDate} could not be approved. Reason: ${reason || 'No reason provided'}. Please contact the VCare Nursing office for more information. - VCare Nursing`
  );

module.exports = { sendSmsOtp, sendSms, sendStaffAdvanceApprovedSms, sendStaffAdvanceRejectedSms, sendStaffLeaveApprovedSms, sendStaffLeaveRejectedSms };
