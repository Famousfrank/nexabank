import ZellePage from './ZellePage';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { accounts as accountsApi, transactions as txnApi, users as usersApi, limitsApi, loansApi, profileApi } from '../api/client';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const relativeDate = (dateStr) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const groupByDate = (txns) => {
  const groups = {};
  for (const t of txns) {
    const label = relativeDate(t.created_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  }
  return groups;
};

const acctColor = (type) => {
  if (type === 'checking') return '#c8102e';
  if (type === 'savings')  return '#1a7f4b';
  if (type === 'credit')   return '#e07b00';
  return '#012169';
};

const acctIcon = (type) => {
  if (type === 'checking') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  );
  if (type === 'savings') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/>
    </svg>
  );
  if (type === 'credit') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  );
  return null;
};

const txnIcon = (desc = '') => {
  const d = desc.toLowerCase();
  if (d.includes('grocery') || d.includes('food') || d.includes('restaurant'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 2l1.5 16.5A2 2 0 0 0 6.5 20h11a2 2 0 0 0 2-1.5L21 2"/><path d="M2 7h20"/></svg>;
  if (d.includes('transfer'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>;
  if (d.includes('deposit') || d.includes('direct') || d.includes('salary'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
  if (d.includes('atm') || d.includes('withdrawal'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>;
  if (d.includes('gas') || d.includes('fuel'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 22V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"/><path d="M17 10h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/></svg>;
  if (d.includes('utilities') || d.includes('electric'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>;
};

/* ─── Spinner ──────────────────────────────────────────────────────────────── */
function Spinner({ size = 20, color = '#c8102e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
      style={{ animation: 'boa-spin 0.8s linear infinite', flexShrink: 0 }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}

/* ─── Toast ────────────────────────────────────────────────────────────────── */
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#c8102e' : '#1a7f4b',
      color: '#fff', padding: '12px 22px', borderRadius: 14, zIndex: 9999,
      fontSize: 14, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      animation: 'boa-fadeUp 0.3s ease', maxWidth: 320, textAlign: 'center',
      fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
    }}>
      {msg}
    </div>
  );
}

/* ─── Transfer Page ────────────────────────────────────────────────────────── */
function TransferPage({ accounts, onSuccess, onToast, onRequestPin }) {
  const [fromId, setFromId]       = useState('');
  const [toId, setToId]           = useState('');
  const [externalType, setExternalType] = useState(''); // 'domestic' | 'international' | ''
  const [amount, setAmount]       = useState('');
  const [note, setNote]           = useState('');
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading]     = useState(false);
  const [txnDone, setTxnDone]     = useState(null); // { amount, toLabel, ref }

  // External transfer form fields
  const [extName,    setExtName]    = useState('');
  const [extBank,    setExtBank]    = useState('');
  const [extAcctNo,  setExtAcctNo]  = useState('');
  const [extRouting, setExtRouting] = useState('');
  const [extAddress, setExtAddress] = useState('');
  const [extCountry, setExtCountry] = useState('');
  const [extSwift,   setExtSwift]   = useState('');
  const [extIban,    setExtIban]    = useState('');

  const eligible = accounts.filter(a => ['checking', 'savings'].includes(a.type) && !a.is_frozen);
  const fromAcct = eligible.find(a => a.id === fromId);

  useEffect(() => {
    const checking = eligible.find(a => a.type === 'checking');
    if (checking && !fromId) setFromId(checking.id);
  }, [accounts]);

  const isExternal  = externalType === 'domestic' || externalType === 'international';
  const canTransfer = fromId && amount && (isExternal ? (extName && extBank && extAcctNo && extRouting) : toId);

  const handleTransfer = async () => {
    if (!canTransfer) return onToast('Please fill all required fields', 'error');
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return onToast('Enter a valid amount', 'error');
    if (fromAcct && fromAcct.balance < amt) return onToast('Insufficient funds', 'error');

    if (isExternal) {
      // External transfers are recorded locally as a debit with metadata
      setLoading(true);
      try {
        const desc = externalType === 'domestic'
          ? `Domestic transfer to ${extName} · ${extBank}`
          : `International transfer to ${extName} · ${extBank}`;
        let tpin = null;
        if (onRequestPin) { try { tpin = await onRequestPin(); } catch { return; } }
        const res = await txnApi.transfer({
          from_account_id: fromId,
          to_identifier:   fromId,
          amount: amt,
          note,
          external: true,
          external_type: externalType,
          recipient_name: extName,
          recipient_bank: extBank,
          recipient_account: extAcctNo,
          routing_number: extRouting,
          bank_address: extAddress,
          country: extCountry,
          swift_code: extSwift,
          iban: extIban,
          description: desc,
          transaction_pin: tpin,
        });
        const toLabel = `${extName} · ${extBank}`;
        setTxnDone({ amount: amt, toLabel, ref: res?.reference || '' });
        onSuccess();
      } catch (e) {
        onToast(e.message || 'Transfer failed', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (fromId === toId) return onToast('Cannot transfer to the same account', 'error');
    setLoading(true);
    try {
      let ipin = null;
      if (onRequestPin) { try { ipin = await onRequestPin(); } catch { return; } }
      const res = await txnApi.transfer({ from_account_id: fromId, to_identifier: toId, amount: amt, note, transaction_pin: ipin });
      const destAcct = accounts.find(a => a.id === toId);
      setTxnDone({ amount: amt, toLabel: destAcct?.label || 'account', ref: res?.reference || '' });
      onSuccess();
    } catch (e) {
      onToast(e.message || 'Transfer failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toAccounts = accounts.filter(a => a.id !== fromId);

  // ── Success screen ──────────────────────────────────────────────────────
  if (txnDone) return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f8f9fb' }}>
      <div style={{ background:'#012169', padding:'20px 20px 28px', color:'#fff' }}>
        <div style={{ fontSize:20, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>Transfer Money</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'40px 24px', textAlign:'center' }}>
        {/* Green circle checkmark */}
        <div style={{ width:88, height:88, borderRadius:'50%', background:'#dcfce7',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24,
          boxShadow:'0 4px 24px rgba(26,127,75,0.18)' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
            stroke="#1a7f4b" strokeWidth="3" strokeLinecap="round">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
        </div>
        <div style={{ fontSize:26, fontWeight:900, color:'#012169',
          fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>
          Transfer Successful!
        </div>
        <div style={{ fontSize:15, color:'#555', fontFamily:"'DM Sans',sans-serif", marginBottom:4 }}>
          You sent
        </div>
        <div style={{ fontSize:36, fontWeight:900, color:'#1a7f4b',
          fontFamily:"'DM Sans',sans-serif", marginBottom:4 }}>
          {fmt(txnDone.amount)}
        </div>
        <div style={{ fontSize:15, color:'#555', fontFamily:"'DM Sans',sans-serif", marginBottom:28 }}>
          to <strong style={{ color:'#012169' }}>{txnDone.toLabel}</strong>
        </div>
        {txnDone.ref && (
          <div style={{ background:'#f0f4ff', borderRadius:10, padding:'10px 20px',
            marginBottom:32, fontSize:12, color:'#555', fontFamily:"'DM Sans',sans-serif" }}>
            Reference: <strong style={{ color:'#012169', fontFamily:"'Courier New',monospace",
              letterSpacing:1 }}>{txnDone.ref}</strong>
          </div>
        )}
        <button onClick={() => {
          setTxnDone(null); setAmount(''); setNote(''); setExternalType('');
          setExtName(''); setExtBank(''); setExtAcctNo(''); setExtRouting('');
          setExtAddress(''); setExtCountry(''); setExtSwift(''); setExtIban('');
        }} style={{ background:'#c8102e', color:'#fff', border:'none', borderRadius:14,
          padding:'14px 48px', fontSize:16, fontWeight:700, cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif" }}>
          Done
        </button>
        <button onClick={() => setTxnDone(null)}
          style={{ marginTop:12, background:'none', border:'none', color:'#888',
            fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Make another transfer
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ background: '#012169', padding: '20px 20px 28px', color: '#fff' }}>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Transfer Money</div>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

          {/* FROM */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>From</div>
            <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              {eligible.map((a, i) => (
                <div key={a.id} onClick={() => { setFromId(a.id); if (toId === a.id) setToId(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    background: fromId === a.id ? '#fef2f2' : '#fff',
                    borderTop: i > 0 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: acctColor(a.type),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    {acctIcon(a.type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>{a.card_number} · {fmt(a.balance)}</div>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: '50%',
                    border: `2px solid ${fromId === a.id ? '#c8102e' : '#ddd'}`,
                    background: fromId === a.id ? '#c8102e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {fromId === a.id && <div style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%' }}/>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* arrow */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0 16px' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#f5f5f5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c8102e' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </div>
          </div>

          {/* TO */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>To</div>
            <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>

              {/* Own accounts */}
              {toAccounts.map((a, i) => (
                <div key={a.id} onClick={() => { setToId(a.id); setExternalType(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    background: toId === a.id && !isExternal ? '#fef2f2' : '#fff',
                    borderTop: i > 0 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: acctColor(a.type),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    {acctIcon(a.type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>{a.card_number} · {fmt(a.balance)}</div>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: '50%',
                    border: `2px solid ${toId === a.id && !isExternal ? '#c8102e' : '#ddd'}`,
                    background: toId === a.id && !isExternal ? '#c8102e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {toId === a.id && !isExternal && <div style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%' }}/>}
                  </div>
                </div>
              ))}

              {/* Divider */}
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 16px 4px',
                fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase',
                letterSpacing: 1, fontFamily: "'DM Sans', sans-serif" }}>External</div>

              {/* Domestic Transfer */}
              <div>
                <div onClick={() => { setExternalType(externalType === 'domestic' ? '' : 'domestic'); setToId(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    background: externalType === 'domestic' ? '#fef2f2' : '#fff',
                    borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#2563eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V7a5 5 0 0110 0v3"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Domestic Transfer</div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>Send to any US bank account</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: externalType === 'domestic' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
                {externalType === 'domestic' && (
                  <div style={{ padding: '4px 16px 16px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                    {[
                      { label: 'Account Name *', value: extName,    setter: setExtName,    placeholder: 'Full name on account', type: 'text' },
                      { label: 'Bank Name *',     value: extBank,    setter: setExtBank,    placeholder: 'e.g. Chase, Wells Fargo', type: 'text' },
                      { label: 'Account Number *',value: extAcctNo,  setter: setExtAcctNo,  placeholder: 'Recipient account number', type: 'text' },
                      { label: 'Routing Number * (9 digits)', value: extRouting, setter: setExtRouting, placeholder: '9-digit ABA routing number', type: 'text', maxLen: 9 },
                      { label: 'Bank Address (optional)', value: extAddress, setter: setExtAddress, placeholder: 'Bank street address', type: 'text' },
                    ].map(f => (
                      <div key={f.label} style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 5,
                          fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: 0.6 }}>{f.label}</div>
                        <input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)}
                          placeholder={f.placeholder} maxLength={f.maxLen}
                          style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10,
                            padding: '11px 13px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                            color: '#012169', outline: 'none', boxSizing: 'border-box', background: '#fff' }}/>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* International Transfer */}
              <div>
                <div onClick={() => { setExternalType(externalType === 'international' ? '' : 'international'); setToId(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    background: externalType === 'international' ? '#fef2f2' : '#fff',
                    borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#7c3aed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>International Transfer</div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>Wire to a foreign bank account</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: externalType === 'international' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
                {externalType === 'international' && (
                  <div style={{ padding: '4px 16px 16px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                    {[
                      { label: 'Account Name *',   value: extName,    setter: setExtName,    placeholder: 'Full name on account', type: 'text' },
                      { label: 'Bank Name *',       value: extBank,    setter: setExtBank,    placeholder: 'Recipient bank name', type: 'text' },
                      { label: 'Account Number *',  value: extAcctNo,  setter: setExtAcctNo,  placeholder: 'Recipient account number', type: 'text' },
                      { label: 'Routing Number * (9 digits)', value: extRouting, setter: setExtRouting, placeholder: '9-digit routing number', type: 'text', maxLen: 9 },
                      { label: 'SWIFT / BIC Code',  value: extSwift,   setter: setExtSwift,   placeholder: 'e.g. CHASUS33', type: 'text' },
                      { label: 'IBAN',              value: extIban,    setter: setExtIban,    placeholder: 'International Bank Account Number', type: 'text' },
                      { label: 'Country *',         value: extCountry, setter: setExtCountry, placeholder: 'Recipient country', type: 'text' },
                      { label: 'Bank Address (optional)', value: extAddress, setter: setExtAddress, placeholder: 'Bank street address', type: 'text' },
                    ].map(f => (
                      <div key={f.label} style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 5,
                          fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: 0.6 }}>{f.label}</div>
                        <input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)}
                          placeholder={f.placeholder} maxLength={f.maxLen}
                          style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10,
                            padding: '11px 13px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                            color: '#012169', outline: 'none', boxSizing: 'border-box', background: '#fff' }}/>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Amount</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                fontSize: 24, fontWeight: 800, color: '#012169', fontFamily: "'DM Sans', sans-serif",
                pointerEvents: 'none' }}>$</span>
              <input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)} min="0.01" step="0.01"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 12,
                  padding: '14px 16px 14px 38px', fontSize: 28, fontWeight: 800,
                  color: '#012169', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            {fromAcct && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
                Available: <strong style={{ color: '#1a7f4b' }}>{fmt(fromAcct.balance)}</strong>
              </div>
            )}
          </div>

          {/* Date */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Schedule</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 12,
                padding: '13px 16px', fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                color: '#012169', outline: 'none', boxSizing: 'border-box' }}/>
          </div>

          {/* Note */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Note (optional)</div>
            <input type="text" placeholder="Add a note…" value={note} onChange={e => setNote(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 12,
                padding: '13px 16px', fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                color: '#333', outline: 'none', boxSizing: 'border-box' }}/>
          </div>

          <button onClick={handleTransfer} disabled={loading || !canTransfer}
            style={{
              width: '100%', border: 'none', borderRadius: 14, padding: '16px',
              fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              cursor: (loading || !canTransfer) ? 'not-allowed' : 'pointer',
              background: (loading || !canTransfer) ? '#bbb' : '#c8102e',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'background 0.2s',
            }}>
            {loading ? <><Spinner size={18} color="#fff"/> Processing…</> : 'Transfer Money'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Deposit Modal ────────────────────────────────────────────────────────── */
function DepositModal({ accounts, onClose, onSuccess, onToast }) {
  const [step, setStep]       = useState(1);
  const [acctId, setAcctId]   = useState('');
  const [amount, setAmount]   = useState('');
  const [source, setSource]   = useState('External Bank Account');
  const [loading, setLoading] = useState(false);

  const selectedAcct = accounts.find(a => a.id === acctId);
  const eligible     = accounts.filter(a => ['checking', 'savings'].includes(a.type));

  const handleDeposit = async () => {
    setLoading(true);
    try {
      await txnApi.deposit({ account_id: acctId, amount: parseFloat(amount), description: `Deposit from ${source}` });
      setStep(4);
      onSuccess();
    } catch (e) {
      onToast(e.message || 'Deposit failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', animation: 'boa-fadeIn 0.2s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', background: '#fff', borderRadius: '22px 22px 0 0',
        maxHeight: '88vh', overflowY: 'auto', animation: 'boa-slideUp 0.3s ease' }}>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
          <div style={{ width: 36, height: 4, background: '#e0e0e0', borderRadius: 2 }}/>
        </div>

        <div style={{ padding: '20px 20px 44px' }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
            {[1, 2, 3].map((s, idx) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: idx < 2 ? 1 : 'none' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: step >= s ? '#c8102e' : '#e5e7eb',
                  color: step >= s ? '#fff' : '#999',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.3s' }}>
                  {step > s ? '✓' : s}
                </div>
                {idx < 2 && <div style={{ flex: 1, height: 2, background: step > s ? '#c8102e' : '#e5e7eb',
                  margin: '0 6px', transition: 'background 0.3s' }}/>}
              </div>
            ))}
            <div style={{ marginLeft: 12, fontSize: 13, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
              {['', 'Select Account', 'Enter Amount', 'Confirm', 'Done'][step]}
            </div>
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#012169', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
                Select Account
              </div>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
                Where should the deposit go?
              </div>
              {eligible.map(a => (
                <div key={a.id} onClick={() => setAcctId(a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14,
                    border: `2px solid ${acctId === a.id ? '#c8102e' : '#e5e7eb'}`,
                    borderRadius: 14, marginBottom: 12, cursor: 'pointer',
                    background: acctId === a.id ? '#fef2f2' : '#fff', transition: 'all 0.15s' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: acctColor(a.type),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                    {acctIcon(a.type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
                      Balance: {fmt(a.balance)}
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => acctId && setStep(2)} disabled={!acctId}
                style={{ width: '100%', background: acctId ? '#c8102e' : '#ccc', color: '#fff',
                  border: 'none', borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700,
                  cursor: acctId ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
                Continue
              </button>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#012169', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
                Enter Amount
              </div>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 24, fontFamily: "'DM Sans', sans-serif" }}>
                Depositing to <strong style={{ color: '#012169' }}>{selectedAcct?.label}</strong>
              </div>

              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: '#012169', fontFamily: "'DM Sans', sans-serif" }}>$</span>
                  <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                    min="1" step="0.01" autoFocus
                    style={{ border: 'none', borderBottom: '2px solid #012169', width: 180, fontSize: 44,
                      fontWeight: 900, textAlign: 'center', color: '#012169',
                      fontFamily: "'DM Sans', sans-serif", outline: 'none', background: 'transparent' }}/>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
                {[100, 250, 500, 1000, 2500, 5000].map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ border: `1.5px solid ${amount === String(a) ? '#c8102e' : '#e5e7eb'}`,
                      background: amount === String(a) ? '#fef2f2' : '#fff',
                      borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                      color: amount === String(a) ? '#c8102e' : '#333' }}>
                    ${a.toLocaleString()}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase',
                  letterSpacing: 0.8, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Deposit Source</div>
                <select value={source} onChange={e => setSource(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 12,
                    padding: '13px 16px', fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                    color: '#333', outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                  <option>External Bank Account</option>
                  <option>Wire Transfer</option>
                  <option>Cash Deposit</option>
                  <option>Mobile Check Capture</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setStep(1)}
                  style={{ flex: 1, border: '1.5px solid #e5e7eb', background: '#fff', borderRadius: 14,
                    padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Back
                </button>
                <button onClick={() => { if (amount && parseFloat(amount) > 0) setStep(3); }}
                  disabled={!amount || parseFloat(amount) <= 0}
                  style={{ flex: 2, background: (!amount || parseFloat(amount) <= 0) ? '#ccc' : '#c8102e',
                    color: '#fff', border: 'none', borderRadius: 14, padding: 14, fontSize: 15,
                    fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Review Deposit
                </button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#012169', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
                Confirm Deposit
              </div>
              <div style={{ background: '#f8f9fa', borderRadius: 16, padding: 20, marginBottom: 24 }}>
                {[
                  ['To Account', selectedAcct?.label],
                  ['Account Number', selectedAcct?.card_number],
                  ['Amount', fmt(parseFloat(amount))],
                  ['Source', source],
                  ['Date', new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                    paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #eee' }}>
                    <span style={{ color: '#888', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{k}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#012169', fontFamily: "'DM Sans', sans-serif" }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>New Balance</span>
                  <span style={{ fontWeight: 800, fontSize: 17, color: '#1a7f4b', fontFamily: "'DM Sans', sans-serif" }}>
                    {fmt((selectedAcct?.balance || 0) + parseFloat(amount))}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setStep(2)}
                  style={{ flex: 1, border: '1.5px solid #e5e7eb', background: '#fff', borderRadius: 14,
                    padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Back
                </button>
                <button onClick={handleDeposit} disabled={loading}
                  style={{ flex: 2, background: loading ? '#ccc' : '#c8102e', color: '#fff',
                    border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  {loading ? <><Spinner size={16} color="#fff"/> Processing…</> : 'Confirm Deposit'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 – Success */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a7f4b" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#012169', marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                Deposit Successful!
              </div>
              <div style={{ fontSize: 16, color: '#555', marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>
                {fmt(parseFloat(amount))} deposited to
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#012169', marginBottom: 32, fontFamily: "'DM Sans', sans-serif" }}>
                {selectedAcct?.label}
              </div>
              <button onClick={onClose}
                style={{ background: '#c8102e', color: '#fff', border: 'none', borderRadius: 14,
                  padding: '14px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Account Detail ───────────────────────────────────────────────────────── */
/* ─── Network Logo SVG ─────────────────────────────────────────────────────── */
function NetworkLogo({ network, size = 40, white = false }) {
  if (network === 'visa') return (
    <svg width={size} height={size * 0.32} viewBox="0 0 750 237" fill="none">
      <path d="M278 0L185 237H120L73 47C70 36 68 32 59 27 45 20 21 13 0 9L2 0H108C121 0 133 9 136 24L162 162 243 0H278Z"
        fill={white ? '#fff' : '#1a1f71'}/>
      <path d="M616 0L558 237H497L555 0H616ZM503 0L416 154 392 44C389 28 376 0 361 0H265L263 9C286 14 320 23 339 34 350 40 353 45 356 57L397 237H463L583 0H503ZM731 0H680C667 0 656 7 651 19L554 237H620L633 199H713L721 237H781L731 0ZM648 150L680 61 699 150H648Z"
        fill={white ? '#fff' : '#1a1f71'}/>
    </svg>
  );
  if (network === 'mastercard') return (
    <svg width={size} height={size * 0.62} viewBox="0 0 152 95" fill="none">
      <circle cx="47" cy="47.5" r="47" fill={white ? 'rgba(255,255,255,0.9)' : '#EB001B'}/>
      <circle cx="105" cy="47.5" r="47" fill={white ? 'rgba(255,255,255,0.6)' : '#F79E1B'}/>
      <path d="M76 20C86 27 93 37 93 47.5C93 58 86 68 76 75C66 68 59 58 59 47.5C59 37 66 27 76 20Z"
        fill={white ? 'rgba(255,255,255,0.75)' : '#FF5F00'}/>
    </svg>
  );
  if (network === 'amex') return (
    <svg width={size} height={size * 0.32} viewBox="0 0 300 95" fill="none">
      <rect width="300" height="95" rx="8" fill={white ? 'rgba(255,255,255,0.15)' : 'none'}/>
      <text x="10" y="72" fontFamily="Arial Black,sans-serif" fontWeight="900"
        fontSize="68" fill={white ? '#fff' : '#2671b2'} letterSpacing="-2">AMEX</text>
    </svg>
  );
  return null;
}

/* ─── Realistic Credit Card Preview ────────────────────────────────────────── */
function CreditCardPreview({ network, holderName, masked, expiry, flipped, onTap }) {
  const nets = {
    visa:       { bg:'#0f2d6e', shine:'#1a4a9e', accent:'#c8b560', name:'VISA PLATINUM' },
    mastercard: { bg:'#1a0a2e', shine:'#2d1055', accent:'#e8a020', name:'MASTERCARD' },
    amex:       { bg:'#0a3528', shine:'#1a5540', accent:'#a8c8b0', name:'AMERICAN EXPRESS' },
  };
  const t = nets[network] || nets.visa;
  const displayNum = masked || '•••• •••• ••••';
  const displayExp = expiry || 'MM/YY';
  const displayName = (holderName || 'YOUR NAME').toUpperCase();

  return (
    <div onClick={onTap} style={{
      width:'100%', aspectRatio:'1.586/1', borderRadius:16, cursor: onTap ? 'pointer' : 'default',
      perspective:1000, WebkitPerspective:1000,
    }}>
      <div style={{
        width:'100%', height:'100%', position:'relative',
        transformStyle:'preserve-3d', WebkitTransformStyle:'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition:'transform 0.6s cubic-bezier(0.4,0.2,0.2,1)',
      }}>

        {/* ── FRONT ── */}
        <div style={{
          position:'absolute', inset:0, borderRadius:16,
          background:`linear-gradient(135deg, ${t.bg} 0%, ${t.shine} 60%, ${t.bg} 100%)`,
          backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden',
          overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.4)',
          padding:'5% 6%', display:'flex', flexDirection:'column', justifyContent:'space-between',
        }}>
          {/* Diagonal shine lines */}
          <div style={{ position:'absolute', inset:0, opacity:0.06,
            background:'repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(255,255,255,1) 3px,rgba(255,255,255,1) 4px)' }}/>
          {/* Radial glow */}
          <div style={{ position:'absolute', top:'-30%', right:'-10%', width:'80%', aspectRatio:'1',
            borderRadius:'50%', background:`radial-gradient(circle, ${t.shine}99 0%, transparent 70%)`,
            pointerEvents:'none' }}/>

          {/* Top row */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative', zIndex:1 }}>
            <div>
              <div style={{ fontSize:11, color:`${t.accent}`, fontWeight:800,
                fontFamily:"'DM Sans',sans-serif", letterSpacing:1.5, textTransform:'uppercase' }}>
                NexaBank
              </div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)',
                fontFamily:"'DM Sans',sans-serif", marginTop:1 }}>{t.name}</div>
            </div>
            {/* EMV chip */}
            <div style={{ width:36, height:26,
              background:'linear-gradient(135deg,#d4a843,#f0cc70,#c89830)',
              borderRadius:4, position:'relative', overflow:'hidden',
              boxShadow:'inset 0 1px 2px rgba(0,0,0,0.3)' }}>
              <div style={{ position:'absolute', top:'30%', left:0, right:0, height:1, background:'rgba(0,0,0,0.25)' }}/>
              <div style={{ position:'absolute', top:'60%', left:0, right:0, height:1, background:'rgba(0,0,0,0.2)' }}/>
              <div style={{ position:'absolute', top:0, left:'40%', bottom:0, width:1, background:'rgba(0,0,0,0.2)' }}/>
              <div style={{ position:'absolute', top:0, right:'40%', bottom:0, width:1, background:'rgba(0,0,0,0.15)' }}/>
            </div>
          </div>

          {/* Card number */}
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ fontSize:16, fontFamily:"'Courier New',monospace",
              color:'rgba(255,255,255,0.95)', letterSpacing:2,
              fontWeight:400, textShadow:'0 1px 3px rgba(0,0,0,0.4)' }}>
              {displayNum}
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', position:'relative', zIndex:1 }}>
            <div>
              <div style={{ fontSize:8, color:'rgba(255,255,255,0.45)',
                fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>Card Holder</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.9)',
                fontFamily:"'DM Sans',sans-serif", fontWeight:700, letterSpacing:1,
                marginTop:1, maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {displayName}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
              <div style={{ fontSize:8, color:'rgba(255,255,255,0.45)',
                fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>Expires</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.9)',
                fontFamily:"'Courier New',monospace", fontWeight:700 }}>{displayExp}</div>
              <div style={{ marginTop:2 }}>
                <NetworkLogo network={network} size={32} white />
              </div>
            </div>
          </div>

          {/* Contactless icon */}
          <div style={{ position:'absolute', top:'42%', right:'7%', opacity:0.3 }}>
            <svg width="16" height="22" viewBox="0 0 24 34" fill="none">
              <path d="M12 2 Q22 10 12 17 Q2 10 12 2Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M12 8 Q19 13 12 17 Q5 13 12 8Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M12 13 Q16 15 12 17 Q8 15 12 13Z" stroke="white" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
        </div>

        {/* ── BACK ── */}
        <div style={{
          position:'absolute', inset:0, borderRadius:16,
          background:`linear-gradient(135deg, ${t.bg} 0%, ${t.shine} 100%)`,
          backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden',
          transform:'rotateY(180deg)',
          overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ position:'absolute', inset:0, opacity:0.06,
            background:'repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(255,255,255,1) 3px,rgba(255,255,255,1) 4px)' }}/>
          {/* Magnetic stripe */}
          <div style={{ position:'absolute', top:'18%', left:0, right:0, height:'18%',
            background:'rgba(0,0,0,0.85)' }}/>
          {/* Signature strip */}
          <div style={{ position:'absolute', top:'44%', left:'6%', right:'6%', height:'14%',
            background:'#f5f5f0', borderRadius:3, display:'flex', alignItems:'center',
            paddingLeft:8, paddingRight:8, justifyContent:'space-between', overflow:'hidden' }}>
            <div style={{ flex:1, height:'60%', backgroundImage:'repeating-linear-gradient(90deg,#ddd 0,#ddd 2px,#f5f5f0 2px,#f5f5f0 6px)',
              backgroundSize:'6px 100%', opacity:0.6 }}/>
            <div style={{ background:'#fff8dc', padding:'2px 8px', borderRadius:2,
              fontSize:9, fontFamily:"'Courier New',monospace",
              color:'#333', fontWeight:700, letterSpacing:1, flexShrink:0, marginLeft:6 }}>
              {displayNum.slice(-4).replace('•','') || '****'}
            </div>
          </div>
          {/* CVV label */}
          <div style={{ position:'absolute', top:'62%', right:'8%',
            fontSize:8, color:'rgba(255,255,255,0.5)',
            fontFamily:"'DM Sans',sans-serif" }}>CVV</div>
          {/* NexaBank text */}
          <div style={{ position:'absolute', bottom:'14%', left:'6%',
            fontSize:10, color:`${t.accent}`,
            fontFamily:"'DM Sans',sans-serif", fontWeight:700, letterSpacing:1 }}>NEXABANK</div>
          {/* Network logo back */}
          <div style={{ position:'absolute', bottom:'12%', right:'6%' }}>
            <NetworkLogo network={network} size={36} white />
          </div>
          {/* Tap hint */}
          {onTap && (
            <div style={{ position:'absolute', top:'88%', left:'50%', transform:'translateX(-50%)',
              fontSize:9, color:'rgba(255,255,255,0.3)',
              fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
              Double-tap to flip
            </div>
          )}
        </div>
      </div>
      {onTap && !flipped && (
        <div style={{ textAlign:'center', marginTop:6,
          fontSize:9, color:'rgb(243, 241, 241)',
          fontFamily:"'DM Sans',sans-serif" }}>Double-tap card to see back</div>
      )}
    </div>
  );
}

/* ─── Sidebar Menu ─────────────────────────────────────────────────────────── */
const TIER_DEFS = {
  1: {
    label: 'Tier 1 — Starter', color: '#6b7280',
    transfer: { daily:     2_000, monthly:    20_000 },
    deposit:  { daily:     5_000, monthly:    25_000 },
    withdraw: { daily:     5_000, monthly:    20_000 },
  },
  2: {
    label: 'Tier 2 — Standard', color: '#3b82f6',
    transfer: { daily:    20_000, monthly:   100_000 },
    deposit:  { daily:    50_000, monthly:   500_000 },
    withdraw: { daily:    50_000, monthly:   500_000 },
  },
  3: {
    label: 'Tier 3 — Premium', color: '#f59e0b',
    transfer: { daily: 1_000_000, monthly:   500_000 },
    deposit:  { daily: 5_000_000, monthly: 20_000_000 },
    withdraw: { daily: 5_000_000, monthly:   200_000 },
  },
};
const fmtLimit = n => '$' + (n >= 1_000_000 ? (n/1_000_000).toFixed(n%1_000_000===0?0:1)+'M'
  : n >= 1_000 ? (n/1_000).toFixed(n%1_000===0?0:1)+'K' : n.toString());

function SidebarMenu({ accounts, user, onClose, onRefresh, onToast, onDeposit, onTransfer, onSelectCard, onCardApproved }) {
  console.log('SidebarMenu - Received accounts:', accounts);
  console.log('SidebarMenu - Credit accounts filtered:', accounts.filter(a => a.type === 'credit' && a.card_network)); 
  const creditAccounts = accounts.filter(a => a.type === 'credit' && a.card_network);
  const [screen,    setScreen]    = useState('main');
  // upgrade flow steps: 'pick-tier' | 'docs-t2' | 'docs-t3' | 'submitting' | 'result'
  const [step,      setStep]      = useState('pick-tier');
  const [tierInfo,  setTierInfo]  = useState(null);   // { tier, pending_request }
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  // upgrade form state
  const [selTier,   setSelTier]   = useState(null);
  const [idType,    setIdType]    = useState('');
  const [idFile,    setIdFile]    = useState(null);   // base64
  const [idFileName,setIdFileName]= useState('');
  const [creditHist,setCreditHist]= useState('');
  const [proofIncome,setProofIncome] = useState(null);
  const [proofName, setProofName] = useState('');
  const [purpose,   setPurpose]   = useState('');
  const [result,    setResult]    = useState(null);   // { ok, message }

  // Loans state
  const [loanStep,     setLoanStep]     = useState(1); // 1=type 2=personal 3=financial 4=review 5=done
  const [loanType,     setLoanType]     = useState('');
  const [loanAmount,   setLoanAmount]   = useState('');
  const [loanTerm,     setLoanTerm]     = useState('36');
  const [loanPurpose,  setLoanPurpose]  = useState('');
  const [loanFirstName,setLoanFirstName]= useState('');
  const [loanLastName, setLoanLastName] = useState('');
  const [loanDOB,      setLoanDOB]      = useState('');
  const [loanAddress,  setLoanAddress]  = useState('');
  const [loanEmployer, setLoanEmployer] = useState('');
  const [loanIncome,   setLoanIncome]   = useState('');
  const [loanEmployStatus, setLoanEmployStatus] = useState('');
  const [loanCreditScore,  setLoanCreditScore]  = useState('');
  const [loanDebt,         setLoanDebt]         = useState('');
  const [loanSaving,       setLoanSaving]        = useState(false);
  const [loanRefNo,        setLoanRefNo]         = useState('');
  const [loanError,        setLoanError]         = useState('');
  const [loanExisting,     setLoanExisting]      = useState(null);
  // Admin state
  const [adminLoans,       setAdminLoans]        = useState([]);
  const [adminLoading,     setAdminLoading]       = useState(false);
  const [adminAction,      setAdminAction]        = useState(null); // {id, type}
  const [adminDeclineReason, setAdminDeclineReason] = useState('');
  const [kycList,      setKycList]      = useState([]);
  const [kycAdminTab,  setKycAdminTab]  = useState('loans'); // 'loans' | 'kyc'  // active loan application
  const [loanCheckLoading, setLoanCheckLoading]  = useState(false);

  // Credit card create state
  // credit card creation state
  const [cardNetwork,  setCardNetwork]  = useState('visa');
  const [cardHolderName, setCardHolderName] = useState(user?.full_name || '');
  const [cardReqStep,  setCardReqStep]  = useState('form'); // form | review | pending | declined
  const [cardReqData,  setCardReqData]  = useState(null);
  const [cardSaving,   setCardSaving]   = useState(false);
  // card management state
  const [viewingCard,  setViewingCard]  = useState(null);   // account object
  const [cardDetails,  setCardDetails]  = useState(null);
  const [cardFlipped,  setCardFlipped]  = useState(false);
  const [cardTapCount, setCardTapCount] = useState(0);
  const [showPin,      setShowPin]      = useState(false);
  const [pinValue,     setPinValue]     = useState('');
  const [pinStep,      setPinStep]      = useState('entry'); // entry | confirm | done

  useEffect(() => {
    if (screen === 'limits') {
      setLoading(true);
      setTierInfo(null);
      limitsApi.me()
        .then(d => setTierInfo(d))
        .catch(() => setTierInfo({ tier: 1, limits: {}, tiers: {}, pending_request: null }))
        .finally(() => setLoading(false));
    }
  }, [screen]);

  const toBase64 = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const handleFileChange = async (e, setter, nameSetter) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await toBase64(file);
    setter(b64); nameSetter(file.name);
  };

  const submitUpgrade = async () => {
    if (!purpose.trim()) { onToast('Please describe the purpose of this upgrade', 'error'); return; }
    if (!idFile)         { onToast('Please upload a valid ID document', 'error'); return; }
    if (!idType)         { onToast('Please select ID type', 'error'); return; }
    if (selTier === 3 && !proofIncome) { onToast('Proof of Income is required for Tier 3', 'error'); return; }

    setSaving(true);
    try {
      const body = {
        requested_tier: selTier,
        id_type:       idType,
        id_document:   idFile,
        credit_history: creditHist || null,
        proof_of_income: proofIncome || null,
        purpose,
      };
      const res = await limitsApi.upgrade(body);
      setResult({ ok: true,  message: res.message });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Submission failed. Please try again.' });
    } finally {
      setSaving(false);
      setStep('result');
    }
  };

  // Check for any pending card request on entering credit screen
  useEffect(() => {
    if (screen === 'loans') {
      setLoanCheckLoading(true);
      setLoanExisting(null);
      loansApi.list().then(apps => {
        const active = apps.find(a => ['pending','under_review','specialist_contact'].includes(a.status));
        if (active) { setLoanExisting(active); }
        else { setLoanExisting(null); setLoanStep(1); }
      }).catch(() => {}).finally(() => setLoanCheckLoading(false));
    }
  }, [screen]);

  useEffect(() => {
    if (screen === 'admin') {
      setAdminLoading(true);
      setKycAdminTab('loans');
      Promise.all([
        loansApi.listAll().catch(() => []),
        profileApi.kycAdminAll().catch(() => []),
      ]).then(([loans, kycs]) => {
        setAdminLoans(loans || []);
        setKycList(kycs || []);
      }).finally(() => setAdminLoading(false));
    }
  }, [screen]);

useEffect(() => {
  if (screen === 'credit') {
    setCardHolderName(user?.full_name || '');
    const hasCreditCards = creditAccounts.length > 0;
    
    if (hasCreditCards) {
      // User has cards - show the cards list
      setCardReqStep('form');
      return;
    }
    
    // No cards yet - check for pending requests
    setCardReqStep('form'); // default
    setLoading(true);
    
    accountsApi.cardReqStatus()
      .then(req => {
        if (!req) {
          setCardReqStep('form');
          return;
        }
        
        if (req.status === 'pending') {
          setCardReqStep('pending');
        } else if (req.status === 'declined') {
          setCardReqData(req);
          setCardReqStep('declined');
        } else if (req.status === 'approved') {
        
          onRefresh().then(() => {
       
            if (creditAccounts.length > 0) {
              setCardReqStep('form');
              if (onCardApproved) onCardApproved();
            } else {
              
              setCardReqStep('form');
            }
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
}, [screen, creditAccounts.length]); 

  const submitCardRequest = async () => {
    if (!cardHolderName.trim()) { onToast('Please enter the name for your card', 'error'); return; }
    setCardSaving(true);
    try {
      await accountsApi.cardRequest({ card_network: cardNetwork, card_name: cardHolderName.trim() });
      setCardReqStep('pending');
    } catch (e) {
      onToast(e.message || 'Failed to submit card request', 'error');
    } finally { setCardSaving(false); }
  };

  const inputSt = {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    color: '#012169', outline: 'none', boxSizing: 'border-box', background: '#fff',
  };
  const labelSt = {
    fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6, fontFamily: "'DM Sans', sans-serif", display: 'block',
  };
  const BackBtn = ({ to }) => (
    <button onClick={() => { setStep(to || 'pick-tier'); }}
      style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:20,
        display:'flex', alignItems:'center', gap:6, color:'#012169',
        fontSize:14, fontWeight:600, fontFamily:"'DM Sans', sans-serif" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      Back
    </button>
  );
  const ScreenBack = ({ label = 'Back' }) => (
    <button onClick={() => setScreen('main')}
      style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:20,
        display:'flex', alignItems:'center', gap:6, color:'#012169',
        fontSize:14, fontWeight:600, fontFamily:"'DM Sans', sans-serif" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      {label}
    </button>
  );

  const menuItems = [
    { id:'limits',   color:'#3b82f6', label:'Limit Management',   sub:'View tier & request upgrade',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg> },
    { id:'credit', color:'#e07b00',
      label: creditAccounts.length > 0 ? 'My Cards' : 'Create Credit Card',
      sub:   creditAccounts.length > 0 ? `${creditAccounts.length} card${creditAccounts.length>1?'s':''} · tap to manage` : 'Apply for a Visa, Mastercard or Amex',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
    { id:'deposit',  color:'#1a7f4b', label:'Deposit Funds',       sub:'Add money to your account',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
    { id:'transfer', color:'#7c3aed', label:'Transfer Money',      sub:'Send funds between accounts',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg> },
    { id:'loans', color:'#0e7490',
      label:'Loans & Credit', sub:'Personal, auto & mortgage loans',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/><line x1="9.5" y1="15.5" x2="14.5" y2="12.5"/></svg> },
    { id:'security', color:'#c8102e', label:'Security Settings',   sub:'Password, 2FA & sessions',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    { id:'admin', color:'#374151',
      label:'Panel', sub:'Manage loan & card applications',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
    { id:'help',     color:'#888',    label:'Help & Support',      sub:'FAQs, contact & disputes',
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  ];

  const handleItem = id => {
    if (id === 'deposit')  { onDeposit(); return; }
    if (id === 'transfer') { onTransfer(); return; }
    if (id === 'security' || id === 'help') { onToast('Coming soon', 'success'); return; }
    if (id === 'admin') { setAdminDeclineReason(''); setAdminAction(null); }
    if (id === 'limits') { setStep('pick-tier'); setResult(null); }
    if (id === 'loans')  { setLoanStep(1); setLoanType(''); setLoanAmount(''); setLoanTerm('36');
      setLoanPurpose(''); setLoanFirstName(user?.full_name?.split(' ')[0]||'');
      setLoanLastName(user?.full_name?.split(' ').slice(1).join(' ')||'');
      setLoanDOB(''); setLoanAddress(''); setLoanEmployer('');
      setLoanIncome(''); setLoanEmployStatus(''); setLoanCreditScore(''); setLoanDebt(''); }
    if (id === 'credit') { setCardNetwork('visa'); }
    setScreen(id);
  };

  const currentTier   = tierInfo?.tier || 1;
  const tierDef       = TIER_DEFS[currentTier];

  const isFullScreen = screen !== 'main';

  return (
    <>
      {/* Backdrop — only shown for sidebar, fullscreen covers everything */}
      {!isFullScreen && (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
          zIndex:300, backdropFilter:'blur(2px)' }}/>
      )}
      <div style={isFullScreen ? {
        position:'fixed', inset:0,
        background:'#f8f9fb', zIndex:400,
        display:'flex', flexDirection:'column',
        animation:'slideInRight 0.22s cubic-bezier(0.4,0,0.2,1)',
      } : {
        position:'fixed', top:0, left:0, bottom:0, width:'82%', maxWidth:340,
        background:'#fff', zIndex:301, display:'flex', flexDirection:'column',
        boxShadow:'4px 0 32px rgba(0,0,0,0.18)',
        animation:'slideInLeft 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header — compact topbar for fullscreen, full sidebar header for main menu */}
        {isFullScreen ? (
          <div style={{ background:'#012169', padding:'0 16px', height:56,
            display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <button onClick={() => {
                if (step === 'docs-t2' || step === 'docs-t3' || step === 'result') {
                  setStep('pick-tier'); setResult(null);
                } else if (screen === 'credit' && cardReqStep === 'new-form') {
                  setCardReqStep('form');
                } else if (screen === 'loans' && !loanExisting && loanStep > 1 && loanStep < 5) {
                  setLoanStep(s => s - 1);
                } else { setScreen('main'); }
              }}
              style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10,
                width:36, height:36, cursor:'pointer', color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff',
              fontFamily:"'DM Sans', sans-serif", letterSpacing:0.3 }}>
              {screen === 'limits'
                ? (step === 'docs-t2' ? 'Upgrade to Tier 2'
                  : step === 'docs-t3' ? 'Upgrade to Tier 3'
                  : step === 'result'  ? 'Request Status'
                  : 'Limit Management')
                : screen === 'credit'
                  ? (creditAccounts.length > 0 && cardReqStep === 'form' ? 'My Cards'
                    : cardReqStep === 'new-form' ? 'New Card Application'
                    : cardReqStep === 'pending'  ? 'Application Pending'
                    : cardReqStep === 'declined' ? 'Application Declined'
                    : 'Apply for a Card')
                : screen === 'loans'
                  ? (loanExisting ? 'Application Status'
                    : loanStep === 1 ? 'Loans & Credit'
                    : loanStep === 2 ? 'Personal Details'
                    : loanStep === 3 ? 'Financial Overview'
                    : loanStep === 4 ? 'Review & Submit'
                    : 'Application Submitted')
                : screen === 'admin' ? 'Admin Panel'
                : 'Menu'}
            </div>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10,
                width:36, height:36, cursor:'pointer', color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ) : (
          <div style={{ background:'#012169', padding:'28px 20px 20px', flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:1,
                  textTransform:'uppercase', fontFamily:"'DM Sans', sans-serif" }}>NexaBank</div>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff',
                  fontFamily:"'DM Sans', sans-serif", marginTop:4 }}>{user?.full_name || 'My Account'}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)',
                  fontFamily:"'DM Sans', sans-serif", marginTop:2 }}>{user?.email || ''}</div>
              </div>
              <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none',
                borderRadius:10, width:34, height:34, cursor:'pointer', color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
              {accounts.map(a => (
                <div key={a.id} style={{ background:'rgba(255,255,255,0.13)', borderRadius:8,
                  padding:'4px 10px', fontSize:11, color:'#fff', fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}>
                  {a.label} · {fmt(a.balance)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto' }}>

          {/* ── Main menu ── */}
          {screen === 'main' && (
            <div style={{ padding:'8px 0' }}>
              {menuItems.map(item => (
                <div key={item.id} onClick={() => handleItem(item.id)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px',
                    cursor:'pointer', borderBottom:'1px solid #f5f5f5' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8f9fb'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <div style={{ width:40, height:40, borderRadius:12, flexShrink:0,
                    background:item.color+'18', display:'flex', alignItems:'center',
                    justifyContent:'center', color:item.color }}>{item.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, fontFamily:"'DM Sans', sans-serif",
                      color:'#012169' }}>{item.label}</div>
                    <div style={{ fontSize:11, color:'#aaa', fontFamily:"'DM Sans', sans-serif",
                      marginTop:1 }}>{item.sub}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              ))}
            </div>
          )}

          {/* ── Limit Management ── */}
          {screen === 'limits' && (
            <div style={{ padding:'20px 20px 40px', maxWidth:600, margin:'0 auto', width:'100%' }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#012169',
                fontFamily:"'DM Sans', sans-serif", marginBottom:4 }}>Your Current Limits</div>

              {loading ? (
                <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}>
                  <Spinner size={28} color="#012169"/>
                </div>
              ) : !tierInfo ? (
                <div style={{ textAlign:'center', paddingTop:40, color:'#bbb',
                  fontFamily:"'DM Sans', sans-serif", fontSize:13 }}>
                  Could not load limit info. Please close and try again.
                </div>
              ) : step === 'pick-tier' && (
                <>
                  {/* Current tier badge */}
                  <div style={{ background:tierDef.color+'15', borderRadius:14, padding:'16px',
                    marginBottom:20, border:`1.5px solid ${tierDef.color}30` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:tierDef.color,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:16, fontWeight:900, color:'#fff' }}>{currentTier}</div>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'#012169',
                          fontFamily:"'DM Sans', sans-serif" }}>{tierDef.label}</div>
                        <div style={{ fontSize:11, color:'#888', fontFamily:"'DM Sans', sans-serif" }}>
                          Current account tier
                        </div>
                      </div>
                    </div>
                    {/* Limits table */}
                    {['transfer','deposit','withdraw'].map(t => (
                      <div key={t} style={{ display:'flex', justifyContent:'space-between',
                        padding:'7px 0', borderTop:'1px solid '+tierDef.color+'20' }}>
                        <span style={{ fontSize:12, color:'#666', fontFamily:"'DM Sans', sans-serif",
                          textTransform:'capitalize', fontWeight:600 }}>{t}</span>
                        <span style={{ fontSize:12, color:'#012169', fontFamily:"'DM Sans', sans-serif" }}>
                          {fmtLimit(tierDef[t].daily)}/day · {fmtLimit(tierDef[t].monthly)}/mo
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Pending request notice */}
                  {tierInfo.pending_request?.status === 'pending' && (
                    <div style={{ background:'#fff7ed', border:'1.5px solid #f59e0b',
                      borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#b45309',
                        fontFamily:"'DM Sans', sans-serif" }}>
                        ⏳ Upgrade Request Pending
                      </div>
                      <div style={{ fontSize:12, color:'#92400e', marginTop:4,
                        fontFamily:"'DM Sans', sans-serif" }}>
                        Your Tier {tierInfo.pending_request.requested_tier} upgrade is under admin review.
                        You will be notified once it's approved.
                      </div>
                    </div>
                  )}

                  {tierInfo.pending_request?.status === 'declined' && (
                    <div style={{ background:'#fff0f0', border:'1.5px solid #c8102e',
                      borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#c8102e',
                        fontFamily:"'DM Sans', sans-serif" }}>❌ Last Request Declined</div>
                      <div style={{ fontSize:12, color:'#7f1d1d', marginTop:4,
                        fontFamily:"'DM Sans', sans-serif" }}>
                        {tierInfo.pending_request.decline_reason || 'Your request was declined.'}
                      </div>
                    </div>
                  )}

                  {/* Upgrade tiers preview */}
                  {currentTier < 3 && tierInfo.pending_request?.status !== 'pending' && (
                    <>
                      <div style={{ fontSize:12, fontWeight:700, color:'#888', textTransform:'uppercase',
                        letterSpacing:0.8, fontFamily:"'DM Sans', sans-serif", marginBottom:12 }}>
                        Available Upgrades
                      </div>
                      {[2,3].filter(t => t > currentTier).map(t => {
                        const td = TIER_DEFS[t];
                        return (
                          <div key={t}
                            onClick={() => { setSelTier(t); setStep(t === 2 ? 'docs-t2' : 'docs-t3'); }}
                            style={{ border:`1.5px solid ${td.color}`, borderRadius:14, padding:'14px 16px',
                              marginBottom:12, cursor:'pointer', background:td.color+'08',
                              opacity: t > currentTier + 1 ? 0.45 : 1,
                              pointerEvents: t > currentTier + 1 ? 'none' : 'auto' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                              <div style={{ fontWeight:800, fontSize:14, color:td.color,
                                fontFamily:"'DM Sans', sans-serif" }}>{td.label}</div>
                              {t > currentTier + 1 && (
                                <span style={{ fontSize:10, background:'#f3f4f6', borderRadius:6,
                                  padding:'2px 8px', color:'#888' }}>Unlock Tier {t-1} first</span>
                              )}
                            </div>
                            {['transfer','deposit','withdraw'].map(cat => (
                              <div key={cat} style={{ display:'flex', justifyContent:'space-between',
                                fontSize:11, color:'#555', fontFamily:"'DM Sans', sans-serif", marginBottom:3 }}>
                                <span style={{ textTransform:'capitalize', fontWeight:600 }}>{cat}</span>
                                <span>{fmtLimit(td[cat].daily)}/day · {fmtLimit(td[cat].monthly)}/mo</span>
                              </div>
                            ))}
                            <div style={{ marginTop:10, fontSize:12, fontWeight:700, color:td.color,
                              display:'flex', alignItems:'center', gap:4, fontFamily:"'DM Sans', sans-serif" }}>
                              Upgrade to {td.label}
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M9 18l6-6-6-6"/>
                              </svg>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {currentTier === 3 && (
                    <div style={{ textAlign:'center', padding:'20px 0', color:'#f59e0b',
                      fontWeight:700, fontFamily:"'DM Sans', sans-serif", fontSize:14 }}>
                      🏆 You are on the highest tier!
                    </div>
                  )}
                </>
              )}

              {/* ── Step: Tier 2 docs ── */}
              {step === 'docs-t2' && (
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#012169',
                    fontFamily:"'DM Sans', sans-serif", marginBottom:4 }}>
                    Upgrade to Tier 2
                  </div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans', sans-serif", marginBottom:20 }}>
                    Submit your ID and credit history for review. You must have been banking with NexaBank for at least 2 months.
                  </div>

                  <label style={labelSt}>ID Type *</label>
                  <select value={idType} onChange={e=>setIdType(e.target.value)}
                    style={{ ...inputSt, marginBottom:16 }}>
                    <option value="">Select ID type…</option>
                    <option>Driver's Licence</option>
                    <option>International Passport</option>
                    <option>National ID Card</option>
                    <option>Voter's Card</option>
                    <option>Residence Permit</option>
                  </select>

                  <label style={labelSt}>Upload ID Document *</label>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                      border:'1.5px dashed #cbd5e1', borderRadius:10, padding:'12px 14px',
                      background:'#f8faff' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span style={{ fontSize:13, color: idFileName ? '#012169' : '#94a3b8',
                        fontFamily:"'DM Sans', sans-serif" }}>
                        {idFileName || 'Click to upload (JPG, PNG, PDF)'}
                      </span>
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display:'none' }}
                        onChange={e => handleFileChange(e, setIdFile, setIdFileName)} />
                    </label>
                  </div>

                  <label style={labelSt}>Credit History (optional)</label>
                  <textarea value={creditHist} onChange={e=>setCreditHist(e.target.value)}
                    placeholder="Describe your credit history or any loans…"
                    rows={3} style={{ ...inputSt, marginBottom:16, resize:'vertical' }} />

                  <label style={labelSt}>Purpose of Limit Increase *</label>
                  <textarea value={purpose} onChange={e=>setPurpose(e.target.value)}
                    placeholder="Why do you need higher limits? (e.g. business transactions, investments…)"
                    rows={3} style={{ ...inputSt, marginBottom:24, resize:'vertical' }} />

                  <button onClick={submitUpgrade} disabled={saving}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:15, fontWeight:700, fontFamily:"'DM Sans', sans-serif",
                      background: saving ? '#bbb' : '#012169', color:'#fff',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {saving ? <><Spinner size={16} color="#fff"/> Submitting…</> : 'Submit Request'}
                  </button>
                </div>
              )}

              {/* ── Step: Tier 3 docs ── */}
              {step === 'docs-t3' && (
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#012169',
                    fontFamily:"'DM Sans', sans-serif", marginBottom:4 }}>
                    Upgrade to Tier 3 — Premium
                  </div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans', sans-serif", marginBottom:20 }}>
                    Premium tier requires Proof of Income in addition to your ID and credit history.
                  </div>

                  <label style={labelSt}>ID Type *</label>
                  <select value={idType} onChange={e=>setIdType(e.target.value)}
                    style={{ ...inputSt, marginBottom:16 }}>
                    <option value="">Select ID type…</option>
                    <option>Driver's Licence</option>
                    <option>International Passport</option>
                    <option>National ID Card</option>
                    <option>Voter's Card</option>
                    <option>Residence Permit</option>
                  </select>

                  <label style={labelSt}>Upload ID Document *</label>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                      border:'1.5px dashed #cbd5e1', borderRadius:10, padding:'12px 14px', background:'#f8faff' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span style={{ fontSize:13, color: idFileName ? '#012169' : '#94a3b8',
                        fontFamily:"'DM Sans', sans-serif" }}>
                        {idFileName || 'Click to upload (JPG, PNG, PDF)'}
                      </span>
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display:'none' }}
                        onChange={e => handleFileChange(e, setIdFile, setIdFileName)} />
                    </label>
                  </div>

                  <label style={labelSt}>Proof of Income *</label>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                      border:'1.5px dashed #f59e0b', borderRadius:10, padding:'12px 14px', background:'#fffbeb' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span style={{ fontSize:13, color: proofName ? '#012169' : '#94a3b8',
                        fontFamily:"'DM Sans', sans-serif" }}>
                        {proofName || 'Pay slip, bank statement or tax return'}
                      </span>
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display:'none' }}
                        onChange={e => handleFileChange(e, setProofIncome, setProofName)} />
                    </label>
                  </div>

                  <label style={labelSt}>Credit History *</label>
                  <textarea value={creditHist} onChange={e=>setCreditHist(e.target.value)}
                    placeholder="Describe your credit history, existing loans or credit score…"
                    rows={3} style={{ ...inputSt, marginBottom:16, resize:'vertical' }} />

                  <label style={labelSt}>Purpose of Limit Increase *</label>
                  <textarea value={purpose} onChange={e=>setPurpose(e.target.value)}
                    placeholder="Why do you need Premium tier limits?"
                    rows={3} style={{ ...inputSt, marginBottom:24, resize:'vertical' }} />

                  <button onClick={submitUpgrade} disabled={saving}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:15, fontWeight:700, fontFamily:"'DM Sans', sans-serif",
                      background: saving ? '#bbb' : '#f59e0b', color:'#fff',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {saving ? <><Spinner size={16} color="#fff"/> Submitting…</> : 'Submit Tier 3 Request'}
                  </button>
                </div>
              )}

              {/* ── Step: result ── */}
              {step === 'result' && result && (
                <div style={{ textAlign:'center', padding:'20px 0' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>
                    {result.ok ? '✅' : '❌'}
                  </div>
                  <div style={{ fontSize:16, fontWeight:700, color: result.ok ? '#1a7f4b' : '#c8102e',
                    fontFamily:"'DM Sans', sans-serif", marginBottom:8 }}>
                    {result.ok ? 'Request Submitted!' : 'Request Declined'}
                  </div>
                  <div style={{ fontSize:13, color:'#555', fontFamily:"'DM Sans', sans-serif",
                    lineHeight:1.6, marginBottom:24 }}>
                    {result.message}
                  </div>
                  <button onClick={() => { setScreen('main'); setStep('pick-tier'); setResult(null); }}
                    style={{ border:'none', borderRadius:12, padding:'12px 28px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans', sans-serif",
                      background:'#012169', color:'#fff', cursor:'pointer' }}>
                    Back to Menu
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Cards Screen ── */}
          {screen === 'credit' && (
            <div style={{ padding:'20px 20px 40px', maxWidth:520, margin:'0 auto', width:'100%' }}>

              {/* ── My Cards view (has cards + no active form step) ── */}
              {creditAccounts.length > 0 && cardReqStep === 'form' && (
                <>
                  <div style={{ fontSize:13, color:'#888', fontFamily:"'DM Sans',sans-serif",
                    marginBottom:16 }}>Tap a card to manage it</div>

                  {creditAccounts.map(card => (
                    <div key={card.id}
                      onClick={() => { onClose(); setTimeout(() => { onSelectCard(card); }, 220); }}
                      style={{ background:'#fff', borderRadius:16, marginBottom:12,
                        boxShadow:'0 2px 12px rgba(0,0,0,0.08)', overflow:'hidden', cursor:'pointer' }}>
                      {/* Mini card preview */}
                      <div style={{ padding:'16px 18px 14px',
                        background: card.card_network === 'mastercard' ? '#1a1a2e'
                                  : card.card_network === 'amex'       ? '#0a3528'
                                  : '#0f2d6e',
                        position:'relative', overflow:'hidden' }}>
                        {/* shine lines */}
                        <div style={{ position:'absolute', inset:0, opacity:0.05,
                          background:'repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(255,255,255,1) 3px,rgba(255,255,255,1) 4px)' }}/>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
                          <div>
                            <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)',
                              fontFamily:"'DM Sans',sans-serif", letterSpacing:1 }}>NexaBank</div>
                            <div style={{ fontSize:13, color:'rgba(255,255,255,0.95)',
                              fontFamily:"'Courier New',monospace", marginTop:6, letterSpacing:2 }}>
                              {card.card_number ? card.card_number.slice(0,4) + ' •••• ' + card.card_number.slice(-4) : '•••• •••• ••••'}
                            </div>
                          </div>
                          <NetworkLogo network={card.card_network} size={30} white />
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end',
                          marginTop:10, position:'relative' }}>
                          <div>
                            <div style={{ fontSize:8, color:'rgba(255,255,255,0.4)',
                              fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase' }}>Holder</div>
                            <div style={{ fontSize:11, color:'rgba(255,255,255,0.85)',
                              fontFamily:"'DM Sans',sans-serif", fontWeight:700, letterSpacing:0.5 }}>
                              {card.card_name || user?.full_name || ''}
                            </div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:8, color:'rgba(255,255,255,0.4)',
                              fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase' }}>Balance</div>
                            <div style={{ fontSize:12, color:'rgba(255,255,255,0.9)',
                              fontFamily:"'DM Sans',sans-serif", fontWeight:800 }}>
                              {fmt(card.balance)}
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Card footer */}
                      <div style={{ padding:'10px 18px', display:'flex', justifyContent:'space-between',
                        alignItems:'center' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%',
                            background: card.card_status === 'blocked' ? '#c8102e'
                                      : card.card_status === 'frozen'  ? '#3b82f6' : '#22c55e' }}/>
                          <span style={{ fontSize:12, fontWeight:600, color:'#555',
                            fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                            {card.card_status || 'Active'}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:'#012169', fontWeight:700,
                          fontFamily:"'DM Sans',sans-serif" }}>
                          Manage →
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Create new card button (only if < 2 cards) */}
                  {creditAccounts.length < 2 && (
                    <button onClick={() => setCardReqStep('new-form')}
                      style={{ width:'100%', border:'2px dashed #c8d8f0', borderRadius:14,
                        padding:'15px', fontSize:14, fontWeight:700,
                        fontFamily:"'DM Sans',sans-serif", background:'#f8faff',
                        color:'#012169', cursor:'pointer', marginTop:4,
                        display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Create New Card
                    </button>
                  )}
                </>
              )}

              {/* ── Create card form (no cards yet, or clicked Create New) ── */}
              {(creditAccounts.length === 0 && cardReqStep === 'form') || cardReqStep === 'new-form' ? (<>
                {creditAccounts.length > 0 && (
                  <button onClick={() => setCardReqStep('form')}
                    style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none',
                      cursor:'pointer', color:'#012169', fontWeight:700, fontSize:13,
                      fontFamily:"'DM Sans',sans-serif", marginBottom:16, padding:0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M19 12H5M12 5l-7 7 7 7"/>
                    </svg>
                    Back to My Cards
                  </button>
                )}

                {/* Live card preview */}
                <CreditCardPreview key={cardNetwork} network={cardNetwork} holderName={cardHolderName} />
                <div style={{ height:20 }}/>

                {/* Network selector */}
                <label style={labelSt}>Card Network *</label>
                <div style={{ display:'flex', gap:10, marginBottom:18 }}>
                  {['visa','mastercard','amex'].map(n => (
                    <div key={n} onClick={() => setCardNetwork(n)}
                      style={{ flex:1, border: cardNetwork===n ? '2px solid #012169' : '1.5px solid #e5e7eb',
                        borderRadius:12, padding:'10px 6px', cursor:'pointer', textAlign:'center',
                        background: cardNetwork===n ? '#f0f4ff' : '#fff', transition:'all 0.15s' }}>
                      <NetworkLogo network={n} size={28} />
                      <div style={{ fontSize:10, fontWeight:700,
                        color: cardNetwork===n ? '#012169' : '#888',
                        marginTop:4, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>{n}</div>
                    </div>
                  ))}
                </div>

                <label style={labelSt}>Name on Card *</label>
                <input type="text" placeholder="As it should appear on the card"
                  value={cardHolderName} onChange={e => setCardHolderName(e.target.value.toUpperCase())}
                  style={{ ...inputSt, marginBottom:8, letterSpacing:1 }} />

                {/* $1 fee notice */}
                <div style={{ background:'#fffbeb', border:'1px solid #f59e0b', borderRadius:10,
                  padding:'10px 14px', marginBottom:20, display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ fontSize:16 }}>ℹ️</span>
                  <div style={{ fontSize:12, color:'#92400e', fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}>
                    Card creation requires a <strong>$1.00 processing fee</strong> debited from your
                    Checking account upon approval.
                  </div>
                </div>

                <button onClick={submitCardRequest} disabled={cardSaving}
                  style={{ width:'100%', border:'none', borderRadius:12, padding:'15px',
                    fontSize:15, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                    background: cardSaving ? '#bbb' : '#012169', color:'#fff',
                    cursor: cardSaving ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {cardSaving ? <><Spinner size={16} color="#fff"/> Submitting…</> : 'Apply for Card'}
                </button>
              </>) : null}

              {/* ── Step: pending ── */}
              {cardReqStep === 'pending' && (
                <div style={{ textAlign:'center', paddingTop:20 }}>
                  <div style={{ fontSize:56, marginBottom:16 }}>⏳</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#012169',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>Request Under Review</div>
                  <div style={{ fontSize:13, color:'#666', fontFamily:"'DM Sans',sans-serif",
                    lineHeight:1.6, marginBottom:24 }}>
                    Your card application has been submitted. Our team is reviewing it and you'll
                    receive a notification once it's approved. The $1.00 processing fee will only
                    be charged upon approval.
                  </div>
                  <div style={{ background:'#f0f4ff', borderRadius:14, padding:'16px',
                    marginBottom:24, textAlign:'left' }}>
                    <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif",
                      textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>What happens next</div>
                    {['Our team reviews your application','$1.00 fee debited from your Checking account','Your card is activated and ready to use'].map((s,i) => (
                      <div key={i} style={{ display:'flex', gap:10, marginBottom:8, alignItems:'flex-start' }}>
                        <div style={{ width:20, height:20, borderRadius:'50%', background:'#012169',
                          color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center',
                          justifyContent:'center', flexShrink:0, fontFamily:"'DM Sans',sans-serif" }}>{i+1}</div>
                        <div style={{ fontSize:12, color:'#444', fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}>{s}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                    accountsApi.cardReqStatus().then(req => {
                      if (!req) return;
                      if (req.status === 'approved') { onRefresh(); onClose(); }
                      else if (req.status === 'declined') { setCardReqData(req); setCardReqStep('declined'); }
                      else onToast('Still under review — check back shortly', 'info');
                    }).catch(() => onToast('Could not check status', 'error'));
                  }}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'13px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                      background:'#012169', color:'#fff', cursor:'pointer', marginBottom:10 }}>
                    Check Approval Status
                  </button>
                  <button onClick={() => setScreen('main')}
                    style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:12, padding:'12px',
                      fontSize:14, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
                      background:'#fff', color:'#888', cursor:'pointer' }}>
                    Back to Menu
                  </button>
                </div>
              )}

              {/* ── Step: declined ── */}
              {cardReqStep === 'declined' && (
                <div style={{ textAlign:'center', paddingTop:20 }}>
                  <div style={{ fontSize:56, marginBottom:16 }}>❌</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#c8102e',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>Application Declined</div>
                  <div style={{ fontSize:13, color:'#666', fontFamily:"'DM Sans',sans-serif",
                    lineHeight:1.6, marginBottom:16 }}>
                    {cardReqData?.decline_reason || 'Your card application was declined.'}
                  </div>
                  <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                    <button onClick={() => setCardReqStep(creditAccounts.length > 0 ? 'new-form' : 'form')}
                      style={{ border:'1.5px solid #012169', borderRadius:12, padding:'12px 24px',
                        fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                        background:'#fff', color:'#012169', cursor:'pointer' }}>
                      Try Again
                    </button>
                    <button onClick={() => setScreen('main')}
                      style={{ border:'none', borderRadius:12, padding:'12px 24px',
                        fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                        background:'#012169', color:'#fff', cursor:'pointer' }}>
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* ── Admin Panel Screen ── */}
          {screen === 'admin' && (
            <div style={{ padding:'20px 16px 60px' }}>

              {/* Tab switcher */}
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                {[['loans','Loans'],['kyc','KYC']].map(([tab,label]) => (
                  <button key={tab} onClick={() => setKycAdminTab(tab)}
                    style={{ flex:1, padding:'9px', borderRadius:10, border:'none',
                      background: kycAdminTab===tab ? '#012169' : '#f0f2f5',
                      color: kycAdminTab===tab ? '#fff' : '#555',
                      fontSize:13, fontWeight:700, cursor:'pointer',
                      fontFamily:"'DM Sans',sans-serif" }}>
                    {label} {tab==='kyc' ? `(${kycList.filter(k=>k.status==='pending').length})` : `(${adminLoans.filter(l=>['pending','under_review','specialist_contact'].includes(l.status)).length})`}
                  </button>
                ))}
              </div>

              {adminLoading && (
                <div style={{ display:'flex', justifyContent:'center', paddingTop:50 }}>
                  <Spinner size={30} color="#012169"/>
                </div>
              )}

              {/* ── KYC Tab ── */}
              {!adminLoading && kycAdminTab === 'kyc' && (
                <>
                  {kycList.length === 0 && (
                    <div style={{ textAlign:'center', paddingTop:50, color:'#bbb',
                      fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>
                      No KYC submissions yet.
                    </div>
                  )}
                  {kycList.map(kyc => {
                    const kycSC = {
                      pending:  { bg:'#fef3c715', border:'#f59e0b40', text:'#b45309', label:'Pending' },
                      verified: { bg:'#d1fae515', border:'#1a7f4b40', text:'#1a7f4b', label:'Verified ✓' },
                      rejected: { bg:'#fee2e215', border:'#c8102e40', text:'#c8102e', label:'Rejected' },
                    }[kyc.status] || { bg:'#f5f5f5', border:'#ddd', text:'#888', label: kyc.status };
                    return (
                      <div key={kyc.id} style={{ border:'1.5px solid #e5e7eb', borderRadius:14,
                        marginBottom:14, overflow:'hidden', background:'#fff' }}>
                        <div style={{ padding:'12px 16px', borderBottom:'1px solid #f5f5f5',
                          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color:'#012169',
                              fontFamily:"'DM Sans',sans-serif" }}>{kyc.full_name}</div>
                            <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{kyc.email}</div>
                          </div>
                          <div style={{ padding:'4px 10px', borderRadius:20, fontSize:11,
                            fontWeight:700, background:kycSC.bg,
                            border:`1px solid ${kycSC.border}`, color:kycSC.text }}>
                            {kycSC.label}
                          </div>
                        </div>
                        <div style={{ padding:'10px 16px', display:'flex', gap:16, flexWrap:'wrap',
                          borderBottom:'1px solid #f5f5f5', fontSize:11, color:'#888' }}>
                          <span>SSN: •••-••-{(kyc.ssn||'').slice(-4)}</span>
                          <span>Submitted: {new Date(kyc.submitted_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                        </div>
                        {kyc.status === 'pending' && (
                          <div style={{ padding:'10px 16px', display:'flex', gap:8 }}>
                            <button onClick={async () => {
                              try {
                                await profileApi.kycApprove(kyc.id);
                                setKycList(prev => prev.map(k => k.id===kyc.id ? {...k,status:'verified'} : k));
                                onToast('KYC approved!','success');
                              } catch(e) { onToast(e.message||'Error','error'); }
                            }} style={{ flex:1, padding:'8px', border:'1.5px solid #1a7f4b',
                              borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                              background:'#1a7f4b10', color:'#1a7f4b',
                              fontFamily:"'DM Sans',sans-serif" }}>
                              ✓ Approve KYC
                            </button>
                            <button onClick={async () => {
                              const reason = window.prompt('Rejection reason (optional):') || undefined;
                              try {
                                await profileApi.kycReject(kyc.id, reason);
                                setKycList(prev => prev.map(k => k.id===kyc.id ? {...k,status:'rejected'} : k));
                                onToast('KYC rejected','success');
                              } catch(e) { onToast(e.message||'Error','error'); }
                            }} style={{ padding:'8px 12px', border:'1.5px solid #e5e7eb',
                              borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                              background:'#fff', color:'#c8102e',
                              fontFamily:"'DM Sans',sans-serif" }}>
                              ✕ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Loans Tab ── */}
              {!adminLoading && kycAdminTab === 'loans' && adminLoans.length === 0 && (
                <div style={{ textAlign:'center', paddingTop:50, color:'#bbb',
                  fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>
                  No loan applications yet.
                </div>
              )}

              {!adminLoading && kycAdminTab === 'loans' && adminLoans.map(loan => {
                const statusColors = {
                  pending:            { bg:'#f59e0b15', border:'#f59e0b40', text:'#b45309', label:'Pending' },
                  under_review:       { bg:'#0e749015', border:'#0e749040', text:'#0e7490', label:'Under Review' },
                  specialist_contact: { bg:'#7c3aed15', border:'#7c3aed40', text:'#7c3aed', label:'Specialist Assigned' },
                  approved:           { bg:'#1a7f4b15', border:'#1a7f4b40', text:'#1a7f4b', label:'Approved' },
                  declined:           { bg:'#c8102e15', border:'#c8102e40', text:'#c8102e', label:'Declined' },
                };
                const sc = statusColors[loan.status] || statusColors.pending;
                const isActive = ['pending','under_review','specialist_contact'].includes(loan.status);
                const isDeclineOpen = adminAction?.id === loan.id && adminAction?.type === 'decline';

                return (
                  <div key={loan.id} style={{ border:'1.5px solid #e5e7eb', borderRadius:14,
                    marginBottom:14, overflow:'hidden', background:'#fff' }}>

                    {/* Header row */}
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid #f5f5f5',
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:'#012169',
                          fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                          {loan.loan_type} Loan · {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(loan.amount)}
                        </div>
                        <div style={{ fontSize:11, color:'#888', fontFamily:"'DM Sans',sans-serif", marginTop:2 }}>
                          {loan.full_name} · {loan.email}
                        </div>
                      </div>
                      <div style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                        fontFamily:"'DM Sans',sans-serif", background:sc.bg,
                        border:`1px solid ${sc.border}`, color:sc.text, flexShrink:0 }}>
                        {sc.label}
                      </div>
                    </div>

                    {/* Details */}
                    <div style={{ padding:'10px 16px', display:'flex', gap:16,
                      flexWrap:'wrap', borderBottom:'1px solid #f5f5f5' }}>
                      {[
                        ['Ref', loan.reference_no],
                        ['Term', loan.term_months+'mo'],
                        ['Income', new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(loan.annual_income)],
                        ['Credit', loan.credit_score_range],
                      ].map(([k,v]) => (
                        <div key={k}>
                          <div style={{ fontSize:9, color:'#aaa', fontFamily:"'DM Sans',sans-serif",
                            textTransform:'uppercase', letterSpacing:0.6 }}>{k}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#222',
                            fontFamily: k==='Ref' ? "'Courier New',monospace" : "'DM Sans',sans-serif",
                            marginTop:2 }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons — only for active applications */}
                    {isActive && (
                      <div style={{ padding:'10px 16px' }}>
                        {!isDeclineOpen ? (
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                            {loan.status === 'pending' && (
                              <button onClick={async () => {
                                try {
                                  await loansApi.review(loan.id);
                                  setAdminLoans(prev => prev.map(l => l.id===loan.id ? {...l,status:'under_review'} : l));
                                  onToast('Moved to Under Review', 'success');
                                } catch(e) { onToast(e.message||'Error','error'); }
                              }} style={{ flex:1, padding:'8px', border:'1.5px solid #0e7490',
                                borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                                background:'#0e749010', color:'#0e7490',
                                fontFamily:"'DM Sans',sans-serif" }}>
                                Mark Under Review
                              </button>
                            )}
                            {loan.status === 'under_review' && (
                              <button onClick={async () => {
                                try {
                                  await loansApi.specialist(loan.id);
                                  setAdminLoans(prev => prev.map(l => l.id===loan.id ? {...l,status:'specialist_contact'} : l));
                                  onToast('Specialist assigned', 'success');
                                } catch(e) { onToast(e.message||'Error','error'); }
                              }} style={{ flex:1, padding:'8px', border:'1.5px solid #7c3aed',
                                borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                                background:'#7c3aed10', color:'#7c3aed',
                                fontFamily:"'DM Sans',sans-serif" }}>
                                Assign Specialist
                              </button>
                            )}
                            <button onClick={async () => {
                              try {
                                await loansApi.approve(loan.id);
                                setAdminLoans(prev => prev.map(l => l.id===loan.id ? {...l,status:'approved'} : l));
                                onRefresh();
                                onToast('Loan approved & disbursed!', 'success');
                              } catch(e) { onToast(e.message||'Error','error'); }
                            }} style={{ flex:1, padding:'8px', border:'1.5px solid #1a7f4b',
                              borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                              background:'#1a7f4b10', color:'#1a7f4b',
                              fontFamily:"'DM Sans',sans-serif" }}>
                              ✓ Approve & Disburse
                            </button>
                            <button onClick={() => { setAdminAction({id:loan.id,type:'decline'}); setAdminDeclineReason(''); }}
                              style={{ padding:'8px 12px', border:'1.5px solid #e5e7eb',
                                borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                                background:'#fff', color:'#c8102e',
                                fontFamily:"'DM Sans',sans-serif" }}>
                              ✕ Decline
                            </button>
                          </div>
                        ) : (
                          <div>
                            <input value={adminDeclineReason}
                              onChange={e => setAdminDeclineReason(e.target.value)}
                              placeholder="Reason for declining (optional)"
                              style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:8,
                                padding:'9px 12px', fontSize:12, fontFamily:"'DM Sans',sans-serif",
                                outline:'none', marginBottom:8, boxSizing:'border-box',
                                color:'#111', background:'#fafafa' }}
                            />
                            <div style={{ display:'flex', gap:8 }}>
                              <button onClick={async () => {
                                try {
                                  await loansApi.decline(loan.id, adminDeclineReason||undefined);
                                  setAdminLoans(prev => prev.map(l => l.id===loan.id ? {...l,status:'declined',decline_reason:adminDeclineReason} : l));
                                  setAdminAction(null);
                                  onToast('Application declined', 'success');
                                } catch(e) { onToast(e.message||'Error','error'); }
                              }} style={{ flex:1, padding:'8px', border:'none', borderRadius:8,
                                fontSize:12, fontWeight:700, cursor:'pointer',
                                background:'#c8102e', color:'#fff',
                                fontFamily:"'DM Sans',sans-serif" }}>
                                Confirm Decline
                              </button>
                              <button onClick={() => setAdminAction(null)}
                                style={{ padding:'8px 14px', border:'1.5px solid #e5e7eb',
                                  borderRadius:8, fontSize:12, cursor:'pointer',
                                  background:'#fff', color:'#888',
                                  fontFamily:"'DM Sans',sans-serif" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Declined reason */}
                    {loan.status === 'declined' && loan.decline_reason && (
                      <div style={{ padding:'8px 16px', background:'#fef2f2',
                        fontSize:11, color:'#b91c1c', fontFamily:"'DM Sans',sans-serif" }}>
                        Reason: {loan.decline_reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* ── Loans & Credit Screen ── */}
          {screen === 'loans' && (
            <div style={{ padding:'24px 20px 60px', maxWidth:600, margin:'0 auto', width:'100%' }}>

              {/* Loading check */}
              {loanCheckLoading && (
                <div style={{ display:'flex', justifyContent:'center', alignItems:'center',
                  paddingTop:60, flexDirection:'column', gap:14 }}>
                  <Spinner size={32} color="#012169"/>
                  <div style={{ fontSize:13, color:'#888', fontFamily:"'DM Sans',sans-serif" }}>
                    Checking your applications…
                  </div>
                </div>
              )}

              {/* Existing active application — show status instead of form */}
              {!loanCheckLoading && loanExisting && (
                <div>
                  {/* Status badge */}
                  <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28 }}>
                    <div style={{ width:52, height:52, borderRadius:16, flexShrink:0,
                      background: loanExisting.status === 'under_review' ? '#0e749018' : '#f59e0b18',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {loanExisting.status === 'under_review' ? (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0e7490" strokeWidth="1.8" strokeLinecap="round">
                          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                      ) : (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize:17, fontWeight:800, color:'#012169',
                        fontFamily:"'DM Sans',sans-serif" }}>Application In Progress</div>
                      <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif", marginTop:2 }}>
                        Submitted {new Date(loanExisting.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                      </div>
                    </div>
                  </div>

                  {/* Status pill */}
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6,
                    padding:'6px 14px', borderRadius:20, marginBottom:20,
                    background: loanExisting.status === 'under_review' ? '#0e749015' : loanExisting.status === 'specialist_contact' ? '#7c3aed15' : '#f59e0b15',
                    border: `1.5px solid ${loanExisting.status === 'under_review' ? '#0e749040' : loanExisting.status === 'specialist_contact' ? '#7c3aed40' : '#f59e0b40'}` }}>
                    <div style={{ width:7, height:7, borderRadius:'50%',
                      background: loanExisting.status === 'under_review' ? '#0e7490' : loanExisting.status === 'specialist_contact' ? '#7c3aed' : '#f59e0b',
                      animation:'boa-spin 1.8s linear infinite' }}/>
                    <span style={{ fontSize:12, fontWeight:700,
                      color: loanExisting.status === 'under_review' ? '#0e7490' : loanExisting.status === 'specialist_contact' ? '#7c3aed' : '#b45309',
                      fontFamily:"'DM Sans',sans-serif" }}>
                      {loanExisting.status === 'under_review' ? 'Under Review' : loanExisting.status === 'specialist_contact' ? 'Specialist Assigned' : 'Pending Review'}
                    </span>
                  </div>

                  {/* Application summary */}
                  <div style={{ border:'1.5px solid #e5e7eb', borderRadius:14, overflow:'hidden', marginBottom:14 }}>
                    <div style={{ background:'#f8f9fb', padding:'10px 16px', borderBottom:'1.5px solid #e5e7eb' }}>
                      <div style={{ fontSize:11, fontWeight:800, color:'#012169',
                        fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>
                        Application Summary
                      </div>
                    </div>
                    {[
                      ['Reference No.', loanExisting.reference_no],
                      ['Loan Type', loanExisting.loan_type.charAt(0).toUpperCase()+loanExisting.loan_type.slice(1)+' Loan'],
                      ['Amount Requested', fmt(parseFloat(loanExisting.amount))],
                      ['Repayment Term', loanExisting.term_months+' months'],
                      ['Est. Monthly', fmt(parseFloat(loanExisting.amount) * 1.079 / loanExisting.term_months)],
                      ['Credit Score', loanExisting.credit_score_range],
                    ].map(([k,v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between',
                        padding:'11px 16px', borderBottom:'1px solid #f5f5f5', alignItems:'center' }}>
                        <span style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif" }}>{k}</span>
                        <span style={{ fontSize:13, fontWeight: k==='Reference No.' ? 800 : 600,
                          color: k==='Reference No.' ? '#012169' : '#111',
                          fontFamily: k==='Reference No.' ? "'Courier New',monospace" : "'DM Sans',sans-serif",
                          letterSpacing: k==='Reference No.' ? 1 : 0 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Timeline */}
                  <div style={{ border:'1.5px solid #e5e7eb', borderRadius:14, overflow:'hidden', marginBottom:24 }}>
                    <div style={{ background:'#f8f9fb', padding:'10px 16px', borderBottom:'1.5px solid #e5e7eb' }}>
                      <div style={{ fontSize:11, fontWeight:800, color:'#012169',
                        fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>
                        What Happens Next
                      </div>
                    </div>
                    {[
                      { icon:'✅', label:'Application Received', done: true },
                      { icon:'🔍', label:'Under Review by Loan Team', done: ['under_review','specialist_contact'].includes(loanExisting.status) },
                      { icon:'📞', label:'Specialist Assigned', done: loanExisting.status === 'specialist_contact' },
                      { icon:'💰', label:'Funds Disbursed to Account', done: false },
                    ].map((step, i) => (
                      <div key={i} style={{ display:'flex', gap:12, padding:'12px 16px',
                        borderBottom: i < 3 ? '1px solid #f5f5f5' : 'none',
                        alignItems:'center',
                        opacity: step.done ? 1 : 0.45 }}>
                        <div style={{ fontSize:18, flexShrink:0 }}>{step.icon}</div>
                        <div style={{ flex:1, fontSize:13, fontWeight: step.done ? 700 : 500,
                          color: step.done ? '#222' : '#888',
                          fontFamily:"'DM Sans',sans-serif" }}>{step.label}</div>
                        {step.done && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a7f4b" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Secure badge */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    paddingTop:16, borderTop:'1px solid #f0f0f0' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span style={{ fontSize:11, color:'#9ca3af', fontFamily:"'DM Sans',sans-serif", fontWeight:500 }}>
                      256-bit SSL Encrypted · Your data is secure
                    </span>
                  </div>
                </div>
              )}

              {/* No existing application — show the form */}
              {!loanCheckLoading && !loanExisting && <>

              {/* Progress bar */}
              {loanStep < 5 && (
                <div style={{ marginBottom:28 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    {['Loan Type','Personal','Financial','Review'].map((label, i) => (
                      <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', fontSize:12,
                          fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                          display:'flex', alignItems:'center', justifyContent:'center',
                          background: loanStep > i+1 ? '#0e7490' : loanStep === i+1 ? '#012169' : '#e5e7eb',
                          color: loanStep >= i+1 ? '#fff' : '#9ca3af',
                          transition:'all 0.2s' }}>
                          {loanStep > i+1 ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : i+1}
                        </div>
                        <div style={{ fontSize:9, marginTop:4, color: loanStep === i+1 ? '#012169' : '#9ca3af',
                          fontWeight: loanStep === i+1 ? 700 : 400, fontFamily:"'DM Sans',sans-serif",
                          textAlign:'center' }}>{label}</div>
                      </div>
                    ))}
                    <div style={{ position:'absolute', left:36, right:36, top:14, height:2,
                      background:'#e5e7eb', zIndex:-1 }}/>
                  </div>
                  <div style={{ height:3, background:'#e5e7eb', borderRadius:2, marginTop:4 }}>
                    <div style={{ height:'100%', borderRadius:2, background:'linear-gradient(90deg,#012169,#0e7490)',
                      width: `${((loanStep-1)/3)*100}%`, transition:'width 0.35s ease' }}/>
                  </div>
                </div>
              )}

              {/* ── STEP 1: Loan Type ── */}
              {loanStep === 1 && (
                <>
                  <div style={{ fontSize:18, fontWeight:800, color:'#012169',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:4 }}>Choose Loan Type</div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif", marginBottom:24 }}>
                    Select the type of credit facility you need
                  </div>

                  {[
                    { id:'personal',  label:'Personal Loan',   amount:'Up to $50,000',   rate:'From 7.9% APR',
                      icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
                      desc:'For personal expenses, travel, medical or any purpose', color:'#0e7490' },
                    { id:'auto',      label:'Auto Loan',       amount:'Up to $80,000',   rate:'From 5.4% APR',
                      icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="10" width="22" height="8" rx="2"/><path d="M5 10V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>,
                      desc:'Finance a new or used vehicle purchase', color:'#7c3aed' },
                    { id:'mortgage',  label:'Home Mortgage',   amount:'Up to $2,000,000', rate:'From 4.1% APR',
                      icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
                      desc:'Purchase or refinance your home or property', color:'#b45309' },
                    { id:'business',  label:'Business Loan',   amount:'Up to $500,000',  rate:'From 6.5% APR',
                      icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
                      desc:'Fund your business growth, inventory or equipment', color:'#1a7f4b' },
                  ].map(lt => (
                    <div key={lt.id} onClick={() => setLoanType(lt.id)}
                      style={{ border: loanType === lt.id ? `2px solid ${lt.color}` : '1.5px solid #e5e7eb',
                        borderRadius:14, padding:'16px', marginBottom:12, cursor:'pointer',
                        background: loanType === lt.id ? lt.color+'08' : '#fff',
                        transition:'all 0.15s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
                          background: loanType === lt.id ? lt.color+'20' : '#f3f4f6',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          color: loanType === lt.id ? lt.color : '#6b7280' }}>{lt.icon}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:'#111',
                            fontFamily:"'DM Sans',sans-serif" }}>{lt.label}</div>
                          <div style={{ fontSize:11, color:'#888', fontFamily:"'DM Sans',sans-serif",
                            marginTop:2 }}>{lt.desc}</div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color: loanType === lt.id ? lt.color : '#012169',
                            fontFamily:"'DM Sans',sans-serif" }}>{lt.amount}</div>
                          <div style={{ fontSize:11, color:'#0e7490', fontFamily:"'DM Sans',sans-serif",
                            marginTop:1 }}>{lt.rate}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button onClick={() => { if (loanType) setLoanStep(2); }}
                    disabled={!loanType}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                      background: loanType ? '#012169' : '#e5e7eb',
                      color: loanType ? '#fff' : '#aaa', cursor: loanType ? 'pointer' : 'not-allowed',
                      marginTop:8, transition:'all 0.2s' }}>
                    Continue →
                  </button>
                </>
              )}

              {/* ── STEP 2: Personal Details ── */}
              {loanStep === 2 && (
                <>
                  <div style={{ fontSize:18, fontWeight:800, color:'#012169',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:4 }}>Personal Details</div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif", marginBottom:24 }}>
                    We need a few details to process your application
                  </div>

                  {[
                    { label:'First Name', value:loanFirstName, set:setLoanFirstName, type:'text', placeholder:'John' },
                    { label:'Last Name',  value:loanLastName,  set:setLoanLastName,  type:'text', placeholder:'Doe' },
                    { label:'Date of Birth', value:loanDOB, set:setLoanDOB, type:'date', placeholder:'' },
                    { label:'Residential Address', value:loanAddress, set:setLoanAddress, type:'text', placeholder:'123 Main Street, City, State' },
                  ].map(field => (
                    <div key={field.label} style={{ marginBottom:18 }}>
                      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                        fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                        letterSpacing:0.7, marginBottom:7 }}>{field.label} *</label>
                      <input type={field.type} value={field.value} placeholder={field.placeholder}
                        onChange={e => field.set(e.target.value)}
                        style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:10,
                          padding:'11px 14px', fontSize:14, fontFamily:"'DM Sans',sans-serif",
                          color:'#111', outline:'none', background:'#fafafa',
                          boxSizing:'border-box' }}
                        onFocus={e => e.target.style.borderColor='#012169'}
                        onBlur={e => e.target.style.borderColor='#e5e7eb'}
                      />
                    </div>
                  ))}

                  <div style={{ marginBottom:20 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                      fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                      letterSpacing:0.7, marginBottom:7 }}>Employment Status *</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {['Employed','Self-Employed','Business Owner','Retired','Other'].map(s => (
                        <div key={s} onClick={() => setLoanEmployStatus(s)}
                          style={{ padding:'8px 14px', borderRadius:20, fontSize:12, fontWeight:600,
                            fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
                            border: loanEmployStatus === s ? '1.5px solid #012169' : '1.5px solid #e5e7eb',
                            background: loanEmployStatus === s ? '#012169' : '#fff',
                            color: loanEmployStatus === s ? '#fff' : '#555',
                            transition:'all 0.15s' }}>
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => { if (loanFirstName && loanLastName && loanDOB && loanAddress && loanEmployStatus) setLoanStep(3); }}
                    disabled={!loanFirstName || !loanLastName || !loanDOB || !loanAddress || !loanEmployStatus}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                      background: (loanFirstName && loanLastName && loanDOB && loanAddress && loanEmployStatus) ? '#012169' : '#e5e7eb',
                      color: (loanFirstName && loanLastName && loanDOB && loanAddress && loanEmployStatus) ? '#fff' : '#aaa',
                      cursor: (loanFirstName && loanLastName && loanDOB && loanAddress && loanEmployStatus) ? 'pointer' : 'not-allowed',
                      transition:'all 0.2s' }}>
                    Continue →
                  </button>
                </>
              )}

              {/* ── STEP 3: Financial Overview ── */}
              {loanStep === 3 && (
                <>
                  <div style={{ fontSize:18, fontWeight:800, color:'#012169',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:4 }}>Financial Overview</div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif", marginBottom:24 }}>
                    Your financial details help us find the best rate for you
                  </div>

                  {/* Loan amount slider */}
                  <div style={{ marginBottom:22 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                      fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                      letterSpacing:0.7, marginBottom:7 }}>Loan Amount *</label>
                    <div style={{ border:'1.5px solid #e5e7eb', borderRadius:10,
                      padding:'11px 14px', background:'#fafafa', display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:18, color:'#012169', fontWeight:700,
                        fontFamily:"'DM Sans',sans-serif" }}>$</span>
                      <input type="number" value={loanAmount} placeholder="e.g. 15000"
                        onChange={e => setLoanAmount(e.target.value)}
                        style={{ flex:1, border:'none', background:'transparent', fontSize:15,
                          fontFamily:"'DM Sans',sans-serif", color:'#111', outline:'none' }}
                      />
                    </div>
                  </div>

                  {/* Loan term */}
                  <div style={{ marginBottom:22 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                      fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                      letterSpacing:0.7, marginBottom:7 }}>Repayment Term *</label>
                    <div style={{ display:'flex', gap:8 }}>
                      {['12','24','36','48','60'].map(m => (
                        <div key={m} onClick={() => setLoanTerm(m)}
                          style={{ flex:1, textAlign:'center', padding:'10px 0', borderRadius:10,
                            border: loanTerm === m ? '2px solid #012169' : '1.5px solid #e5e7eb',
                            background: loanTerm === m ? '#012169' : '#fff',
                            cursor:'pointer', transition:'all 0.15s' }}>
                          <div style={{ fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                            color: loanTerm === m ? '#fff' : '#222' }}>{m}</div>
                          <div style={{ fontSize:9, color: loanTerm === m ? 'rgba(255,255,255,0.7)' : '#aaa',
                            fontFamily:"'DM Sans',sans-serif" }}>mo</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Estimated repayment pill */}
                  {loanAmount && parseFloat(loanAmount) > 0 && (
                    <div style={{ background:'linear-gradient(135deg,#012169,#0e7490)', borderRadius:12,
                      padding:'14px 16px', marginBottom:22, display:'flex', justifyContent:'space-between',
                      alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)',
                          fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>
                          Est. Monthly Payment</div>
                        <div style={{ fontSize:22, fontWeight:900, color:'#fff',
                          fontFamily:"'DM Sans',sans-serif" }}>
                          {fmt(parseFloat(loanAmount) * (1 + 0.079) / parseInt(loanTerm))}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)',
                          fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>
                          Total Cost</div>
                        <div style={{ fontSize:16, fontWeight:700, color:'rgba(255,255,255,0.9)',
                          fontFamily:"'DM Sans',sans-serif" }}>
                          {fmt(parseFloat(loanAmount) * 1.079)}
                        </div>
                      </div>
                    </div>
                  )}

                  {[
                    { label:'Annual Income (Before Tax)', value:loanIncome, set:setLoanIncome, placeholder:'e.g. 65000', prefix:'$' },
                    { label:'Monthly Debt Payments',      value:loanDebt,   set:setLoanDebt,   placeholder:'e.g. 500',   prefix:'$' },
                  ].map(field => (
                    <div key={field.label} style={{ marginBottom:18 }}>
                      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                        fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                        letterSpacing:0.7, marginBottom:7 }}>{field.label} *</label>
                      <div style={{ border:'1.5px solid #e5e7eb', borderRadius:10,
                        padding:'11px 14px', background:'#fafafa', display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:16, color:'#888', fontWeight:600,
                          fontFamily:"'DM Sans',sans-serif" }}>{field.prefix}</span>
                        <input type="number" value={field.value} placeholder={field.placeholder}
                          onChange={e => field.set(e.target.value)}
                          style={{ flex:1, border:'none', background:'transparent', fontSize:15,
                            fontFamily:"'DM Sans',sans-serif", color:'#111', outline:'none' }}
                        />
                      </div>
                    </div>
                  ))}

                  <div style={{ marginBottom:22 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                      fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                      letterSpacing:0.7, marginBottom:7 }}>Credit Score Range *</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {[
                        { label:'Excellent', sub:'750+', color:'#1a7f4b' },
                        { label:'Good',      sub:'700–749', color:'#0e7490' },
                        { label:'Fair',      sub:'650–699', color:'#b45309' },
                        { label:'Poor',      sub:'Below 650', color:'#c8102e' },
                      ].map(s => (
                        <div key={s.label} onClick={() => setLoanCreditScore(s.label)}
                          style={{ flex:1, minWidth:'calc(50% - 4px)', textAlign:'center',
                            padding:'10px 8px', borderRadius:10,
                            border: loanCreditScore === s.label ? `2px solid ${s.color}` : '1.5px solid #e5e7eb',
                            background: loanCreditScore === s.label ? s.color+'12' : '#fff',
                            cursor:'pointer', transition:'all 0.15s' }}>
                          <div style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                            color: loanCreditScore === s.label ? s.color : '#222' }}>{s.label}</div>
                          <div style={{ fontSize:10, color:'#aaa', fontFamily:"'DM Sans',sans-serif" }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom:20 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#555',
                      fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase',
                      letterSpacing:0.7, marginBottom:7 }}>Loan Purpose</label>
                    <textarea value={loanPurpose} onChange={e => setLoanPurpose(e.target.value)}
                      placeholder="Briefly describe what you'll use the loan for..."
                      rows={3}
                      style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:10,
                        padding:'11px 14px', fontSize:13, fontFamily:"'DM Sans',sans-serif",
                        color:'#111', outline:'none', background:'#fafafa',
                        resize:'none', boxSizing:'border-box' }}
                      onFocus={e => e.target.style.borderColor='#012169'}
                      onBlur={e => e.target.style.borderColor='#e5e7eb'}
                    />
                  </div>

                  <button onClick={() => { if (loanAmount && loanIncome && loanCreditScore) setLoanStep(4); }}
                    disabled={!loanAmount || !loanIncome || !loanCreditScore}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                      background: (loanAmount && loanIncome && loanCreditScore) ? '#012169' : '#e5e7eb',
                      color: (loanAmount && loanIncome && loanCreditScore) ? '#fff' : '#aaa',
                      cursor: (loanAmount && loanIncome && loanCreditScore) ? 'pointer' : 'not-allowed',
                      transition:'all 0.2s' }}>
                    Review Application →
                  </button>
                </>
              )}

              {/* ── STEP 4: Review & Submit ── */}
              {loanStep === 4 && (
                <>
                  <div style={{ fontSize:18, fontWeight:800, color:'#012169',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:4 }}>Review & Submit</div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif", marginBottom:24 }}>
                    Please confirm your information before submitting
                  </div>

                  {/* Summary cards */}
                  {[
                    { title:'Loan Details', rows:[
                      ['Type', loanType.charAt(0).toUpperCase()+loanType.slice(1)+' Loan'],
                      ['Amount', fmt(parseFloat(loanAmount)||0)],
                      ['Term', loanTerm+' months'],
                      ['Est. Monthly', fmt(parseFloat(loanAmount||0) * 1.079 / parseInt(loanTerm))],
                    ]},
                    { title:'Personal Details', rows:[
                      ['Full Name', loanFirstName+' '+loanLastName],
                      ['Date of Birth', loanDOB || '—'],
                      ['Address', loanAddress || '—'],
                      ['Employment', loanEmployStatus],
                    ]},
                    { title:'Financial Overview', rows:[
                      ['Annual Income', fmt(parseFloat(loanIncome||0))],
                      ['Monthly Debt', fmt(parseFloat(loanDebt||0))],
                      ['Credit Score', loanCreditScore],
                      ['Purpose', loanPurpose || 'Not specified'],
                    ]},
                  ].map(section => (
                    <div key={section.title} style={{ border:'1.5px solid #e5e7eb', borderRadius:14,
                      marginBottom:14, overflow:'hidden' }}>
                      <div style={{ background:'#f8f9fb', padding:'10px 16px',
                        borderBottom:'1.5px solid #e5e7eb' }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#012169',
                          fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>
                          {section.title}
                        </div>
                      </div>
                      {section.rows.map(([k,v]) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between',
                          padding:'10px 16px', borderBottom:'1px solid #f5f5f5', alignItems:'center' }}>
                          <span style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif" }}>{k}</span>
                          <span style={{ fontSize:13, fontWeight:600, color:'#111',
                            fontFamily:"'DM Sans',sans-serif", maxWidth:'55%', textAlign:'right',
                            wordBreak:'break-word' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Disclaimer */}
                  <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10,
                    padding:'12px 14px', marginBottom:20 }}>
                    <div style={{ fontSize:11, color:'#92400e', fontFamily:"'DM Sans',sans-serif",
                      lineHeight:1.6 }}>
                      By submitting, you consent to a soft credit check which will not affect your credit score.
                      Final rates are subject to full underwriting approval.
                    </div>
                  </div>

                  {loanError && (
                    <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
                      padding:'10px 14px', marginBottom:16, fontSize:12,
                      color:'#b91c1c', fontFamily:"'DM Sans',sans-serif" }}>
                      {loanError}
                    </div>
                  )}
                  <button onClick={async () => {
                    setLoanSaving(true); setLoanError('');
                    try {
                      const res = await loansApi.submit({
                        loan_type: loanType, amount: parseFloat(loanAmount),
                        term_months: parseInt(loanTerm), purpose: loanPurpose,
                        first_name: loanFirstName, last_name: loanLastName,
                        dob: loanDOB, address: loanAddress,
                        employ_status: loanEmployStatus,
                        annual_income: parseFloat(loanIncome),
                        monthly_debt: parseFloat(loanDebt || 0),
                        credit_score_range: loanCreditScore,
                        employer: loanEmployer,
                      });
                      setLoanRefNo(res.reference_no);
                      setLoanStep(5);
                    } catch(e) {
                      setLoanError(e.message || 'Submission failed. Please try again.');
                    } finally { setLoanSaving(false); }
                  }}
                    disabled={loanSaving}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                      background:'#012169', color:'#fff', cursor: loanSaving ? 'not-allowed' : 'pointer',
                      opacity: loanSaving ? 0.75 : 1, transition:'opacity 0.2s',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {loanSaving ? (
                      <>
                        <svg style={{ animation:'boa-spin 0.9s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Submitting…
                      </>
                    ) : 'Submit Application'}
                  </button>
                </>
              )}

              {/* ── STEP 5: Success ── */}
              {loanStep === 5 && (
                <div style={{ textAlign:'center', paddingTop:20 }}>
                  <div style={{ width:72, height:72, borderRadius:'50%',
                    background:'linear-gradient(135deg,#1a7f4b,#059669)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    margin:'0 auto 20px', boxShadow:'0 8px 24px rgba(26,127,75,0.35)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{ fontSize:20, fontWeight:900, color:'#012169',
                    fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>Application Submitted!</div>
                  <div style={{ fontSize:13, color:'#666', fontFamily:"'DM Sans',sans-serif",
                    lineHeight:1.7, marginBottom:28, padding:'0 12px' }}>
                    Your {loanType} loan application for <strong>{fmt(parseFloat(loanAmount||0))}</strong> has been received.
                    A loan specialist will contact you within <strong>1–2 business days</strong>.
                  </div>

                  {/* Reference number */}
                  <div style={{ background:'#f8f9fb', border:'1.5px solid #e5e7eb', borderRadius:12,
                    padding:'16px', marginBottom:24 }}>
                    <div style={{ fontSize:10, color:'#aaa', fontFamily:"'DM Sans',sans-serif",
                      textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>Reference Number</div>
                    <div style={{ fontSize:18, fontWeight:900, color:'#012169',
                      fontFamily:"'Courier New',monospace", letterSpacing:2 }}>
                      {loanRefNo}
                    </div>
                  </div>

                  {/* What's next */}
                  <div style={{ textAlign:'left', border:'1.5px solid #e5e7eb', borderRadius:14,
                    overflow:'hidden', marginBottom:24 }}>
                    <div style={{ background:'#f8f9fb', padding:'10px 16px', borderBottom:'1.5px solid #e5e7eb' }}>
                      <div style={{ fontSize:11, fontWeight:800, color:'#012169',
                        fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:0.8 }}>
                        What Happens Next
                      </div>
                    </div>
                    {[
                      ['📋', 'Application Review', 'Our team reviews your details within 24 hours'],
                      ['📞', 'Specialist Contact', 'A loan officer will call you to discuss terms'],
                      ['✅', 'Approval & Disbursement', 'Funds deposited directly to your NexaBank account'],
                    ].map(([icon, title, sub]) => (
                      <div key={title} style={{ display:'flex', gap:12, padding:'12px 16px',
                        borderBottom:'1px solid #f5f5f5', alignItems:'flex-start' }}>
                        <div style={{ fontSize:18, marginTop:1 }}>{icon}</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'#222',
                            fontFamily:"'DM Sans',sans-serif" }}>{title}</div>
                          <div style={{ fontSize:11, color:'#888', fontFamily:"'DM Sans',sans-serif",
                            marginTop:2 }}>{sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => setScreen('main')}
                    style={{ width:'100%', border:'none', borderRadius:12, padding:'14px',
                      fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                      background:'#012169', color:'#fff', cursor:'pointer' }}>
                    Back to Menu
                  </button>
                </div>
              )}

              {/* ── Secure badge (shown on all steps except success) ── */}
              {loanStep < 5 && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  marginTop:28, paddingTop:20, borderTop:'1px solid #f0f0f0' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span style={{ fontSize:11, color:'#9ca3af', fontFamily:"'DM Sans',sans-serif",
                    fontWeight:500, letterSpacing:0.3 }}>
                    256-bit SSL Encrypted · Your data is secure
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
              )}

              </>}

            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideInLeft {
          from { transform:translateX(-100%); opacity:0.6; }
          to   { transform:translateX(0);     opacity:1; }
        }
        @keyframes slideInRight {
          from { transform:translateX(60%); opacity:0.7; }
          to   { transform:translateX(0);   opacity:1; }
        }
      `}</style>
    </>
  );
}

/* ─── Card Management Screen ───────────────────────────────────────────────── */
function CardManagementScreen({ account, onBack, onToast, onRefresh }) {
  const [details,   setDetails]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [flipped,   setFlipped]   = useState(false);
  const [tapTimer,  setTapTimer]  = useState(null);
  const [tapCount,  setTapCount]  = useState(0);
  const [showPin,   setShowPin]   = useState(false);
  const [pin1,      setPin1]      = useState('');
  const [pin2,      setPin2]      = useState('');
  const [pinPhase,  setPinPhase]  = useState('enter'); // enter | confirm | done
  const [pinSaving, setPinSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [showBlock, setShowBlock] = useState(false);

  useEffect(() => {
    accountsApi.cardDetails(account.id)
      .then(d => setDetails(d))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [account.id]);

  // Double-tap to flip
  const handleCardTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (tapTimer) clearTimeout(tapTimer);
    if (newCount >= 2) {
      setFlipped(f => !f);
      setTapCount(0);
    } else {
      const t = setTimeout(() => setTapCount(0), 400);
      setTapTimer(t);
    }
  };

  const toggleFreeze = async () => {
    if (!details) return;
    const newStatus = details.card_status === 'active' ? 'frozen' : 'active';
    setStatusSaving(true);
    try {
      await accountsApi.setCardStatus(account.id, { status: newStatus });
      setDetails(d => ({ ...d, card_status: newStatus }));
      onToast(newStatus === 'frozen' ? 'Card frozen' : 'Card unfrozen', 'success');
      onRefresh();
    } catch (e) { onToast(e.message || 'Failed', 'error'); }
    finally { setStatusSaving(false); }
  };

  const blockCard = async () => {
    setStatusSaving(true);
    try {
      await accountsApi.setCardStatus(account.id, { status: 'blocked' });
      setDetails(d => ({ ...d, card_status: 'blocked' }));
      onToast('Card permanently blocked', 'success');
      setShowBlock(false);
      onRefresh();
    } catch (e) { onToast(e.message || 'Failed', 'error'); }
    finally { setStatusSaving(false); }
  };

  const submitPin = async () => {
    if (pinPhase === 'enter') {
      if (!/^\d{4}$/.test(pin1)) { onToast('PIN must be 4 digits', 'error'); return; }
      setPinPhase('confirm');
      return;
    }
    if (pin1 !== pin2) {
      onToast('PINs do not match', 'error');
      setPin2(''); setPinPhase('enter'); return;
    }
    setPinSaving(true);
    try {
      await accountsApi.setPin(account.id, { pin: pin1 });
      setDetails(d => ({ ...d, has_pin: true }));
      setPinPhase('done');
      onToast('PIN set successfully', 'success');
    } catch (e) { onToast(e.message || 'Failed', 'error'); }
    finally { setPinSaving(false); }
  };

  const isFrozen  = details?.card_status === 'frozen';
  const isBlocked = details?.card_status === 'blocked';

  const ActionBtn = ({ icon, label, sub, onClick, color = '#012169', danger = false, disabled = false }) => (
    <div onClick={disabled ? undefined : onClick}
      style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px',
        borderBottom:'1px solid #f5f5f5', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        background:'#fff' }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background='#f9f9f9')}
      onMouseLeave={e => (e.currentTarget.style.background='#fff')}>
      <div style={{ width:42, height:42, borderRadius:13, flexShrink:0,
        background: danger ? '#fff0f0' : color+'15',
        display:'flex', alignItems:'center', justifyContent:'center',
        color: danger ? '#c8102e' : color }}>
        {icon}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:14, fontFamily:"'DM Sans',sans-serif",
          color: danger ? '#c8102e' : '#012169' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'#aaa', fontFamily:"'DM Sans',sans-serif", marginTop:1 }}>{sub}</div>}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={danger?'#c8102e':'#ccc'} strokeWidth="2" strokeLinecap="round">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f0f2f5', paddingBottom:90 }}>
      {/* Topbar */}
      <div style={{ background:'#012169', padding:'0 16px', height:56,
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
        position:'sticky', top:0, zIndex:10 }}>
        <button onClick={onBack} style={{ background:'rgba(255,255,255,0.15)', border:'none',
          borderRadius:10, width:36, height:36, cursor:'pointer', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div style={{ fontSize:15, fontWeight:800, color:'#fff', fontFamily:"'DM Sans',sans-serif" }}>
          {account.label}
        </div>
        <div style={{ width:36 }}/>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
          <Spinner size={32} color="#012169"/>
        </div>
      ) : !details ? (
        <div style={{ textAlign:'center', padding:40, color:'#bbb', fontFamily:"'DM Sans',sans-serif" }}>
          Could not load card details
        </div>
      ) : (<>

        {/* Card section */}
        <div style={{ background:'#012169', padding:'24px 20px 32px' }}>
          {isBlocked && (
            <div style={{ background:'#c8102e', borderRadius:10, padding:'8px 14px', marginBottom:14,
              fontSize:12, fontWeight:700, color:'#fff', textAlign:'center', fontFamily:"'DM Sans',sans-serif" }}>
              🔒 This card is permanently blocked
            </div>
          )}
          {isFrozen && !isBlocked && (
            <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 14px', marginBottom:14,
              fontSize:12, fontWeight:700, color:'#fff', textAlign:'center', fontFamily:"'DM Sans',sans-serif" }}>
              ❄️ Card is frozen — tap Unfreeze to activate
            </div>
          )}
          <CreditCardPreview
            network={details.card_network}
            holderName={details.card_name}
            masked={details.masked_number}
            expiry={details.expiry}
            flipped={flipped}
            onTap={handleCardTap}
          />
        </div>

        {/* Status pill row */}
        <div style={{ display:'flex', justifyContent:'center', gap:10, padding:'14px 20px',
          background:'#fff', borderBottom:'1px solid #f0f0f0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background: isBlocked?'#fef2f2': isFrozen?'#eff6ff':'#f0fdf4',
            borderRadius:20, padding:'6px 14px' }}>
            <div style={{ width:8, height:8, borderRadius:'50%',
              background: isBlocked?'#c8102e': isFrozen?'#3b82f6':'#22c55e' }}/>
            <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
              color: isBlocked?'#c8102e': isFrozen?'#3b82f6':'#16a34a' }}>
              {isBlocked ? 'Blocked' : isFrozen ? 'Frozen' : 'Active'}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f0f4ff',
            borderRadius:20, padding:'6px 14px' }}>
            <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif", color:'#012169' }}>
              Balance: {fmt(details.balance)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ margin:'12px 0', background:'#fff', borderRadius:16, overflow:'hidden',
          marginLeft:16, marginRight:16, boxShadow:'0 1px 8px rgba(0,0,0,0.06)' }}>

          <ActionBtn
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
            label={isFrozen ? 'Unfreeze Card' : 'Freeze Card'}
            sub={isFrozen ? 'Re-enable card transactions' : 'Temporarily pause card usage'}
            color={isFrozen ? '#1a7f4b' : '#3b82f6'}
            onClick={toggleFreeze}
            disabled={isBlocked || statusSaving}
          />

          <ActionBtn
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>}
            label="View Card Details"
            sub={details.masked_number + ' · Exp ' + details.expiry}
            color="#7c3aed"
            onClick={() => {
              onToast(`Card: ${details.masked_number} | Exp: ${details.expiry} | ${(details.card_network||'').toUpperCase()}`, 'success');
            }}
            disabled={isBlocked}
          />

          <ActionBtn
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 8v4l2 2"/></svg>}
            label={details.has_pin ? 'Change PIN' : 'Set PIN'}
            sub={details.has_pin ? 'Update your 4-digit PIN' : 'Add a PIN to your card'}
            color="#f59e0b"
            onClick={() => { setShowPin(true); setPinPhase('enter'); setPin1(''); setPin2(''); }}
            disabled={isBlocked}
          />

          <ActionBtn
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            label="Block & Delete Card"
            sub="Permanently disable this card"
            danger
            onClick={() => setShowBlock(true)}
            disabled={isBlocked}
          />
        </div>
      </>)}

      {/* PIN Modal */}
      {showPin && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500,
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'28px 24px 40px',
            width:'100%', maxWidth:480, animation:'boa-slideUp 0.3s ease' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#012169',
              fontFamily:"'DM Sans',sans-serif", marginBottom:6 }}>
              {pinPhase === 'done' ? '✅ PIN Set!' : pinPhase === 'confirm' ? 'Confirm PIN' : details?.has_pin ? 'Change PIN' : 'Set Card PIN'}
            </div>
            {pinPhase !== 'done' && (
              <div style={{ fontSize:12, color:'#888', fontFamily:"'DM Sans',sans-serif", marginBottom:20 }}>
                {pinPhase === 'confirm' ? 'Re-enter your 4-digit PIN to confirm' : 'Enter a 4-digit PIN for your card'}
              </div>
            )}
            {pinPhase === 'done' ? (
              <button onClick={() => setShowPin(false)}
                style={{ width:'100%', border:'none', borderRadius:12, padding:'14px', fontSize:15,
                  fontWeight:700, fontFamily:"'DM Sans',sans-serif", background:'#012169', color:'#fff', cursor:'pointer' }}>
                Done
              </button>
            ) : (<>
              {/* 4 digit PIN dots input */}
              <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:24 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width:48, height:56, borderRadius:12, border:'2px solid',
                    borderColor: (pinPhase==='enter'?pin1:pin2).length > i ? '#012169' : '#e5e7eb',
                    background: (pinPhase==='enter'?pin1:pin2).length > i ? '#f0f4ff' : '#f9f9f9',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:10, height:10, borderRadius:'50%',
                      background: (pinPhase==='enter'?pin1:pin2).length > i ? '#012169' : 'transparent' }}/>
                  </div>
                ))}
              </div>
              {/* Number pad */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k,i) => (
                  <button key={i} disabled={!k} onClick={() => {
                    if (k === '⌫') {
                      if (pinPhase==='enter') setPin1(p => p.slice(0,-1));
                      else setPin2(p => p.slice(0,-1));
                    } else if (k) {
                      if (pinPhase==='enter' && pin1.length < 4) setPin1(p => p+k);
                      else if (pinPhase==='confirm' && pin2.length < 4) setPin2(p => p+k);
                    }
                  }}
                    style={{ height:52, borderRadius:12, border:'none', fontSize:18, fontWeight:700,
                      fontFamily:"'DM Sans',sans-serif", background: !k ? 'transparent' : '#f5f5f5',
                      color:'#012169', cursor: k ? 'pointer' : 'default' }}>
                    {k}
                  </button>
                ))}
              </div>
              <button onClick={submitPin} disabled={pinSaving || (pinPhase==='enter'?pin1:pin2).length < 4}
                style={{ width:'100%', border:'none', borderRadius:12, padding:'14px', fontSize:15,
                  fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                  background: (pinPhase==='enter'?pin1:pin2).length < 4 ? '#e5e7eb' : '#012169',
                  color: (pinPhase==='enter'?pin1:pin2).length < 4 ? '#aaa' : '#fff',
                  cursor: (pinPhase==='enter'?pin1:pin2).length < 4 ? 'not-allowed' : 'pointer' }}>
                {pinSaving ? 'Saving…' : pinPhase==='confirm' ? 'Confirm PIN' : 'Continue'}
              </button>
              <button onClick={() => setShowPin(false)}
                style={{ width:'100%', border:'none', borderRadius:12, padding:'12px', fontSize:14,
                  fontWeight:600, fontFamily:"'DM Sans',sans-serif", background:'transparent',
                  color:'#888', cursor:'pointer', marginTop:8 }}>Cancel</button>
            </>)}
          </div>
        </div>
      )}

      {/* Block confirm modal */}
      {showBlock && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', width:'100%', maxWidth:380 }}>
            <div style={{ fontSize:24, textAlign:'center', marginBottom:12 }}>🔒</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#c8102e', textAlign:'center',
              fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>Block & Delete Card</div>
            <div style={{ fontSize:13, color:'#666', fontFamily:"'DM Sans',sans-serif",
              textAlign:'center', lineHeight:1.6, marginBottom:24 }}>
              This action is <strong>permanent and irreversible</strong>. Your card will be immediately disabled
              and cannot be reactivated. Are you sure?
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowBlock(false)}
                style={{ flex:1, border:'1.5px solid #e5e7eb', borderRadius:12, padding:'13px',
                  fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                  background:'#fff', color:'#555', cursor:'pointer' }}>Cancel</button>
              <button onClick={blockCard} disabled={statusSaving}
                style={{ flex:1, border:'none', borderRadius:12, padding:'13px',
                  fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                  background: statusSaving ? '#bbb' : '#c8102e', color:'#fff',
                  cursor: statusSaving ? 'not-allowed' : 'pointer' }}>
                {statusSaving ? 'Blocking…' : 'Yes, Block Card'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Account Details Tab ──────────────────────────────────────────────────── */
function AccountDetailsTab({ account }) {
  const [details, setDetails]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [copied,  setCopied]    = useState(false);

  useEffect(() => {
    accountsApi.details(account.id)
      .then(d => setDetails(d))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [account.id]);

  const handleCopyAll = () => {
    if (!details) return;
    const text = [
      `Account Name:    ${details.account_holder}`,
      `Account Number:  ${details.full_account_number}`,
      `Account Type:    ${details.label} (${details.type})`,
      `Bank Name:       ${details.bank_name}`,
      `Bank Address:    ${details.bank_address}`,
      `Routing Number:  ${details.routing_number}`,
      `SWIFT / BIC:     ${details.swift_code}`,
      `Currency:        ${details.currency}`,
      `Status:          ${details.is_frozen ? 'Frozen' : 'Active'}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const Row = ({ label, value, mono }) => (
    <div style={{ padding: '15px 20px', borderBottom: '1px solid #f5f5f5',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ color: '#888', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
        flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 13,
        color: '#012169', fontFamily: mono ? "'Courier New', monospace" : "'DM Sans', sans-serif",
        textAlign: 'right', letterSpacing: mono ? 1 : 0, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40, background: '#fff' }}>
      <Spinner size={28} color="#012169" />
    </div>
  );

  if (!details) return (
    <div style={{ flex: 1, padding: 20, background: '#fff', textAlign: 'center',
      color: '#bbb', fontFamily: "'DM Sans', sans-serif", paddingTop: 60 }}>
      Could not load account details
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f8f9fb' }}>

      {/* Copy-all button */}
      <div style={{ padding: '16px 16px 8px' }}>
        <button onClick={handleCopyAll}
          style={{
            width: '100%', border: copied ? 'none' : '1.5px solid #012169',
            borderRadius: 12, padding: '12px 16px',
            fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            background: copied ? '#1a7f4b' : '#fff',
            color: copied ? '#fff' : '#012169',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, transition: 'all 0.2s',
          }}>
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy All Details
            </>
          )}
        </button>
      </div>

      {/* Details card */}
      <div style={{ margin: '8px 16px 24px', background: '#fff', borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Account card header */}
        <div style={{ background: '#012169', padding: '20px 20px 16px' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8,
            textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
            {details.bank_name}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff',
            fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5 }}>
            {details.account_holder}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)',
            fontFamily: "'Courier New', monospace", marginTop: 8, letterSpacing: 2 }}>
            {details.full_account_number}
          </div>
          <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(255,255,255,0.15)',
            borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#fff',
            fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize' }}>
            {details.label} Account
          </div>
        </div>

        <Row label="Account Name"   value={details.account_holder} />
        <Row label="Account Number" value={details.full_account_number} mono />
        <Row label="Account Type"   value={`${details.label} (${details.type.charAt(0).toUpperCase() + details.type.slice(1)})`} />
        <Row label="Bank Name"      value={details.bank_name} />
        <Row label="Bank Address"   value={details.bank_address} />
        <Row label="Routing Number" value={details.routing_number} mono />
        <Row label="SWIFT / BIC"    value={details.swift_code} mono />
        <Row label="Currency"       value={details.currency} />
        <Row label="Status"         value={details.is_frozen ? '🔒 Frozen' : '✅ Active'} />
        <Row label="Member Since"   value={new Date(details.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} />
      </div>
    </div>
  );
}

/* ─── Statement Tab ────────────────────────────────────────────────────────── */
function StatementTab({ account, transactions }) {
  const today     = new Date().toISOString().slice(0, 10);
  const firstDay  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [fromDate,  setFromDate]  = useState(firstDay);
  const [toDate,    setToDate]    = useState(today);
  const [loading,   setLoading]   = useState(false);
  const [emailing,  setEmailing]  = useState(false);
  const [result,    setResult]    = useState(null); // fetched statement data
  const [toast,     setToast]     = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStatement = async () => {
    if (!fromDate || !toDate) return showToast('Select both dates', 'error');
    if (fromDate > toDate)    return showToast('From date must be before To date', 'error');
    setLoading(true);
    setResult(null);
    try {
      const data = await usersApi.statement({ account_id: account.id, from_date: fromDate, to_date: toDate });
      setResult(data);
      if (data.email_sent) showToast('Statement also sent to your email ✓', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to generate statement', 'error');
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async () => {
    if (!result) return;
    setEmailing(true);
    try {
      const data = await usersApi.statement({ account_id: account.id, from_date: fromDate, to_date: toDate });
      if (data.email_sent) showToast('Statement sent to ' + data.user.email, 'success');
      else showToast('Email could not be sent', 'error');
    } catch (e) {
      showToast(e.message || 'Email failed', 'error');
    } finally {
      setEmailing(false);
    }
  };

  const downloadPNG = () => {
    if (!result) return;
    const { account: acct, user, from_date, to_date, transactions: txns, summary } = result;
    const fmtD = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtA = (n) => (n >= 0 ? '+' : '') + '$' + Math.abs(parseFloat(n)).toFixed(2);

    const ROW_H      = 36;
    const TABLE_START = 360; // navy(140) + account band(120) + gap(12) + boxH(64) + gap(24)
    const TABLE_HEAD  = 36;
    const FOOTER_H    = 70;
    const BOTTOM_PAD  = 24;
    const H = TABLE_START + TABLE_HEAD + Math.max(txns.length, 1) * ROW_H + 20 + FOOTER_H + BOTTOM_PAD;
    const W = 680;

    const canvas = document.createElement('canvas');
    canvas.width  = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(0, 0, W, H);

    // Navy header
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, W, 140);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('NEXABANK', 32, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '400 12px sans-serif';
    ctx.fillText('Account Statement', 32, 74);

    // Account info band
    ctx.fillStyle = '#f0f4ff';
    ctx.fillRect(0, 140, W, 120);

    ctx.fillStyle = '#888';
    ctx.font = '400 11px sans-serif';
    ctx.fillText('Account Holder', 32, 165);
    ctx.fillStyle = '#012169';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(user.full_name, 32, 183);

    ctx.fillStyle = '#888';
    ctx.font = '400 11px sans-serif';
    ctx.fillText('Account', 260, 165);
    ctx.fillStyle = '#012169';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(acct.label + ' ' + acct.card_number, 260, 183);

    ctx.fillStyle = '#888';
    ctx.font = '400 11px sans-serif';
    ctx.fillText('Period', 480, 165);
    ctx.fillStyle = '#012169';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(fmtD(from_date) + ' – ' + fmtD(to_date), 480, 183);

    ctx.fillStyle = '#888';
    ctx.font = '400 11px sans-serif';
    ctx.fillText('Closing Balance', 32, 220);
    ctx.fillStyle = '#012169';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('$' + parseFloat(acct.balance).toFixed(2), 32, 238);

    // Summary boxes
    const boxY = 272, boxH = 64;
    // Credits
    ctx.fillStyle = '#f0faf4';
    ctx.beginPath(); ctx.roundRect(24, boxY, 196, boxH, 10); ctx.fill();
    ctx.fillStyle = '#888'; ctx.font = '400 10px sans-serif';
    ctx.fillText('TOTAL CREDITS', 36, boxY + 20);
    ctx.fillStyle = '#1a7f4b'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText('+$' + summary.total_credits.toFixed(2), 36, boxY + 46);
    // Debits
    ctx.fillStyle = '#fff0f0';
    ctx.beginPath(); ctx.roundRect(236, boxY, 196, boxH, 10); ctx.fill();
    ctx.fillStyle = '#888'; ctx.font = '400 10px sans-serif';
    ctx.fillText('TOTAL DEBITS', 248, boxY + 20);
    ctx.fillStyle = '#c8102e'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText('-$' + summary.total_debits.toFixed(2), 248, boxY + 46);
    // Count
    ctx.fillStyle = '#f0f4ff';
    ctx.beginPath(); ctx.roundRect(448, boxY, 196, boxH, 10); ctx.fill();
    ctx.fillStyle = '#888'; ctx.font = '400 10px sans-serif';
    ctx.fillText('TRANSACTIONS', 460, boxY + 20);
    ctx.fillStyle = '#012169'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(String(summary.count), 460, boxY + 46);

    // Table header
    const tY = TABLE_START;
    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(0, tY, W, TABLE_HEAD);
    const cols = ['Date', 'Description', 'Category', 'Amount', 'Balance'];
    const colX = [24, 130, 320, 460, 570];
    ctx.fillStyle = '#888'; ctx.font = 'bold 10px sans-serif';
    cols.forEach((c, i) => {
      ctx.textAlign = i >= 3 ? 'right' : 'left';
      ctx.fillText(c, i >= 3 ? colX[i] + 80 : colX[i], tY + 22);
    });
    ctx.textAlign = 'left';

    // Table rows
    if (txns.length === 0) {
      ctx.fillStyle = '#bbb'; ctx.font = '400 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No transactions in this period', W / 2, tY + TABLE_HEAD + 30);
      ctx.textAlign = 'left';
    } else {
      txns.forEach((t, i) => {
        const rY = tY + TABLE_HEAD + i * ROW_H;
        if (i % 2 === 0) { ctx.fillStyle = '#fafafa'; ctx.fillRect(0, rY, W, ROW_H); }
        ctx.fillStyle = '#555'; ctx.font = '400 12px sans-serif';
        ctx.fillText(fmtD(t.created_at), colX[0], rY + 22);
        // Truncate description
        let desc = t.description;
        while (ctx.measureText(desc).width > 175 && desc.length > 4) desc = desc.slice(0, -2) + '…';
        ctx.fillText(desc, colX[1], rY + 22);
        let cat = (t.category || '').charAt(0).toUpperCase() + (t.category || '').slice(1);
        ctx.fillText(cat, colX[2], rY + 22);
        ctx.textAlign = 'right';
        ctx.fillStyle = parseFloat(t.amount) >= 0 ? '#1a7f4b' : '#c8102e';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(fmtA(t.amount), colX[3] + 80, rY + 22);
        ctx.fillStyle = '#012169';
        ctx.fillText('$' + parseFloat(t.balance_after).toFixed(2), colX[4] + 80, rY + 22);
        ctx.textAlign = 'left';
      });
    }

    // Footer
    const footerY = TABLE_START + TABLE_HEAD + Math.max(txns.length, 1) * ROW_H + 20;
    ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, footerY, W, FOOTER_H + BOTTOM_PAD);
    ctx.fillStyle = '#aaa'; ctx.font = '400 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NexaBank · Official Account Statement · Generated ' + new Date().toLocaleString(), W / 2, footerY + 22);
    ctx.fillText('This document is computer-generated and does not require a signature.', W / 2, footerY + 38);
    ctx.textAlign = 'left';

    canvas.toBlob(blob => {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `NexaBank_Statement_${acct.label}_${from_date}_to_${to_date}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    color: '#012169', outline: 'none', boxSizing: 'border-box', background: '#fff',
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6, fontFamily: "'DM Sans', sans-serif", display: 'block',
  };

  return (
    <div style={{ background: '#fff', flex: 1, padding: 20, overflowY: 'auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#c8102e' : '#1a7f4b',
          color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13,
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, zIndex: 999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, color: '#012169',
        fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
        Generate Statement
      </div>

      {/* Date pickers */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>From</label>
          <input type="date" value={fromDate} max={today}
            onChange={e => { setFromDate(e.target.value); setResult(null); }}
            style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>To</label>
          <input type="date" value={toDate} max={today}
            onChange={e => { setToDate(e.target.value); setResult(null); }}
            style={inputStyle} />
        </div>
      </div>

      {/* Generate button */}
      <button onClick={fetchStatement} disabled={loading}
        style={{
          width: '100%', border: 'none', borderRadius: 12, padding: '14px',
          fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          background: loading ? '#bbb' : '#012169', color: '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 16,
        }}>
        {loading ? <><Spinner size={16} color="#fff"/> Generating…</> : 'Generate Statement'}
      </button>

      {/* Results */}
      {result && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>

          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Credits', val: '+$' + result.summary.total_credits.toFixed(2), bg: '#f0faf4', color: '#1a7f4b' },
              { label: 'Debits',  val: '-$' + result.summary.total_debits.toFixed(2),  bg: '#fff0f0', color: '#c8102e' },
              { label: 'Txns',    val: String(result.summary.count),                   bg: '#f0f4ff', color: '#012169' },
            ].map(c => (
              <div key={c.label} style={{ flex: 1, background: c.bg, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase',
                  letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif" }}>{c.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c.color,
                  fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Transaction preview */}
          <div style={{ background: '#f8f9fb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            {result.transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#bbb',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                No transactions in this period
              </div>
            ) : (
              result.transactions.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderBottom: i < result.transactions.length - 1 ? '1px solid #eee' : 'none',
                  background: i % 2 === 0 ? '#fff' : '#f8f9fb' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif", color: '#012169' }}>{t.description}</div>
                    <div style={{ fontSize: 11, color: '#aaa', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                      {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}{(t.category || '').charAt(0).toUpperCase() + (t.category || '').slice(1)}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14,
                    color: parseFloat(t.amount) >= 0 ? '#1a7f4b' : '#c8102e',
                    fontFamily: "'DM Sans', sans-serif" }}>
                    {parseFloat(t.amount) >= 0 ? '+' : ''}${Math.abs(parseFloat(t.amount)).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={downloadPNG}
              style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '14px',
                fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                background: '#012169', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
            <button onClick={sendEmail} disabled={emailing}
              style={{
                flex: 1, border: '2px solid #012169', borderRadius: 12, padding: '14px',
                fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                background: '#fff', color: '#012169', cursor: emailing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: emailing ? 0.6 : 1,
              }}>
              {emailing ? <><Spinner size={14} color="#012169"/> Sending…</> : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Send to Email
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  );
}

function AccountDetail({ account, transactions, onBack, onDeposit, onTransfer, onSelectTxn }) {
  const [tab, setTab] = useState('transactions');
  const txns   = transactions.filter(t => t.account_id === account.id);
  const groups = groupByDate([...txns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#012169', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 0' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{account.label} Account</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Sans', sans-serif" }}>Total Balance</div>
          </div>
        </div>

        <div style={{ padding: '20px 20px 28px' }}>
          <div style={{ fontSize: 40, fontWeight: 900, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
            {fmt(account.balance)}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 24, fontFamily: "'DM Sans', sans-serif" }}>
            Available Balance
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { label: 'Deposit', fn: onDeposit, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
              { label: 'Transfer', fn: onTransfer, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg> },
              { label: 'Pay', fn: () => {}, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
            ].map(({ label, fn, icon }) => (
              <div key={label} onClick={fn}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  {icon}
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee', padding: '0 20px' }}>
        {['transactions', 'statements', 'details'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '14px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#c8102e' : '#888',
              borderBottom: `2px solid ${tab === t ? '#c8102e' : 'transparent'}`,
              fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize', marginRight: 4 }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'transactions' && (
        <div style={{ background: '#fff', flex: 1 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f5f5f5',
              borderRadius: 12, padding: '10px 14px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span style={{ fontSize: 14, color: '#aaa', fontFamily: "'DM Sans', sans-serif" }}>Search transactions</span>
            </div>
          </div>

          {txns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#bbb', fontFamily: "'DM Sans', sans-serif" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.5" strokeLinecap="round"
                style={{ display: 'block', margin: '0 auto 12px' }}>
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              No transactions yet
            </div>
          ) : (
            Object.entries(groups).map(([date, items]) => (
              <div key={date}>
                <div style={{ padding: '12px 20px 4px', fontSize: 13, fontWeight: 700, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
                  {date}
                </div>
                {items.map(t => (
                  <div key={t.id} onClick={() => onSelectTxn && onSelectTxn(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px', borderBottom: '1px solid #f8f8f8', cursor: 'pointer' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: '#f5f5f5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', flexShrink: 0 }}>
                      {txnIcon(t.description)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{t.description}</div>
                      <div style={{ fontSize: 12, color: '#999', fontFamily: "'DM Sans', sans-serif" }}>
                        {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: t.amount > 0 ? '#1a7f4b' : '#c8102e',
                      fontFamily: "'DM Sans', sans-serif" }}>
                      {t.amount > 0 ? '+' : ''}{fmt(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'details' && (
        <AccountDetailsTab account={account} />
      )}

      {tab === 'statements' && (
        <StatementTab account={account} transactions={transactions} />
      )}
    </div>
  );
}

/* ─── Accounts Page ────────────────────────────────────────────────────────── */
function AccountsPage({ accounts, onSelectAccount }) {
  const [filter, setFilter] = useState('all');
  const tabs = ['all', 'checking', 'savings', 'credit'];
  const shown = filter === 'all' ? accounts : accounts.filter(a => a.type === filter);
  const total = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ background: '#012169', padding: '20px 20px 24px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Accounts</div>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Sans', sans-serif" }}>Total Balance</div>
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "'DM Sans', sans-serif" }}>{fmt(total)}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '14px 16px', background: '#fff',
        borderBottom: '1px solid #f0f0f0', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: 20, flexShrink: 0,
              background: filter === t ? '#012169' : '#f0f0f0',
              color: filter === t ? '#fff' : '#555',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              textTransform: t === 'all' ? 'none' : 'capitalize' }}>
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff' }}>
        {shown.map((a) => (
          <div key={a.id} onClick={() => onSelectAccount(a)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
              borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: acctColor(a.type),
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              {acctIcon(a.type)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}>{a.label} Account</div>
              <div style={{ fontSize: 13, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
                {a.card_number} · Available Now
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#012169', fontFamily: "'DM Sans', sans-serif" }}>
                {fmt(a.balance)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Transaction Detail ───────────────────────────────────────────────────── */
function TransactionDetail({ txn, accounts, onBack }) {
  const [downloading, setDownloading] = useState(false);

  const downloadReceipt = () => {
    setDownloading(true);
    try {
      const isCredit = txn.amount > 0;
      const acct     = accounts.find(a => a.id === txn.account_id);
      const acctLabel = acct ? acct.label + ' ' + acct.card_number : txn.account_label || '—';
      const date = new Date(txn.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const time = new Date(txn.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const amtDisplay = (isCredit ? '+' : '') + fmt(txn.amount);

      // ── Canvas setup ──────────────────────────────────────────────────────
      const W = 600, H = 820;
      const canvas = document.createElement('canvas');
      canvas.width  = W * 2; // 2x for retina
      canvas.height = H * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);

      // Background
      ctx.fillStyle = '#f8f9fb';
      ctx.fillRect(0, 0, W, H);

      // Navy header
      ctx.fillStyle = '#012169';
      ctx.fillRect(0, 0, W, 180);

      // Header: Bank name
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 13px sans-serif';
      ctx.fillText('NEXABANK', 40, 44);

      // Header: "Transaction Receipt" label
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '400 12px sans-serif';
      ctx.fillText('Transaction Receipt', 40, 76);

      // Header: Amount
      ctx.fillStyle = isCredit ? '#4ade80' : '#ffffff';
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText(amtDisplay, 40, 124);

      // Header: Description
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '400 14px sans-serif';
      ctx.fillText(txn.description, 40, 152);

      // Status pill
      const statusColors = { completed: '#1a7f4b', pending: '#e07b00', failed: '#c8102e', reversed: '#888' };
      const statusBgs    = { completed: '#f0faf4', pending: '#fff8f0', failed: '#fff0f0', reversed: '#f5f5f5' };
      const status = txn.status || 'completed';
      const pillW = 110, pillH = 28, pillX = W / 2 - pillW / 2, pillY = 166;
      ctx.fillStyle = statusBgs[status] || '#f5f5f5';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 14);
      ctx.fill();
      ctx.fillStyle = statusColors[status] || '#888';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((status.charAt(0).toUpperCase() + status.slice(1)), W / 2, pillY + 18);
      ctx.textAlign = 'left';

      // Divider card background
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.07)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(24, 210, W - 48, 490, 16);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Detail rows
      const rows = [
        ['Amount',        amtDisplay],
        ['Type',          (txn.type || 'transfer').charAt(0).toUpperCase() + (txn.type||'transfer').slice(1)],
        ['Category',      (txn.category || 'other').charAt(0).toUpperCase() + (txn.category||'other').slice(1)],
        ['Account',       acctLabel],
        ['Balance After', fmt(txn.balance_after)],
        ['Reference',     txn.reference || '—'],
        ['Date',          date],
        ['Time',          time],
      ];
      if (txn.metadata?.note) rows.push(['Note', txn.metadata.note]);

      const rowH = 46;
      const startY = 230;
      rows.forEach(([label, value], i) => {
        const y = startY + i * rowH;
        // Separator
        if (i > 0) {
          ctx.strokeStyle = '#f5f5f5';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(44, y - 2);
          ctx.lineTo(W - 44, y - 2);
          ctx.stroke();
        }
        // Label
        ctx.fillStyle = '#888';
        ctx.font = '400 13px sans-serif';
        ctx.fillText(label, 44, y + 20);
        // Value
        const isAmt = label === 'Amount';
        ctx.fillStyle = isAmt ? (isCredit ? '#1a7f4b' : '#c8102e') : '#012169';
        ctx.font = 'bold 13px sans-serif';
        // Right align value
        const maxValW = 240;
        ctx.textAlign = 'right';
        // Truncate long values
        let val = String(value);
        while (ctx.measureText(val).width > maxValW && val.length > 6) val = val.slice(0, -2) + '…';
        ctx.fillText(val, W - 44, y + 20);
        ctx.textAlign = 'left';
      });

      // Footer
      ctx.fillStyle = '#bbb';
      ctx.font = '400 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NexaBank · This is an official transaction receipt', W / 2, H - 48);
      ctx.fillText('Generated ' + new Date().toLocaleString(), W / 2, H - 30);
      ctx.textAlign = 'left';

      // ── Export as PNG download (widely supported, no library needed) ──────
      canvas.toBlob(blob => {
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = `NexaBank_Receipt_${txn.reference || txn.id.slice(0,8)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setDownloading(false);
      }, 'image/png');
    } catch (err) {
      console.error('Receipt error:', err);
      setDownloading(false);
    }
  };
  const isCredit = txn.amount > 0;
  const acct     = accounts.find(a => a.id === txn.account_id);

  const statusColor = { completed: '#1a7f4b', pending: '#e07b00', failed: '#c8102e', reversed: '#888' };
  const statusBg    = { completed: '#f0faf4', pending: '#fff8f0', failed: '#fff0f0', reversed: '#f5f5f5' };

  const rows = [
    ['Amount',       (isCredit ? '+' : '') + fmt(txn.amount)],
    ['Type',         (txn.type || 'transfer').charAt(0).toUpperCase() + (txn.type || 'transfer').slice(1)],
    ['Category',     (txn.category || 'other').charAt(0).toUpperCase() + (txn.category || 'other').slice(1)],
    ['Account',      acct ? acct.label + ' ' + acct.card_number : txn.account_label || '—'],
    ['Balance After', fmt(txn.balance_after)],
    ['Reference',    txn.reference || '—'],
    ['Date',         new Date(txn.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
    ['Time',         new Date(txn.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
  ];
  if (txn.metadata?.note) rows.push(['Note', txn.metadata.note]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f8f9fb', zIndex: 200, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: '#012169', padding: '20px 20px 36px', color: '#fff', position: 'relative', overflow: 'visible' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, padding: 0, marginBottom: 20,
          fontSize: 15, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>
          Transaction Details
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'DM Sans', sans-serif",
          color: isCredit ? '#4ade80' : '#fff' }}>
          {isCredit ? '+' : ''}{fmt(txn.amount)}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
          {txn.description}
        </div>
      </div>

      {/* Status pill — floats over the header/body boundary */}
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 10, marginTop: -16 }}>
        <div style={{
          background: statusBg[txn.status] || '#f5f5f5',
          color: statusColor[txn.status] || '#888',
          padding: '7px 24px', borderRadius: 999,
          fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          boxShadow: '0 3px 12px rgba(0,0,0,0.18)',
          textTransform: 'capitalize',
          border: '2px solid #fff',
        }}>
          {txn.status || 'Completed'}
        </div>
      </div>

      {/* Icon */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 8px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20,
          background: isCredit ? '#f0faf4' : '#fff0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
          {txnIcon(txn.description)}
        </div>
      </div>

      {/* Detail rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 32px' }}>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {rows.map(([label, value], i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '15px 20px', borderBottom: i < rows.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
              <span style={{ color: '#888', fontSize: 14, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{label}</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: label === 'Amount' ? (isCredit ? '#1a7f4b' : '#c8102e') : '#012169',
                fontFamily: "'DM Sans', sans-serif", textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Reference copy hint */}
        {txn.reference && txn.reference !== '—' && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#bbb', fontFamily: "'DM Sans', sans-serif" }}>
            Reference: {txn.reference}
          </div>
        )}

        {/* Download Receipt Button */}
        <button onClick={downloadReceipt} disabled={downloading}
          style={{
            width: '100%', marginTop: 24, border: 'none', borderRadius: 14,
            padding: '16px', fontSize: 15, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            background: downloading ? '#bbb' : '#012169',
            color: '#fff', cursor: downloading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'background 0.2s',
          }}>
          {downloading ? (
            <><Spinner size={18} color="#fff"/> Generating…</>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Receipt
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Home Page ──────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════
   ProfileCenter — full-screen profile management overlay
   Screens: dropdown | view | contact | kyc | password | pin | biometric | devices | privacy
═══════════════════════════════════════════════════════════════════════════ */
function ProfileCenter({ user, profileData, onClose, onRefreshProfile, onToast, onTogglePrivacy }) {
  const [screen, setScreen] = useState('dropdown');
  const [loading, setLoading] = useState(false);

  // View/Edit
  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState(false);

  // Contact change
  const [contactType,    setContactType]    = useState('email');
  const [contactStep,    setContactStep]    = useState(1); // 1=intro, 2=otp, 3=new value, 4=done
  const [contactOtp,     setContactOtp]     = useState('');
  const [newContact,     setNewContact]     = useState('');
  const [sentTo,         setSentTo]         = useState('');

  // Password
  const [curPw,  setCurPw]  = useState('');
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');

  // PIN
  const [pinStep,    setPinStep]    = useState(1); // 1=password verify, 2=enter pin, 3=confirm pin, 4=done
  const [pinPw,      setPinPw]      = useState('');
  const [pin1,       setPin1]       = useState('');
  const [pin2,       setPin2]       = useState('');

  // KYC
  const [kycStep,  setKycStep]  = useState(1);
  const [kycData,  setKycData]  = useState({ id_card:'', ssn:'', proof_address:'', selfie:'' });
  const [kycInfo,  setKycInfo]  = useState(null);

  const profile = profileData || {};
  const initials = (profile.full_name || user?.full_name || 'ME').slice(0,2).toUpperCase();

  const go = (s) => { setScreen(s); setLoading(false); };

  const toB64 = (file) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });

  // Load KYC when entering that screen
  useEffect(() => {
    if (screen === 'kyc') {
      // Always re-fetch so approval is reflected immediately
      profileApi.kycStatus().then(d => setKycInfo(d)).catch(() => {});
      onRefreshProfile(); // refresh kyc_status on user object
    }
  }, [screen]);

  const inputStyle = (focused) => ({
    width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10,
    border:`1.5px solid ${focused ? '#012169' : '#e5e7eb'}`, fontSize:14,
    fontFamily:"'DM Sans',sans-serif", outline:'none', color:'#111', background:'#fafafa',
    marginBottom: 14,
  });
  const btnPrimary = { width:'100%', padding:'14px', border:'none', borderRadius:12,
    background:'#012169', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer',
    fontFamily:"'DM Sans',sans-serif" };
  const btnSecondary = { width:'100%', padding:'14px', border:'1.5px solid #e5e7eb', borderRadius:12,
    background:'#fff', color:'#555', fontSize:14, fontWeight:600, cursor:'pointer',
    fontFamily:"'DM Sans',sans-serif", marginTop:10 };

  // ── Topbar ───────────────────────────────────────────────────────────────
  const Topbar = ({ title, back }) => (
    <div style={{ background:'#012169', padding:'14px 20px',
      paddingTop:'calc(14px + env(safe-area-inset-top,0px))',
      display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
      <div onClick={back || onClose} style={{ width:36, height:36, borderRadius:10, cursor:'pointer',
        background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </div>
      <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{title}</div>
    </div>
  );

  const Wrap = ({ children, title, back }) => (
    <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', flexDirection:'column',
      background:'#f8f9fb', fontFamily:"'DM Sans',sans-serif" }}>
      <Topbar title={title} back={back}/>
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px 60px' }}>{children}</div>
    </div>
  );

  // ── Status chip ──────────────────────────────────────────────────────────
  const kycColors = { none:{bg:'#f5f5f5',text:'#888',label:'Not Started'}, pending:{bg:'#fef3c7',text:'#b45309',label:'Pending Review'},
    verified:{bg:'#d1fae5',text:'#065f46',label:'Verified ✓'}, rejected:{bg:'#fee2e2',text:'#b91c1c',label:'Rejected'} };

  // ═══════════════════════════════════════════════════
  // DROPDOWN
  // ═══════════════════════════════════════════════════
  if (screen === 'dropdown') return (
    <div style={{ position:'fixed', inset:0, zIndex:2000, fontFamily:"'DM Sans',sans-serif" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ position:'absolute', top:70, right:16, width:300,
          background:'#fff', borderRadius:18, boxShadow:'0 8px 40px rgba(0,0,0,0.18)',
          overflow:'hidden', border:'1px solid #f0f0f0' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#012169,#01357a)', padding:'20px 18px',
          display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'#c8102e',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:16, fontWeight:800, color:'#fff', flexShrink:0,
            overflow:'hidden' }}>
            {profile.avatar && profile.avatar.startsWith('data:')
              ? <img src={profile.avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : initials}
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{profile.full_name || user?.full_name}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
              ID: {profile.customer_id || '—'}
            </div>
            {(() => { const kc = kycColors[profile.kyc_status||'none'];
              return <div style={{ marginTop:5, display:'inline-block', padding:'2px 8px',
                borderRadius:10, background:'rgba(255,255,255,0.15)', fontSize:10,
                fontWeight:700, color:'#fff' }}>{kc.label}</div>; })()}
          </div>
        </div>

        {/* Menu items */}
        {[
          { icon:'👤', label:'View / Edit Profile',       sub:'Name, photo, customer ID',   s:'view' },
          { icon:'📱', label:'Contact Information',        sub:'Email, phone, address',       s:'contact' },
          { icon:'🪪', label:'KYC & Verification',         sub:'Identity documents',          s:'kyc' },
          { icon:'🔑', label:'Change Password',            sub:'Update login password',       s:'password' },
          { icon:'🔢', label:'Transaction PIN',            sub:'4-digit transfer PIN',        s:'pin' },
          { icon:'🧬', label:'Biometric Settings',         sub:'Face ID / Fingerprint',       s:'biometric' },
          { icon:'📍', label:'Manage Devices',             sub:'Authorized devices',          s:'devices' },
          { icon:'👁', label:'Privacy Mode',               sub: profile.privacy_mode ? 'On — balances hidden' : 'Off — balances visible', s:'privacy' },
        ].map(item => (
          <div key={item.s} onClick={() => go(item.s)}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px',
              borderBottom:'1px solid #f8f8f8', cursor:'pointer' }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#f5f7ff',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
              {item.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>{item.label}</div>
              <div style={{ fontSize:11, color:'#aaa', marginTop:1 }}>{item.sub}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════
  // VIEW / EDIT PROFILE
  // ═══════════════════════════════════════════════════
  if (screen === 'view') return (
    <Wrap title="Profile" back={() => go('dropdown')}>
      {/* Avatar */}
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ position:'relative', width:88, height:88, margin:'0 auto 12px' }}>
          {/* Avatar circle — photo or initials */}
          <label htmlFor="avatar-upload" style={{ cursor:'pointer', display:'block',
            width:88, height:88, borderRadius:'50%', overflow:'hidden',
            background:'#012169', boxShadow:'0 2px 12px rgba(1,33,105,0.25)' }}>
            {profile.avatar && profile.avatar.startsWith('data:') ? (
              <img src={profile.avatar} alt="avatar"
                style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            ) : (
              <div style={{ width:'100%', height:'100%', display:'flex',
                alignItems:'center', justifyContent:'center',
                fontSize:28, fontWeight:800, color:'#fff' }}>
                {initials}
              </div>
            )}
          </label>
          {/* Camera badge */}
          <label htmlFor="avatar-upload" style={{ position:'absolute', bottom:0, right:0,
            width:28, height:28, borderRadius:'50%', background:'#c8102e',
            display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', boxShadow:'0 2px 6px rgba(0,0,0,0.25)',
            border:'2px solid #fff' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </label>
          {/* Hidden file input */}
          <input id="avatar-upload" type="file" accept="image/*" style={{ display:'none' }}
            onChange={async e => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 3 * 1024 * 1024)
                return onToast('Image must be under 3MB', 'error');
              const b64 = await toB64(file);
              setLoading(true);
              try {
                await profileApi.update({ avatar: b64 });
                onRefreshProfile();
                onToast('Profile picture updated!', 'success');
              } catch(e) { onToast(e.message||'Error','error'); }
              finally { setLoading(false); e.target.value=''; }
            }}/>
        </div>

        <div style={{ fontSize:18, fontWeight:800, color:'#111' }}>{profile.full_name}</div>
        <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>{profile.email}</div>

        {/* Delete photo button — only shown when a photo exists */}
        {profile.avatar && profile.avatar.startsWith('data:') && (
          <button onClick={async () => {
            setLoading(true);
            try {
              await profileApi.update({ avatar: '' });
              onRefreshProfile();
              onToast('Profile picture removed', 'success');
            } catch(e) { onToast(e.message||'Error','error'); }
            finally { setLoading(false); }
          }} style={{ marginTop:10, background:'none', border:'1px solid #e5e7eb',
            borderRadius:8, padding:'5px 14px', fontSize:12, color:'#c8102e',
            cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
            🗑 Remove Photo
          </button>
        )}
      </div>

      {/* Info cards */}
      <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:'1px solid #f0f0f0', marginBottom:16 }}>
        {[
          ['Customer ID', profile.customer_id || '—'],
          ['Full Name',   profile.full_name   || '—'],
          ['Email',       profile.email       || '—'],
          ['Phone',       profile.phone       || 'Not set'],
          ['Member Since', new Date(profile.created_at||Date.now()).toLocaleDateString('en-US',{month:'long',year:'numeric'})],
          ['KYC Status',  (kycColors[profile.kyc_status||'none']||{}).label || '—'],
        ].map(([k,v],i,arr) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'13px 16px',
            borderBottom: i<arr.length-1 ? '1px solid #f5f5f5' : 'none', alignItems:'center' }}>
            <span style={{ fontSize:13, color:'#888' }}>{k}</span>
            <span style={{ fontSize:13, fontWeight:700, color:'#111', maxWidth:'55%',
              textAlign:'right', wordBreak:'break-all' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Edit name */}
      {editMode ? (
        <div>
          <input value={editName} onChange={e => setEditName(e.target.value)}
            placeholder="Full name" style={inputStyle(true)}/>
          <button style={btnPrimary} onClick={async () => {
            if (!editName.trim()) return onToast('Name cannot be empty','error');
            setLoading(true);
            try {
              await profileApi.update({ full_name: editName.trim() });
              onRefreshProfile(); setEditMode(false);
              onToast('Name updated!','success');
            } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
          }}>{loading ? 'Saving…' : 'Save Name'}</button>
          <button style={btnSecondary} onClick={() => setEditMode(false)}>Cancel</button>
        </div>
      ) : (
        <button style={btnPrimary} onClick={() => { setEditName(profile.full_name||''); setEditMode(true); }}>
          ✏️ Edit Name
        </button>
      )}
    </Wrap>
  );

  // ═══════════════════════════════════════════════════
  // CONTACT INFORMATION
  // ═══════════════════════════════════════════════════
  if (screen === 'contact') return (
    <Wrap title="Contact Information" back={() => go('dropdown')}>
      {/* Type selector */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['email','phone'].map(t => (
          <button key={t} onClick={() => { setContactType(t); setContactStep(1); setContactOtp(''); setNewContact(''); }}
            style={{ flex:1, padding:'10px', borderRadius:10, border:`1.5px solid ${contactType===t?'#012169':'#e5e7eb'}`,
              background: contactType===t ? '#012169' : '#fff', color: contactType===t ? '#fff' : '#555',
              fontSize:13, fontWeight:700, cursor:'pointer', textTransform:'capitalize' }}>
            {t === 'email' ? '📧 Email' : '📱 Phone'}
          </button>
        ))}
      </div>

      {/* Current value display */}
      <div style={{ background:'#fff', borderRadius:12, padding:'14px 16px', marginBottom:20,
        border:'1px solid #f0f0f0' }}>
        <div style={{ fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:0.6 }}>Current {contactType}</div>
        <div style={{ fontSize:15, fontWeight:700, color:'#012169', marginTop:4 }}>
          {contactType==='email' ? (profile.email||'Not set') : (profile.phone||'Not set')}
        </div>
      </div>

      {contactStep === 1 && (
        <>
          <p style={{ fontSize:13, color:'#666', marginBottom:20, lineHeight:1.6 }}>
            To change your {contactType}, we'll send a verification code to your current registered {contactType}.
          </p>
          <button style={btnPrimary} onClick={async () => {
            setLoading(true);
            try {
              const r = await profileApi.sendOtp(contactType);
              setSentTo(r.sent_to); setContactStep(2);
            } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
          }}>{loading ? 'Sending…' : `Send Verification Code`}</button>
        </>
      )}

      {contactStep === 2 && (
        <>
          <p style={{ fontSize:13, color:'#666', marginBottom:16, lineHeight:1.6 }}>
            Enter the 6-digit code sent to <strong>{sentTo}</strong>
          </p>
          <input value={contactOtp} onChange={e => setContactOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
            placeholder="000000" maxLength={6} style={{...inputStyle(false), fontSize:24, letterSpacing:8, textAlign:'center'}}/>
          <button style={btnPrimary} onClick={() => { if (contactOtp.length===6) setContactStep(3); else onToast('Enter 6-digit code','error'); }}>
            Verify Code
          </button>
          <button style={btnSecondary} onClick={() => setContactStep(1)}>Back</button>
        </>
      )}

      {contactStep === 3 && (
        <>
          <p style={{ fontSize:13, color:'#666', marginBottom:16 }}>Enter your new {contactType}:</p>
          <input value={newContact} onChange={e => setNewContact(e.target.value)}
            placeholder={contactType==='email' ? 'new@email.com' : '+1 234 567 8900'}
            type={contactType==='email' ? 'email' : 'tel'} style={inputStyle(false)}/>
          <button style={btnPrimary} onClick={async () => {
            if (!newContact.trim()) return onToast(`Enter new ${contactType}`,'error');
            setLoading(true);
            try {
              await profileApi.changeContact({ type:contactType, otp:contactOtp, new_value:newContact.trim() });
              setContactStep(4); onRefreshProfile();
            } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
          }}>{loading ? 'Updating…' : `Update ${contactType.charAt(0).toUpperCase()+contactType.slice(1)}`}</button>
          <button style={btnSecondary} onClick={() => setContactStep(2)}>Back</button>
        </>
      )}

      {contactStep === 4 && (
        <div style={{ textAlign:'center', paddingTop:20 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
          <div style={{ fontSize:17, fontWeight:800, color:'#1a7f4b', marginBottom:8 }}>
            {contactType.charAt(0).toUpperCase()+contactType.slice(1)} Updated!
          </div>
          <p style={{ fontSize:13, color:'#666', marginBottom:24, lineHeight:1.6 }}>
            A security alert has been sent to your previous email address.
            If you didn't make this change, contact customer support immediately.
          </p>
          <button style={btnPrimary} onClick={() => { setContactStep(1); setContactOtp(''); setNewContact(''); }}>Done</button>
        </div>
      )}
    </Wrap>
  );

  // ═══════════════════════════════════════════════════
  // KYC
  // ═══════════════════════════════════════════════════
  if (screen === 'kyc') {
    const liveStatus = kycInfo?.kyc_status || profile.kyc_status || 'none';
    const kc = kycColors[liveStatus];
    const isVerified = liveStatus === 'verified';
    const isPending  = liveStatus === 'pending';

    return (
      <Wrap title="KYC Verification" back={() => go('dropdown')}>
        {/* Status */}
        <div style={{ background:'#fff', borderRadius:14, padding:'18px 16px', marginBottom:20,
          border:'1px solid #f0f0f0', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:14, background:kc.bg,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>
            {liveStatus==='verified' ? '✅' : liveStatus==='pending' ? '⏳' : liveStatus==='rejected' ? '❌' : '🪪'}
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#111' }}>KYC Status</div>
            <div style={{ fontSize:12, fontWeight:700, color:kc.text, marginTop:3 }}>{kc.label}</div>
          </div>
        </div>

        {(isVerified || isPending) && (
          <div style={{ textAlign:'center', padding:'30px 20px', color:'#888', fontSize:14 }}>
            {isVerified ? '🎉 Your identity has been fully verified.' : '⏳ Your documents are under review. We’ll notify you once verified.'}
          </div>
        )}

        {!isVerified && !isPending && (
          <>
            <p style={{ fontSize:13, color:'#666', lineHeight:1.7, marginBottom:20 }}>
              Complete identity verification to unlock all NexaBank features. Required documents:
            </p>
            <div style={{ background:'#fff', borderRadius:14, padding:'16px', marginBottom:20, border:'1px solid #f0f0f0' }}>
              {[['🪪','Government-issued ID Card'],['🔢','Social Security Number (SSN)'],
                ['🏠','Proof of Address (utility bill, bank letter)'],['🤳','Selfie / Facial Verification']].map(([icon,label]) => (
                <div key={label} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 0',
                  borderBottom:'1px solid #f8f8f8' }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#444' }}>{label}</span>
                </div>
              ))}
            </div>

            {kycStep === 1 && (
              <>
                <div style={{ fontWeight:700, color:'#012169', marginBottom:8, fontSize:13 }}>Step 1 of 4 — ID Card</div>
                <p style={{ fontSize:12, color:'#888', marginBottom:14 }}>Upload a clear photo of your government-issued ID (front and back)</p>
                <label style={{ display:'block', border:'2px dashed #012169', borderRadius:12, padding:'20px',
                  textAlign:'center', cursor:'pointer', marginBottom:14, background:'#f0f4ff' }}>
                  <input type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={async e => {
                    if (e.target.files[0]) {
                      const b64 = await toB64(e.target.files[0]);
                      setKycData(p => ({...p, id_card: b64}));
                    }
                  }}/>
                  <div style={{ fontSize:28, marginBottom:8 }}>{kycData.id_card ? '✅' : '📁'}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#012169' }}>
                    {kycData.id_card ? 'ID uploaded ✓' : 'Tap to upload ID Card'}
                  </div>
                </label>
                <button style={{...btnPrimary, opacity: kycData.id_card?1:0.5}}
                  disabled={!kycData.id_card} onClick={() => setKycStep(2)}>Next</button>
              </>
            )}
            {kycStep === 2 && (
              <>
                <div style={{ fontWeight:700, color:'#012169', marginBottom:8, fontSize:13 }}>Step 2 of 4 — SSN</div>
                <input value={kycData.ssn} onChange={e => setKycData(p=>({...p,ssn:e.target.value.replace(/\D/g,'').slice(0,9)}))}
                  placeholder="9-digit SSN (no dashes)" style={inputStyle(false)} maxLength={9}/>
                <div style={{ display:'flex', gap:10 }}>
                  <button style={{...btnSecondary, marginTop:0, flex:1}} onClick={() => setKycStep(1)}>Back</button>
                  <button style={{...btnPrimary, flex:1, opacity:kycData.ssn.length===9?1:0.5}}
                    disabled={kycData.ssn.length!==9} onClick={() => setKycStep(3)}>Next</button>
                </div>
              </>
            )}
            {kycStep === 3 && (
              <>
                <div style={{ fontWeight:700, color:'#012169', marginBottom:8, fontSize:13 }}>Step 3 of 4 — Proof of Address</div>
                <label style={{ display:'block', border:'2px dashed #012169', borderRadius:12, padding:'20px',
                  textAlign:'center', cursor:'pointer', marginBottom:14, background:'#f0f4ff' }}>
                  <input type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={async e => {
                    if (e.target.files[0]) { const b64 = await toB64(e.target.files[0]); setKycData(p=>({...p,proof_address:b64})); }
                  }}/>
                  <div style={{ fontSize:28, marginBottom:8 }}>{kycData.proof_address ? '✅' : '📁'}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#012169' }}>
                    {kycData.proof_address ? 'Document uploaded ✓' : 'Tap to upload proof of address'}
                  </div>
                </label>
                <div style={{ display:'flex', gap:10 }}>
                  <button style={{...btnSecondary, marginTop:0, flex:1}} onClick={() => setKycStep(2)}>Back</button>
                  <button style={{...btnPrimary, flex:1, opacity:kycData.proof_address?1:0.5}}
                    disabled={!kycData.proof_address} onClick={() => setKycStep(4)}>Next</button>
                </div>
              </>
            )}
            {kycStep === 4 && (
              <>
                <div style={{ fontWeight:700, color:'#012169', marginBottom:8, fontSize:13 }}>Step 4 of 4 — Selfie</div>
                <label style={{ display:'block', border:'2px dashed #012169', borderRadius:12, padding:'20px',
                  textAlign:'center', cursor:'pointer', marginBottom:14, background:'#f0f4ff' }}>
                  <input type="file" accept="image/*" capture="user" style={{ display:'none' }} onChange={async e => {
                    if (e.target.files[0]) { const b64 = await toB64(e.target.files[0]); setKycData(p=>({...p,selfie:b64})); }
                  }}/>
                  <div style={{ fontSize:28, marginBottom:8 }}>{kycData.selfie ? '✅' : '🤳'}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#012169' }}>
                    {kycData.selfie ? 'Selfie uploaded ✓' : 'Tap to take / upload selfie'}
                  </div>
                </label>
                <div style={{ display:'flex', gap:10 }}>
                  <button style={{...btnSecondary, marginTop:0, flex:1}} onClick={() => setKycStep(3)}>Back</button>
                  <button style={{...btnPrimary, flex:1, opacity:kycData.selfie?1:0.5}}
                    disabled={!kycData.selfie || loading} onClick={async () => {
                      setLoading(true);
                      try {
                        await profileApi.submitKyc(kycData);
                        onRefreshProfile(); setKycStep(1);
                        setKycData({id_card:'',ssn:'',proof_address:'',selfie:''});
                        onToast('KYC submitted for review!','success');
                      } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
                    }}>{loading ? 'Submitting…' : 'Submit for Verification'}</button>
                </div>
              </>
            )}
          </>
        )}
      </Wrap>
    );
  }

  // ═══════════════════════════════════════════════════
  // CHANGE PASSWORD
  // ═══════════════════════════════════════════════════
  if (screen === 'password') return (
    <Wrap title="Change Password" back={() => go('dropdown')}>
      <p style={{ fontSize:13, color:'#666', marginBottom:20 }}>Enter your current password then choose a new one (min. 8 characters).</p>
      {[['Current Password', curPw, setCurPw],['New Password', newPw, setNewPw],['Confirm New Password', confPw, setConfPw]].map(([label, val, set]) => (
        <div key={label}>
          <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:6 }}>{label}</div>
          <input type="password" value={val} onChange={e => set(e.target.value)} placeholder="••••••••" style={inputStyle(false)}/>
        </div>
      ))}
      <button style={btnPrimary} onClick={async () => {
        if (!curPw||!newPw||!confPw) return onToast('All fields required','error');
        if (newPw !== confPw) return onToast('Passwords do not match','error');
        if (newPw.length < 8) return onToast('Min. 8 characters','error');
        setLoading(true);
        try {
          await usersApi.changePassword({ current_password:curPw, new_password:newPw });
          onToast('Password changed!','success'); setCurPw(''); setNewPw(''); setConfPw(''); go('dropdown');
        } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
      }}>{loading ? 'Updating…' : 'Change Password'}</button>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════
  // TRANSACTION PIN
  // ═══════════════════════════════════════════════════
  if (screen === 'pin') {
    const PinDots = ({val}) => (
      <div style={{ display:'flex', justifyContent:'center', gap:16, margin:'20px 0' }}>
        {[0,1,2,3].map(i => <div key={i} style={{ width:16, height:16, borderRadius:'50%',
          background: val.length > i ? '#012169' : '#e5e7eb', transition:'background 0.15s' }}/>)}
      </div>
    );
    const Numpad = ({val, set, onFull}) => (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k,i) => (
          <button key={i} disabled={!k} onClick={() => {
            if (k==='⌫') set(p => p.slice(0,-1));
            else if (val.length < 4) { const np = val+k; set(np); if (np.length===4 && onFull) onFull(np); }
          }} style={{ padding:'16px 0', border:'1.5px solid #e5e7eb', borderRadius:12,
            fontSize: k==='⌫'?18:20, fontWeight:700, background: k?'#fff':'transparent',
            cursor: k?'pointer':'default', color:'#111', opacity: k?1:0, fontFamily:"'DM Sans',sans-serif" }}>
            {k}
          </button>
        ))}
      </div>
    );

    return (
      <Wrap title="Transaction PIN" back={() => { setPinStep(1); setPinPw(''); setPin1(''); setPin2(''); go('dropdown'); }}>
        <div style={{ background:'#eef2ff', borderRadius:12, padding:'12px 16px', marginBottom:20,
          fontSize:13, color:'#3730a3', fontWeight:600 }}>
          {profile.has_pin ? '🔒 You have a PIN set. Enter your password below to replace it.' : '🔓 No PIN set yet. Set one to secure transfers.'}
        </div>

        {pinStep === 1 && (
          <>
            <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:6 }}>Login Password</div>
            <input type="password" value={pinPw} onChange={e => setPinPw(e.target.value)}
              placeholder="Your account password" style={inputStyle(false)}/>
            <button style={btnPrimary} onClick={async () => {
              if (!pinPw) return onToast('Password required','error');
              setLoading(true);
              try {
                // Verify by attempting a dummy pin verify won't work — just proceed, backend will check on set-pin
                setPinStep(2); setPin1(''); setPin2('');
              } finally { setLoading(false); }
            }}>Continue</button>
          </>
        )}
        {pinStep === 2 && (
          <>
            <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:'#111' }}>Enter new PIN</div>
            <PinDots val={pin1}/>
            <Numpad val={pin1} set={setPin1} onFull={() => setPinStep(3)}/>
          </>
        )}
        {pinStep === 3 && (
          <>
            <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:'#111' }}>Confirm PIN</div>
            <PinDots val={pin2}/>
            <Numpad val={pin2} set={setPin2} onFull={async (confirmed) => {
              if (confirmed !== pin1) { onToast("PINs don't match",'error'); setPin2(''); setPinStep(2); setPin1(''); return; }
              setLoading(true);
              try {
                await profileApi.setPin({ pin: pin1, current_password: pinPw });
                onRefreshProfile(); onToast('PIN set successfully!','success');
                setPinStep(4);
              } catch(e) { onToast(e.message||'Error','error'); setPinStep(1); } finally { setLoading(false); }
            }}/>
          </>
        )}
        {pinStep === 4 && (
          <div style={{ textAlign:'center', paddingTop:20 }}>
            <div style={{ fontSize:56, marginBottom:12 }}>🔒</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#1a7f4b', marginBottom:8 }}>PIN Set!</div>
            <p style={{ fontSize:13, color:'#666', marginBottom:24 }}>Your 4-digit transaction PIN is now active. You'll need it to approve transfers.</p>
            <button style={btnPrimary} onClick={() => { setPinStep(1); setPinPw(''); setPin1(''); setPin2(''); go('dropdown'); }}>Done</button>
          </div>
        )}
      </Wrap>
    );
  }

  // ═══════════════════════════════════════════════════
  // BIOMETRIC
  // ═══════════════════════════════════════════════════
  if (screen === 'biometric') return (
    <Wrap title="Biometric Settings" back={() => go('dropdown')}>
      <div style={{ textAlign:'center', padding:'20px 0 28px' }}>
        <div style={{ fontSize:60, marginBottom:16 }}>{profile.biometric_enabled ? '🔓' : '🔒'}</div>
        <div style={{ fontSize:17, fontWeight:800, color:'#111', marginBottom:8 }}>
          Biometric Login is {profile.biometric_enabled ? 'Enabled' : 'Disabled'}
        </div>
        <p style={{ fontSize:13, color:'#666', lineHeight:1.7, maxWidth:280, margin:'0 auto 28px' }}>
          {profile.biometric_enabled
            ? 'You can use Face ID, Touch ID or Fingerprint to log in quickly.'
            : 'Enable biometric login to use Face ID, Touch ID or Fingerprint to access your account.'}
        </p>
        <button style={{ ...btnPrimary, background: profile.biometric_enabled ? '#c8102e' : '#012169' }}
          onClick={async () => {
            setLoading(true);
            try {
              const res = await profileApi.toggle('biometric_enabled');
              onRefreshProfile();
              onToast(`Biometric login ${res.biometric_enabled ? 'enabled' : 'disabled'}`, 'success');
            } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
          }}>
          {loading ? 'Updating…' : (profile.biometric_enabled ? 'Disable Biometrics' : 'Enable Biometrics')}
        </button>
        <div style={{ marginTop:16, fontSize:11, color:'#aaa' }}>
          Note: Actual biometric authentication uses your device's native API. This toggle controls the setting.
        </div>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════
  // MANAGE DEVICES
  // ═══════════════════════════════════════════════════
  if (screen === 'devices') return (
    <Wrap title="Manage Devices" back={() => go('dropdown')}>
      <p style={{ fontSize:13, color:'#666', marginBottom:20 }}>Devices that have accessed your account:</p>
      <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:'1px solid #f0f0f0' }}>
        {[
          { name:'Current Device', type:'📱', detail: typeof window !== 'undefined' ? (navigator.platform||'Mobile') : 'Mobile', current:true },
        ].map((d, i) => (
          <div key={i} style={{ display:'flex', gap:12, padding:'16px', borderBottom:'1px solid #f8f8f8', alignItems:'center' }}>
            <div style={{ fontSize:26 }}>{d.type}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>{d.name}</div>
              <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{d.detail}</div>
            </div>
            {d.current && <div style={{ fontSize:10, fontWeight:700, color:'#1a7f4b',
              background:'#d1fae5', padding:'3px 8px', borderRadius:8 }}>Current</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop:16, fontSize:12, color:'#aaa', textAlign:'center' }}>
        Device management with revocation will be available in a future update.
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════
  // PRIVACY MODE
  // ═══════════════════════════════════════════════════
  if (screen === 'privacy') return (
    <Wrap title="Privacy Mode" back={() => go('dropdown')}>
      <div style={{ textAlign:'center', padding:'20px 0 28px' }}>
        <div style={{ fontSize:60, marginBottom:16 }}>{profile.privacy_mode ? '🙈' : '👁'}</div>
        <div style={{ fontSize:17, fontWeight:800, color:'#111', marginBottom:8 }}>
          Privacy Mode is {profile.privacy_mode ? 'ON' : 'OFF'}
        </div>
        <p style={{ fontSize:13, color:'#666', lineHeight:1.7, maxWidth:290, margin:'0 auto 28px' }}>
          {profile.privacy_mode
            ? 'Your account balances are hidden on the dashboard. Tap any balance to reveal.'
            : 'Enable Privacy Mode to hide your balances on the main dashboard — useful in public spaces.'}
        </p>
        <button style={{ ...btnPrimary, background: profile.privacy_mode ? '#c8102e' : '#012169' }}
          onClick={async () => {
            setLoading(true);
            try {
              await onTogglePrivacy();
              onRefreshProfile();
              onToast(`Privacy mode ${profile.privacy_mode ? 'disabled' : 'enabled'}`, 'success');
            } catch(e) { onToast(e.message||'Error','error'); } finally { setLoading(false); }
          }}>
          {loading ? 'Updating…' : (profile.privacy_mode ? 'Disable Privacy Mode' : 'Enable Privacy Mode')}
        </button>
      </div>
    </Wrap>
  );

  return null;
}


function HomePage({ user, accounts, transactions, totalBalance, availableBalance,
  onOpenSidebar, onSetTab, onDeposit, onSelectAcct, firstName,
  recentTxns, txnGroups, onSelectTxn, notifications, onOpenNotif,
  privacyMode, onOpenProfile, profileData }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #001a5e 0%, #012169 50%, #01357a 100%)',
        padding: '20px 20px 0', color: '#fff', position: 'relative', overflow: 'hidden' }}>

        {/* Subtle city silhouette */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: 0.07 }}
          viewBox="0 0 390 80" preserveAspectRatio="none" width="100%" height="80">
          <path d="M0 80V52l15-2V34h8V22h6V34h5V28h10V16h8V28h6V20h4V28h8V14h12V28h5V22h8V28h6V32h10V20h8V32h6V26h8V32h5V18h10V32h6V28h8V36h12V28h6V14h10V28h5V22h8V28h6V32h10V20h8V80z" fill="#fff"/>
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, position: 'relative' }}>
          <div onClick={() => onOpenSidebar()}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
              NexaBank
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div onClick={onOpenNotif} style={{ position:'relative', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {(notifications||[]).filter(n=>!n.is_read).length > 0 && (
                <div style={{ position:'absolute', top:-5, right:-5, minWidth:16, height:16,
                  borderRadius:8, background:'#c8102e', border:'2px solid #012169',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9, fontWeight:800, color:'#fff', fontFamily:"'DM Sans',sans-serif",
                  padding:'0 3px', lineHeight:1 }}>
                  {(notifications||[]).filter(n=>!n.is_read).length > 9 ? '9+' : (notifications||[]).filter(n=>!n.is_read).length}
                </div>
              )}
            </div>
            <div onClick={onOpenProfile} style={{ width: 36, height: 36, borderRadius: '50%',
              background: '#c8102e', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: "'DM Sans', sans-serif",
              flexShrink: 0, cursor: 'pointer', boxShadow: '0 0 0 2px rgba(255,255,255,0.3)',
              overflow:'hidden' }}>
              {profileData?.avatar
                ? <img src={profileData.avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                : user?.full_name?.slice(0,2).toUpperCase() || 'ME'}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', fontFamily: "'DM Sans', sans-serif",
          marginBottom: 2, position: 'relative' }}>
          {getGreeting()}, <strong style={{ color: '#fff', fontWeight: 700 }}>{firstName}</strong>
        </div>

        {/* Balance hero */}
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '18px 18px 0 0',
          padding: '22px 20px 30px', marginTop: 18, backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.12)', borderBottom: 'none', position: 'relative' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>
            Total Balance
          </div>
          <div style={{ fontSize: 44, fontWeight: 900, fontFamily: "'DM Sans', sans-serif", lineHeight: 1,
            letterSpacing: -1, marginBottom: 14 }}>
            {privacyMode ? '••••••' : fmt(totalBalance)}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 14 }}/>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>
            Available Balance
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
            {privacyMode ? '••••' : fmt(availableBalance)}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ background: '#fff', padding: '28px 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {[
            { label: 'Transfer', fn: () => onSetTab('transfer'), icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg> },
            { label: 'Pay Bills', fn: () => onSetTab('pay'), icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg> },
            { label: 'Deposit', fn: () => onDeposit(), icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
            { label: 'Send', fn: () => {}, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
          ].map(({ label, fn, icon }) => (
            <div key={label} onClick={fn}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, background: '#eef2ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#012169' }}>
                {icon}
              </div>
              <span style={{ fontSize: 12, color: '#555', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Accounts section */}
      <div style={{ background: '#fff', marginTop: 8, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#012169', fontFamily: "'DM Sans', sans-serif" }}>Accounts</div>
          <div onClick={() => onSetTab('accounts')}
            style={{ fontSize: 13, color: '#c8102e', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 3 }}>
            View All
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>
        {accounts.map((a, i) => (
          <div key={a.id} onClick={() => { onSelectAcct(a); onSetTab(a.type === 'credit' && a.card_network ? 'card' : 'detail'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 14,
              paddingBottom: i < accounts.length - 1 ? 16 : 0,
              marginBottom: i < accounts.length - 1 ? 16 : 0,
              borderBottom: i < accounts.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: acctColor(a.type),
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              {acctIcon(a.type)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>{a.label}</div>
              <div style={{ fontSize: 12, color: '#999', fontFamily: "'DM Sans', sans-serif" }}>{a.card_number}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#012169', fontFamily: "'DM Sans', sans-serif" }}>
                {fmt(a.balance)}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div style={{ background: '#fff', marginTop: 8, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#012169', fontFamily: "'DM Sans', sans-serif" }}>
            Transactions
          </div>
          <div onClick={() => onSetTab('accounts')}
            style={{ fontSize: 13, color: '#c8102e', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 3 }}>
            See All
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>

        {recentTxns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc', fontFamily: "'DM Sans', sans-serif" }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.5" strokeLinecap="round"
              style={{ display: 'block', margin: '0 auto 10px' }}>
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            <div style={{ fontSize: 14 }}>No transactions yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Make a transfer or deposit to get started</div>
          </div>
        ) : (
          Object.entries(txnGroups).map(([date, items]) => (
            <div key={date}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
                letterSpacing: 0.6, marginBottom: 10, marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
                {date}
              </div>
              {items.map((t, i) => (
                <div key={t.id} onClick={() => onSelectTxn(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14,
                  paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#f5f5f5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', flexShrink: 0 }}>
                    {txnIcon(t.description)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
                      {t.description}
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa', fontFamily: "'DM Sans', sans-serif" }}>
                      {t.account_label} · {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                    color: t.amount > 0 ? '#1a7f4b' : '#c8102e' }}>
                    {t.amount > 0 ? '+' : ''}{fmt(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── More Page ─────────────────────────────────────────────────────────── */
/* ─── Security Settings ─────────────────────────────────────────────────── */
function SecurityPage({ profileData, onToast, onRefresh, onBack, onRequestPin }) {
  const [screen, setScreen] = useState('main');
  const [curPw, setCurPw]   = useState('');
  const [newPw, setNewPw]   = useState('');
  const [conPw, setConPw]   = useState('');
  const [pin1,  setPin1]    = useState('');
  const [pin2,  setPin2]    = useState('');
  const [saving, setSaving] = useState(false);

  const inp = (val, set, placeholder, type='text') => (
    <input value={val} onChange={e=>set(e.target.value)} placeholder={placeholder} type={type}
      style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:10, padding:'11px 14px',
        fontSize:14, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', color:'#111' }}/>
  );

  const changePassword = async () => {
    if (!curPw || !newPw || !conPw) return onToast('Fill all fields','error');
    if (newPw !== conPw) return onToast('Passwords do not match','error');
    if (newPw.length < 8) return onToast('Min 8 characters','error');
    setSaving(true);
    try {
      await usersApi.changePassword({ current_password: curPw, new_password: newPw });
      onToast('Password changed!','success');
      setCurPw(''); setNewPw(''); setConPw('');
      setScreen('main');
    } catch(e) { onToast(e.message,'error'); }
    setSaving(false);
  };

  const setPin = async () => {
    if (pin1.length !== 4) return onToast('PIN must be 4 digits','error');
    if (pin1 !== pin2) return onToast('PINs do not match','error');
    setSaving(true);
    try {
      await profileApi.setPin({ pin: pin1 });
      onToast('Transaction PIN set!','success');
      setPin1(''); setPin2('');
      setScreen('main');
      onRefresh();
    } catch(e) { onToast(e.message,'error'); }
    setSaving(false);
  };

  const togglePrivacy = async () => {
    try {
      await profileApi.toggle('privacy_mode');
      onToast(profileData?.privacy_mode ? 'Privacy mode off' : 'Privacy mode on','success');
      onRefresh();
    } catch(e) { onToast(e.message,'error'); }
  };

  const toggleBiometric = async () => {
    try {
      await profileApi.toggle('biometric_enabled');
      onToast(profileData?.biometric_enabled ? 'Biometric disabled' : 'Biometric enabled','success');
      onRefresh();
    } catch(e) { onToast(e.message,'error'); }
  };

  const S = { fontFamily:"'DM Sans',sans-serif" };

  if (screen === 'password') return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f5f5', ...S }}>
      <div style={{ background:'#012169', padding:'20px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>setScreen('main')} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ fontSize:18, fontWeight:800 }}>Change Password</div>
      </div>
      <div style={{ padding:20 }}>
        <div style={{ background:'#fff', borderRadius:16, padding:22 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:.7, marginBottom:6 }}>Current Password</div>
              {inp(curPw, setCurPw, 'Enter current password','password')}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:.7, marginBottom:6 }}>New Password</div>
              {inp(newPw, setNewPw, 'Min 8 characters','password')}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:.7, marginBottom:6 }}>Confirm New Password</div>
              {inp(conPw, setConPw, 'Repeat new password','password')}
            </div>
            <button onClick={changePassword} disabled={saving}
              style={{ background:'#012169', color:'#fff', border:'none', borderRadius:12, padding:14, fontSize:15, fontWeight:700, cursor:'pointer', opacity:saving?.7:1 }}>
              {saving ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === 'pin') return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f5f5', ...S }}>
      <div style={{ background:'#012169', padding:'20px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>setScreen('main')} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ fontSize:18, fontWeight:800 }}>{profileData?.has_pin ? 'Change' : 'Set'} Transaction PIN</div>
      </div>
      <div style={{ padding:20 }}>
        <div style={{ background:'#fff', borderRadius:16, padding:22 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:.7, marginBottom:6 }}>New 4-Digit PIN</div>
              <input value={pin1} onChange={e=>setPin1(e.target.value.replace(/\D/,'').slice(0,4))} placeholder="••••" type="password" maxLength={4}
                style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:10, padding:'11px 14px', fontSize:22, letterSpacing:8, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', textAlign:'center' }}/>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:.7, marginBottom:6 }}>Confirm PIN</div>
              <input value={pin2} onChange={e=>setPin2(e.target.value.replace(/\D/,'').slice(0,4))} placeholder="••••" type="password" maxLength={4}
                style={{ width:'100%', border:'1.5px solid #e5e7eb', borderRadius:10, padding:'11px 14px', fontSize:22, letterSpacing:8, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', textAlign:'center' }}/>
            </div>
            <button onClick={setPin} disabled={saving||pin1.length!==4||pin2.length!==4}
              style={{ background:'#012169', color:'#fff', border:'none', borderRadius:12, padding:14, fontSize:15, fontWeight:700, cursor:'pointer', opacity:(saving||pin1.length!==4||pin2.length!==4)?.6:1 }}>
              {saving ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Main security screen
  const Toggle = ({ label, sub, value, onTap }) => (
    <div onClick={onTap} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid #f5f5f5', cursor:'pointer' }}>
      <div>
        <div style={{ fontSize:14, fontWeight:600, color:'#222' }}>{label}</div>
        <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{sub}</div>
      </div>
      <div style={{ width:44, height:24, borderRadius:12, background:value?'#012169':'#e5e7eb', position:'relative', transition:'background .2s', flexShrink:0 }}>
        <div style={{ position:'absolute', top:2, left:value?22:2, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.2)' }}/>
      </div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f5f5', ...S }}>
      <div style={{ background:'#012169', padding:'20px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ fontSize:18, fontWeight:800 }}>Security Settings</div>
      </div>
      <div style={{ padding:20 }}>
        {/* Account Security */}
        <div style={{ background:'#fff', borderRadius:16, padding:'4px 20px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#012169', textTransform:'uppercase', letterSpacing:.8, padding:'14px 0 8px' }}>Account Security</div>
          {[
            { label:'Change Password', sub:'Update your login password', icon:'🔑', action:()=>setScreen('password') },
            { label:`${profileData?.has_pin?'Change':'Set'} Transaction PIN`, sub:'4-digit PIN for transfers', icon:'🔢', action:()=>setScreen('pin') },
          ].map(item => (
            <div key={item.label} onClick={item.action}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 0', borderBottom:'1px solid #f5f5f5', cursor:'pointer' }}>
              <span style={{ fontSize:22 }}>{item.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#222' }}>{item.label}</div>
                <div style={{ fontSize:12, color:'#888', marginTop:1 }}>{item.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </div>

        {/* Privacy & Biometric */}
        <div style={{ background:'#fff', borderRadius:16, padding:'4px 20px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#012169', textTransform:'uppercase', letterSpacing:.8, padding:'14px 0 8px' }}>Privacy & Access</div>
          <Toggle label="Privacy Mode" sub="Hide balances on home screen" value={!!profileData?.privacy_mode} onTap={togglePrivacy}/>
          <Toggle label="Biometric Login" sub="Use fingerprint or face ID" value={!!profileData?.biometric_enabled} onTap={toggleBiometric}/>
        </div>

        {/* 2FA Info */}
        <div style={{ background:'#f0f4ff', border:'1px solid #c7d7ff', borderRadius:14, padding:'14px 16px' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#012169', marginBottom:4 }}>🛡️ Two-Factor Authentication</div>
          <div style={{ fontSize:12, color:'#555', lineHeight:1.6 }}>
            2FA is active on your account. Every login requires a one-time code sent to your registered email.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Help & Support ─────────────────────────────────────────────────────── */
function HelpSupportPage({ user, onBack, onToast }) {
  const [screen, setScreen]   = useState('main'); // main | chat | faq | faqDetail
  const [messages, setMessages] = useState([
    { id:1, from:'support', text:"Hello! 👋 Welcome to NexaBank support. I'm your virtual assistant. How can I help you today?", time: new Date() }
  ]);
  const [input, setInput]     = useState('');
  const [typing, setTyping]   = useState(false);
  const [faqOpen, setFaqOpen] = useState(null);
  const chatRef = useRef(null);

  const FAQS = [
    { q:'How do I reset my password?', a:'Go to More → Security Settings → Change Password. Enter your current password and your new password. Changes take effect immediately.' },
    { q:'How long do transfers take?', a:'Internal transfers between NexaBank accounts are instant. Zelle transfers typically arrive within minutes. External wire transfers take 1–3 business days.' },
    { q:'Why is my account frozen?', a:'Accounts may be frozen for security reasons or suspected unauthorized activity. Contact support via live chat for immediate assistance.' },
    { q:'How do I set up a transaction PIN?', a:'Go to More → Security Settings → Set Transaction PIN. Enter and confirm your 4-digit PIN. This PIN is required for all outgoing transfers.' },
    { q:'How do I upgrade my account tier?', a:'Go to Transfer → tap the tier upgrade option. Submit your documents. Tier upgrades are reviewed within 1–2 business days.' },
    { q:'What are the transfer limits?', a:'Tier 1: $500/day. Tier 2: $2,000/day. Tier 3: $10,000/day. Upgrade your tier to increase your limits.' },
    { q:'How do I request a credit card?', a:'Open the sidebar menu and tap "Credit Cards". Select your preferred card network and submit a request. A $1.00 processing fee applies upon approval.' },
    { q:'How do I verify my identity (KYC)?', a:'Go to your Profile → scroll down to KYC Verification. Upload your ID, proof of address, and a selfie. Verification takes 1–2 business days.' },
  ];

  const QUICK_REPLIES = [
    'Transfer issues', 'Account frozen', 'Card request', 'Tier upgrade', 'Report fraud'
  ];

  const RESPONSES = {
    'transfer': "I can help with transfer issues! First, make sure your account has sufficient funds and isn't frozen. For transfers over your tier limit, you'll need to upgrade your tier. Would you like me to connect you with a live agent?",
    'frozen': "Account freezes are usually temporary security measures. I'm escalating this to our team now. A live agent will review your account within 15 minutes. Is there anything else I can help with?",
    'card': "For card requests, you can apply directly from the sidebar menu → Credit Cards section. A $1.00 processing fee is charged upon approval. Would you like more details?",
    'tier': "Tier upgrades unlock higher transaction limits. Go to Transfer → Upgrade Tier and submit your documents. It takes 1–2 business days. Can I help with anything else?",
    'fraud': "🚨 If you suspect fraud, I'm alerting our security team immediately. Please do NOT share any OTPs or PINs. A specialist will contact you within 5 minutes. Do you want to freeze your accounts as a precaution?",
    'hello': "Hello! How can I assist you today? You can ask me about transfers, account issues, cards, or anything else.",
    'default': "Thank you for reaching out! I've noted your query and a support specialist will follow up shortly. Is there anything specific I can help clarify right now?",
  };

  function getReply(text) {
    const t = text.toLowerCase();
    if (t.includes('transfer') || t.includes('send') || t.includes('money')) return RESPONSES.transfer;
    if (t.includes('frozen') || t.includes('freeze') || t.includes('locked')) return RESPONSES.frozen;
    if (t.includes('card') || t.includes('credit')) return RESPONSES.card;
    if (t.includes('tier') || t.includes('limit') || t.includes('upgrade')) return RESPONSES.tier;
    if (t.includes('fraud') || t.includes('stolen') || t.includes('unauthorized')) return RESPONSES.fraud;
    if (t.includes('hello') || t.includes('hi') || t.includes('hey')) return RESPONSES.hello;
    return RESPONSES.default;
  }

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { id: Date.now(), from:'user', text: text.trim(), time: new Date() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      chatRef.current?.scrollTo({ top: 99999, behavior:'smooth' });
    }, 50);
    setTimeout(() => {
      setTyping(false);
      const reply = { id: Date.now()+1, from:'support', text: getReply(text), time: new Date() };
      setMessages(p => [...p, reply]);
      setTimeout(() => chatRef.current?.scrollTo({ top: 99999, behavior:'smooth' }), 50);
    }, 1400);
  };

  const fmt = t => t.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const S = { fontFamily:"'DM Sans',sans-serif" };

  if (screen === 'chat') return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f5f5f5', ...S, height:'100%' }}>
      {/* Header */}
      <div style={{ background:'#012169', padding:'16px 20px', color:'#fff', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={()=>setScreen('main')} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'#c8102e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🏦</div>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>NexaBank Support</div>
          <div style={{ fontSize:11, opacity:.7, display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80' }}/>
            Online · Typically replies in minutes
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatRef} style={{ flex:1, overflowY:'auto', padding:'16px 14px', display:'flex', flexDirection:'column', gap:10 }}>
        {messages.map(m => (
          <div key={m.id} style={{ display:'flex', flexDirection:m.from==='user'?'row-reverse':'row', alignItems:'flex-end', gap:8 }}>
            {m.from==='support' && (
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#012169', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>🏦</div>
            )}
            <div style={{ maxWidth:'78%' }}>
              <div style={{ background: m.from==='user'?'#012169':'#fff', color:m.from==='user'?'#fff':'#222', borderRadius: m.from==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.6, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
                {m.text}
              </div>
              <div style={{ fontSize:10, color:'#bbb', marginTop:3, textAlign:m.from==='user'?'right':'left' }}>{fmt(m.time)}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'#012169', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🏦</div>
            <div style={{ background:'#fff', borderRadius:'16px 16px 16px 4px', padding:'12px 16px', boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
              <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#012169', animation:`bounce .8s ${i*0.15}s infinite` }}/>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick replies */}
      <div style={{ padding:'8px 14px 4px', display:'flex', gap:7, overflowX:'auto', flexShrink:0 }}>
        {QUICK_REPLIES.map(r => (
          <button key={r} onClick={()=>sendMessage(r)}
            style={{ background:'#f0f4ff', border:'1px solid #c7d7ff', borderRadius:20, padding:'6px 14px', fontSize:12, color:'#012169', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'DM Sans',sans-serif" }}>
            {r}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding:'10px 14px 24px', background:'#fff', borderTop:'1px solid #f0f0f0', display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Type your message…"
          onKeyDown={e=>{ if(e.key==='Enter' && input.trim()) sendMessage(input); }}
          style={{ flex:1, border:'1.5px solid #e5e7eb', borderRadius:24, padding:'10px 16px', fontSize:14, outline:'none', fontFamily:"'DM Sans',sans-serif" }}/>
        <button onClick={()=>sendMessage(input)} disabled={!input.trim()}
          style={{ width:42, height:42, borderRadius:'50%', background:input.trim()?'#012169':'#e5e7eb', border:'none', cursor:input.trim()?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </div>
  );

  if (screen === 'faq') return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f5f5', ...S }}>
      <div style={{ background:'#012169', padding:'20px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>setScreen('main')} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ fontSize:18, fontWeight:800 }}>FAQs</div>
      </div>
      <div style={{ padding:20 }}>
        <div style={{ background:'#fff', borderRadius:16, overflow:'hidden' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: i<FAQS.length-1?'1px solid #f5f5f5':'none' }}>
              <div onClick={()=>setFaqOpen(faqOpen===i?null:i)}
                style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#222', flex:1, paddingRight:12 }}>{faq.q}</div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: faqOpen===i?'rotate(90deg)':'rotate(0)', transition:'transform .2s', flexShrink:0 }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
              {faqOpen===i && (
                <div style={{ padding:'0 20px 16px', fontSize:13, color:'#666', lineHeight:1.7, background:'#f8f9fb' }}>{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Main help screen
  return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f5f5', ...S }}>
      <div style={{ background:'#012169', padding:'20px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ fontSize:18, fontWeight:800 }}>Help & Support</div>
      </div>
      <div style={{ padding:20 }}>
        {/* Live Chat CTA */}
        <div onClick={()=>setScreen('chat')}
          style={{ background:'linear-gradient(135deg,#012169,#0e4fbd)', borderRadius:16, padding:22, marginBottom:16, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:52, height:52, borderRadius:16, background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>💬</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16 }}>Live Chat Support</div>
            <div style={{ fontSize:12, opacity:.8, marginTop:3 }}>Chat with a specialist now</div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:6 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80' }}/>
              <span style={{ fontSize:11, opacity:.9 }}>Online · Replies in minutes</span>
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft:'auto' }}><path d="M9 18l6-6-6-6"/></svg>
        </div>

        {/* Options */}
        <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', marginBottom:14 }}>
          {[
            { icon:'❓', label:'FAQs', sub:'Find quick answers', action:()=>setScreen('faq') },
            { icon:'📧', label:'Email Support', sub:'support@nexabank.com', action:()=>onToast('Email: support@nexabank.com','success') },
            { icon:'📞', label:'Call Support', sub:'1-800-NEXA-BANK', action:()=>onToast('Call: 1-800-NEXA-BANK','success') },
          ].map((item, i, arr) => (
            <div key={item.label} onClick={item.action}
              style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', cursor:'pointer', borderBottom:i<arr.length-1?'1px solid #f5f5f5':'none' }}>
              <span style={{ fontSize:22 }}>{item.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#222' }}>{item.label}</div>
                <div style={{ fontSize:12, color:'#888', marginTop:1 }}>{item.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </div>

        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:14, padding:'14px 16px', fontSize:13, color:'#9a3412', lineHeight:1.6 }}>
          🚨 <strong>Report Fraud:</strong> Call 1-800-NEXA-BANK immediately or use Live Chat. We're available 24/7.
        </div>
      </div>
    </div>
  );
}

/* ─── More Page ──────────────────────────────────────────────────────────── */
function MorePage({ user, profileData, onLogout, onToast, onRefresh }) {
  const [screen, setScreen] = useState('main'); // main | security | help

  if (screen === 'security') return (
    <SecurityPage profileData={profileData} onToast={onToast} onRefresh={onRefresh} onBack={()=>setScreen('main')}/>
  );

  if (screen === 'help') return (
    <HelpSupportPage user={user} onBack={()=>setScreen('main')} onToast={onToast}/>
  );

  const S = { fontFamily:"'DM Sans',sans-serif" };

  return (
    <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f5f5', ...S }}>
      <div style={{ background:'#012169', padding:'20px', color:'#fff' }}>
        <div style={{ fontSize:22, fontWeight:800 }}>More</div>
      </div>
      <div style={{ padding:16 }}>
        {/* Profile Card */}
        <div style={{ background:'#fff', borderRadius:16, padding:20, marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:60, height:60, borderRadius:'50%', background:'#c8102e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#fff', overflow:'hidden', flexShrink:0 }}>
            {profileData?.avatar && profileData.avatar.startsWith('data:')
              ? <img src={profileData.avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : (user?.full_name?.slice(0,2).toUpperCase() || 'ME')}
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:18, color:'#012169' }}>{user?.full_name}</div>
            <div style={{ fontSize:13, color:'#888', marginTop:2 }}>{user?.email}</div>
            {profileData?.customer_id && <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>ID: {profileData.customer_id}</div>}
          </div>
        </div>

        {/* Menu items */}
        {[
          { label:'Security Settings', icon:'🔒', sub:'Password, PIN & privacy',   action:()=>setScreen('security') },
          { label:'Help & Support',    icon:'💬', sub:'Chat, FAQs & contact',       action:()=>setScreen('help') },
        ].map(item => (
          <div key={item.label} onClick={item.action}
            style={{ background:'#fff', borderRadius:14, padding:'16px 20px', marginBottom:10, display:'flex', alignItems:'center', gap:14, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize:22 }}>{item.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:'#222', fontSize:14 }}>{item.label}</div>
              <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{item.sub}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        ))}

        <div onClick={onLogout}
          style={{ background:'#fff', borderRadius:14, padding:'16px 20px', marginTop:4, display:'flex', alignItems:'center', gap:14, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.04)', color:'#c8102e' }}>
          <span style={{ fontSize:22 }}>🚪</span>
          <span style={{ fontWeight:700, fontSize:14 }}>Sign Out</span>
        </div>
      </div>
    </div>
  );
}


/* ─── Pay Page ──────────────────────────────────────────────────────────── */
function PayPage() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 90 }}>
      <div style={{ background: '#012169', padding: '20px', color: '#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Pay Bills</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: '#ccc', fontFamily: "'DM Sans', sans-serif" }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.5" strokeLinecap="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/>
        </svg>
        <div style={{ fontSize: 16, color: '#bbb' }}>Bill Pay coming soon</div>
      </div>
    </div>
  );
}

/* ─── Main BankingApp ──────────────────────────────────────────────────────── */
export default function BankingApp() {
  const { user, logout: onLogout } = useAuth();
  const [tab, setTab]             = useState('home');
  const [accounts, setAccounts]   = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedAcct, setSelectedAcct] = useState(null);
  const [showDeposit, setShowDeposit]   = useState(false);
  const [toast, setToast]         = useState(null);
  const [selectedTxn,  setSelectedTxn]  = useState(null);
  const [showSidebar,  setShowSidebar]  = useState(false);
  const [notifications,   setNotifications]   = useState([]);
  const [showNotifPanel,  setShowNotifPanel]  = useState(false);
  const [selectedNotif,   setSelectedNotif]   = useState(null);
  // Profile dropdown
  const [showProfileDrop, setShowProfileDrop] = useState(false);
  const [profileScreen,   setProfileScreen]   = useState(null); // 'view'|'contact'|'kyc'|'password'|'pin'|'biometric'|'devices'|'privacy'
  const [profileData,     setProfileData]     = useState(null);
  // PIN modal for transfers
  const [pinModal,        setPinModal]        = useState(null); // {resolve, reject}
  const [pinInput,        setPinInput]        = useState('');
  const [pinError,        setPinError]        = useState('');

  const firstName = user?.full_name?.split(' ')[0] || 'User';

  const loadNotifications = useCallback(async () => {
    try {
      const data = await usersApi.notifications();
      setNotifications(data || []);
    } catch (e) { /* silent */ }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const data = await profileApi.me();
      setProfileData(data);
    } catch (e) { /* silent */ }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [accts, txns] = await Promise.all([
        accountsApi.list(),
        txnApi.list({ limit: 100 }),
      ]);
      setAccounts(accts || []);
      setTransactions(txns || []);
      setSelectedAcct(prev => prev ? (accts || []).find(a => a.id === prev.id) || prev : null);
      loadNotifications();
    } catch (e) {
      showToast(e.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); loadProfile(); }, [loadData, loadProfile]);

  // Poll notifications every 30 seconds
  useEffect(() => {
    const id = setInterval(loadNotifications, 30000);
    return () => clearInterval(id);
  }, [loadNotifications]);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const totalBalance     = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
  const availableBalance = accounts.filter(a => !a.is_frozen).reduce((s, a) => s + parseFloat(a.balance || 0), 0);
  const recentTxns       = [...transactions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
  const txnGroups        = groupByDate(recentTxns);

  /* ── Loading screen ── */
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, background: '#f5f5f5' }}>
      <Spinner size={40} color="#012169"/>
      <div style={{ fontFamily: "'DM Sans', sans-serif", color: '#888', fontSize: 15 }}>Loading your accounts…</div>
    </div>
  );

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900&display=swap');
        @keyframes boa-spin    { to { transform: rotate(360deg); } }
        @keyframes boa-fadeUp  { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes boa-fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes boa-slideUp { from { transform: translateY(60%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { display: none; }
        
        /* Desktop styles */
        @media (min-width: 768px) {
          body {
            background: #1a1f2e;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
          }
          .banking-app-container {
            width: 100%;
            max-width: 1280px;
            height: 95vh;
            margin: 0 auto;
            background: #f5f5f5;
            border-radius: 28px;
            box-shadow: 0 25px 60px rgba(0,0,0,0.3);
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="banking-app-container">
        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)}/>}

        {/* Desktop header - only visible on desktop */}
        <div className="desktop-header" style={{
          display: 'none',
          '@media (min-width: 768px)': {
            display: 'block'
          }
        }}>
          {/* Desktop header content will be inside the main content */}
        </div>

        {/* Page content */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          overflowY: 'auto', 
          position: 'relative',
          height: '100%'
        }}>
          {tab === 'home' && (
            <HomePage
              user={user}
              accounts={accounts}
              transactions={transactions}
              totalBalance={totalBalance}
              availableBalance={availableBalance}
              onOpenSidebar={() => setShowSidebar(true)}
              onSetTab={setTab}
              onDeposit={() => setShowDeposit(true)}
              onSelectAcct={a => { setSelectedAcct(a); setTab(a.type === 'credit' && a.card_network ? 'card' : 'detail'); }}
              firstName={firstName}
              recentTxns={recentTxns}
              txnGroups={txnGroups}
              onSelectTxn={t => setSelectedTxn(t)}
              notifications={notifications}
              onOpenNotif={() => setShowNotifPanel(true)}
              privacyMode={!!(profileData?.privacy_mode)}
              onOpenProfile={() => setShowProfileDrop(true)}
              profileData={profileData}
            />
          )}
          {tab === 'accounts' && !selectedAcct && (
            <AccountsPage accounts={accounts}
              onSelectAccount={a => {
                setSelectedAcct(a);
                setTab(a.type === 'credit' && a.card_network ? 'card' : 'detail');
              }}/>
          )}
          {tab === 'detail' && selectedAcct && selectedAcct.type !== 'credit' && (
            <AccountDetail
              account={selectedAcct} transactions={transactions}
              onBack={() => { setSelectedAcct(null); setTab('accounts'); }}
              onDeposit={() => setShowDeposit(true)}
              onTransfer={() => setTab('transfer')}
              onSelectTxn={t => setSelectedTxn(t)}
            />
          )}
          {tab === 'card' && selectedAcct && (
            <CardManagementScreen
              account={selectedAcct}
              onBack={() => { setSelectedAcct(null); setTab('accounts'); }}
              onToast={showToast}
              onRefresh={loadData}
            />
          )}
          {tab === 'transfer' && (
            <TransferPage accounts={accounts} onSuccess={loadData} onToast={showToast}
              onRequestPin={() => new Promise((resolve, reject) => {
                setPinInput(''); setPinError(''); setPinModal({ resolve, reject });
              })}/>
          )}
          {tab === 'pay'  && <ZellePage accounts={accounts} onSuccess={loadData} onToast={showToast} onRequestPin={() => new Promise((resolve, reject) => { setPinInput(''); setPinError(''); setPinModal({ resolve, reject }); })}/>}
          {tab === 'more' && <MorePage user={user} profileData={profileData} onLogout={onLogout} onToast={showToast} onRefresh={loadProfile}/>}
        </div>

        {/* Sidebar */}
        {showSidebar && (
      
<SidebarMenu
  accounts={accounts}
  user={user}
  onClose={() => setShowSidebar(false)}
  onRefresh={async () => {
  try {
    await loadData();
    return true;
  } catch (error) {
    console.error('Refresh failed:', error);
    return false;
  }
}}
  onToast={showToast}
  onDeposit={() => { setShowSidebar(false); setShowDeposit(true); }}
  onTransfer={() => { setShowSidebar(false); setTab('transfer'); }}
 onCardApproved={() => { 
  setShowSidebar(false); 
  setTab('accounts'); 
  loadData();
}}
  onSelectCard={card => {
    setShowSidebar(false);
    setTimeout(() => {
      setSelectedAcct(card);
      setTab('card');
    }, 220);
  }}
/>
        )}

        {/* Transaction detail overlay */}
        {selectedTxn && (
          <TransactionDetail
            txn={selectedTxn}
            accounts={accounts}
            onBack={() => setSelectedTxn(null)}
          />
        )}

        {/* ── Notification Panel ── */}
        {showNotifPanel && !selectedNotif && (
          <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', flexDirection:'column',
            background:'#f8f9fb', fontFamily:"'DM Sans',sans-serif",
            '@media (min-width: 768px)': {
              maxWidth: '480px',
              left: '50%',
              transform: 'translateX(-50%)',
              boxShadow: '0 0 40px rgba(0,0,0,0.2)',
            }
          }}>

            {/* Header */}
            <div style={{ background:'#012169', padding:'16px 20px',
              paddingTop:'calc(16px + env(safe-area-inset-top, 0px))',
              display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
              <div onClick={() => setShowNotifPanel(false)}
                style={{ cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                  width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.12)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>Notifications</div>
                {notifications.filter(n=>!n.is_read).length > 0 && (
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:1 }}>
                    {notifications.filter(n=>!n.is_read).length} unread
                  </div>
                )}
              </div>
              {notifications.some(n=>!n.is_read) && (
                <div onClick={async () => {
                  await usersApi.markNotifRead();
                  setNotifications(prev => prev.map(n => ({...n, is_read:true})));
                }} style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.75)',
                  cursor:'pointer', padding:'6px 12px', borderRadius:8,
                  background:'rgba(255,255,255,0.12)' }}>
                  Mark all read
                </div>
              )}
            </div>

            {/* List */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {notifications.length === 0 && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', height:'60%', gap:12 }}>
                  <div style={{ fontSize:48 }}>🔔</div>
                  <div style={{ fontSize:14, color:'#bbb', fontWeight:600 }}>No notifications yet</div>
                </div>
              )}
              {notifications.map((n, i) => (
                <div key={n.id} onClick={async () => {
                  if (!n.is_read) {
                    await usersApi.markOneRead(n.id).catch(()=>{});
                    setNotifications(prev => prev.map(x => x.id===n.id ? {...x,is_read:true} : x));
                  }
                  setSelectedNotif({...n, is_read:true});
                }}
                  style={{ display:'flex', gap:14, padding:'14px 20px',
                    borderBottom:'1px solid #eee', cursor:'pointer',
                    background: n.is_read ? '#fff' : '#eef2ff',
                    transition:'background 0.15s' }}>

                  {/* Unread dot */}
                  <div style={{ flexShrink:0, paddingTop:4 }}>
                    {!n.is_read
                      ? <div style={{ width:8, height:8, borderRadius:'50%', background:'#012169' }}/>
                      : <div style={{ width:8, height:8 }}/>
                    }
                  </div>

                  {/* Icon */}
                  <div style={{ width:40, height:40, borderRadius:12, flexShrink:0,
                    background: n.is_read ? '#f3f4f6' : '#dbeafe',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                    {n.icon || '🔔'}
                  </div>

                  {/* Text */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color: n.is_read ? '#555' : '#111',
                      fontWeight: n.is_read ? 500 : 700,
                      lineHeight:1.4, wordBreak:'break-word' }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>
                      {new Date(n.created_at).toLocaleString('en-US',{
                        month:'short', day:'numeric',
                        hour:'numeric', minute:'2-digit', hour12:true
                      })}
                    </div>
                  </div>

                  {/* Chevron */}
                  <div style={{ flexShrink:0, display:'flex', alignItems:'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Notification Detail ── */}
        {showNotifPanel && selectedNotif && (
          <div style={{ position:'fixed', inset:0, zIndex:1001, display:'flex', flexDirection:'column',
            background:'#f8f9fb', fontFamily:"'DM Sans',sans-serif",
            '@media (min-width: 768px)': {
              maxWidth: '480px',
              left: '50%',
              transform: 'translateX(-50%)',
              boxShadow: '0 0 40px rgba(0,0,0,0.2)',
            }
          }}>

            {/* Header */}
            <div style={{ background:'#012169', padding:'16px 20px',
              paddingTop:'calc(16px + env(safe-area-inset-top, 0px))',
              display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
              <div onClick={() => setSelectedNotif(null)}
                style={{ cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                  width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.12)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </div>
              <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>Notification</div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
              {/* Icon + title card */}
              <div style={{ background:'#fff', borderRadius:18, padding:'28px 20px',
                textAlign:'center', marginBottom:20,
                boxShadow:'0 2px 16px rgba(0,0,0,0.06)', border:'1px solid #f0f0f0' }}>
                <div style={{ fontSize:52, marginBottom:14 }}>{selectedNotif.icon || '🔔'}</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#111',
                  lineHeight:1.4, marginBottom:10, padding:'0 8px' }}>
                  {selectedNotif.message}
                </div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:6,
                  padding:'5px 12px', borderRadius:20,
                  background: selectedNotif.is_read ? '#f3f4f6' : '#dbeafe',
                  fontSize:11, fontWeight:700,
                  color: selectedNotif.is_read ? '#888' : '#1d4ed8' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%',
                    background: selectedNotif.is_read ? '#aaa' : '#3b82f6' }}/>
                  {selectedNotif.is_read ? 'Read' : 'Unread'}
                </div>
              </div>

              {/* Meta */}
              <div style={{ background:'#fff', borderRadius:14, overflow:'hidden',
                border:'1px solid #f0f0f0', boxShadow:'0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ padding:'10px 16px', background:'#f8f9fb',
                  borderBottom:'1px solid #f0f0f0', fontSize:11, fontWeight:800,
                  color:'#012169', textTransform:'uppercase', letterSpacing:0.8 }}>
                  Details
                </div>
                {[
                  ['Date', new Date(selectedNotif.created_at).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})],
                  ['Time', new Date(selectedNotif.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})],
                  ['Status', selectedNotif.is_read ? 'Read' : 'Unread'],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between',
                    padding:'12px 16px', borderBottom:'1px solid #f8f8f8', alignItems:'center' }}>
                    <span style={{ fontSize:13, color:'#888' }}>{k}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'#111' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            PROFILE DROPDOWN + ALL SCREENS
        ═══════════════════════════════════════════════════════════ */}
        {showProfileDrop && (
          <ProfileCenter
            user={user}
            profileData={profileData}
            onClose={() => setShowProfileDrop(false)}
            onRefreshProfile={loadProfile}
            onToast={showToast}
            onTogglePrivacy={async () => {
              const res = await profileApi.toggle('privacy_mode');
              setProfileData(prev => ({ ...prev, privacy_mode: res.privacy_mode }));
            }}
          />
        )}

        {/* ── PIN Modal ── */}
        {pinModal && (
          <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,0.55)',
            display:'flex', alignItems:'flex-end', justifyContent:'center', fontFamily:"'DM Sans',sans-serif",
            '@media (min-width: 768px)': {
              alignItems: 'center',
            }
          }}>
            <div style={{ background:'#fff', borderRadius:'24px 24px 0 0', padding:'28px 24px 40px',
              width:'100%', maxWidth:480,
              '@media (min-width: 768px)': {
                borderRadius: '24px',
              }
            }}>
              <div style={{ width:40, height:4, borderRadius:2, background:'#e5e7eb', margin:'0 auto 20px' }}/>
              <div style={{ fontSize:18, fontWeight:800, color:'#012169', marginBottom:6 }}>Enter Transaction PIN</div>
              <div style={{ fontSize:13, color:'#888', marginBottom:24 }}>Enter your 4-digit PIN to confirm this transfer</div>
              {/* 4 dot indicators */}
              <div style={{ display:'flex', justifyContent:'center', gap:16, marginBottom:24 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width:16, height:16, borderRadius:'50%',
                    background: pinInput.length > i ? '#012169' : '#e5e7eb',
                    transition:'background 0.15s' }}/>
                ))}
              </div>
              {pinError && <div style={{ color:'#c8102e', fontSize:12, fontWeight:600,
                textAlign:'center', marginBottom:12 }}>{pinError}</div>}
              {/* Numpad */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k,i) => (
                  <button key={i} disabled={!k} onClick={() => {
                    if (k === '⌫') { setPinInput(p => p.slice(0,-1)); setPinError(''); }
                    else if (pinInput.length < 4) {
                      const np = pinInput + k;
                      setPinInput(np);
                      setPinError('');
                      if (np.length === 4) {
                        // auto-submit
                        pinModal.resolve(np);
                        setPinModal(null); setPinInput('');
                      }
                    }
                  }} style={{ padding:'16px 0', border:'1.5px solid #e5e7eb', borderRadius:12,
                    fontSize: k === '⌫' ? 18 : 20, fontWeight:700, background: k ? '#fff' : 'transparent',
                    cursor: k ? 'pointer' : 'default', color:'#111', fontFamily:"'DM Sans',sans-serif",
                    opacity: k ? 1 : 0 }}>
                    {k}
                  </button>
                ))}
              </div>
              <button onClick={() => { pinModal.reject(); setPinModal(null); setPinInput(''); setPinError(''); }}
                style={{ width:'100%', padding:'14px', border:'none', borderRadius:12,
                  background:'#f5f5f5', color:'#888', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* Deposit modal */}
        {showDeposit && (
          <DepositModal accounts={accounts}
            onClose={() => setShowDeposit(false)}
            onSuccess={loadData}
            onToast={showToast}/>
        )}

        {/* Bottom nav */}
        <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb',
          display: 'flex', paddingBottom: 'env(safe-area-inset-bottom, 4px)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.07)', flexShrink: 0,
          '@media (min-width: 768px)': {
            maxWidth: '600px',
            margin: '0 auto',
            width: '100%',
            borderTop: 'none',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
          }
        }}>
          {[
            { id: 'home', label: 'Home', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
            { id: 'accounts', label: 'Accounts', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
            { id: 'transfer', label: 'Transfer', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg> },
            { id: 'pay', label: 'Pay', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg> },
            { id: 'more', label: 'More', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg> },
          ].map(({ id, label, icon }) => {
            const active = tab === id || (id === 'accounts' && (tab === 'detail' || tab === 'card'));
            return (
              <div key={id} onClick={() => { setTab(id); if (id === 'accounts') { setSelectedAcct(null); } }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '10px 0 6px', cursor: 'pointer',
                  color: active ? '#c8102e' : '#aaa', transition: 'color 0.2s' }}>
                {icon}
                <span style={{ fontSize: 10, marginTop: 4, fontWeight: active ? 700 : 500,
                  fontFamily: "'DM Sans', sans-serif" }}>
                  {label}
                </span>
                {active && (
                  <div style={{ width: 24, height: 3, background: '#c8102e', borderRadius: 2, marginTop: 3 }}/>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}