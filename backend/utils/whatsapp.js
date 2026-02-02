const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const sendWhatsAppOtp = async (mobileNumber, otp) => {
  try {
    console.log('WhatsApp Debug - Input mobileNumber:', mobileNumber);
    console.log('WhatsApp Debug - TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET');
    console.log('WhatsApp Debug - TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET');
    console.log('WhatsApp Debug - TWILIO_WHATSAPP_NUMBER:', process.env.TWILIO_WHATSAPP_NUMBER);

    // Ensure the number is in E.164 format and prefixed with 'whatsapp:'
    // Example: whatsapp:+94771234567
    let cleanNumber = mobileNumber;
    
    // Remove 'whatsapp:' prefix if present
    if (cleanNumber.startsWith('whatsapp:')) {
      cleanNumber = cleanNumber.substring(9);
    }
    
    // Remove leading '+' for processing
    if (cleanNumber.startsWith('+')) {
      cleanNumber = cleanNumber.substring(1);
    }
    
    // Remove leading '0' (common in some number formats)
    if (cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.substring(1);
    }
    
    // Add '+' back for E.164 format
    cleanNumber = '+94' + cleanNumber;
    
    const formattedNumber = `whatsapp:${cleanNumber}`;

    console.log('WhatsApp Debug - Formatted number:', formattedNumber);

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      body: `Your VCare verification code is: ${otp}. It expires in 10 minutes.`,
      to: formattedNumber
    });

    console.log(`WhatsApp OTP sent via Twilio. SID: ${message.sid}`);
    return message;
  } catch (error) {
    console.error("Twilio WhatsApp Error:", error);
    console.error("Twilio Error Details:", {
      code: error.code,
      message: error.message,
      status: error.status,
      moreInfo: error.moreInfo
    });
    throw new Error(`Failed to send WhatsApp message: ${error.message}`);
  }
};

module.exports = sendWhatsAppOtp;