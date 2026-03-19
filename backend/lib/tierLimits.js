/**
 * tierLimits.js
 * Pure helper — no Express, no circular dependencies.
 * Imported by both limits.js (route) and transactions.js (enforcement).
 */

/* ─── Tier Definitions ────────────────────────────────────────────────────────
   All amounts in USD.  transfer / deposit / withdraw × daily / monthly
──────────────────────────────────────────────────────────────────────────────*/
const TIERS = {
  1: {
    label:    'Tier 1 — Starter',
    color:    '#6b7280',
    transfer: { daily:       2_000, monthly:    20_000 },
    deposit:  { daily:       5_000, monthly:    25_000 },
    withdraw: { daily:       5_000, monthly:    20_000 },
  },
  2: {
    label:    'Tier 2 — Standard',
    color:    '#3b82f6',
    transfer: { daily:      20_000, monthly:   100_000 },
    deposit:  { daily:      50_000, monthly:   500_000 },
    withdraw: { daily:      50_000, monthly:   500_000 },
  },
  3: {
    label:    'Tier 3 — Premium',
    color:    '#f59e0b',
    transfer: { daily:   1_000_000, monthly:   500_000 },
    deposit:  { daily:   5_000_000, monthly: 20_000_000 },
    withdraw: { daily:   5_000_000, monthly:   200_000 },
  },
};

/**
 * checkLimit(conn, userId, accountId, txType, amount)
 *
 * @param conn     - active MySQL connection (inside a transaction)
 * @param userId   - authenticated user id
 * @param accountId - the account being debited/credited
 * @param txType   - 'transfer' | 'deposit' | 'withdraw'
 * @param amount   - positive number (the amount of this single transaction)
 * @returns { ok: true } or { ok: false, message: string }
 */
async function checkLimit(conn, userId, accountId, txType, amount) {
  const [userRows] = await conn.query(
    'SELECT tier FROM users WHERE id = ?', [userId]
  );
  const tier   = userRows[0]?.tier || 1;
  const limits = TIERS[tier]?.[txType];
  if (!limits) return { ok: true }; // unknown type — skip

  const today     = new Date();
  const dayStr    = today.toISOString().slice(0, 10);   // YYYY-MM-DD
  const monthStr  = today.toISOString().slice(0, 7);    // YYYY-MM

  if (txType === 'deposit') {
    // Deposits: amount is positive (money IN)
    const [d] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE account_id = ? AND category = 'deposit'
         AND DATE(created_at) = ?`,
      [accountId, dayStr]
    );
    if (parseFloat(d[0].total) + amount > limits.daily) {
      return {
        ok: false,
        message: `Daily deposit limit of $${limits.daily.toLocaleString()} (Tier ${tier}) reached. ` +
                 `Used today: $${parseFloat(d[0].total).toLocaleString()}.`,
      };
    }
    const [m] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE account_id = ? AND category = 'deposit'
         AND DATE_FORMAT(created_at, '%Y-%m') = ?`,
      [accountId, monthStr]
    );
    if (parseFloat(m[0].total) + amount > limits.monthly) {
      return {
        ok: false,
        message: `Monthly deposit limit of $${limits.monthly.toLocaleString()} (Tier ${tier}) reached. ` +
                 `Used this month: $${parseFloat(m[0].total).toLocaleString()}.`,
      };
    }
    return { ok: true };
  }

  // transfer / withdraw: amount goes OUT (stored as negative in DB)
  const catClause = txType === 'transfer'
    ? `category IN ('transfer', 'domestic', 'international')`
    : `category = 'withdrawal'`;

  const [d] = await conn.query(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM transactions
     WHERE account_id = ? AND ${catClause}
       AND amount < 0 AND DATE(created_at) = ?`,
    [accountId, dayStr]
  );
  if (parseFloat(d[0].total) + amount > limits.daily) {
    return {
      ok: false,
      message: `Daily ${txType} limit of $${limits.daily.toLocaleString()} (Tier ${tier}) reached. ` +
               `Used today: $${parseFloat(d[0].total).toLocaleString()}.`,
    };
  }

  const [mo] = await conn.query(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM transactions
     WHERE account_id = ? AND ${catClause}
       AND amount < 0 AND DATE_FORMAT(created_at, '%Y-%m') = ?`,
    [accountId, monthStr]
  );
  if (parseFloat(mo[0].total) + amount > limits.monthly) {
    return {
      ok: false,
      message: `Monthly ${txType} limit of $${limits.monthly.toLocaleString()} (Tier ${tier}) reached. ` +
               `Used this month: $${parseFloat(mo[0].total).toLocaleString()}.`,
    };
  }

  return { ok: true };
}

module.exports = { TIERS, checkLimit };