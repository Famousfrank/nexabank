const bcrypt = require('bcryptjs');
const router = require('express').Router();
const crypto = require('crypto');
const db     = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { checkLimit }  = require('../lib/tierLimits');

router.use(requireAuth);

// GET /transactions
router.get('/', async (req, res) => {
  try {
    const { account_id, category, type, limit = 50, offset = 0, search } = req.query;
    let sql = `SELECT t.*, a.label AS account_label
               FROM transactions t
               JOIN accounts a ON t.account_id = a.id
               WHERE t.user_id = ?`;
    const params = [req.user.id];
    if (account_id) { sql += ' AND t.account_id = ?'; params.push(account_id); }
    if (category)   { sql += ' AND t.category = ?';   params.push(category); }
    if (type)       { sql += ' AND t.type = ?';        params.push(type); }
    if (search)     { sql += ' AND t.description LIKE ?'; params.push(`%${search}%`); }
    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /transactions/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /transactions/deposit
router.post('/deposit', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { account_id, amount, description } = req.body;
    const amt = parseFloat(amount);
    if (!account_id || !amt || amt <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid deposit details' });
    }
    const [acctRows] = await conn.query(
      'SELECT * FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE',
      [account_id, req.user.id]
    );
    if (!acctRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Account not found' }); }
    const acct = acctRows[0];
    if (acct.is_frozen) { await conn.rollback(); return res.status(400).json({ error: 'Account is frozen' }); }

    // ── Tier limit check ──────────────────────────────────────────────────────
    const depLimit = await checkLimit(conn, req.user.id, account_id, 'deposit', amt);
    if (!depLimit.ok) { await conn.rollback(); return res.status(400).json({ error: depLimit.message }); }

    const newBalance = parseFloat(acct.balance) + amt;
    const ref    = `DEP${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const desc   = description || `Deposit to ${acct.label}`;
    const txnId  = crypto.randomUUID();

    await conn.query(
      `INSERT INTO transactions (id, account_id, user_id, type, amount, balance_after, description, category, status, reference)
       VALUES (?, ?, ?, 'credit', ?, ?, ?, 'deposit', 'completed', ?)`,
      [txnId, account_id, req.user.id, amt, newBalance, desc, ref]
    );
    await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account_id]);
    await conn.query(
      'INSERT INTO notifications (user_id, icon, message) VALUES (?, ?, ?)',
      [req.user.id, '💰', `$${amt.toFixed(2)} deposited to your ${acct.label}. Ref: ${ref}`]
    );
    await conn.commit();
    const [txn] = await db.query('SELECT * FROM transactions WHERE id = ?', [txnId]);
    res.status(201).json({ transaction: txn[0], reference: ref, new_balance: newBalance });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Deposit failed' });
  } finally {
    conn.release();
  }
});

// POST /transactions/transfer
router.post('/transfer', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const {
      from_account_id, to_identifier, amount, description, note,
      external, external_type, recipient_name, recipient_bank,
      recipient_account, routing_number, bank_address,
      country, swift_code, iban,
      transaction_pin,
    } = req.body;
    const amt = parseFloat(amount);
    if (!from_account_id || !amt || amt <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid transfer details' });
    }

    // ── PIN verification ────────────────────────────────────────────────────
    const [pinRows] = await conn.query('SELECT transaction_pin_hash FROM users WHERE id=?', [req.user.id]);
    if (pinRows[0]?.transaction_pin_hash) {
      if (!transaction_pin) {
        await conn.rollback();
        return res.status(403).json({ error: 'Transaction PIN required', pin_required: true });
      }
      const pinValid = await bcrypt.compare(String(transaction_pin), pinRows[0].transaction_pin_hash);
      if (!pinValid) {
        await conn.rollback();
        return res.status(403).json({ error: 'Incorrect transaction PIN', pin_required: true });
      }
    }

    // ── External (domestic / international) transfer ──────────────────────────
    if (external) {
      const [srcRows] = await conn.query(
        'SELECT * FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE',
        [from_account_id, req.user.id]
      );
      if (!srcRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Source account not found' }); }
      const src = srcRows[0];
      if (src.is_frozen)    { await conn.rollback(); return res.status(400).json({ error: 'Source account is frozen' }); }
      if (src.balance < amt){ await conn.rollback(); return res.status(400).json({ error: 'Insufficient funds' }); }

      // ── Tier limit check ────────────────────────────────────────────────────
      const extLimit = await checkLimit(conn, req.user.id, from_account_id, 'transfer', amt);
      if (!extLimit.ok) { await conn.rollback(); return res.status(400).json({ error: extLimit.message }); }

      const newBalance = parseFloat(src.balance) - amt;
      const ref        = `EXT${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const desc       = description || (external_type === 'international'
        ? `International wire to ${recipient_name}`
        : `Domestic transfer to ${recipient_name}`);
      const txnId      = crypto.randomUUID();
      const meta       = JSON.stringify({
        external_type, recipient_name, recipient_bank,
        recipient_account, routing_number, bank_address,
        country, swift_code, iban, note: note || null,
      });

      await conn.query(
        `INSERT INTO transactions (id, account_id, user_id, type, amount, balance_after, description, category, status, reference, metadata)
         VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, 'completed', ?, ?)`,
        [txnId, from_account_id, req.user.id, -amt, newBalance, desc, external_type || 'transfer', ref, meta]
      );
      await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, from_account_id]);
      await conn.query(
        'INSERT INTO notifications (user_id, icon, message) VALUES (?, ?, ?)',
        [req.user.id, '💸', `$${amt.toFixed(2)} sent via ${external_type === 'international' ? 'international wire' : 'domestic transfer'} to ${recipient_name}. Ref: ${ref}`]
      );
      await conn.commit();
      const [txn] = await db.query('SELECT * FROM transactions WHERE id = ?', [txnId]);
      return res.status(201).json({ transaction: txn[0], reference: ref });
    }

    if (!to_identifier) {
      await conn.rollback();
      return res.status(400).json({ error: 'Destination required' });
    }
    const [srcRows] = await conn.query(
      'SELECT * FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE',
      [from_account_id, req.user.id]
    );
    if (!srcRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Source account not found' }); }
    const src = srcRows[0];
    if (src.is_frozen) { await conn.rollback(); return res.status(400).json({ error: 'Source account is frozen' }); }
    if (src.balance < amt) { await conn.rollback(); return res.status(400).json({ error: 'Insufficient funds' }); }

    // ── Tier limit check ──────────────────────────────────────────────────────
    const intLimit = await checkLimit(conn, req.user.id, from_account_id, 'transfer', amt);
    if (!intLimit.ok) { await conn.rollback(); return res.status(400).json({ error: intLimit.message }); }

    let dest = null;
    const [destById] = await conn.query('SELECT * FROM accounts WHERE id = ? FOR UPDATE', [to_identifier]);
    if (destById.length) {
      dest = destById[0];
    } else {
      const [destByCard] = await conn.query('SELECT * FROM accounts WHERE card_number LIKE ? FOR UPDATE', [`%${to_identifier}`]);
      if (destByCard.length) dest = destByCard[0];
    }
    if (!dest) { await conn.rollback(); return res.status(404).json({ error: 'Destination account not found' }); }
    if (dest.is_frozen) { await conn.rollback(); return res.status(400).json({ error: 'Destination account is frozen' }); }

    const ref            = `TXN${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const newSrcBalance  = parseFloat(src.balance) - amt;
    const newDestBalance = parseFloat(dest.balance) + amt;
    const desc           = description || `Transfer to ${dest.label}`;
    const meta           = note ? JSON.stringify({ note }) : null;

    const srcTxnId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO transactions (id, account_id, user_id, type, amount, balance_after, description, category, status, reference, metadata)
       VALUES (?, ?, ?, 'transfer', ?, ?, ?, 'transfer', 'completed', ?, ?)`,
      [srcTxnId, src.id, req.user.id, -amt, newSrcBalance, desc, ref, meta]
    );
    await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [newSrcBalance, src.id]);

    const destTxnId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO transactions (id, account_id, user_id, type, amount, balance_after, description, category, status, reference, metadata)
       VALUES (?, ?, ?, 'transfer', ?, ?, ?, 'transfer', 'completed', ?, ?)`,
      [destTxnId, dest.id, dest.user_id, amt, newDestBalance, `Transfer from ${src.label}`, ref, meta]
    );
    await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [newDestBalance, dest.id]);

    await conn.query(
      'INSERT INTO notifications (user_id, icon, message) VALUES (?, ?, ?)',
      [req.user.id, '💸', `You sent $${amt.toFixed(2)} from ${src.label}. Ref: ${ref}`]
    );
    if (dest.user_id !== req.user.id) {
      await conn.query(
        'INSERT INTO notifications (user_id, icon, message) VALUES (?, ?, ?)',
        [dest.user_id, '💰', `You received $${amt.toFixed(2)} in your ${dest.label}. Ref: ${ref}`]
      );
    }
    await conn.commit();
    const [txn] = await db.query('SELECT * FROM transactions WHERE id = ?', [srcTxnId]);
    res.status(201).json({ transaction: txn[0], reference: ref });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Transfer failed' });
  } finally {
    conn.release();
  }
});

module.exports = router;