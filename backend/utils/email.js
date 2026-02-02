const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email credentials not configured. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS in environment variables.');
    throw new Error('Email service not configured');
  }

  console.log('Email Details:');
  console.log('  From:', process.env.EMAIL_FROM || process.env.EMAIL_USER);
  console.log('  To:', options.email);
  console.log('  Subject:', options.subject);
  console.log('Using host:', process.env.EMAIL_HOST);

  // 1. Create a transporter with Gmail-specific settings
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use 'pass' instead of 'password' for Gmail
    },
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  });

  // Verify transporter configuration
  try {
    await transporter.verify();
    console.log('Email transporter verified successfully');
  } catch (verifyError) {
    console.error('Transporter verification failed:', verifyError);
    throw new Error('Email transporter configuration failed');
  }

  // 2. Define email options
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: options.email,
    subject: options.subject,
    text: options.message,
    // html: options.html (you can add HTML templates later)
  };

  // 3. Send the email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (sendError) {
    console.error('Failed to send email:', sendError);
    throw sendError;
  }
};

module.exports = sendEmail;