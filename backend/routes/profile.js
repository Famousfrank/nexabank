const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db/pool');
const { requireAuth }             = require('../middleware/auth');
const { transporter, generateOTP } = require('../services/otp.service');

router.use(requireAuth);

const sendMail = async (to, subject, html) => {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({ from:`"NexaBank" <${process.env.SMTP_USER}>`, to, subject, html });
};

const alertHtml = (userName, action, supportUrl='https://nexabank.com/support') => `
  <div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#c8102e;padding:22px 24px;text-align:center">
      <div style="font-size:32px">⚠️</div>
      <h2 style="color:#fff;margin:8px 0 0;font-size:18px">Security Alert</h2>
    </div>
    <div style="padding:24px">
      <p style="color:#444;font-size:14px">Hi <strong>${userName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7">${action}</p>
      <p style="color:#555;font-size:13px">If this wasn't you, please <a href="${supportUrl}" style="color:#c8102e;font-weight:700">contact customer support</a> immediately.</p>
    </div>
    <div style="background:#f8f9fb;padding:12px 24px;text-align:center">
      <p style="color:#aaa;font-size:11px;margin:0">NexaBank Security · Automated Alert</p>
    </div>
  </div>`;

/* ── GET /profile/me ─────────────────────────────────────────────────────── */
router.get('/me', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, full_name, email, phone, avatar, created_at,
            customer_id, kyc_status, privacy_mode, biometric_enabled,
            (transaction_pin_hash IS NOT NULL) AS has_pin
     FROM users WHERE id=?`, [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const u = rows[0];
  res.json({ ...u, privacy_mode: !!u.privacy_mode, biometric_enabled: !!u.biometric_enabled, has_pin: !!u.has_pin });
});

/* ── PATCH /profile/me ───────────────────────────────────────────────────── */
router.patch('/me', async (req, res) => {
  const { full_name, avatar } = req.body;
  const fields = []; const vals = [];
  if (full_name?.trim()) { fields.push('full_name=?'); vals.push(full_name.trim()); }
  if (avatar !== undefined) { fields.push('avatar=?'); vals.push(avatar === '' ? null : avatar); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.user.id);
  await db.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, vals);
  res.json({ message: 'Profile updated' });
});

/* ── POST /profile/contact-otp  — send OTP to verify before changing email/phone ── */
router.post('/contact-otp', async (req, res) => {
  const { type } = req.body; // 'email' | 'phone'
  if (!['email','phone'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const [rows] = await db.query('SELECT email, full_name, phone FROM users WHERE id=?', [req.user.id]);
  const user = rows[0];
  const otp  = generateOTP();
  const expires = new Date(Date.now() + 10*60*1000);
  await db.query(
    `INSERT INTO otp_codes (user_id, code, purpose, expires_at) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE code=VALUES(code), expires_at=VALUES(expires_at)`,
    [req.user.id, otp, `contact_${type}`, expires]
  );
  if (type === 'email') {
    await sendMail(user.email, '🔐 NexaBank – Verify Contact Change',
      `<div style="font-family:'Segoe UI',sans-serif;max-width:460px;margin:0 auto;background:#012169;border-radius:14px;padding:28px;text-align:center">
        <h2 style="color:#fff;margin:0 0 8px">Contact Change OTP</h2>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 20px">Enter this code to verify your identity</p>
        <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00f5c4;margin:16px 0">${otp}</div>
        <p style="color:rgba(255,255,255,0.5);font-size:12px">Valid for 10 minutes. Never share this code.</p>
      </div>`);
    res.json({ message: `OTP sent to ${user.email}`, sent_to: user.email });
  } else {
    // In production send SMS; for now log it
    console.log(`\n📱 Contact change OTP for ${user.phone||'(no phone)'}: ${otp}\n`);
    res.json({ message: `OTP sent to your registered phone`, sent_to: user.phone || '(phone not set)' });
  }
});

/* ── PATCH /profile/contact  — verify OTP then update email or phone ─────── */
router.patch('/contact', async (req, res) => {
  const { type, otp, new_value } = req.body;
  if (!['email','phone'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!otp || !new_value?.trim()) return res.status(400).json({ error: 'OTP and new value required' });

  const [otpRows] = await db.query(
    "SELECT * FROM otp_codes WHERE user_id=? AND purpose=? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
    [req.user.id, `contact_${type}`]
  );
  if (!otpRows.length || otpRows[0].code !== otp)
    return res.status(400).json({ error: 'Invalid or expired OTP' });

  const [userRows] = await db.query('SELECT email, full_name FROM users WHERE id=?', [req.user.id]);
  const user = userRows[0];

  if (type === 'email') {
    await db.query('UPDATE users SET email=? WHERE id=?', [new_value.trim(), req.user.id]);
    // Alert old email
    sendMail(user.email, '⚠️ NexaBank – Email Address Changed',
      alertHtml(user.full_name, `Your NexaBank email address was changed to <strong>${new_value.trim()}</strong>.`)).catch(console.error);
  } else {
    await db.query('UPDATE users SET phone=? WHERE id=?', [new_value.trim(), req.user.id]);
    sendMail(user.email, '⚠️ NexaBank – Phone Number Changed',
      alertHtml(user.full_name, `Your NexaBank phone number was changed to <strong>${new_value.trim()}</strong>.`)).catch(console.error);
  }
  await db.query("DELETE FROM otp_codes WHERE user_id=? AND purpose=?", [req.user.id, `contact_${type}`]);
  res.json({ message: `${type === 'email' ? 'Email' : 'Phone'} updated successfully` });
});

/* ── POST /profile/set-pin ───────────────────────────────────────────────── */
router.post('/set-pin', async (req, res) => {
  const { pin, current_password } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  if (!current_password) return res.status(400).json({ error: 'Current password required to set PIN' });
  const [rows] = await db.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(400).json({ error: 'Incorrect password' });
  const hash = await bcrypt.hash(pin, 12);
  await db.query('UPDATE users SET transaction_pin_hash=? WHERE id=?', [hash, req.user.id]);
  res.json({ message: 'Transaction PIN set successfully' });
});

/* ── POST /profile/verify-pin ───────────────────────────────────────────── */
router.post('/verify-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const [rows] = await db.query('SELECT transaction_pin_hash FROM users WHERE id=?', [req.user.id]);
  if (!rows[0].transaction_pin_hash) return res.status(400).json({ error: 'No PIN set. Please set a transaction PIN first.' });
  const valid = await bcrypt.compare(String(pin), rows[0].transaction_pin_hash);
  if (!valid) return res.status(400).json({ error: 'Incorrect PIN' });
  res.json({ valid: true });
});

/* ── PATCH /profile/toggle ── privacy_mode / biometric_enabled ───────────── */
router.patch('/toggle', async (req, res) => {
  const { field } = req.body;
  if (!['privacy_mode','biometric_enabled'].includes(field))
    return res.status(400).json({ error: 'Invalid field' });
  await db.query(`UPDATE users SET ${field} = NOT ${field} WHERE id=?`, [req.user.id]);
  const [rows] = await db.query(`SELECT ${field} FROM users WHERE id=?`, [req.user.id]);
  res.json({ [field]: !!rows[0][field] });
});

/* ── POST /profile/kyc ───────────────────────────────────────────────────── */
router.post('/kyc', async (req, res) => {
  try {
    const { id_card, ssn, proof_address, selfie } = req.body;
    if (!id_card || !ssn || !proof_address || !selfie)
      return res.status(400).json({ error: 'All KYC documents are required' });
    if (!ssn.match(/^\d{9}$/))
      return res.status(400).json({ error: 'SSN must be exactly 9 digits' });

    // Size guard — base64 images can be large; reject if any single file > 8MB
    const MB8 = 8 * 1024 * 1024;
    if (id_card.length > MB8 || proof_address.length > MB8 || selfie.length > MB8)
      return res.status(413).json({ error: 'One or more files are too large. Please upload images under 6MB.' });

    // Check for existing pending
    const [existing] = await db.query(
      "SELECT id FROM kyc_documents WHERE user_id=? AND status='pending'", [req.user.id]);
    if (existing.length)
      return res.status(409).json({ error: 'You already have a pending KYC submission' });

    // Store only the fact that docs were submitted, not the raw base64 (keeps DB lean)
    // For a real app you'd upload to S3/cloud storage and store the URL
    const docRef = 'submitted_' + Date.now();
   await db.query(
  `INSERT INTO kyc_documents (user_id, id_card, ssn, proof_address, selfie, status) 
   VALUES (?,?,?,?,?, 'pending')`,
  [req.user.id, docRef, ssn, docRef, docRef]
);
    await db.query("UPDATE users SET kyc_status='pending', kyc_submitted_at=NOW() WHERE id=?", [req.user.id]);
    await db.query('INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)',
      [req.user.id, '🪪', 'Your KYC documents have been submitted and are under review.']);

    const [userRows] = await db.query('SELECT email,full_name FROM users WHERE id=?', [req.user.id]);
    if (userRows.length) {
      sendMail(userRows[0].email, '✅ NexaBank – KYC Submission Received',
        `<div style="font-family:'Segoe UI',sans-serif;max-width:460px;margin:0 auto;background:#012169;border-radius:14px;padding:28px;text-align:center">
          <div style="font-size:40px;margin-bottom:10px">🪪</div>
          <h2 style="color:#fff;margin:0 0 10px">KYC Submitted</h2>
          <p style="color:rgba(255,255,255,0.75);font-size:14px;line-height:1.7">Hi <strong>${userRows[0].full_name}</strong>, your identity verification documents have been received and are being reviewed. You will be notified once verified.</p>
        </div>`).catch(console.error);
    }

    res.status(201).json({ message: 'KYC documents submitted successfully' });
  } catch (err) {
    console.error('KYC submission error:', err);
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'KYC table not found. Please run patch_profile_features.sql in phpMyAdmin first.' });
    }
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({ error: 'Database column missing. Please run patch_profile_features.sql in phpMyAdmin.' });
    }
    res.status(500).json({ error: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

/* ── GET /profile/kyc ───────────────────────────────────────────────────── */
router.get('/kyc', async (req, res) => {
  const [rows] = await db.query(
    'SELECT status, submitted_at, reviewed_at FROM kyc_documents WHERE user_id=? ORDER BY submitted_at DESC LIMIT 1',
    [req.user.id]
  );
  const [userRows] = await db.query('SELECT kyc_status FROM users WHERE id=?', [req.user.id]);
  res.json({ kyc_status: userRows[0]?.kyc_status || 'none', latest: rows[0] || null });
});


/* ── GET /profile/kyc/admin/all  — list all pending KYC submissions ─────── */
router.get('/kyc/admin/all', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT k.id, k.user_id, k.ssn, k.status, k.submitted_at, k.reviewed_at,
              u.full_name, u.email, u.kyc_status
       FROM kyc_documents k
       JOIN users u ON u.id = k.user_id
       ORDER BY k.submitted_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── POST /profile/kyc/:id/approve  (admin) ─────────────────────────────── */
router.post('/kyc/:id/approve', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT k.*, u.email, u.full_name FROM kyc_documents k JOIN users u ON u.id=k.user_id WHERE k.id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'KYC submission not found' });
    const kyc = rows[0];

    await db.query(
      "UPDATE kyc_documents SET status='verified', reviewed_at=NOW() WHERE id=?", [req.params.id]);
    await db.query(
      "UPDATE users SET kyc_status='verified' WHERE id=?", [kyc.user_id]);
    await db.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)",
      [kyc.user_id, '✅', 'Your identity has been verified! Your NexaBank account is now fully verified.']);

    sendMail(kyc.email, '✅ NexaBank – Identity Verified!',
      `<div style="font-family:'Segoe UI',sans-serif;max-width:460px;margin:0 auto;background:#012169;border-radius:14px;padding:28px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <h2 style="color:#fff;margin:0 0 10px">Identity Verified!</h2>
        <p style="color:rgba(255,255,255,0.75);font-size:14px;line-height:1.7">
          Hi <strong>${kyc.full_name}</strong>, your identity has been successfully verified.
          Your NexaBank account now has full access to all features.
        </p>
      </div>`
    ).catch(console.error);

    res.json({ message: 'KYC approved and user verified.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── POST /profile/kyc/:id/reject  (admin) ──────────────────────────────── */
router.post('/kyc/:id/reject', async (req, res) => {
  try {
    const { reason = 'Documents could not be verified. Please resubmit.' } = req.body;
    const [rows] = await db.query(
      'SELECT k.*, u.email, u.full_name FROM kyc_documents k JOIN users u ON u.id=k.user_id WHERE k.id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'KYC submission not found' });
    const kyc = rows[0];

    await db.query(
      "UPDATE kyc_documents SET status='rejected', reviewed_at=NOW() WHERE id=?", [req.params.id]);
    await db.query(
      "UPDATE users SET kyc_status='rejected' WHERE id=?", [kyc.user_id]);
    await db.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)",
      [kyc.user_id, '❌', `KYC verification unsuccessful: ${reason}`]);

    sendMail(kyc.email, '❌ NexaBank – KYC Verification Update',
      `<div style="font-family:'Segoe UI',sans-serif;max-width:460px;margin:0 auto;background:#c8102e;border-radius:14px;padding:28px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">❌</div>
        <h2 style="color:#fff;margin:0 0 10px">Verification Unsuccessful</h2>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.7">
          Hi <strong>${kyc.full_name}</strong>, unfortunately we could not verify your identity at this time.<br><br>
          Reason: <em>${reason}</em><br><br>
          Please resubmit your KYC documents from the app.
        </p>
      </div>`
    ).catch(console.error);

    res.json({ message: 'KYC rejected.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;