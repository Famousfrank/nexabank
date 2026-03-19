const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  family: 4,
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls:    { rejectUnauthorized: false },
});

module.exports = async function sendMail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"NexaBank" <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
  } catch (e) {
    console.error('Mail error:', e.message);
  }
};