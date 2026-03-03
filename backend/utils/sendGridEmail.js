const sgMail = require('@sendgrid/mail');

const sendSendGridEmail = async (options) => {
  try {
    // Check if SendGrid API key is configured
    if (!process.env.SENDGRID_API_KEY) {
      return {
        success: false,
        skipped: true,
        error: 'SendGrid API key not configured'
      };
    }

    // Set the API key
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Validate required fields
    if (!options.to || !options.subject || !options.text) {
      return {
        success: false,
        skipped: true,
        error: 'Missing required email fields: to, subject, or text'
      };
    }

    // Prepare email message
    const msg = {
      to: options.to,
      from: options.from || process.env.EMAIL_FROM,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text
    };

    // Send email
    const response = await sgMail.send(msg);
    
    console.log('SendGrid email sent successfully:', response[0].statusCode);
    
    return {
      success: true,
      skipped: false,
      messageId: response[0].headers['x-message-id'],
      statusCode: response[0].statusCode
    };

  } catch (error) {
    console.error('SendGrid email error:', error);
    
    // Handle specific SendGrid errors
    if (error.response) {
      console.error('SendGrid API response:', error.response.body);
      
      // Don't retry on certain errors
      if (error.response.statusCode === 401 || error.response.statusCode === 403) {
        return {
          success: false,
          skipped: true,
          error: 'SendGrid authentication failed',
          details: error.response.body
        };
      }
    }

    return {
      success: false,
      skipped: false,
      error: error.message,
      details: error.response?.body || null
    };
  }
};

module.exports = sendSendGridEmail;
