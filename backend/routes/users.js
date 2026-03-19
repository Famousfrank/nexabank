const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const db          = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { transporter } = require('../services/otp.service');

router.use(requireAuth);

// ─── GET /users/me ────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, full_name, email, phone, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /users/me ─────────────────────────────────────────────────────────
router.patch('/me', async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const fields = [];
    const vals   = [];
    if (full_name) { fields.push('full_name = ?'); vals.push(full_name); }
    if (phone)     { fields.push('phone = ?');     vals.push(phone); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.user.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /users/me/password ─────────────────────────────────────────────────
router.patch('/me/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters' });

    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid  = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /users/notifications ─────────────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows.map(r => ({ ...r, is_read: !!r.is_read })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /users/notifications/:id/read ─────────────────────────────────────
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ─── PATCH /users/notifications/read-all ──────────────────────────────────────
router.patch('/notifications/read-all', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /users/budgets ───────────────────────────────────────────────────────
router.get('/budgets', async (req, res) => {
  try {
    const [budgets] = await db.query(
      'SELECT * FROM budgets WHERE user_id = ?',
      [req.user.id]
    );
    // Calculate spent per category this month
    const [spent] = await db.query(
      `SELECT category, SUM(ABS(amount)) AS spent
       FROM transactions
       WHERE user_id = ? AND type = 'debit'
         AND MONTH(created_at) = MONTH(CURDATE())
         AND YEAR(created_at)  = YEAR(CURDATE())
       GROUP BY category`,
      [req.user.id]
    );
    const spentMap = Object.fromEntries(spent.map(s => [s.category, parseFloat(s.spent)]));
    res.json(budgets.map(b => ({ ...b, spent: spentMap[b.category] || 0 })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /users/budgets/:category ─────────────────────────────────────────────
router.put('/budgets/:category', async (req, res) => {
  try {
    const { amount, period = 'monthly' } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount required' });
    await db.query(
      `INSERT INTO budgets (user_id, category, amount, period) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
      [req.user.id, req.params.category, amount, period]
    );
    res.json({ message: 'Budget saved' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /users/goals ─────────────────────────────────────────────────────────
router.get('/goals', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /users/goals ────────────────────────────────────────────────────────
router.post('/goals', async (req, res) => {
  try {
    const { name, icon, target, deadline } = req.body;
    if (!name || !target) return res.status(400).json({ error: 'Name and target required' });
    const [result] = await db.query(
      'INSERT INTO savings_goals (user_id, name, icon, target, deadline) VALUES (?,?,?,?,?)',
      [req.user.id, name, icon || '🎯', target, deadline || null]
    );
    res.status(201).json({ id: result.insertId, name, icon, target, saved: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /users/goals/:id ───────────────────────────────────────────────────
router.patch('/goals/:id', async (req, res) => {
  try {
    const { saved } = req.body;
    await db.query(
      'UPDATE savings_goals SET saved = ? WHERE id = ? AND user_id = ?',
      [saved, req.params.id, req.user.id]
    );
    res.json({ message: 'Goal updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /users/contacts ──────────────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM contacts WHERE user_id = ? ORDER BY name', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /users/contacts ─────────────────────────────────────────────────────
router.post('/contacts', async (req, res) => {
  try {
    const { name, account_number, bank } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const avatar = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const [result] = await db.query(
      'INSERT INTO contacts (user_id, name, avatar, account_number, bank) VALUES (?,?,?,?,?)',
      [req.user.id, name, avatar, account_number || null, bank || null]
    );
    res.status(201).json({ id: result.insertId, name, avatar, account_number, bank });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /users/analytics ─────────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const uid = req.user.id;

    // Spending by category this month
    const [byCategory] = await db.query(
      `SELECT category, SUM(ABS(amount)) AS total
       FROM transactions WHERE user_id = ? AND amount < 0
         AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
       GROUP BY category ORDER BY total DESC`,
      [uid]
    );

    // Daily spending last 7 days
    const [daily] = await db.query(
      `SELECT DATE(created_at) AS day, SUM(ABS(amount)) AS total
       FROM transactions WHERE user_id = ? AND amount < 0
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(created_at) ORDER BY day ASC`,
      [uid]
    );

    // Monthly income vs spend last 6 months
    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(created_at,'%Y-%m') AS month,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS spend
       FROM transactions WHERE user_id = ?
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month ASC`,
      [uid]
    );

    res.json({ byCategory, daily, monthly });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /users/statement ───────────────────────────────────────────────────
// Generate statement for an account between two dates.
// Returns transactions as JSON and emails an HTML statement to the user.
router.post('/statement', async (req, res) => {
  try {
    const { account_id, from_date, to_date } = req.body;
    if (!account_id || !from_date || !to_date)
      return res.status(400).json({ error: 'account_id, from_date and to_date are required' });

    // Verify account belongs to this user
    const [acctRows] = await db.query(
      'SELECT * FROM accounts WHERE id = ? AND user_id = ?',
      [account_id, req.user.id]
    );
    if (!acctRows.length) return res.status(404).json({ error: 'Account not found' });
    const acct = acctRows[0];

    // Fetch user info for the email
    const [userRows] = await db.query(
      'SELECT full_name, email FROM users WHERE id = ?',
      [req.user.id]
    );
    const user = userRows[0];

    // Fetch transactions in range
    const [txns] = await db.query(
      `SELECT * FROM transactions
       WHERE account_id = ? AND user_id = ?
         AND DATE(created_at) >= ? AND DATE(created_at) <= ?
       ORDER BY created_at ASC`,
      [account_id, req.user.id, from_date, to_date]
    );

    // Summary figures
    const totalCredits = txns.filter(t => t.amount > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalDebits  = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const maskCard = (n) => '•••• ' + String(n).trim().slice(-4);

    // ── Build HTML email ────────────────────────────────────────────────────
    const fmtAmt = (n) => {
      const abs = Math.abs(parseFloat(n));
      return (n >= 0 ? '+' : '-') + '$' + abs.toFixed(2);
    };
    const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // 4-column mobile-friendly rows (Date | Description | Amount | Balance)
    const txnRowsMobile = txns.map(t => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#555;font-size:12px;white-space:nowrap">${fmtDate(t.created_at)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:12px">${t.description}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-weight:700;white-space:nowrap;color:${parseFloat(t.amount) >= 0 ? '#1a7f4b' : '#c8102e'}">${fmtAmt(t.amount)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;white-space:nowrap;color:#012169">$${parseFloat(t.balance_after).toFixed(2)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:0; padding:0; background:#f0f4f8; font-family:'Segoe UI',Arial,sans-serif; }
  .wrapper { width:100%; background:#f0f4f8; padding:16px 0; }
  .card { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; }
  .header { background:#012169; padding:24px 20px; }
  .header h1 { margin:0; font-size:22px; font-weight:800; color:#fff; letter-spacing:1px; }
  .header p  { margin:4px 0 0; font-size:12px; color:rgba(255,255,255,0.6); }
  .info-band { background:#f8f9fb; padding:18px 20px; border-bottom:1px solid #e5e7eb; }
  .info-band table { width:100%; border-collapse:collapse; }
  .info-band td { padding:6px 4px; vertical-align:top; }
  .info-label { font-size:11px; color:#888; }
  .info-value { font-size:13px; font-weight:700; color:#012169; margin-top:2px; }
  .summary { padding:16px 20px; border-bottom:1px solid #e5e7eb; }
  .summary table { width:100%; border-collapse:collapse; }
  .summary td { padding:0 4px; }
  .summary td:first-child { padding-left:0; }
  .summary td:last-child  { padding-right:0; }
  .sbox { border-radius:10px; padding:12px 14px; }
  .sbox-label { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:0.5px; }
  .sbox-val   { font-size:16px; font-weight:800; margin-top:4px; }
  .txn-section { padding:16px 20px; }
  .txn-title { font-size:12px; font-weight:700; color:#012169; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; }
  .txn-table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .txn-table th { padding:8px 8px; font-size:10px; color:#888; text-transform:uppercase; letter-spacing:0.4px; border-bottom:2px solid #e5e7eb; background:#f8f9fb; }
  .txn-table td { word-break:break-word; }
  .footer { padding:16px 20px; background:#f8f9fb; border-top:1px solid #e5e7eb; text-align:center; }
  .footer p { font-size:11px; color:#aaa; margin:2px 0; }
</style>
</head><body>
<div class="wrapper">
<div class="card">

  <!-- Header -->
  <div class="header">
    <h1>NEXABANK</h1>
    <p>Account Statement</p>
  </div>

  <!-- Account info: stacks to 2-col on mobile -->
  <div class="info-band">
    <table>
      <tr>
        <td style="width:50%">
          <div class="info-label">Account Holder</div>
          <div class="info-value">${user.full_name}</div>
        </td>
        <td style="width:50%">
          <div class="info-label">Account</div>
          <div class="info-value">${acct.label} ${maskCard(acct.card_number)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding-top:12px">
          <div class="info-label">Period</div>
          <div class="info-value">${fmtDate(from_date)} – ${fmtDate(to_date)}</div>
        </td>
        <td style="padding-top:12px">
          <div class="info-label">Closing Balance</div>
          <div class="info-value">$${parseFloat(acct.balance).toFixed(2)}</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Summary: 3 equal boxes, each one-third width -->
  <div class="summary">
    <table>
      <tr>
        <td style="width:33%;padding-right:6px;padding-left:0">
          <div class="sbox" style="background:#f0faf4">
            <div class="sbox-label">Credits</div>
            <div class="sbox-val" style="color:#1a7f4b">+$${totalCredits.toFixed(2)}</div>
          </div>
        </td>
        <td style="width:33%;padding:0 3px">
          <div class="sbox" style="background:#fff0f0">
            <div class="sbox-label">Debits</div>
            <div class="sbox-val" style="color:#c8102e">-$${totalDebits.toFixed(2)}</div>
          </div>
        </td>
        <td style="width:33%;padding-left:6px;padding-right:0">
          <div class="sbox" style="background:#f0f4ff">
            <div class="sbox-label">Txns</div>
            <div class="sbox-val" style="color:#012169">${txns.length}</div>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Transaction table: 4 cols (Date | Description | Amount | Balance) -->
  <div class="txn-section">
    <div class="txn-title">Transaction History</div>
    ${txns.length === 0
      ? '<p style="text-align:center;color:#bbb;font-size:13px;padding:24px 0">No transactions in this period</p>'
      : `<table class="txn-table">
          <colgroup>
            <col style="width:18%">
            <col style="width:42%">
            <col style="width:20%">
            <col style="width:20%">
          </colgroup>
          <thead>
            <tr>
              <th style="text-align:left">Date</th>
              <th style="text-align:left">Description</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>${txnRowsMobile}</tbody>
        </table>`}
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Generated by NexaBank · ${new Date().toLocaleString()}</p>
    <p>This is an official account statement.</p>
  </div>

</div>
</div>
</body></html>`;

    // ── Send email (non-blocking — don't fail the request if email fails) ──
    let emailSent = false;
    try {
      if (transporter) {
        await transporter.sendMail({
          from:    `"NexaBank" <${process.env.SMTP_USER}>`,
          to:      user.email,
          subject: `NexaBank Statement – ${acct.label} (${from_date} to ${to_date})`,
          html,
        });
        emailSent = true;
      }
    } catch (mailErr) {
      console.error('Statement email failed:', mailErr.message);
    }

    // Return everything the frontend needs to build the downloadable PDF
    res.json({
      account:      { ...acct, card_number: maskCard(acct.card_number) },
      user:         { full_name: user.full_name, email: user.email },
      from_date,
      to_date,
      transactions: txns,
      summary:      { total_credits: totalCredits, total_debits: totalDebits, count: txns.length },
      email_sent:   emailSent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;