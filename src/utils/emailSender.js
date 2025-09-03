// src/utils/emailSender.js
const nodemailer = require('nodemailer');

// Initialize transporter variable
let transporter = null;

// Initialize email transporter based on environment
const initializeTransporter = async () => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.GMAIL_USER && process.env.GMAIL_PASS) {
      console.log('📧 Initializing production email transporter with Gmail');
      
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
        connectionTimeout: 10000,
        pool: true,
        maxConnections: 1,
        maxMessages: 5
      });
    } else {
      console.log('📧 Initializing development email transporter with Ethereal');
      
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      
      console.log('Ethereal credentials for testing:', testAccount.user, testAccount.pass);
    }
    
    await transporter.verify();
    console.log('✅ Email transporter initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize email transporter:', error.message);
    transporter = null;
    return false;
  }
};

// Initialize transporter on module load
initializeTransporter();

const createTransporter = () => {
  return transporter;
};

// Verify connection with comprehensive error handling
const verifyTransporter = async () => {
  if (!transporter) {
    console.error('❌ Cannot verify transporter - creation failed');
    return false;
  }

  try {
    await transporter.verify();
    console.log('✅ Email transporter is ready to send messages');
    return true;
  } catch (error) {
    console.error('❌ Email transporter verification failed:', error.message);
    
    // Provide specific guidance based on error type
    if (error.code === 'EAUTH') {
      console.error('🔐 Authentication failed. Please check:');
      console.error('1. Your GMAIL_USER and GMAIL_PASS in .env file');
      console.error('2. If using Gmail, make sure you\'re using an App Password (not your regular password)');
      console.error('3. That 2-factor authentication is enabled and you generated an App Password');
      console.error('4. Visit: https://myaccount.google.com/apppasswords to generate an app password');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.error('🌐 Connection failed. This could be due to:');
      console.error('1. Internet connection issues');
      console.error('2. Firewall blocking SMTP connections (port 587 or 465)');
      console.error('3. Gmail server issues');
      console.error('4. Antivirus software blocking the connection');
      console.error('5. Try using a different network (e.g., switch from WiFi to mobile hotspot)');
    } else {
      console.error('❌ Unknown error:', error.message);
    }
    
    return false;
  }
};

