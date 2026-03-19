const router  = require('express').Router();
const crypto  = require('crypto');
const db      = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { transporter } = require('../services/otp.service');

router.use(requireAuth);

/* ── helpers ──────────────────────────────────────────────────────────────── */
function genRef() {
  return 'NXB-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

/* ── send status email ────────────────────────────────────────────────────── */
async function sendLoanStatusEmail(to, userName, status, loan) {
  if (!process.env.SMTP_USER) {
    console.log(`\n📧 Loan status email → ${to}: status=${status}\n`);
    return;
  }
  const configs = {
    under_review: {
      subject: '🔍 NexaBank – Your Loan Application is Under Review',
      banner:  'linear-gradient(135deg,#0e7490,#0891b2)',
      icon: '🔍', title: 'Application Under Review',
      body: `Your ${loan.loan_type} loan application for <strong>${fmt(loan.amount)}</strong> is now being reviewed by our loan specialists.`,
    },
    specialist_contact: {
      subject: '📞 NexaBank – A Loan Specialist Will Contact You',
      banner:  'linear-gradient(135deg,#7c3aed,#6d28d9)',
      icon: '📞', title: 'Specialist Will Be in Touch',
      body: `A NexaBank loan specialist has been assigned to your <strong>${fmt(loan.amount)}</strong> ${loan.loan_type} loan application. Expect a call within <strong>1 business day</strong>.`,
    },
    approved: {
      subject: '✅ NexaBank – Your Loan Has Been Approved!',
      banner:  'linear-gradient(135deg,#1a7f4b,#059669)',
      icon: '✅', title: 'Loan Approved & Disbursed!',
      body: `Congratulations! Your ${loan.loan_type} loan of <strong>${fmt(loan.amount)}</strong> has been approved and disbursed directly to your NexaBank checking account. Ref: <strong>${loan.reference_no}</strong>`,
    },
    declined: {
      subject: '❌ NexaBank – Loan Application Update',
      banner:  'linear-gradient(135deg,#c8102e,#dc2626)',
      icon: '❌', title: 'Application Not Approved',
      body: `Unfortunately, your ${loan.loan_type} loan application for <strong>${fmt(loan.amount)}</strong> was not approved.${loan.decline_reason ? ` Reason: <em>${loan.decline_reason}</em>` : ''} You may reapply after 30 days.`,
    },
  };
  const cfg = configs[status];
  if (!cfg) return;

  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#f8f9fb;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:${cfg.banner};padding:28px 24px;text-align:center">
        <div style="font-size:36px;margin-bottom:8px">${cfg.icon}</div>
        <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800">${cfg.title}</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px">NexaBank Loan Services</p>
      </div>
      <div style="padding:28px 24px">
        <p style="color:#444;font-size:15px;margin:0 0 16px">Hi <strong>${userName}</strong>,</p>
        <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px">${cfg.body}</p>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="color:#888;padding:6px 0;border-bottom:1px solid #f5f5f5">Reference</td>
                <td style="text-align:right;font-weight:700;color:#012169;font-family:monospace;padding:6px 0;border-bottom:1px solid #f5f5f5">${loan.reference_no}</td></tr>
            <tr><td style="color:#888;padding:6px 0;border-bottom:1px solid #f5f5f5">Loan Type</td>
                <td style="text-align:right;font-weight:600;color:#111;padding:6px 0;border-bottom:1px solid #f5f5f5;text-transform:capitalize">${loan.loan_type} Loan</td></tr>
            <tr><td style="color:#888;padding:6px 0;border-bottom:1px solid #f5f5f5">Amount</td>
                <td style="text-align:right;font-weight:700;color:#012169;padding:6px 0;border-bottom:1px solid #f5f5f5">${fmt(loan.amount)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Term</td>
                <td style="text-align:right;font-weight:600;color:#111;padding:6px 0">${loan.term_months} months</td></tr>
          </table>
        </div>
      </div>
      <div style="background:#f0f2f5;padding:14px 24px;text-align:center">
        <p style="color:#9ca3af;font-size:11px;margin:0">NexaBank · Secure Banking · This is an automated message</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from:    `"NexaBank" <${process.env.SMTP_USER}>`,
    to, subject: cfg.subject, html,
  });
}

