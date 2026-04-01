const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db/pool');
const { generateOTP, sendOTPEmail } = require('../services/otp.service');
const { signAccess, signRefresh, verifyRefresh, requireAuth } = require('../middleware/auth');

// ─── helpers ──────────────────────────────────────────────────────────────────
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function randomCardNumber() {
  const first = String(Math.floor(Math.random() * 9) + 1);
  const rest  = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
  return first + rest;
}

function maskCard(n) {
  return `•••• •••• ${String(n).trim().slice(-4)}`;
}

// ─── POST /auth/signup/init ───────────────────────────────────────────────────
router.post('/signup/init', async (req, res) => {
  try {
    console.log('Signup init payload:', req.body);
    const { full_name, email, phone, password } = req.body;

    if (!full_name || !email || !phone || !password)
      return res.status(400).json({ error: 'All fields are required' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const otp  = generateOTP();
    const exp  = new Date(Date.now() + 10 * 60 * 1000);
    console.log("OTP for signup:", otp);

    const pendingToken = Buffer.from(JSON.stringify({ full_name, email, phone, hash, otp, exp: exp.getTime() })).toString('base64');

    return res.json({ pendingToken, message: 'OTP sent to your email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/signup/verify ─────────────────────────────────────────────────
router.post('/signup/verify', async (req, res) => {
  try {
    const { pendingToken, otp } = req.body;

    if (!pendingToken || !otp)
      return res.status(400).json({ error: 'Missing fields' });

    let pending;
    try {
      pending = JSON.parse(Buffer.from(pendingToken, 'base64').toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid pending token' });
    }

    const { full_name, email, phone, hash, otp: storedOtp, exp } = pending;

    if (storedOtp !== otp)
      return res.status(400).json({ error: 'Invalid OTP code' });

    if (Date.now() > exp)
      return res.status(400).json({ error: 'OTP has expired, please try again' });

    const [dup] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dup.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const userId = crypto.randomUUID();
    await db.query(
      `INSERT INTO users (id, full_name, email, phone, password_hash, avatar, is_verified) VALUES (?,?,?,?,?,?,1)`,
      [userId, full_name, email, phone, hash, initials(full_name)]
    );

    const accountDefs = [
      { label: 'Checking', type: 'checking', balance: 0, color: '#c8102e' },
      { label: 'Savings',  type: 'savings',  balance: 0, color: '#1a7f4b' },
      { label: 'Credit',   type: 'credit',   balance: 0, color: '#e07b00' },
    ];

    const createdAccounts = [];
    for (const acc of accountDefs) {
      const accId = crypto.randomUUID();
      const cardNo = randomCardNumber();
      await db.query(
        `INSERT INTO accounts (id, user_id, label, type, card_number, balance, card_color) VALUES (?,?,?,?,?,?,?)`,
        [accId, userId, acc.label, acc.type, cardNo, acc.balance, acc.color]
      );
      createdAccounts.push({ id: accId, label: acc.label, type: acc.type, card_number: maskCard(cardNo), balance: acc.balance, card_color: acc.color });
    }

    await db.query(
      `INSERT INTO notifications (user_id, icon, message) VALUES (?, '🎉', ?)`,
      [userId, `Welcome to NexaBank, ${full_name.split(' ')[0]}! Your accounts are ready.`]
    );

    const accessToken  = signAccess({ id: userId, email });
    const refreshToken = signRefresh({ id: userId });
    const rtExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?,?,?)',
      [userId, refreshToken, rtExp]
    );

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: userId, full_name, email, phone, avatar: initials(full_name) },
      accounts: createdAccounts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/login/init ────────────────────────────────────────────────────
router.post('/login/init', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const otp = generateOTP();
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    await db.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at) VALUES (?, ?, 'login', ?)`,
      [user.id, otp, exp]
    );

    await sendOTPEmail(email, otp, 'login');

    return res.json({ userId: user.id, message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Login init error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/login/verify ────────────────────────────────────────────────────
// Step 2: verify OTP and complete login
router.post('/login/verify', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    
    if (!userId || !otp) {
      return res.status(400).json({ error: 'User ID and OTP code required' });
    }

    const [otpRows] = await db.query(
      'SELECT * FROM otp_codes WHERE user_id = ? AND code = ? AND purpose = "login" AND expires_at > NOW()',
      [userId, otp]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }

    await db.query('DELETE FROM otp_codes WHERE id = ?', [otpRows[0].id]);

    const [users] = await db.query('SELECT id, full_name, email, phone, avatar FROM users WHERE id = ? AND is_active = 1', [userId]);
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const user = users[0];

    const accessToken = signAccess({ id: user.id, email: user.email });
    const refreshToken = signRefresh({ id: user.id });
    const rtExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?,?,?)',
      [user.id, refreshToken, rtExp]
    );

    const [accounts] = await db.query(
      'SELECT id, label, type, card_number, balance, card_color FROM accounts WHERE user_id = ?',
      [user.id]
    );

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar
      },
      accounts: accounts.map(acc => ({
        ...acc,
        card_number: maskCard(acc.card_number)
      }))
    });
    
  } catch (err) {
    console.error('Login verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    let payload;
    try { payload = verifyRefresh(refreshToken); }
    catch { return res.status(401).json({ error: 'Invalid or expired refresh token' }); }

    const [rows] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
      [refreshToken]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Token revoked or expired' });

    const [users] = await db.query('SELECT id, email FROM users WHERE id = ?', [payload.id]);
    if (!users.length) return res.status(401).json({ error: 'User not found' });

    const newAccess = signAccess({ id: users[0].id, email: users[0].email });
    return res.json({ accessToken: newAccess });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    }
    return res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/logout-all ────────────────────────────────────────────────────
router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [req.user.id]);
    return res.json({ message: 'All sessions terminated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login endpoint
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const adminEmails = ['admin@nexabank.com', 'franknkem0049@gmail.com'];
    if (!adminEmails.includes(email)) {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const [existingAccounts] = await db.query('SELECT id FROM accounts WHERE user_id = ? LIMIT 1', [user.id]);
    if (existingAccounts.length === 0) {
      const accountDefs = [
        { label: 'Checking', type: 'checking', color: '#c8102e' },
        { label: 'Savings',  type: 'savings',  color: '#1a7f4b' },
        { label: 'Credit',   type: 'credit',   color: '#e07b00' },
      ];
      for (const acc of accountDefs) {
        const accId  = crypto.randomUUID();
        const cardNo = randomCardNumber();
        await db.query(
          'INSERT INTO accounts (id, user_id, label, type, card_number, balance, card_color) VALUES (?,?,?,?,?,0,?)',
          [accId, user.id, acc.label, acc.type, cardNo, acc.color]
        );
      }
    }

    const accessToken  = signAccess({ id: user.id, email: user.email });
    const refreshToken = signRefresh({ id: user.id });
    const rtExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?,?,?)',
      [user.id, refreshToken, rtExp]
    );

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone, avatar: user.avatar },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/test-email', async (req, res) => {
  try {
    const testResult = await sendOTPEmail('franknkem0049@gmail.com', '123456', 'test');
    res.json({ success: true, result: testResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

