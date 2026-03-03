const { Resend } = require('resend');

const sendResendEmail = async (options) => {
  // Check if Resend API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend API key not configured. Skipping email notification.');
    return { skipped: true, reason: 'Resend API key not configured' };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log('Email Details (Resend):');
    console.log('  From:', process.env.RESEND_FROM_EMAIL || process.env.EMAIL_USER);
    console.log('  To:', options.email);
    console.log('  Subject:', options.subject);

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || `VCare <${process.env.EMAIL_USER}>`,
      to: [options.email],
      subject: options.subject,
      text: options.message,
      // html: options.html (you can add HTML templates later)
    });

    if (error) {
      console.error('Resend email failed:', error);
      return { skipped: true, reason: 'Resend email failed', error: error.message };
    }

    console.log('Email sent successfully via Resend:', data.id);
    return { success: true, id: data.id };

  } catch (error) {
    console.error('Failed to send email via Resend:', error);
    return { skipped: true, reason: 'Resend delivery failed', error: error.message };
  }
};

module.exports = sendResendEmail;
