const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

  if (!process.env.SMTP_USER) {
    console.log(`\n📧 OTP for ${to}: \x1b[32m${otp}\x1b[0m  (purpose: ${purpose})\n`);
    return;
  }

  await transporter.sendMail({
    from:    `"NexaBank" <${process.env.SMTP_USER}>`,
    to,
    subject: subjects[purpose] || subjects.login,
    html,
  });
}

module.exports = { generateOTP, sendOTPEmail, transporter };