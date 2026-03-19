const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db     = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function maskCard(n) {
  const clean = String(n).trim();
  return `•••• ${clean.slice(-4)}`;
}

function genCardNumber() {
  const first = String(Math.floor(Math.random() * 9) + 1);
  const rest  = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
  return first + rest;
}

function getExpiry(createdAt) {
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + 4);
  return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getFullYear()).slice(-2);
}

// GET /accounts
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, label, type, card_number, balance, currency, card_color,
              is_frozen, card_network, card_name, card_status, created_at
       FROM accounts WHERE user_id = ? ORDER BY created_at ASC`, [req.user.id]);
    res.json(rows.map(a => ({ ...a, card_number: maskCard(a.card_number), is_frozen: !!a.is_frozen })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /accounts/card-request/status
router.get('/card-request/status', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM card_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', 
      [req.user.id]
    );
    const req_ = rows[0] || null;
    
    // If the latest request is approved, check if card exists
    if (req_ && req_.status === 'approved') {
      const [cardRows] = await db.query(
        "SELECT id FROM accounts WHERE user_id = ? AND type='credit' AND card_network IS NOT NULL LIMIT 1",
        [req.user.id]
      );
      if (cardRows.length > 0) {
        return res.json(null);
      }
      return res.json(req_);
    }
    
    res.json(req_);
  } catch (err) { 
    console.error('Card status error:', err);
    res.status(500).json({ error: 'Server error' }); 
  }
});

// GET /accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, label, type, card_number, balance, currency, card_color,
              is_frozen, card_network, card_name, card_status, created_at
       FROM accounts WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    const a = rows[0];
    res.json({ ...a, card_number: maskCard(a.card_number), is_frozen: !!a.is_frozen });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /accounts/:id/freeze
router.patch('/:id/freeze', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, is_frozen FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    const newState = rows[0].is_frozen ? 0 : 1;
    await db.query('UPDATE accounts SET is_frozen = ? WHERE id = ?', [newState, req.params.id]);
    res.json({ is_frozen: !!newState });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /accounts/card-request
router.post('/card-request', async (req, res) => {
  try {
    const { card_network, card_name } = req.body;
    if (!card_network || !card_name?.trim()) return res.status(400).json({ error: 'Card network and name are required' });
    if (!['visa','mastercard','amex'].includes(card_network)) return res.status(400).json({ error: 'Invalid card network' });
    const [existing] = await db.query("SELECT id FROM accounts WHERE user_id = ? AND type = 'credit'", [req.user.id]);
    if (existing.length >= 2) return res.status(400).json({ error: 'Maximum 2 credit cards allowed' });
    const [pending] = await db.query("SELECT id FROM card_requests WHERE user_id = ? AND status = 'pending'", [req.user.id]);
    if (pending.length) return res.status(400).json({ error: 'You already have a pending card request' });
    const reqId = crypto.randomUUID();
    await db.query('INSERT INTO card_requests (id, user_id, card_network, card_name) VALUES (?,?,?,?)', [reqId, req.user.id, card_network, card_name.trim()]);
    await db.query("INSERT INTO notifications (user_id, icon, message) VALUES (?,?,?)",
      [req.user.id, '💳', `Your ${card_network.toUpperCase()} card request is under review.`]);
    res.status(201).json({ id: reqId, status: 'pending' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /accounts/card-request/:id/approve  (admin)
router.post('/card-request/:id/approve', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Get the card request
    const [reqRows] = await conn.query("SELECT * FROM card_requests WHERE id = ? AND status = 'pending'", [req.params.id]);
    if (!reqRows.length) { 
      await conn.rollback(); 
      return res.status(404).json({ error: 'Pending request not found' }); 
    }
    const cardReq = reqRows[0];
    
    // Check for checking account with sufficient balance
    const [acctRows] = await conn.query(
      "SELECT * FROM accounts WHERE user_id = ? AND type='checking' AND is_frozen=0 ORDER BY created_at ASC LIMIT 1 FOR UPDATE",
      [cardReq.user_id]);
      
    if (!acctRows.length || parseFloat(acctRows[0].balance) < 1) {
      await conn.query("UPDATE card_requests SET status='declined', decline_reason=?, reviewed_at=NOW() WHERE id=?",
        ['Insufficient balance. A $1.00 processing fee is required.', req.params.id]);
      await conn.query("INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)",
        [cardReq.user_id, '❌', 'Card request declined: Insufficient balance for $1.00 processing fee.']);
      await conn.commit();
      return res.status(400).json({ error: 'Declined — insufficient balance', auto_declined: true });
    }
    
    const checkingAcct = acctRows[0];
    const newBalance = parseFloat(checkingAcct.balance) - 1;
    const ref = `CARD${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    
    // Deduct fee from checking
    await conn.query('UPDATE accounts SET balance=? WHERE id=?', [newBalance, checkingAcct.id]);
    
    // Record fee transaction
    await conn.query(
      `INSERT INTO transactions (id,account_id,user_id,type,amount,balance_after,description,category,status,reference)
       VALUES (?,?,?,'debit',?,?,'Card issuance fee','fee','completed',?)`,
      [crypto.randomUUID(), checkingAcct.id, cardReq.user_id, -1, newBalance, ref]);
    
    // Create the credit card account
    const accId = crypto.randomUUID();
    const cardNo = genCardNumber();
    const colors = { visa:'#1a3a6b', mastercard:'#1a1a2e', amex:'#1a4a3a' };
    
    // FIXED: Make sure both card_network and card_name are inserted
    await conn.query(
      `INSERT INTO accounts (id,user_id,label,type,card_number,balance,card_color,card_network,card_name,card_status)
       VALUES (?,?,?,?,?,0,?,?,?,'active')`,
      [accId, 
       cardReq.user_id,
       cardReq.card_network.charAt(0).toUpperCase() + cardReq.card_network.slice(1) + ' Card',
       'credit', 
       cardNo, 
       colors[cardReq.card_network] || '#1a3a6b', 
       cardReq.card_network,  // This sets card_network
       cardReq.card_name]      // This sets card_name
    );
    
    // Update card request status
    await conn.query("UPDATE card_requests SET status='approved', reviewed_at=NOW() WHERE id=?", [req.params.id]);
    
    // Send notifications
    await conn.query("INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)",
      [cardReq.user_id, '✅', `Your ${cardReq.card_network.toUpperCase()} card has been approved! $1.00 fee charged.`]);
    
    await conn.commit();
    
    // Return the newly created account data
    const [newCard] = await conn.query(
      'SELECT id, label, type, card_number, card_network, card_name, card_status FROM accounts WHERE id = ?',
      [accId]
    );
    
    res.json({ 
      message: 'Card approved and issued', 
      account_id: accId,
      account: newCard[0]  // Return the full account data
    });
    
  } catch (err) { 
    await conn.rollback(); 
    console.error('Card approval error:', err); 
    res.status(500).json({ error: 'Server error: ' + err.message }); 
  }
  finally { conn.release(); }
});

