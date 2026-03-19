const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const db       = require('../db/pool');
const { requireAuth }    = require('../middleware/auth');
const { TIERS, checkLimit } = require('../lib/tierLimits');

router.use(requireAuth);

/* ─── GET /limits/me — current tier + limits + usage ─────────────────────── */
router.get('/me', async (req, res) => {
  try {
    const [userRows] = await db.query(
      'SELECT tier FROM users WHERE id = ?', [req.user.id]
    );
    const tier = userRows[0]?.tier || 1;

    // Latest pending request if any
    const [pending] = await db.query(
      `SELECT id, requested_tier, status, decline_reason, created_at
       FROM limit_upgrade_requests
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    res.json({ tier, limits: TIERS[tier], tiers: TIERS, pending_request: pending[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ─── POST /limits/upgrade — submit upgrade request ─────────────────────── */
router.post('/upgrade', async (req, res) => {
  try {
    const {
      requested_tier,
      id_document,      // base64 string of uploaded file
      id_type,          // "Driver's Licence" | "Passport" | "National ID" etc.
      credit_history,
      proof_of_income,  // required for tier 3
      purpose,
    } = req.body;

    if (!requested_tier || !purpose) {
      return res.status(400).json({ error: 'requested_tier and purpose are required' });
    }

    const [userRows] = await db.query(
      'SELECT tier, created_at FROM users WHERE id = ?', [req.user.id]
    );
    const currentTier = userRows[0]?.tier || 1;
    const userCreated = new Date(userRows[0]?.created_at);

    // Must upgrade sequentially
    if (parseInt(requested_tier) !== currentTier + 1) {
      return res.status(400).json({
        error: `You must upgrade tiers sequentially. You are on Tier ${currentTier}, so you can only request Tier ${currentTier + 1}.`,
      });
    }
    if (requested_tier > 3) {
      return res.status(400).json({ error: 'Tier 3 is the maximum tier.' });
    }

    // Block duplicate pending request
    const [existing] = await db.query(
      `SELECT id FROM limit_upgrade_requests
       WHERE user_id = ? AND status = 'pending'`,
      [req.user.id]
    );
    if (existing.length) {
      return res.status(400).json({
        error: 'You already have a pending upgrade request. Please wait for admin review.',
      });
    }

    // ── Tier 2: must have been a customer for at least 2 months ─────────────
    if (parseInt(requested_tier) === 2) {
      const now = new Date();
      const monthsDiff =
        (now.getFullYear() - userCreated.getFullYear()) * 12 +
        (now.getMonth() - userCreated.getMonth());

      if (monthsDiff < 2) {
        // Auto-decline immediately
        const reqId = crypto.randomUUID();
        await db.query(
          `INSERT INTO limit_upgrade_requests
           (id, user_id, requested_tier, current_tier, status, id_type, id_document,
            credit_history, purpose, decline_reason, reviewed_at)
           VALUES (?,?,?,?,'declined',?,?,?,?,?,NOW())`,
          [
            reqId, req.user.id, 2, currentTier,
            id_type || null, id_document || null,
            credit_history || null, purpose,
            `Account must be at least 2 months old to upgrade to Tier 2. Your account is ${monthsDiff < 1 ? 'less than 1 month' : monthsDiff + ' month(s)'} old.`,
          ]
        );
        await db.query(
          "INSERT INTO notifications (user_id, icon, message) VALUES (?,?,?)",
          [req.user.id, '❌',
           `Tier 2 upgrade declined: You need to bank with NexaBank for at least 2 months first. Your account is ${monthsDiff < 1 ? 'less than 1 month' : monthsDiff + ' month(s)'} old.`]
        );
        return res.status(400).json({
          error: `Your account must be at least 2 months old to upgrade to Tier 2. ` +
                 `Your account is ${monthsDiff < 1 ? 'less than 1 month' : monthsDiff + ' month(s)'} old. ` +
                 `Please continue banking with us and try again later.`,
          auto_declined: true,
        });
      }
    }

    // ── Tier 3: proof of income required ────────────────────────────────────
    if (parseInt(requested_tier) === 3 && !proof_of_income) {
      return res.status(400).json({ error: 'Proof of Income document is required for Tier 3.' });
    }

    const reqId = crypto.randomUUID();
    await db.query(
      `INSERT INTO limit_upgrade_requests
       (id, user_id, requested_tier, current_tier, status, id_type, id_document,
        credit_history, proof_of_income, purpose)
       VALUES (?,?,?,?,'pending',?,?,?,?,?)`,
      [
        reqId, req.user.id, parseInt(requested_tier), currentTier,
        id_type || null, id_document || null,
        credit_history || null, proof_of_income || null, purpose,
      ]
    );

    await db.query(
      "INSERT INTO notifications (user_id, icon, message) VALUES (?,?,?)",
      [req.user.id, '⏳',
       `Your Tier ${requested_tier} upgrade request has been submitted and is pending admin review.`]
    );

    res.status(201).json({
      message: 'Upgrade request submitted. You will be notified once reviewed.',
      request_id: reqId,
      status: 'pending',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;