// Improved email sending function with better timeout handling
const sendEmail = async (mailOptions, emailType = 'email') => {
  // Check if transporter is available
  if (!transporter) {
    console.log(`📧 [FALLBACK] ${emailType} would be sent to:`, mailOptions.to);
    if (mailOptions.html) {
      // Extract OTP from HTML for console display
      const otpMatch = mailOptions.html.match(/>(\d{6})</);
      if (otpMatch) console.log('📧 [FALLBACK] OTP Code:', otpMatch[1]);
      
      // Also check for reset links
      const linkMatch = mailOptions.html.match(/https?:\/\/[^\s<>"]+/);
      if (linkMatch) console.log('📧 [FALLBACK] Reset Link:', linkMatch[0]);
    }
    return { success: false, fallback: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    
    // Show Ethereal preview URL in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }
    
    console.log(`✅ ${emailType} sent to: ${mailOptions.to}`, info.messageId);
    return { 
      success: true, 
      messageId: info.messageId,
      previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(info) : null
    };
  } catch (error) {
    console.error(`❌ Error sending ${emailType}:`, error.message);
    
    // Check if it's a timeout error
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET' || error.code === 'ECONNECTION') {
      console.error('⏰ Timeout detected. This could be due to:');
      console.error('1. Internet connection issues');
      console.error('2. Firewall blocking SMTP connections');
      console.error('3. Gmail server issues');
      console.error('4. Antivirus software blocking the connection');
    }
    
    // Fallback to console logging
    console.log(`📧 [FALLBACK] ${emailType} would be sent to:`, mailOptions.to);
    if (mailOptions.html) {
      const otpMatch = mailOptions.html.match(/>(\d{6})</);
      if (otpMatch) console.log('📧 [FALLBACK] OTP Code:', otpMatch[1]);
      
      // Also check for reset links
      const linkMatch = mailOptions.html.match(/https?:\/\/[^\s<>"]+/);
      if (linkMatch) console.log('📧 [FALLBACK] Reset Link:', linkMatch[0]);
    }
    
    return { success: false, fallback: true, error: error.message };
  }
};

// Specific email functions

// OTP Email
const sendOTPEmail = async (email, otp, name = 'User') => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '"Medical Booking App" <noreply@medicalbooking.com>',
    to: email,
    subject: 'Your OTP Code - Medical Booking App',
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 5px; }
                .otp-code { 
                    font-size: 32px; 
                    font-weight: bold; 
                    color: #007bff; 
                    text-align: center;
                    margin: 20px 0;
                    letter-spacing: 5px;
                }
                .footer { 
                    margin-top: 20px; 
                    text-align: center; 
                    color: #666; 
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Medical Booking App</h1>
                </div>
                <div class="content">
                    <h2>Hello ${name},</h2>
                    <p>Your One-Time Password (OTP) for verification is:</p>
                    <div class="otp-code">${otp}</div>
                    <p>This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
                    <p>If you didn't request this OTP, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>© 2025 Medical Booking App. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
      `
  };

  return sendEmail(mailOptions, 'OTP email');
};

// Password Reset Email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '"Medical Booking App" <noreply@medicalbooking.com>',
    to: email,
    subject: 'Password Reset Request - Medical Booking App',
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 5px; }
                .button { 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background: #007bff; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 5px; 
                    margin: 20px 0;
                }
                .footer { 
                    margin-top: 20px; 
                    text-align: center; 
                    color: #666; 
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset</h1>
                </div>
                <div class="content">
                    <h2>Reset Your Password</h2>
                    <p>You requested to reset your password. Click the button below to proceed:</p>
                    <p style="text-align: center;">
                        <a href="${resetLink}" class="button">Reset Password</a>
                    </p>
                    <p>Or copy and paste this link in your browser:</p>
                    <p style="word-break: break-all; color: #007bff;">${resetLink}</p>
                    <p>This link will expire in 1 hour for security reasons.</p>
                    <p>If you didn't request a password reset, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>© 2025 Medical Booking App. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
      `
  };

  return sendEmail(mailOptions, 'password reset email');
};

// Welcome Email (NEW)
const sendWelcomeEmail = async (user) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '"Medical Booking App" <noreply@medicalbooking.com>',
    to: user.email,
    subject: 'Welcome to Medical Booking App',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #28a745; color: white; padding: 20px; text-align: center; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 5px; }
              .footer { 
                  margin-top: 20px; 
                  text-align: center; 
                  color: #666; 
                  font-size: 12px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Welcome to Medical Booking App</h1>
              </div>
              <div class="content">
                  <h2>Hello ${user.name},</h2>
                  <p>Welcome to our medical booking service! We're excited to have you on board.</p>
                  <p>You can now book appointments with doctors easily through our platform.</p>
                  <p>If you have any questions, feel free to contact our support team.</p>
              </div>
              <div class="footer">
                  <p>© 2025 Medical Booking App. All rights reserved.</p>
              </div>
          </div>
      </body>
      </html>
    `
  };

  return sendEmail(mailOptions, 'welcome email');
};

// Appointment Confirmation Email (NEW)
const sendAppointmentConfirmation = async (user, appointment) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '"Medical Booking App" <noreply@medicalbooking.com>',
    to: user.email,
    subject: 'Your Appointment Confirmation',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #17a2b8; color: white; padding: 20px; text-align: center; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 5px; }
              .appointment-details { background: #e9ecef; padding: 15px; border-radius: 5px; }
              .footer { 
                  margin-top: 20px; 
                  text-align: center; 
                  color: #666; 
                  font-size: 12px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Appointment Confirmed</h1>
              </div>
              <div class="content">
                  <h2>Hello ${user.name},</h2>
                  <p>Your appointment has been successfully confirmed. Here are the details:</p>
                  
                  <div class="appointment-details">
                      <p><strong>Doctor:</strong> Dr. ${appointment.doctorName}</p>
                      <p><strong>Date:</strong> ${appointment.date}</p>
                      <p><strong>Time:</strong> ${appointment.time}</p>
                      ${appointment.location ? `<p><strong>Location:</strong> ${appointment.location}</p>` : ''}
                  </div>
                  
                  <p>Please arrive 15 minutes before your scheduled time.</p>
                  <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
              </div>
              <div class="footer">
                  <p>© 2025 Medical Booking App. All rights reserved.</p>
              </div>
          </div>
      </body>
      </html>
    `
  };

  return sendEmail(mailOptions, 'appointment confirmation email');
};

// Test function to diagnose issues
const testEmailConnection = async () => {
  console.log('🧪 Testing email configuration...');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('GMAIL_USER:', process.env.GMAIL_USER ? 'Set' : 'Not set');
  
  const isVerified = await verifyTransporter();
  if (isVerified) {
    console.log('✅ Email configuration test passed');
    return true;
  } else {
    console.log('❌ Email configuration test failed');
    return false;
  }
};

// Test endpoint function (for your API route)
const sendTestEmail = async (req, res) => {
  try {
    const result = await sendEmail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '"Medical Booking App" <noreply@medicalbooking.com>',
      to: process.env.TEST_EMAIL || process.env.GMAIL_USER || 'test@example.com',
      subject: 'Test Email from Medical Booking App',
      html: `
        <h2>Test Email</h2>
        <p>This is a test email sent from the Medical Booking App backend.</p>
        <p>If you received this, your email configuration is working correctly!</p>
      `
    }, 'test email');
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Test email sent successfully',
        previewUrl: result.previewUrl 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send test email',
        fallback: result.fallback 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error sending test email: ' + error.message 
    });
  }
};

module.exports = { 
  sendOTPEmail, 
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAppointmentConfirmation,
  sendTestEmail,
  transporter,
  verifyTransporter,
  testEmailConnection
};