/* ── POST /loans ─────────────────────────────────────────────────────────── */
router.post('/', async (req, res) => {
  const {
    loan_type, amount, term_months, purpose,
    first_name, last_name, dob, address, employ_status,
    annual_income, monthly_debt, credit_score_range, employer,
  } = req.body;

  if (!loan_type || !['personal','auto','mortgage','business'].includes(loan_type))
    return res.status(400).json({ error: 'Invalid loan type.' });
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Invalid loan amount.' });
  if (!term_months || ![12,24,36,48,60].includes(Number(term_months)))
    return res.status(400).json({ error: 'Invalid loan term.' });
  if (!first_name?.trim() || !last_name?.trim())
    return res.status(400).json({ error: 'Full name is required.' });
  if (!dob) return res.status(400).json({ error: 'Date of birth is required.' });
  if (!address?.trim()) return res.status(400).json({ error: 'Address is required.' });
  if (!employ_status?.trim()) return res.status(400).json({ error: 'Employment status is required.' });
  if (!annual_income || isNaN(annual_income) || parseFloat(annual_income) <= 0)
    return res.status(400).json({ error: 'Annual income is required.' });
  if (!credit_score_range?.trim()) return res.status(400).json({ error: 'Credit score range is required.' });

  const [existing] = await db.query(
    "SELECT id FROM loan_applications WHERE user_id=? AND status IN ('pending','under_review','specialist_contact')",
    [req.user.id]
  );
  if (existing.length > 0)
    return res.status(409).json({ error: 'You already have a pending loan application.' });

  const id = crypto.randomUUID();
  const ref = genRef();

  await db.query(
    `INSERT INTO loan_applications
      (id,user_id,loan_type,amount,term_months,purpose,
       first_name,last_name,dob,address,employ_status,
       annual_income,monthly_debt,credit_score_range,employer,reference_no)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, loan_type, parseFloat(amount), Number(term_months),
     purpose?.trim()||null, first_name.trim(), last_name.trim(), dob,
     address.trim(), employ_status.trim(), parseFloat(annual_income),
     parseFloat(monthly_debt||0), credit_score_range.trim(), employer?.trim()||null, ref]
  );

  await db.query(
    "INSERT INTO notifications (user_id,icon,message) VALUES (?,'🏦',?)",
    [req.user.id, `Your ${loan_type} loan application for ${fmt(parseFloat(amount))} received. Ref: ${ref}`]
  );

  const [userRows] = await db.query('SELECT email,full_name FROM users WHERE id=?', [req.user.id]);
  if (userRows.length) {
    sendLoanStatusEmail(userRows[0].email, userRows[0].full_name, 'under_review',
      { loan_type, amount: parseFloat(amount), term_months: Number(term_months), reference_no: ref }
    ).catch(console.error);
  }

  res.status(201).json({ id, reference_no: ref, status: 'pending' });
});

/* ── GET /loans ──────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id,loan_type,amount,term_months,status,reference_no,
            credit_score_range,annual_income,created_at,decline_reason
     FROM loan_applications WHERE user_id=? ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

/* ── GET /loans/:id ──────────────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM loan_applications WHERE id=? AND user_id=?',
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Application not found.' });
  res.json(rows[0]);
});

/* ── POST /loans/:id/review  (admin) ─────────────────────────────────────── */
router.post('/:id/review', async (req, res) => {
  const [rows] = await db.query(
    "SELECT la.*,u.email,u.full_name FROM loan_applications la JOIN users u ON u.id=la.user_id WHERE la.id=? AND la.status NOT IN ('approved','declined')",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Pending application not found.' });
  const loan = rows[0];

  await db.query("UPDATE loan_applications SET status='under_review',reviewed_at=NOW() WHERE id=?", [req.params.id]);
  await db.query("INSERT INTO notifications (user_id,icon,message) VALUES (?,'🔍',?)",
    [loan.user_id, `Your ${loan.loan_type} loan application is now under review.`]);
  sendLoanStatusEmail(loan.email, loan.full_name, 'under_review', loan).catch(console.error);

  res.json({ message: 'Status updated to under_review.' });
});

/* ── POST /loans/:id/specialist  (admin) ─────────────────────────────────── */
router.post('/:id/specialist', async (req, res) => {
  const [rows] = await db.query(
    "SELECT la.*,u.email,u.full_name FROM loan_applications la JOIN users u ON u.id=la.user_id WHERE la.id=? AND la.status NOT IN ('approved','declined')",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Application not under review.' });
  const loan = rows[0];

  await db.query("UPDATE loan_applications SET status='specialist_contact',reviewed_at=NOW() WHERE id=?", [req.params.id]);
  await db.query("INSERT INTO notifications (user_id,icon,message) VALUES (?,'📞',?)",
    [loan.user_id, `A NexaBank loan specialist will contact you within 1 business day.`]);
  sendLoanStatusEmail(loan.email, loan.full_name, 'specialist_contact', loan).catch(console.error);

  res.json({ message: 'Specialist assigned.' });
});

/* ── POST /loans/:id/approve  (admin) ───────────────────────────────────── */
router.post('/:id/approve', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [appRows] = await conn.query(
      `SELECT la.*,u.email,u.full_name
       FROM loan_applications la JOIN users u ON u.id=la.user_id
       WHERE la.id=? AND la.status NOT IN ('approved','declined') FOR UPDATE`,
      [req.params.id]
    );
    if (!appRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Active application not found.' }); }
    const loan = appRows[0];

    // Get checking account to disburse into
    const [acctRows] = await conn.query(
      "SELECT * FROM accounts WHERE user_id=? AND type='checking' AND is_frozen=0 ORDER BY created_at ASC LIMIT 1 FOR UPDATE",
      [loan.user_id]
    );
    if (!acctRows.length) { await conn.rollback(); return res.status(400).json({ error: 'No active checking account found.' }); }
    const checking  = acctRows[0];
    const disbursed = parseFloat(loan.amount);
    const newBal    = parseFloat(checking.balance) + disbursed;
    const txnRef    = `LOAN-${loan.reference_no}`;

    // Credit account
    await conn.query('UPDATE accounts SET balance=? WHERE id=?', [newBal, checking.id]);

    // Transaction record
    await conn.query(
      `INSERT INTO transactions
        (id,account_id,user_id,type,amount,balance_after,description,category,status,reference)
       VALUES (?,?,?,'credit',?,?,?,?,'completed',?)`,
      [crypto.randomUUID(), checking.id, loan.user_id, disbursed, newBal,
       `${loan.loan_type.charAt(0).toUpperCase()+loan.loan_type.slice(1)} loan disbursement`,
       'loan', txnRef]
    );

    // Approve the application
    await conn.query(
      "UPDATE loan_applications SET status='approved',reviewed_at=NOW() WHERE id=?",
      [req.params.id]
    );

    // Notification
    await conn.query(
      "INSERT INTO notifications (user_id,icon,message) VALUES (?,'💰',?)",
      [loan.user_id, `Your ${loan.loan_type} loan of ${fmt(disbursed)} approved & disbursed! Ref: ${loan.reference_no}`]
    );

    await conn.commit();

    sendLoanStatusEmail(loan.email, loan.full_name, 'approved', loan).catch(console.error);

    res.json({ message: `Approved. ${fmt(disbursed)} disbursed.`, new_balance: newBal, transaction_ref: txnRef });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error during approval.' });
  } finally {
    conn.release();
  }
});

/* ── POST /loans/:id/decline  (admin) ───────────────────────────────────── */
router.post('/:id/decline', async (req, res) => {
  const { reason = 'Application did not meet current lending criteria.' } = req.body;
  const [rows] = await db.query(
    `SELECT la.*,u.email,u.full_name FROM loan_applications la JOIN users u ON u.id=la.user_id
     WHERE la.id=? AND la.status NOT IN ('approved','declined')`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Active application not found.' });
  const loan = rows[0];

  await db.query(
    "UPDATE loan_applications SET status='declined',decline_reason=?,reviewed_at=NOW() WHERE id=?",
    [reason, req.params.id]
  );
  await db.query(
    "INSERT INTO notifications (user_id,icon,message) VALUES (?,'❌',?)",
    [loan.user_id, `Your ${loan.loan_type} loan application was declined. ${reason}`]
  );

  loan.decline_reason = reason;
  sendLoanStatusEmail(loan.email, loan.full_name, 'declined', loan).catch(console.error);

  res.json({ message: 'Application declined.' });
});


/* ── GET /loans/admin/all  (admin — lists all applications) ─────────────── */
router.get('/admin/all', async (req, res) => {
  const [rows] = await db.query(
    `SELECT la.id, la.loan_type, la.amount, la.term_months, la.status,
            la.reference_no, la.created_at, la.decline_reason,
            la.first_name, la.last_name, la.annual_income, la.credit_score_range,
            u.full_name, u.email
     FROM loan_applications la
     JOIN users u ON u.id = la.user_id
     ORDER BY la.created_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

module.exports = router;