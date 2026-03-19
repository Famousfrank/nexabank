import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactions as txnApi } from '../api/client';

const PURPLE = '#6b1fa2';

/* ─── Small helpers ─────────────────────────────────────────────────────── */
function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  );
}

/* ─── OTP Input ─────────────────────────────────────────────────────────── */
function OTPInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {[0,1,2,3,4,5].map(i => (
        <input key={i} id={`zotp-${i}`} type="text" maxLength={1}
          value={value[i] || ''}
          onChange={e => {
            const v = e.target.value.replace(/\D/, '');
            const arr = value.split('');
            arr[i] = v;
            onChange(arr.join(''));
            if (v && i < 5) document.getElementById(`zotp-${i+1}`)?.focus();
          }}
          onKeyDown={e => { if (e.key === 'Backspace' && !value[i] && i > 0) document.getElementById(`zotp-${i-1}`)?.focus(); }}
          style={{ width: 44, height: 54, borderRadius: 12, background: '#f8f0ff', border: `2px solid ${value[i] ? PURPLE : '#e5e7eb'}`, color: PURPLE, fontSize: 22, textAlign: 'center', outline: 'none', fontWeight: 700 }}
        />
      ))}
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */
export default function ZellePage({ accounts = [], onSuccess, onToast, onRequestPin }) {
  const { user } = useAuth();

  // Zelle is linked to user's own email/phone automatically (like real banks do)
  const zelleId = user?.email || user?.phone || '';

  // screen: 'home' | 'send' | 'request' | 'link'
  const [screen, setScreen] = useState('home');

  /* ── Send Money state ── */
  const [sendStep, setSendStep]   = useState(1); // 1=recipient, 2=amount+account, 3=confirm, 4=done
  const [recipient, setRecipient] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [fromId, setFromId]       = useState('');
  const [amount, setAmount]       = useState('');
  const [note, setNote]           = useState('');
  const [sending, setSending]     = useState(false);
  const [doneRef, setDoneRef]     = useState('');

  /* ── Link new account state ── */
  const [linkStep, setLinkStep]   = useState(1);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [linkBank, setLinkBank]   = useState('');
  const [linkOtp, setLinkOtp]     = useState('');
  const [linkTimer, setLinkTimer] = useState(0);
  const [extraAccounts, setExtraAccounts] = useState([]);

  const eligible = accounts.filter(a => ['checking', 'savings'].includes(a.type) && !a.is_frozen);
  const fromAcct = eligible.find(a => a.id === fromId);

  /* ── Resend timer ── */
  function startTimer() {
    setLinkTimer(30);
    const iv = setInterval(() => setLinkTimer(t => { if (t <= 1) { clearInterval(iv); return 0; } return t - 1; }), 1000);
  }

  /* ── Send money ── */
  async function handleSend() {
    if (!fromId || !amount || !recipient) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return onToast?.('Enter a valid amount', 'error');
    if (fromAcct && fromAcct.balance < amt) return onToast?.('Insufficient funds', 'error');

    setSending(true);
    try {
      let pin = null;
      if (onRequestPin) { try { pin = await onRequestPin(); } catch { setSending(false); return; } }

      const res = await txnApi.transfer({
        from_account_id: fromId,
        to_identifier:   fromId,   // recorded as external debit
        amount:          amt,
        note:            note || `Zelle payment to ${recipient}`,
        external:        true,
        external_type:   'zelle',
        recipient_name:  recipientName || recipient,
        recipient_bank:  'Zelle',
        description:     `Zelle to ${recipientName || recipient}`,
        transaction_pin: pin,
      });
      setDoneRef(res?.reference || 'ZLL-' + Date.now());
      setSendStep(4);
      onSuccess?.();
    } catch (e) {
      onToast?.(e.message || 'Transfer failed', 'error');
    } finally {
      setSending(false);
    }
  }

  function resetSend() {
    setSendStep(1); setRecipient(''); setRecipientName(''); setFromId(''); setAmount(''); setNote(''); setDoneRef('');
  }

  /* ── Link account ── */
  function handleLinkSend() {
    if (!linkBank || (!linkEmail && !linkPhone)) return;
    startTimer();
    setLinkStep(2);
  }

  function handleLinkVerify() {
    if (linkOtp.length !== 6) return;
    const newAcc = { id: Date.now(), type: linkEmail ? 'email' : 'phone', value: linkEmail || linkPhone, bank: linkBank };
    setExtraAccounts(p => [...p, newAcc]);
    setLinkStep(3);
  }

  function resetLink() {
    setLinkStep(1); setLinkEmail(''); setLinkPhone(''); setLinkBank(''); setLinkOtp('');
    setScreen('home');
  }

  /* ─────────────────────────────── RENDER ────────────────────────────────── */

  const headerGrad = `linear-gradient(135deg, ${PURPLE} 0%, #9d46b9 100%)`;

  /* ── HOME ── */
  if (screen === 'home') return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, background: '#f5f5f5', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: headerGrad, padding: '28px 20px 32px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>Z</div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Zelle<span style={{ fontSize: 12, verticalAlign: 'super' }}>®</span></div>
          </div>
          <div style={{ fontSize: 12, background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20 }}>Active</div>
        </div>

        {/* Linked identity */}
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, opacity: .7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: .7 }}>Linked as</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{zelleId}</div>
          <div style={{ fontSize: 12, opacity: .65, marginTop: 2 }}>{user?.full_name} · NexaBank</div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { resetSend(); setScreen('send'); }}
            style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 14, padding: '18px 12px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send Money
          </button>
          <button onClick={() => onToast?.('Request Money coming soon!', 'success')}
            style={{ background: '#fff', color: PURPLE, border: `2px solid ${PURPLE}`, borderRadius: 14, padding: '18px 12px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="19 12 12 5 5 12"/><polyline points="19 19 12 12 5 19"/></svg>
            Request
          </button>
        </div>

        {/* Linked accounts */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>Linked Accounts</div>
            <button onClick={() => { setLinkStep(1); setScreen('link'); }}
              style={{ background: 'none', border: 'none', color: PURPLE, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
          </div>

          {/* Primary — user's NexaBank account */}
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: extraAccounts.length ? '1px solid #f5f5f5' : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0e6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏦</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>NexaBank</div>
              <div style={{ fontSize: 12, color: '#888' }}>{zelleId}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: PURPLE, background: '#f0e6ff', padding: '3px 9px', borderRadius: 20 }}>Primary</span>
          </div>

          {extraAccounts.map(a => (
            <div key={a.id} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #f5f5f5' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {a.type === 'email' ? '📧' : '📱'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.value}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{a.bank}</div>
              </div>
              <button onClick={() => setExtraAccounts(p => p.filter(x => x.id !== a.id))}
                style={{ background: 'none', border: 'none', color: '#c8102e', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{ background: '#f0e6ff', borderRadius: 14, padding: 16, fontSize: 13, color: '#555', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: PURPLE, marginBottom: 6 }}>ℹ️ How Zelle works</div>
          <div>• Send money directly from your NexaBank account</div>
          <div>• Recipient must have a US bank account</div>
          <div>• Funds typically arrive within minutes</div>
          <div>• No fees charged by NexaBank</div>
        </div>
      </div>
    </div>
  );

  /* ── SEND MONEY ── */
  if (screen === 'send') return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, background: '#f5f5f5', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: headerGrad, padding: '24px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <BackBtn onClick={() => setScreen('home')}/>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Send with Zelle<span style={{ fontSize: 10, verticalAlign: 'super' }}>®</span></div>
        </div>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {[1,2,3].map(s => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: sendStep >= s ? '#fff' : 'rgba(255,255,255,0.3)', transition: 'background .3s' }}/>
          ))}
        </div>
      </div>

      <div style={{ padding: 20 }}>

        {/* Step 1 — Recipient */}
        {sendStep === 1 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 22 }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4, color: '#222' }}>Who are you sending to?</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 22 }}>Enter their email or US phone number</div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Email or Phone</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="name@email.com or (555) 000-0000"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Recipient Name (optional)</label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="John Smith"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>

            <button onClick={() => { if (recipient.trim()) setSendStep(2); }}
              disabled={!recipient.trim()}
              style={{ width: '100%', background: recipient.trim() ? PURPLE : '#e5e7eb', color: recipient.trim() ? '#fff' : '#aaa', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: recipient.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Continue →
            </button>
          </div>
        )}

        {/* Step 2 — Amount + Account */}
        {sendStep === 2 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 22 }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4, color: '#222' }}>Amount & Account</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 22 }}>Sending to <strong>{recipientName || recipient}</strong></div>

            {/* From account */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Send From</label>
              {eligible.length === 0 ? (
                <div style={{ padding: 14, background: '#fff5f5', borderRadius: 10, fontSize: 13, color: '#c8102e' }}>No eligible accounts available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {eligible.map(a => (
                    <div key={a.id} onClick={() => setFromId(a.id)}
                      style={{ border: `2px solid ${fromId === a.id ? PURPLE : '#e5e7eb'}`, borderRadius: 12, padding: '12px 16px', cursor: 'pointer', background: fromId === a.id ? '#f8f0ff' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all .15s' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{a.label}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Available: {fmt(a.balance)}</div>
                      </div>
                      {fromId === a.id && (
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: PURPLE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Amount */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Amount</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: '#555', fontWeight: 700 }}>$</span>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px 12px 30px', fontSize: 20, fontWeight: 700, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#222' }}/>
              </div>
              {fromAcct && amount && parseFloat(amount) > fromAcct.balance && (
                <div style={{ fontSize: 12, color: '#c8102e', marginTop: 5 }}>⚠️ Exceeds available balance</div>
              )}
            </div>

            {/* Note */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="What's it for?"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSendStep(1)}
                style={{ flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
              <button onClick={() => setSendStep(3)}
                disabled={!fromId || !amount || parseFloat(amount) <= 0 || (fromAcct && parseFloat(amount) > fromAcct.balance)}
                style={{ flex: 2, background: (fromId && amount && parseFloat(amount) > 0 && !(fromAcct && parseFloat(amount) > fromAcct.balance)) ? PURPLE : '#e5e7eb', color: (fromId && amount && parseFloat(amount) > 0 && !(fromAcct && parseFloat(amount) > fromAcct.balance)) ? '#fff' : '#aaa', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Review →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Confirm */}
        {sendStep === 3 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 22 }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20, color: '#222' }}>Confirm Transfer</div>

            {/* Summary */}
            <div style={{ background: '#f8f0ff', borderRadius: 14, padding: '18px', marginBottom: 22 }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#888' }}>You're sending</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: PURPLE }}>{fmt(parseFloat(amount))}</div>
              </div>
              {[
                ['To', recipientName || recipient],
                ['Contact', recipient],
                ['From', `${fromAcct?.label} (${fmt(fromAcct?.balance)} available)`],
                ['Via', 'Zelle®'],
                ...(note ? [['Note', note]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(107,31,162,0.1)' }}>
                  <span style={{ fontSize: 13, color: '#888' }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#222', maxWidth: '60%', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#9a3412', marginBottom: 20 }}>
              ⚠️ Zelle transfers cannot be cancelled once sent. Make sure the recipient information is correct.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSendStep(2)}
                style={{ flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
              <button onClick={handleSend} disabled={sending}
                style={{ flex: 2, background: PURPLE, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: sending ? .7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {sending ? <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{ animation: 'spin .8s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  Sending…
                </> : 'Send Money'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Done */}
        {sendStep === 4 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#d4edda', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a7f4b" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#222', marginBottom: 8 }}>Sent!</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: PURPLE, marginBottom: 16 }}>{fmt(parseFloat(amount))}</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>Sent to <strong>{recipientName || recipient}</strong></div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 24, fontFamily: 'monospace' }}>Ref: {doneRef}</div>
            <div style={{ fontSize: 13, color: '#888', background: '#f0e6ff', borderRadius: 10, padding: '10px 16px', marginBottom: 24 }}>
              Funds typically arrive within minutes.
            </div>
            <button onClick={() => { resetSend(); setScreen('home'); }}
              style={{ width: '100%', background: PURPLE, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
            <button onClick={() => { resetSend(); setSendStep(1); }}
              style={{ width: '100%', background: 'none', border: 'none', color: PURPLE, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 10, fontFamily: 'inherit' }}>
              Send Another
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  /* ── LINK ACCOUNT ── */
  if (screen === 'link') return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, background: '#f5f5f5', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: headerGrad, padding: '24px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BackBtn onClick={() => setScreen('home')}/>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Link Bank Account</div>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {linkStep === 1 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: '#222' }}>Add another bank to Zelle</div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Select Bank</label>
              <select value={linkBank} onChange={e => setLinkBank(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}>
                <option value="">Choose your bank…</option>
                {['Chase','Bank of America','Wells Fargo','Citibank','Capital One','TD Bank','PNC Bank','US Bank','Truist','Fifth Third'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Email Address</label>
              <input value={linkEmail} onChange={e => setLinkEmail(e.target.value)} type="email" placeholder="Registered with your bank"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>

            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, margin: '4px 0 12px' }}>— or —</div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 7 }}>Phone Number</label>
              <input value={linkPhone} onChange={e => setLinkPhone(e.target.value)} type="tel" placeholder="(555) 000-0000"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>

            <button onClick={handleLinkSend} disabled={!linkBank || (!linkEmail && !linkPhone)}
              style={{ width: '100%', background: (linkBank && (linkEmail || linkPhone)) ? PURPLE : '#e5e7eb', color: (linkBank && (linkEmail || linkPhone)) ? '#fff' : '#aaa', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Send Verification Code
            </button>
          </div>
        )}

        {linkStep === 2 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📱</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Enter Verification Code</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              We sent a 6-digit code to <strong>{linkEmail || linkPhone}</strong>
            </div>
            <div style={{ marginBottom: 24 }}>
              <OTPInput value={linkOtp} onChange={setLinkOtp}/>
            </div>
            <button onClick={handleLinkVerify} disabled={linkOtp.length !== 6}
              style={{ width: '100%', background: linkOtp.length === 6 ? PURPLE : '#e5e7eb', color: linkOtp.length === 6 ? '#fff' : '#aaa', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
              Verify & Link
            </button>
            <div style={{ fontSize: 13, color: '#aaa' }}>
              {linkTimer > 0 ? `Resend in ${linkTimer}s` : <button onClick={() => { setLinkOtp(''); startTimer(); }} style={{ background: 'none', border: 'none', color: PURPLE, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Resend Code</button>}
            </div>
          </div>
        )}

        {linkStep === 3 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#d4edda', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a7f4b" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Account Linked!</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>{linkBank} via {linkEmail || linkPhone}</div>
            <button onClick={resetLink}
              style={{ width: '100%', background: PURPLE, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}