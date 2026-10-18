const axios = require('axios');
const { toMessagingDigits } = require('./phone');

const { isMessageEnabled } = require('./systemSettings');

// eventKey: see messageEvents.js — lets an admin switch this specific message off.
const sendSmsOtp = async (mobileNumber, otp, eventKey) => {
  if (!(await isMessageEnabled('sms', eventKey))) {
    console.log(`[SMS] BLOCKED (disabled in admin settings): OTP to ${mobileNumber}`);
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

const sendSms = async (mobileNumber, message, eventKey) => {
  if (!(await isMessageEnabled('sms', eventKey))) {
    console.log(`[SMS] BLOCKED (disabled in admin settings): to ${mobileNumber}`);
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
    `Hi ${staffName}, your advance request of LKR ${amount} has been approved. Your new wallet balance is LKR ${newBalance}. Log in to the VCare staff portal to view your wallet. - VCare Nursing`,
    'staff_advance_approved'
  );

const sendStaffAdvanceRejectedSms = (mobileNumber, staffName, amount, reason) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your advance request of LKR ${amount} could not be approved. Reason: ${reason || 'No reason provided'}. Please contact the VCare Nursing office for more information. - VCare Nursing`,
    'staff_advance_rejected'
  );

const sendStaffLeaveApprovedSms = (mobileNumber, staffName, startDate, endDate, days) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your leave request from ${startDate} to ${endDate} (${days} day${days === 1 ? '' : 's'}) has been approved. - VCare Nursing`,
    'staff_leave_approved'
  );

const sendStaffLeaveRejectedSms = (mobileNumber, staffName, startDate, endDate, reason) =>
  sendSms(
    mobileNumber,
    `Hi ${staffName}, your leave request from ${startDate} to ${endDate} could not be approved. Reason: ${reason || 'No reason provided'}. Please contact the VCare Nursing office for more information. - VCare Nursing`,
    'staff_leave_rejected'
  );

module.exports = { sendSmsOtp, sendSms, sendStaffAdvanceApprovedSms, sendStaffAdvanceRejectedSms, sendStaffLeaveApprovedSms, sendStaffLeaveRejectedSms };
