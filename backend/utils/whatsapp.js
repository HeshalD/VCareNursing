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

const sendWhatsAppMessage = async (mobileNumber, content, mediaOptions = null) => {
  try {
    let cleanNumber = mobileNumber.replace('whatsapp:', '').replace('+', '');
    if (cleanNumber.startsWith('0')) cleanNumber = cleanNumber.substring(1);
    
    // Ensure Sri Lanka prefix - Adjust if you expand to other countries
    if (!cleanNumber.startsWith('94')) cleanNumber = '94' + cleanNumber;
    
    const formattedNumber = `whatsapp:+${cleanNumber}`;

    const messagePayload = {
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: formattedNumber,
    };

    // Handle Media (PDF/Images) vs Text
    if (mediaOptions && mediaOptions.type === 'document') {
      messagePayload.body = content; // Caption for the document
      messagePayload.mediaUrl = [mediaOptions.link]; // Twilio expects an array of URLs
      console.log('WhatsApp Debug - Sending document:', {
        link: mediaOptions.link,
        filename: mediaOptions.filename
      });
    } else {
      messagePayload.body = content;
    }

    console.log('WhatsApp Debug - Message payload:', JSON.stringify(messagePayload, null, 2));

    const message = await client.messages.create(messagePayload);
    console.log(`WhatsApp Message sent. SID: ${message.sid}`);
    console.log('WhatsApp Debug - Message status:', message.status);
    console.log('WhatsApp Debug - Full response:', JSON.stringify(message, null, 2));
    return message;
  } catch (error) {
    console.error("Twilio WhatsApp Error:", error);
    throw new Error(`Failed to send WhatsApp: ${error.message}`);
  }
};

const checkMessageStatus = async (messageSid) => {
  try {
    const message = await client.messages(messageSid).fetch();
    return {
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage
    };
  } catch (error) {
    console.error("Error checking message status:", error);
    throw error;
  }
};

module.exports = { sendWhatsAppOtp, sendWhatsAppMessage, checkMessageStatus };