// POST /accounts/card-request/:id/decline  (admin)
router.post('/card-request/:id/decline', async (req, res) => {
  try {
    const { reason = 'Request declined by administrator' } = req.body;
    const [rows] = await db.query("SELECT * FROM card_requests WHERE id=? AND status='pending'", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    await db.query("UPDATE card_requests SET status='declined', decline_reason=?, reviewed_at=NOW() WHERE id=?", [reason, req.params.id]);
    await db.query("INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)",
      [rows[0].user_id, '❌', `Card request declined: ${reason}`]);
    res.json({ message: 'Declined' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /accounts/:id/card-status
router.patch('/:id/card-status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active','frozen','blocked'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const [rows] = await db.query("SELECT id,card_status FROM accounts WHERE id=? AND user_id=? AND type='credit'", [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Card not found' });
    if (rows[0].card_status === 'blocked') return res.status(400).json({ error: 'A blocked card cannot be modified.' });
    await db.query('UPDATE accounts SET card_status=? WHERE id=?', [status, req.params.id]);
    const icons = { active:'✅', frozen:'❄️', blocked:'🔒' };
    const msgs  = { active:'Card unfrozen successfully', frozen:'Card frozen successfully', blocked:'Card permanently blocked' };
    await db.query("INSERT INTO notifications (user_id,icon,message) VALUES (?,?,?)", [req.user.id, icons[status], msgs[status]]);
    res.json({ card_status: status });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /accounts/:id/set-pin
router.post('/:id/set-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    const [rows] = await db.query("SELECT id FROM accounts WHERE id=? AND user_id=? AND type='credit'", [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Card not found' });
    const pinHash = await bcrypt.hash(pin, 10);
    await db.query('UPDATE accounts SET card_pin_hash=? WHERE id=?', [pinHash, req.params.id]);
    res.json({ message: 'PIN set successfully' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /accounts/:id/card-details
router.get('/:id/card-details', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT card_number, card_network, card_name, card_status, card_pin_hash, label, balance, created_at
       FROM accounts WHERE id=? AND user_id=? AND type='credit'`, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Card not found' });
    const c = rows[0];
    const raw = String(c.card_number).trim();
    const masked = raw.slice(0,4) + ' •••• •••• ' + raw.slice(-4);
    res.json({
      masked_number: masked,
      card_network:  c.card_network,
      card_name:     c.card_name,
      card_status:   c.card_status,
      has_pin:       !!c.card_pin_hash,
      label:         c.label,
      balance:       c.balance,
      expiry:        getExpiry(c.created_at),
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /accounts/:id/limit (kept for compatibility)
router.patch('/:id/limit', async (req, res) => {
  res.json({ message: 'Limits are managed by your account tier' });
});

// GET /accounts/:id/details
router.get('/:id/details', async (req, res) => {
  try {
    const [acctRows] = await db.query('SELECT * FROM accounts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!acctRows.length) return res.status(404).json({ error: 'Account not found' });
    const acct = acctRows[0];
    const [userRows] = await db.query('SELECT full_name FROM users WHERE id=?', [req.user.id]);
    const raw = String(acct.card_number).trim();
    const full_account_number = raw.length === 12
      ? raw.slice(0,3)+' '+raw.slice(3,6)+' '+raw.slice(6)
      : raw.match(/.{1,4}/g)?.join(' ') || raw;
    res.json({
      id: acct.id, label: acct.label, type: acct.type,
      full_account_number, account_holder: userRows[0]?.full_name || '',
      balance: acct.balance, currency: acct.currency || 'USD',
      is_frozen: !!acct.is_frozen, created_at: acct.created_at,
      bank_name: 'NexaBank', bank_address: '1 NexaBank Plaza, New York, NY 10001, USA',
      routing_number: '021000021', swift_code: 'NXBKUS33', currency: acct.currency || 'USD',
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;