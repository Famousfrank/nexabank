const nodemailer = require('nodemailer');

// Configure transporter with timeouts to prevent hanging
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  family: 4, // Use IPv4 only
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { 
    rejectUnauthorized: false 
  },
  // Timeout settings to prevent hanging
  connectionTimeout: 10000,  // 10 seconds to connect
  greetingTimeout: 10000,    // 10 seconds for greeting
  socketTimeout: 10000       // 10 seconds for socket activity
});

// Function to generate a 6-digit OTP
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Function to send OTP email
async function sendOTPEmail(to, otp, purpose = 'login') {
  const subjects = {
    signup: '🏦 NexaBank – Verify your account',
    login:  '🔐 NexaBank – Your login OTP',
    reset:  '🔑 NexaBank – Password reset OTP',
  };

  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#080c18;color:#fff;border-radius:16px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#00f5c4,#7c6fff);padding:24px;text-align:center">
        <h1 style="margin:0;font-size:28px;color:#0a0e1a">nexabank</h1>
        <p style="margin:6px 0 0;color:#0a0e1a;opacity:0.7;font-size:13px">Next-generation banking</p>
      </div>
      <div style="padding:32px;text-align:center">
        <p style="color:#8892a4;font-size:14px;margin-bottom:8px">Your one-time code</p>
        <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#00f5c4;margin:16px 0">${otp}</div>
        <p style="color:#8892a4;font-size:13px">Valid for <strong style="color:#fff">10 minutes</strong>. Never share this code.</p>
      </div>
      <div style="background:rgba(255,255,255,0.04);padding:16px;text-align:center">
        <p style="color:#4a5568;font-size:11px;margin:0">If you didn't request this, please ignore this email.</p>
      </div>
    </div>`;

  // Log SMTP configuration (without password)
  console.log('📧 SMTP Configuration:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER ? process.env.SMTP_USER.substring(0, 5) + '...' : 'NOT SET',
    hasPass: !!process.env.SMTP_PASS
  });
  
  // Check if SMTP credentials are missing
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`\n📧 =========================================`);
    console.log(`⚠️ SMTP credentials missing!`);
    console.log(`📧 OTP for ${to} (${purpose}): \x1b[32m${otp}\x1b[0m`);
    console.log(`📧 Add SMTP_USER and SMTP_PASS to environment variables`);
    console.log(`📧 =========================================\n`);
    return { success: true, simulated: true, otp: otp };
  }

  try {
    console.log(`📧 Attempting to send OTP email to ${to}...`);
    
    // Verify transporter configuration
    await transporter.verify();
    console.log('✅ SMTP transporter verified successfully');
    
    // Send email with timeout
    const info = await transporter.sendMail({
      from: `"NexaBank" <${process.env.SMTP_USER}>`,
      to,
      subject: subjects[purpose] || subjects.login,
      html,
    });
    
    console.log(`✅ OTP email sent to ${to} (${purpose}) - Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
    
  } catch (err) {
    console.error(`❌ Failed to send OTP email to ${to}:`, err.message);
    console.error(`❌ Error details:`, err);
    
    // Log the OTP to console as fallback
    console.log(`\n📧 =========================================`);
    console.log(`⚠️ Email failed - OTP for ${to} (${purpose}): \x1b[32m${otp}\x1b[0m`);
    console.log(`📧 =========================================\n`);
    
    return { success: false, error: err.message, otp: otp };
  }
}

module.exports = { generateOTP, sendOTPEmail, transporter };