/**
 * NexaBank Admin API
 * Mount at: /api/admin
 * All routes require auth (uses same JWT as regular users — no separate admin role yet).
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const sendMail = require('../lib/mailer');
router.use(requireAuth);



/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD STATS
══════════════════════════════════════════════════════════════════════════════ */
router.get('/stats', async (req, res) => {
  try {
    const [[{ total_users }]]   = await db.query('SELECT COUNT(*) AS total_users FROM users');
    const [[{ active_users }]]  = await db.query('SELECT COUNT(*) AS active_users FROM users WHERE is_active=1');
    const [[{ total_accounts }]]= await db.query('SELECT COUNT(*) AS total_accounts FROM accounts');
    const [[{ total_txns }]]    = await db.query('SELECT COUNT(*) AS total_txns FROM transactions');
    const [[{ total_volume }]]  = await db.query('SELECT COALESCE(SUM(ABS(amount)),0) AS total_volume FROM transactions');
    const [[{ pending_loans }]] = await db.query("SELECT COUNT(*) AS pending_loans FROM loan_applications WHERE status IN ('pending','under_review','specialist_contact')");
    const [[{ pending_cards }]] = await db.query("SELECT COUNT(*) AS pending_cards FROM card_requests WHERE status='pending'");
    const [[{ pending_tiers }]] = await db.query("SELECT COUNT(*) AS pending_tiers FROM limit_upgrade_requests WHERE status='pending'");
    const [[{ pending_kyc }]]   = await db.query("SELECT COUNT(*) AS pending_kyc FROM kyc_documents WHERE status='pending'");
    const [[{ total_balance }]] = await db.query('SELECT COALESCE(SUM(balance),0) AS total_balance FROM accounts');

    // Last 7 days txn volume
    const [daily] = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count, SUM(ABS(amount)) AS volume
      FROM transactions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    // New users per day last 7 days
    const [newUsers] = await db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    // Top transaction categories
    const [categories] = await db.query(`
      SELECT category, COUNT(*) AS count, SUM(ABS(amount)) AS volume
      FROM transactions
      GROUP BY category
      ORDER BY count DESC
      LIMIT 8
    `);

    res.json({
      total_users, active_users, total_accounts, total_txns,
      total_volume: parseFloat(total_volume),
      total_balance: parseFloat(total_balance),
      pending_loans, pending_cards, pending_tiers, pending_kyc,
      daily, newUsers, categories,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   USER MANAGEMENT
══════════════════════════════════════════════════════════════════════════════ */
// GET /admin/users
router.get('/users', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const like = `%${search}%`;

    const [rows] = await db.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.is_verified, u.is_active,
             u.tier, u.created_at, u.kyc_status,
             COUNT(DISTINCT a.id)  AS account_count,
             COALESCE(SUM(a.balance), 0) AS total_balance
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id
      WHERE u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [like, like, like, parseInt(limit), offset]);

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM users WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ?',
      [like, like, like]
    );

    res.json({ users: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/users/:id  — full user profile
router.get('/users/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, full_name, email, phone, is_verified, is_active, tier,
             kyc_status, customer_id, created_at, updated_at,
             transaction_pin_hash IS NOT NULL AS has_pin, privacy_mode, biometric_enabled
      FROM users WHERE id = ?
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const [accounts] = await db.query(
      'SELECT id, label, type, card_number, balance, is_frozen, card_status, card_network, created_at FROM accounts WHERE user_id = ?',
      [req.params.id]
    );
    const [recentTxns] = await db.query(`
      SELECT id, type, amount, description, category, status, created_at
      FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `, [req.params.id]);

    res.json({ user: rows[0], accounts, recentTxns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /admin/users/:id/toggle-active
router.patch('/users/:id/toggle-active', async (req, res) => {
  try {
    const [[user]] = await db.query('SELECT id, full_name, email, is_active FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newVal = user.is_active ? 0 : 1;
    await db.query('UPDATE users SET is_active=? WHERE id=?', [newVal, req.params.id]);
    res.json({ is_active: newVal, message: newVal ? 'Account activated' : 'Account deactivated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /admin/users/:id/tier
router.patch('/users/:id/tier', async (req, res) => {
  try {
    const { tier } = req.body;
    if (![1,2,3].includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
    await db.query('UPDATE users SET tier=? WHERE id=?', [tier, req.params.id]);
    res.json({ message: `Tier updated to ${tier}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   CARD REQUESTS
══════════════════════════════════════════════════════════════════════════════ */
router.get('/card-requests', async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const where = status !== 'all' ? 'WHERE cr.status = ?' : '';
    const params = status !== 'all' ? [status] : [];
    const [rows] = await db.query(`
      SELECT cr.id, cr.card_network, cr.card_name, cr.status,
             cr.decline_reason, cr.created_at, cr.reviewed_at,
             u.full_name, u.email, u.id AS user_id
      FROM card_requests cr
      JOIN users u ON u.id = cr.user_id
      ${where}
      ORDER BY cr.created_at DESC
      LIMIT 100
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/card-requests/:id/approve', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[req2]] = await conn.query(
      'SELECT cr.*, u.full_name, u.email FROM card_requests cr JOIN users u ON u.id=cr.user_id WHERE cr.id=?',
      [req.params.id]
    );
    if (!req2) return res.status(404).json({ error: 'Request not found' });
    if (req2.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    // Deduct $1 fee from checking account
    const [[checking]] = await conn.query(
      "SELECT id, balance FROM accounts WHERE user_id=? AND type='checking' LIMIT 1",
      [req2.user_id]
    );
    if (!checking || checking.balance < 1)
      return res.status(400).json({ error: 'User has insufficient balance for $1.00 fee' });

    const newBal = parseFloat(checking.balance) - 1;
    const ref = 'CARD-' + Date.now();
    const last4 = Math.floor(1000 + Math.random() * 9000);
    const cardNum = `0000${last4.toString().padStart(4,'0')}`;

    await conn.query('UPDATE accounts SET balance=? WHERE id=?', [newBal, checking.id]);
    await conn.query(
      'INSERT INTO transactions (id,account_id,user_id,type,amount,balance_after,description,category,reference) VALUES (UUID(),?,?,?,?,?,?,?,?)',
      [checking.id, req2.user_id, 'debit', -1, newBal, 'Card processing fee', 'fees', ref]
    );

    // Create credit account
    const expiry = `${String(new Date().getMonth()+1).padStart(2,'0')}/${new Date().getFullYear()+4}`;
    await conn.query(
      `INSERT INTO accounts (id,user_id,label,type,card_number,balance,card_network,card_name,card_status,created_at)
       VALUES (UUID(),?,'Credit','credit',?,0.00,?,?,'active',NOW())`,
      [req2.user_id, cardNum, req2.card_network, req2.card_name]
    );
    await conn.query(
      "UPDATE card_requests SET status='approved', reviewed_at=NOW() WHERE id=?",
      [req.params.id]
    );
    await conn.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,'💳',?)",
      [req2.user_id, `Your ${req2.card_network.toUpperCase()} card has been approved! $1.00 processing fee charged.`]
    );
    await conn.commit();

    await sendMail(req2.email, 'Your NexaBank Card is Approved! 💳', `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#012169;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0">NexaBank</h1>
        </div>
        <div style="padding:24px">
          <h2>Hi ${req2.full_name},</h2>
          <p>Great news! Your <strong>${req2.card_network.toUpperCase()}</strong> credit card has been approved.</p>
          <p>A processing fee of <strong>$1.00</strong> has been charged from your checking account.</p>
          <p>Your card ending in <strong>${last4}</strong> is now active and ready to use.</p>
        </div>
      </div>
    `);
    res.json({ message: 'Card approved and created' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

router.post('/card-requests/:id/decline', async (req, res) => {
  try {
    const { reason = 'Application declined by administrator' } = req.body;
    const [[req2]] = await db.query(
      'SELECT cr.*, u.full_name, u.email FROM card_requests cr JOIN users u ON u.id=cr.user_id WHERE cr.id=?',
      [req.params.id]
    );
    if (!req2) return res.status(404).json({ error: 'Request not found' });
    await db.query(
      "UPDATE card_requests SET status='declined', decline_reason=?, reviewed_at=NOW() WHERE id=?",
      [reason, req.params.id]
    );
    await db.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,'❌',?)",
      [req2.user_id, `Your card application was declined. ${reason}`]
    );
    await sendMail(req2.email, 'Card Application Update', `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#012169;padding:24px;text-align:center"><h1 style="color:#fff;margin:0">NexaBank</h1></div>
        <div style="padding:24px">
          <h2>Hi ${req2.full_name},</h2>
          <p>Unfortunately your card application was declined.</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>You may reapply after addressing the issue.</p>
        </div>
      </div>
    `);
    res.json({ message: 'Card request declined' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   LIMIT UPGRADE REQUESTS
══════════════════════════════════════════════════════════════════════════════ */
router.get('/limit-upgrades', async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const where = status !== 'all' ? 'WHERE lr.status = ?' : '';
    const params = status !== 'all' ? [status] : [];
    const [rows] = await db.query(`
      SELECT lr.id, lr.requested_tier, lr.current_tier, lr.status,
             lr.id_type, lr.purpose, lr.decline_reason, lr.created_at, lr.reviewed_at,
             u.full_name, u.email, u.id AS user_id, u.tier AS current_user_tier
      FROM limit_upgrade_requests lr
      JOIN users u ON u.id = lr.user_id
      ${where}
      ORDER BY lr.created_at DESC
      LIMIT 100
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/limit-upgrades/:id/approve', async (req, res) => {
  try {
    const [[lr]] = await db.query(
      'SELECT lr.*, u.full_name, u.email FROM limit_upgrade_requests lr JOIN users u ON u.id=lr.user_id WHERE lr.id=?',
      [req.params.id]
    );
    if (!lr) return res.status(404).json({ error: 'Request not found' });
    if (lr.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    await db.query('UPDATE users SET tier=? WHERE id=?', [lr.requested_tier, lr.user_id]);
    await db.query(
      "UPDATE limit_upgrade_requests SET status='approved', reviewed_at=NOW() WHERE id=?",
      [req.params.id]
    );
    await db.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,'⬆️',?)",
      [lr.user_id, `Your account has been upgraded to Tier ${lr.requested_tier}! Enjoy your new limits.`]
    );
    await sendMail(lr.email, `Account Upgraded to Tier ${lr.requested_tier}! 🎉`, `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#012169;padding:24px;text-align:center"><h1 style="color:#fff;margin:0">NexaBank</h1></div>
        <div style="padding:24px">
          <h2>Hi ${lr.full_name},</h2>
          <p>Your account has been upgraded to <strong>Tier ${lr.requested_tier}</strong>!</p>
          <p>Your new higher transaction limits are now active.</p>
        </div>
      </div>
    `);
    res.json({ message: `Upgraded to Tier ${lr.requested_tier}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/limit-upgrades/:id/decline', async (req, res) => {
  try {
    const { reason = 'Request declined by administrator' } = req.body;
    const [[lr]] = await db.query(
      'SELECT lr.*, u.full_name, u.email FROM limit_upgrade_requests lr JOIN users u ON u.id=lr.user_id WHERE lr.id=?',
      [req.params.id]
    );
    if (!lr) return res.status(404).json({ error: 'Request not found' });
    await db.query(
      "UPDATE limit_upgrade_requests SET status='declined', decline_reason=?, reviewed_at=NOW() WHERE id=?",
      [reason, req.params.id]
    );
    await db.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,'❌',?)",
      [lr.user_id, `Your tier upgrade request was declined. ${reason}`]
    );
    await sendMail(lr.email, 'Tier Upgrade Request Update', `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#012169;padding:24px;text-align:center"><h1 style="color:#fff;margin:0">NexaBank</h1></div>
        <div style="padding:24px">
          <h2>Hi ${lr.full_name},</h2>
          <p>Your tier upgrade request was declined.</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
      </div>
    `);
    res.json({ message: 'Request declined' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   TRANSACTIONS (admin view)
══════════════════════════════════════════════════════════════════════════════ */
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 30, search = '', type = 'all' } = req.query;
    const offset = (parseInt(page)-1) * parseInt(limit);
    const where = [];
    const params = [];

    if (search) {
      where.push('(u.full_name LIKE ? OR t.description LIKE ? OR t.reference LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (type !== 'all') { where.push('t.type = ?'); params.push(type); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await db.query(`
      SELECT t.id, t.type, t.amount, t.balance_after, t.description,
             t.category, t.status, t.reference, t.created_at,
             u.full_name, u.email, a.label AS account_label, a.type AS account_type
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      JOIN accounts a ON a.id = t.account_id
      ${whereStr}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM transactions t JOIN users u ON u.id=t.user_id ${whereStr}`,
      params
    );

    res.json({ transactions: rows, total, page: parseInt(page) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   ACCOUNTS (admin view)
══════════════════════════════════════════════════════════════════════════════ */
router.get('/accounts', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page)-1) * parseInt(limit);
    const like = `%${search}%`;
    const [rows] = await db.query(`
      SELECT a.id, a.label, a.type, a.card_number, a.balance,
             a.is_frozen, a.card_status, a.card_network, a.created_at,
             u.full_name, u.email, u.id AS user_id
      FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE u.full_name LIKE ? OR a.card_number LIKE ? OR u.email LIKE ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `, [like, like, like, parseInt(limit), offset]);

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.full_name LIKE ? OR a.card_number LIKE ? OR u.email LIKE ?',
      [like, like, like]
    );

    res.json({ accounts: rows, total, page: parseInt(page) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Freeze/unfreeze account
router.patch('/accounts/:id/freeze', async (req, res) => {
  try {
    const [[acct]] = await db.query('SELECT id, is_frozen FROM accounts WHERE id=?', [req.params.id]);
    if (!acct) return res.status(404).json({ error: 'Account not found' });
    const newVal = acct.is_frozen ? 0 : 1;
    await db.query('UPDATE accounts SET is_frozen=? WHERE id=?', [newVal, req.params.id]);
    res.json({ is_frozen: newVal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   SEND NOTIFICATION (broadcast or targeted)
══════════════════════════════════════════════════════════════════════════════ */
router.post('/notify', async (req, res) => {
  try {
    const { user_id, message, icon = '📢' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    if (user_id) {
      await db.query('INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)', [user_id, icon, message]);
    } else {
      // Broadcast to all active users
      const [users] = await db.query('SELECT id FROM users WHERE is_active=1');
      for (const u of users) {
        await db.query('INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)', [u.id, icon, message]);
      }
    }
    res.json({ message: user_id ? 'Notification sent' : `Broadcast sent to ${await db.query('SELECT COUNT(*) FROM users WHERE is_active=1').then(r => r[0][0]['COUNT(*)'])} users` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   LOAN APPLICATIONS (admin view)
══════════════════════════════════════════════════════════════════════════════ */
// GET /admin/loans - Get all loan applications
router.get('/loans', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT l.*, u.full_name, u.email 
      FROM loan_applications l
      JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('Error fetching loans:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/loans/:id - Get single loan application
router.get('/loans/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT l.*, u.full_name, u.email 
      FROM loan_applications l
      JOIN users u ON u.id = l.user_id
      WHERE l.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.json(rows[0]);
  } catch (e) {
    console.error('Error fetching loan:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/loans/:id/approve - Approve a loan
router.post('/loans/:id/approve', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Get loan details
    const [[loan]] = await conn.query(
      'SELECT * FROM loan_applications WHERE id = ?', 
      [req.params.id]
    );
    
    if (!loan) {
      await conn.rollback();
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    if (loan.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ error: 'Loan already processed' });
    }
    
    // Update loan status
    await conn.query(
      "UPDATE loan_applications SET status = 'approved', reviewed_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    
    // Find user's checking account
    const [[account]] = await conn.query(
      "SELECT id FROM accounts WHERE user_id = ? AND type = 'checking' LIMIT 1",
      [loan.user_id]
    );
    
    if (account) {
      // Disburse funds to checking account
      await conn.query(
        'UPDATE accounts SET balance = balance + ? WHERE id = ?',
        [loan.amount, account.id]
      );
      
      // Create transaction record
      const ref = 'LOAN-' + Date.now();
      await conn.query(
        `INSERT INTO transactions (id, account_id, user_id, type, amount, balance_after, description, category, reference)
         VALUES (UUID(), ?, ?, 'credit', ?, (SELECT balance FROM accounts WHERE id = ?), 
         'Loan Disbursement', 'loan', ?)`,
        [account.id, loan.user_id, loan.amount, account.id, ref]
      );
    }
    
    // Add notification for user
    await conn.query(
      `INSERT INTO notifications (user_id, icon, message) 
       VALUES (?, '✅', ?)`,
      [loan.user_id, `Your ${loan.loan_type} loan of $${loan.amount} has been approved and disbursed to your checking account!`]
    );
    
    await conn.commit();
    res.json({ message: 'Loan approved and disbursed successfully' });
  } catch (e) {
    await conn.rollback();
    console.error('Error approving loan:', e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// POST /admin/loans/:id/decline - Decline a loan
router.post('/loans/:id/decline', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const { reason } = req.body;
    
    const [[loan]] = await conn.query(
      'SELECT * FROM loan_applications WHERE id = ?', 
      [req.params.id]
    );
    
    if (!loan) {
      await conn.rollback();
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    if (loan.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ error: 'Loan already processed' });
    }
    
    await conn.query(
      "UPDATE loan_applications SET status = 'declined', decline_reason = ?, reviewed_at = NOW() WHERE id = ?",
      [reason || 'Declined by administrator', req.params.id]
    );
    
    // Add notification for user
    await conn.query(
      `INSERT INTO notifications (user_id, icon, message) 
       VALUES (?, '❌', ?)`,
      [loan.user_id, `Your loan application for $${loan.amount} was declined. ${reason ? 'Reason: ' + reason : ''}`]
    );
    
    await conn.commit();
    res.json({ message: 'Loan declined' });
  } catch (e) {
    await conn.rollback();
    console.error('Error declining loan:', e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});
module.exports = router;