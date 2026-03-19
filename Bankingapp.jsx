import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { accounts as accountsApi, transactions as txnApi, users as usersApi } from '../api/client';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = {
  food:          { label: 'Food & Drink',   icon: '🍔', color: '#ff6b6b' },
  transport:     { label: 'Transport',      icon: '🚗', color: '#ffd93d' },
  utilities:     { label: 'Utilities',      icon: '⚡', color: '#00f5c4' },
  entertainment: { label: 'Entertainment',  icon: '🎬', color: '#7c6fff' },
  shopping:      { label: 'Shopping',       icon: '🛍️', color: '#ff9f43' },
  health:        { label: 'Health',         icon: '❤️', color: '#ff6b6b' },
  income:        { label: 'Income',         icon: '💰', color: '#00f5c4' },
  transfer:      { label: 'Transfer',       icon: '↔️', color: '#a8dadc' },
  other:         { label: 'Other',          icon: '📦', color: '#8892a4' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => {
  const abs = Math.abs(parseFloat(n));
  return (parseFloat(n) < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const timeAgo = (date) => {
  const diff = (Date.now() - new Date(date)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type==='success' ? 'linear-gradient(135deg,#00f5c4,#00c9a7)' : t.type==='error' ? 'linear-gradient(135deg,#ff6b6b,#ee5a24)' : 'linear-gradient(135deg,#7c6fff,#6c5ce7)',
          color:'#0a0e1a', padding:'12px 20px', borderRadius:12, fontFamily:"'DM Sans',sans-serif",
          fontWeight:600, fontSize:13, boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
          animation:'slideIn 0.3s ease', minWidth:220
        }}>{t.icon} {t.message}</div>
      ))}
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#0f1422', border:'1px solid rgba(255,255,255,0.1)', borderRadius:24, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.7)', animation:'modalIn 0.3s cubic-bezier(0.23,1,0.32,1)' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:16, fontFamily:"'DM Sans',sans-serif" }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#8892a4', cursor:'pointer', fontSize:18, width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({ account, active, onClick, flipped, onFlip }) {
  const color = account.card_color || '#00f5c4';
  return (
    <div onClick={onClick} style={{ cursor:'pointer', perspective:600, width:'100%', maxWidth:320 }}>
      <div style={{ position:'relative', width:'100%', paddingBottom:'57%', transformStyle:'preserve-3d', transition:'transform 0.6s cubic-bezier(0.23,1,0.32,1)', transform: flipped ? 'rotateY(180deg)' : 'none' }}>
        <div style={{ position:'absolute', inset:0, borderRadius:20, padding:'20px 24px', background:`linear-gradient(135deg,${color}22,${color}08)`, border:`1.5px solid ${active ? color : 'rgba(255,255,255,0.08)'}`, boxShadow: active ? `0 0 0 1px ${color}44,0 16px 40px ${color}22` : '0 8px 24px rgba(0,0,0,0.3)', backfaceVisibility:'hidden', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ color:'#8892a4', fontSize:11, fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase', letterSpacing:1.5 }}>{account.label}</div>
              <div style={{ color: account.balance < 0 ? '#ff6b6b' : '#fff', fontSize:22, fontWeight:800, fontFamily:"'Space Grotesk',sans-serif", marginTop:2 }}>{fmt(account.balance)}</div>
            </div>
            <div style={{ color, fontWeight:800, fontSize:13, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:2 }}>{account.type?.toUpperCase()}</div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ color:'#8892a4', fontSize:12, fontFamily:"'DM Mono',monospace", letterSpacing:2 }}>{account.card_number}</div>
            <button onClick={e => { e.stopPropagation(); onFlip(); }} style={{ background:'rgba(255,255,255,0.08)', border:'none', color:'#8892a4', borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>FLIP</button>
          </div>
        </div>
        <div style={{ position:'absolute', inset:0, borderRadius:20, padding:'20px 24px', background:`linear-gradient(135deg,${color}33,${color}11)`, border:`1.5px solid ${color}55`, backfaceVisibility:'hidden', transform:'rotateY(180deg)', display:'flex', flexDirection:'column', justifyContent:'space-around' }}>
          <div style={{ background:'rgba(0,0,0,0.3)', height:40, borderRadius:6, display:'flex', alignItems:'center', paddingLeft:16 }}>
            <span style={{ color:'#8892a4', fontSize:12, fontFamily:"'DM Mono',monospace" }}>{account.card_number}</span>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            <div><div style={{ color:'#8892a4', fontSize:10 }}>CVV</div><div style={{ color:'#fff', fontFamily:"'DM Mono',monospace" }}>• • •</div></div>
            <div><div style={{ color:'#8892a4', fontSize:10 }}>Valid Thru</div><div style={{ color:'#fff', fontFamily:"'DM Mono',monospace" }}>12/28</div></div>
            <div><div style={{ color:'#8892a4', fontSize:10 }}>Type</div><div style={{ color, fontWeight:700 }}>{account.type?.toUpperCase()}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 120 }) {
  const r = 40, cx = size/2, cy = size/2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const total = segments.reduce((s, g) => s + g.value, 0) || 1;
  return (
    <svg width={size} height={size}>
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth="16" strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset} style={{ transform:`rotate(-90deg)`, transformOrigin:`${cx}px ${cy}px`, transition:'stroke-dasharray 0.5s' }} />;
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={28} fill="#0a0e1a" />
    </svg>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color='#00f5c4', width=280, height=48 }) {
  const max = Math.max(...data); const min = Math.min(...data);
  const range = max - min || 1;
  if (data.length < 2) return null;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ overflow:'visible' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Send Money Modal ─────────────────────────────────────────────────────────
function SendMoneyModal({ onClose, accounts, contacts, onSuccess }) {
  const [step, setStep]       = useState(1);
  const [toId, setToId]       = useState('');
  const [fromId, setFromId]   = useState(accounts[0]?.id || '');
  const [amount, setAmount]   = useState('');
  const [note, setNote]       = useState('');
  const [pin, setPin]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const inputStyle = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'12px 16px', color:'#fff', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' };
  const label = { color:'#8892a4', fontSize:11, textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:6 };
  const btn = (primary) => ({ width:'100%', padding:14, borderRadius:12, border:'none', cursor:'pointer', fontWeight:700, fontSize:14, fontFamily:"'DM Sans',sans-serif", background: primary ? 'linear-gradient(135deg,#00f5c4,#00c9a7)' : 'rgba(255,255,255,0.06)', color: primary ? '#0a0e1a' : '#fff' });

  const handleSend = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const result = await txnApi.transfer({ from_account_id: fromId, to_identifier: toId, amount: parseFloat(amount), note });
      onSuccess(result.transaction);
      onClose();
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (pin.length === 4 && step === 3) handleSend(); }, [pin]);

  const selectedContact = contacts.find(c => c.id === parseInt(toId));
  const fromAcc = accounts.find(a => a.id === fromId);

  return (
    <Modal title={['','Send Money','Review Transfer','Confirm PIN'][step]} onClose={onClose}>
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div>
            <label style={label}>Recipient Account / Card Last 4</label>
            <input value={toId} onChange={e => setToId(e.target.value)} placeholder="Account ID or last 4 digits of card" style={inputStyle} />
          </div>
          {contacts.length > 0 && (
            <div>
              <label style={label}>Quick Select Contact</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {contacts.map(c => (
                  <div key={c.id} onClick={() => setToId(String(c.id))} style={{ padding:12, borderRadius:12, border:`1px solid ${toId===String(c.id) ? '#00f5c4' : 'rgba(255,255,255,0.08)'}`, cursor:'pointer', display:'flex', alignItems:'center', gap:10, background: toId===String(c.id) ? 'rgba(0,245,196,0.08)' : 'transparent' }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6fff,#6c5ce7)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:12, flexShrink:0 }}>{c.avatar}</div>
                    <div><div style={{ color:'#fff', fontSize:13, fontWeight:600 }}>{c.name.split(' ')[0]}</div><div style={{ color:'#8892a4', fontSize:11 }}>{c.bank}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label style={label}>From Account</label>
            <select value={fromId} onChange={e => setFromId(e.target.value)} style={{ ...inputStyle, cursor:'pointer' }}>
              {accounts.filter(a => !a.is_frozen && a.balance > 0).map(a => (
                <option key={a.id} value={a.id} style={{ background:'#0f1422' }}>{a.label} – {fmt(a.balance)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Amount</label>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:'#00f5c4', fontWeight:700 }}>$</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.01" placeholder="0.00" style={{ ...inputStyle, paddingLeft:32 }} />
            </div>
          </div>
          <div>
            <label style={label}>Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="What's this for?" style={inputStyle} />
          </div>
          {error && <div style={{ color:'#ff6b6b', fontSize:13 }}>{error}</div>}
          <button onClick={() => { if (toId && parseFloat(amount) > 0) { setError(''); setStep(2); } else setError('Fill in recipient and amount'); }} style={btn(true)}>Continue →</button>
        </div>
      )}
      {step === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div style={{ background:'rgba(0,245,196,0.06)', border:'1px solid rgba(0,245,196,0.15)', borderRadius:16, padding:20 }}>
            {[['To', toId], ['From', fromAcc?.label], ['Amount', `$${parseFloat(amount).toFixed(2)}`], ...(note ? [['Note', note]] : [])].map(([l, v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ color:'#8892a4', fontSize:12 }}>{l}</span>
                <span style={{ color: l==='Amount' ? '#00f5c4' : '#fff', fontWeight: l==='Amount' ? 800 : 600, fontSize: l==='Amount' ? 20 : 14, fontFamily: l==='Amount' ? "'Space Grotesk',sans-serif" : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => setStep(1)} style={btn(false)}>← Back</button>
            <button onClick={() => setStep(3)} style={btn(true)}>Confirm →</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>
          <div style={{ color:'#8892a4', fontSize:13, textAlign:'center' }}>Enter any 4-digit PIN to confirm</div>
          <div style={{ display:'flex', gap:12 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width:48, height:56, borderRadius:12, background:'rgba(255,255,255,0.06)', border:`1px solid ${pin.length>i ? '#00f5c4' : 'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', justifyContent:'center', color:'#00f5c4', fontSize:24 }}>{pin[i] ? '●' : ''}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, width:200 }}>
            {[1,2,3,4,5,6,7,8,9,'','0','⌫'].map((k, i) => (
              <button key={i} disabled={loading} onClick={() => { if (k==='⌫') setPin(p=>p.slice(0,-1)); else if (k!=='' && pin.length<4) setPin(p=>p+k); }} style={{ padding:'14px 0', borderRadius:12, background: k==='' ? 'transparent' : 'rgba(255,255,255,0.06)', border: k==='' ? 'none' : '1px solid rgba(255,255,255,0.08)', color:'#fff', fontSize:16, fontWeight:600, cursor: k==='' ? 'default' : 'pointer', fontFamily:"'DM Mono',monospace" }}>{k}</button>
            ))}
          </div>
          {loading && <div style={{ color:'#00f5c4', fontSize:13 }}>Processing…</div>}
          {error && <div style={{ color:'#ff6b6b', fontSize:13, textAlign:'center' }}>{error}</div>}
        </div>
      )}
    </Modal>
  );
}

// ─── Transaction Detail Modal ─────────────────────────────────────────────────
function TxnDetail({ txn, onClose }) {
  const cat = CATEGORIES[txn.category] || CATEGORIES.other;
  return (
    <Modal title="Transaction Details" onClose={onClose}>
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{cat.icon}</div>
          <div style={{ color: parseFloat(txn.amount) > 0 ? '#00f5c4' : '#ff6b6b', fontSize:32, fontWeight:800, fontFamily:"'Space Grotesk',sans-serif" }}>{fmt(txn.amount)}</div>
          <div style={{ color:'#fff', fontSize:16, fontWeight:600, marginTop:4 }}>{txn.description}</div>
          <div style={{ color:'#8892a4', fontSize:12, marginTop:4 }}>{new Date(txn.created_at).toLocaleString()}</div>
        </div>
        <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:16, padding:16 }}>
          {[['Category', cat.label], ['Status', txn.status], ['Account', txn.account_label || '—'], ['Reference', txn.reference || '—']].map(([l, v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ color:'#8892a4', fontSize:12 }}>{l}</span>
              <span style={{ color: l==='Status' ? '#00f5c4' : '#fff', fontSize:13, fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ padding:14, borderRadius:12, background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>Close</button>
      </div>
    </Modal>
  );
}

// ─── Notification Panel ───────────────────────────────────────────────────────
function NotificationPanel({ notifications, onClose, onMarkRead }) {
  return (
    <div style={{ position:'absolute', top:56, right:0, width:320, background:'#0f1422', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, zIndex:200, boxShadow:'0 16px 48px rgba(0,0,0,0.6)', overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Notifications</span>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onMarkRead} style={{ background:'none', border:'none', color:'#00f5c4', cursor:'pointer', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>Mark all read</button>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8892a4', cursor:'pointer', fontSize:18 }}>×</button>
        </div>
      </div>
      <div style={{ maxHeight:360, overflowY:'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:'#8892a4', fontSize:13 }}>All caught up! 🎉</div>
        ) : notifications.map(n => (
          <div key={n.id} style={{ padding:'12px 20px', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', gap:12, alignItems:'flex-start' }}>
            <span style={{ fontSize:20 }}>{n.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ color: !n.is_read ? '#fff' : '#8892a4', fontSize:13, fontWeight: !n.is_read ? 600 : 400 }}>{n.message}</div>
              <div style={{ color:'#4a5568', fontSize:11, marginTop:2 }}>{timeAgo(n.created_at)}</div>
            </div>
            {!n.is_read && <div style={{ width:6, height:6, borderRadius:'50%', background:'#00f5c4', marginTop:4, flexShrink:0 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function BankingApp() {
  const { user, logout, logoutAll } = useAuth();

  // ── Core state ──
  const [activeTab,  setActiveTab]  = useState('dashboard');
  const [accs,       setAccs]       = useState([]);
  const [txns,       setTxns]       = useState([]);
  const [notifs,     setNotifs]     = useState([]);
  const [analytics,  setAnalytics]  = useState(null);
  const [budgets,    setBudgets]    = useState([]);
  const [goals,      setGoals]      = useState([]);
  const [contacts,   setContacts]   = useState([]);

  // ── UI state ──
  const [activeAccId, setActiveAccId] = useState(null);
  const [flippedCard, setFlippedCard] = useState(null);
  const [showSend,    setShowSend]    = useState(false);
  const [txnDetail,   setTxnDetail]   = useState(null);
  const [showNotifs,  setShowNotifs]  = useState(false);
  const [txnFilter,   setTxnFilter]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts,      setToasts]      = useState([]);
  const [loadingMap,  setLoadingMap]  = useState({});
  const toastId = useRef(0);

  const addToast = useCallback((message, type='success', icon='✓') => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, message, type, icon }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const setLoading = (key, val) => setLoadingMap(m => ({ ...m, [key]: val }));

  // ── Initial data load ──
  const loadAll = useCallback(async () => {
    setLoading('init', true);
    try {
      const [a, t, n, an, b, g, c] = await Promise.all([
        accountsApi.list(),
        txnApi.list({ limit: 60 }),
        usersApi.notifications(),
        usersApi.analytics(),
        usersApi.budgets(),
        usersApi.goals(),
        usersApi.contacts(),
      ]);
      setAccs(a);
      setTxns(t);
      setNotifs(n);
      setAnalytics(an);
      setBudgets(b);
      setGoals(g);
      setContacts(c);
      if (a.length) setActiveAccId(a[0].id);
    } catch (err) {
      addToast(err.message, 'error', '❌');
    } finally {
      setLoading('init', false);
    }
  }, [addToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── WebSocket real-time events ──
  useSocket({
    new_transaction: (txn) => {
      setTxns(prev => [txn, ...prev]);
      setAccs(prev => prev.map(a => a.id === txn.account_id ? { ...a, balance: txn.balance_after } : a));
      addToast(`${parseFloat(txn.amount)>0?'+':''}${fmt(txn.amount)} — ${txn.description}`, parseFloat(txn.amount)>0?'success':'info', parseFloat(txn.amount)>0?'💸':'💳');
    },
    new_notification: (notif) => {
      setNotifs(prev => [notif, ...prev]);
    },
  });

  // ── Actions ──
  const handleSendSuccess = (txn) => {
    setTxns(prev => [txn, ...prev]);
    setAccs(prev => prev.map(a => a.id === txn.account_id ? { ...a, balance: txn.balance_after } : a));
    addToast(`Sent ${fmt(Math.abs(txn.amount))}`, 'success', '✈️');
  };

  const handleFreeze = async (accId) => {
    try {
      const result = await accountsApi.toggleFreeze(accId);
      setAccs(prev => prev.map(a => a.id === accId ? { ...a, is_frozen: result.is_frozen } : a));
      const frozen = result.is_frozen;
      addToast(frozen ? 'Card frozen ❄️' : 'Card unfrozen ✅', 'info', frozen ? '❄️' : '✅');
    } catch (err) { addToast(err.message, 'error', '❌'); }
  };

  const handleMarkNotifRead = async () => {
    try {
      await usersApi.markNotifRead();
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  };

  // ── Derived ──
  const totalBalance  = accs.reduce((s, a) => s + parseFloat(a.balance), 0);
  const unreadCount   = notifs.filter(n => !n.is_read).length;
  const activeAcc     = accs.find(a => a.id === activeAccId);

  const filteredTxns  = txns
    .filter(t => txnFilter === 'all' || t.category === txnFilter)
    .filter(t => !searchQuery || t.description.toLowerCase().includes(searchQuery.toLowerCase()));

  const monthlySpend  = txns.filter(t => parseFloat(t.amount) < 0 && new Date(t.created_at).getMonth() === new Date().getMonth()).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const monthlyIncome = txns.filter(t => parseFloat(t.amount) > 0 && new Date(t.created_at).getMonth() === new Date().getMonth()).reduce((s, t) => s + parseFloat(t.amount), 0);

  const daily7 = analytics?.daily?.map(d => parseFloat(d.total)) || [];

  // ── Shared styles ──
  const S = {
    app:     { minHeight:'100vh', background:'#080c18', color:'#fff', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto', position:'relative' },
    header:  { padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100, background:'rgba(8,12,24,0.92)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.04)' },
    nav:     { display:'flex', justifyContent:'space-around', padding:'8px 0', position:'sticky', bottom:0, background:'rgba(8,12,24,0.95)', backdropFilter:'blur(20px)', borderTop:'1px solid rgba(255,255,255,0.06)' },
    navBtn:  (a) => ({ display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'6px 16px', borderRadius:12, border:'none', cursor:'pointer', background:'none', color: a ? '#00f5c4' : '#4a5568' }),
    content: { flex:1, overflowY:'auto', paddingBottom:16 },
    section: { padding:'20px 20px 0' },
    card:    { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:20, padding:20 },
    label:   { color:'#8892a4', fontSize:11, textTransform:'uppercase', letterSpacing:1.5, fontWeight:600 },
    h2:      { color:'#fff', fontSize:20, fontWeight:700, marginBottom:16 },
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const DashboardTab = () => (
    <div>
      <div style={{ ...S.section, paddingBottom:24, background:'linear-gradient(180deg,rgba(0,245,196,0.05),transparent)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={S.label}>Total Net Worth</span>
          <span style={{ ...S.label, color:'#00f5c4' }}>All accounts</span>
        </div>
        <div style={{ color:'#fff', fontSize:40, fontWeight:800, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:-2, lineHeight:1.1 }}>{fmt(totalBalance)}</div>
        <div style={{ color:'#8892a4', fontSize:13, marginTop:4 }}>Hi, {user?.full_name?.split(' ')[0]} 👋</div>
        {daily7.length > 1 && (
          <div style={{ marginTop:16 }}>
            <Sparkline data={daily7} width={320} height={48} />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d} style={{ ...S.label, fontSize:9 }}>{d}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ ...S.section, marginBottom:20 }}>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { icon:'↗️', label:'Send',    color:'#00f5c4', action:() => setShowSend(true) },
            { icon:'↙️', label:'Request', color:'#7c6fff', action:() => addToast('Request link copied!','info','📨') },
            { icon:'⊕',  label:'Top Up',  color:'#ff9f43', action:() => addToast('Top up initiated','info','💰') },
            { icon:'⊘',  label:'Pay Bill',color:'#ff6b6b', action:() => addToast('Bill payment opened','info','📄') },
          ].map(q => (
            <button key={q.label} onClick={q.action} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${q.color}22`, borderRadius:16, padding:'14px 0', cursor:'pointer', flex:1 }}>
              <span style={{ fontSize:22 }}>{q.icon}</span>
              <span style={{ color:'#cdd3de', fontSize:11, fontWeight:600 }}>{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Account Cards */}
      <div style={{ paddingLeft:20, marginBottom:20 }}>
        <div style={{ ...S.label, marginBottom:12 }}>Your Cards</div>
        <div style={{ display:'flex', gap:12, overflowX:'auto', paddingRight:20, paddingBottom:4 }}>
          {accs.map(a => (
            <div key={a.id} style={{ minWidth:220 }}>
              <AccountCard account={a} active={activeAccId===a.id} onClick={() => setActiveAccId(a.id)} flipped={flippedCard===a.id} onFlip={() => setFlippedCard(f => f===a.id ? null : a.id)} />
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ ...S.section, marginBottom:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {[{ label:'Monthly Spent', value:fmt(monthlySpend), color:'#ff6b6b', icon:'📤' }, { label:'Monthly Income', value:fmt(monthlyIncome), color:'#00f5c4', icon:'📥' }].map(s => (
            <div key={s.label} style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={S.label}>{s.label}</span>
                <span style={{ fontSize:16 }}>{s.icon}</span>
              </div>
              <div style={{ color:s.color, fontSize:20, fontWeight:800, fontFamily:"'Space Grotesk',sans-serif" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Txns */}
      <div style={S.section}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>Recent Activity</span>
          <button onClick={() => setActiveTab('transactions')} style={{ background:'none', border:'none', color:'#00f5c4', fontSize:12, cursor:'pointer' }}>See all →</button>
        </div>
        {txns.slice(0,6).map((t, i) => {
          const cat = CATEGORIES[t.category] || CATEGORIES.other;
          const isNew = i===0 && Date.now()-new Date(t.created_at) < 30000;
          return (
            <div key={t.id} onClick={() => setTxnDetail(t)} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', borderRadius:14, cursor:'pointer', background: isNew ? 'rgba(0,245,196,0.06)' : 'transparent', border:`1px solid ${isNew ? 'rgba(0,245,196,0.15)' : 'transparent'}`, marginBottom:2 }}>
              <div style={{ width:42, height:42, borderRadius:12, background:`${cat.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{cat.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#fff', fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description}</span>
                  <span style={{ color: parseFloat(t.amount)>0 ? '#00f5c4' : '#e2e8f0', fontWeight:700, fontSize:14, marginLeft:8, flexShrink:0 }}>{parseFloat(t.amount)>0?'+':''}{fmt(t.amount)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
                  <span style={{ color:'#4a5568', fontSize:11 }}>{cat.label}</span>
                  <span style={{ color: isNew ? '#00f5c4' : '#4a5568', fontSize:11 }}>{isNew ? '● LIVE' : timeAgo(t.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const AccountsTab = () => (
    <div style={S.section}>
      <div style={S.h2}>My Cards</div>
      {accs.map(a => (
        <div key={a.id} style={{ marginBottom:16 }}>
          <AccountCard account={a} active={activeAccId===a.id} onClick={() => setActiveAccId(a.id)} flipped={flippedCard===a.id} onFlip={() => setFlippedCard(f => f===a.id ? null : a.id)} />
          {activeAccId===a.id && (
            <div style={{ display:'flex', gap:10, marginTop:12 }}>
              {[
                { label: a.is_frozen ? '🔒 Unfreeze' : '❄️ Freeze', action:() => handleFreeze(a.id) },
                { label:'📋 Copy No.', action:() => addToast('Card number copied!','success','📋') },
                { label:'🔄 Details', action:() => setFlippedCard(f => f===a.id ? null : a.id) },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} style={{ flex:1, padding:'10px 0', background: a.is_frozen && btn.label.includes('Freeze') ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, color:'#cdd3de', fontSize:12, cursor:'pointer', fontWeight:600 }}>{btn.label}</button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ ...S.card, border:'1px dashed rgba(124,111,255,0.3)', textAlign:'center', background:'linear-gradient(135deg,rgba(124,111,255,0.05),transparent)' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>+</div>
        <div style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Add Virtual Card</div>
        <div style={{ color:'#8892a4', fontSize:12, marginTop:4 }}>Secure virtual card for online purchases</div>
        <button onClick={() => addToast('Virtual card generated!','success','💳')} style={{ marginTop:14, padding:'10px 20px', background:'linear-gradient(135deg,#7c6fff,#6c5ce7)', border:'none', borderRadius:10, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>Generate</button>
      </div>
    </div>
  );

  const TransactionsTab = () => (
    <div style={S.section}>
      <div style={S.h2}>Transaction History</div>
      <div style={{ position:'relative', marginBottom:12 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#4a5568' }}>🔍</span>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search transactions…" style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'12px 16px 12px 40px', color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:"'DM Sans',sans-serif" }} />
      </div>
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, marginBottom:16 }}>
        {['all', ...Object.keys(CATEGORIES)].map(cat => (
          <button key={cat} onClick={() => setTxnFilter(cat)} style={{ padding:'6px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap', background: txnFilter===cat ? '#00f5c4' : 'rgba(255,255,255,0.06)', color: txnFilter===cat ? '#0a0e1a' : '#8892a4', fontFamily:"'DM Sans',sans-serif" }}>
            {cat==='all' ? 'All' : `${CATEGORIES[cat].icon} ${CATEGORIES[cat].label}`}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
        <button onClick={() => addToast('Statement exported','success','📥')} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'8px 14px', color:'#8892a4', fontSize:12, cursor:'pointer' }}>⬇ Export CSV</button>
      </div>
      {filteredTxns.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#4a5568' }}>No transactions found</div>
      ) : filteredTxns.map((t, i) => {
        const cat = CATEGORIES[t.category] || CATEGORIES.other;
        const isNew = i===0 && Date.now()-new Date(t.created_at) < 30000;
        return (
          <div key={t.id} onClick={() => setTxnDetail(t)} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', borderRadius:14, cursor:'pointer', background: isNew ? 'rgba(0,245,196,0.06)' : 'transparent', border:`1px solid ${isNew ? 'rgba(0,245,196,0.15)' : 'transparent'}`, marginBottom:2 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:`${cat.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, position:'relative' }}>
              {cat.icon}
              {isNew && <div style={{ position:'absolute', top:-3, right:-3, width:8, height:8, borderRadius:'50%', background:'#00f5c4' }} />}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'#fff', fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description}</span>
                <span style={{ color: parseFloat(t.amount)>0 ? '#00f5c4' : '#e2e8f0', fontWeight:700, fontSize:14, marginLeft:8, flexShrink:0 }}>{parseFloat(t.amount)>0?'+':''}{fmt(t.amount)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
                <span style={{ color:'#4a5568', fontSize:11 }}>{cat.label} · {t.account_label}</span>
                <span style={{ color: isNew ? '#00f5c4' : '#4a5568', fontSize:11 }}>{isNew ? 'LIVE' : timeAgo(t.created_at)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const AnalyticsTab = () => {
    const byCategory = analytics?.byCategory || [];
    const donutData  = byCategory.map(r => ({ value: parseFloat(r.total), color: CATEGORIES[r.category]?.color || '#7c6fff' }));

    return (
      <div style={S.section}>
        <div style={S.h2}>Analytics & Insights</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          {[{ label:'Monthly Spent', value:fmt(monthlySpend), color:'#ff6b6b', icon:'📤' }, { label:'Monthly Earned', value:fmt(monthlyIncome), color:'#00f5c4', icon:'📥' }].map(s => (
            <div key={s.label} style={S.card}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}><span style={S.label}>{s.label}</span><span>{s.icon}</span></div><div style={{ color:s.color, fontSize:22, fontWeight:800, fontFamily:"'Space Grotesk',sans-serif" }}>{s.value}</div></div>
          ))}
        </div>

        {/* Donut */}
        {donutData.length > 0 && (
          <div style={{ ...S.card, marginBottom:20 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:15, marginBottom:16 }}>Spending Breakdown</div>
            <div style={{ display:'flex', alignItems:'center', gap:20 }}>
              <DonutChart segments={donutData} size={120} />
              <div style={{ flex:1 }}>
                {byCategory.slice(0,5).map(r => (
                  <div key={r.category} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6, color:'#cdd3de', fontSize:12 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:CATEGORIES[r.category]?.color||'#7c6fff', display:'inline-block' }} />
                      {CATEGORIES[r.category]?.label || r.category}
                    </span>
                    <span style={{ color:'#fff', fontWeight:600, fontSize:12 }}>{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Budget Tracker */}
        {budgets.length > 0 && (
          <div style={{ ...S.card, marginBottom:20 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:15, marginBottom:16 }}>Budget Tracker</div>
            {budgets.map(b => {
              const cat = CATEGORIES[b.category] || CATEGORIES.other;
              const pct = Math.min((b.spent / b.amount) * 100, 100);
              const over = pct >= 90;
              return (
                <div key={b.category} style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6, color:'#cdd3de', fontSize:13 }}>{cat.icon} {cat.label}</span>
                    <span style={{ color: over ? '#ff6b6b' : '#8892a4', fontSize:12 }}>{fmt(b.spent)} / {fmt(b.amount)}</span>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:6, height:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:6, width:`${pct}%`, background: over ? 'linear-gradient(90deg,#ff6b6b,#ee5a24)' : `linear-gradient(90deg,${cat.color},${cat.color}88)`, transition:'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Savings Goals */}
        {goals.length > 0 && (
          <div style={S.card}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:15, marginBottom:16 }}>Savings Goals</div>
            {goals.map(g => {
              const pct = Math.min((g.saved / g.target) * 100, 100);
              return (
                <div key={g.id} style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6, color:'#cdd3de', fontSize:13 }}>{g.icon} {g.name}</span>
                    <span style={{ color:'#00f5c4', fontSize:12, fontWeight:700 }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:6, height:8, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:6, width:`${pct}%`, background:'linear-gradient(90deg,#00f5c4,#7c6fff)', transition:'width 0.5s' }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                    <span style={{ color:'#4a5568', fontSize:11 }}>{fmt(g.saved)} saved</span>
                    <span style={{ color:'#4a5568', fontSize:11 }}>Goal: {fmt(g.target)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const SettingsTab = () => {
    const [twoFA, setTwoFA] = useState(true);
    const [biometric, setBiometric] = useState(false);
    const [pushAlerts, setPushAlerts] = useState(true);

    const toggle = (label, val, setter) => (
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ color:'#cdd3de', fontSize:14 }}>{label}</span>
        <div onClick={() => { setter(!val); addToast(`${label} ${!val?'enabled':'disabled'}`, 'info', !val?'🟢':'🔴'); }} style={{ width:44, height:24, borderRadius:12, background: val ? '#00f5c4' : 'rgba(255,255,255,0.1)', position:'relative', cursor:'pointer', transition:'background 0.3s' }}>
          <div style={{ position:'absolute', top:2, left: val ? 22 : 2, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left 0.3s', boxShadow:'0 2px 6px rgba(0,0,0,0.3)' }} />
        </div>
      </div>
    );

    return (
      <div style={S.section}>
        <div style={S.h2}>Settings</div>
        <div style={{ ...S.card, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:56, height:56, borderRadius:16, background:'linear-gradient(135deg,#00f5c4,#7c6fff)', display:'flex', alignItems:'center', justifyContent:'center', color:'#0a0e1a', fontWeight:800, fontSize:18 }}>{user?.avatar}</div>
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:16 }}>{user?.full_name}</div>
              <div style={{ color:'#8892a4', fontSize:13 }}>{user?.email}</div>
              <div style={{ color:'#8892a4', fontSize:12 }}>{user?.phone}</div>
            </div>
          </div>
        </div>

        <div style={{ ...S.card, marginBottom:20 }}>
          <div style={{ color:'#fff', fontWeight:700, fontSize:15, marginBottom:4 }}>Security</div>
          {toggle('Two-Factor Authentication', twoFA, setTwoFA)}
          {toggle('Biometric Login', biometric, setBiometric)}
          <button onClick={() => addToast('Password reset email sent!','info','📧')} style={{ width:'100%', marginTop:14, padding:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, color:'#cdd3de', fontSize:13, cursor:'pointer', fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Change Password</button>
        </div>

        <div style={{ ...S.card, marginBottom:20 }}>
          <div style={{ color:'#fff', fontWeight:700, fontSize:15, marginBottom:4 }}>Notifications</div>
          {toggle('Push Alerts', pushAlerts, setPushAlerts)}
          {toggle('Email Summaries', true, ()=>{})}
          {toggle('Large Transaction Alerts', true, ()=>{})}
        </div>

        <div style={{ ...S.card, border:'1px solid rgba(255,107,107,0.2)', background:'rgba(255,107,107,0.04)', marginBottom:24 }}>
          <div style={{ color:'#ff6b6b', fontWeight:700, fontSize:15, marginBottom:14 }}>Danger Zone</div>
          <button onClick={async () => { await logoutAll(); addToast('All sessions terminated','error','🔴'); }} style={{ width:'100%', marginBottom:10, padding:12, background:'rgba(255,107,107,0.1)', border:'1px solid rgba(255,107,107,0.2)', borderRadius:12, color:'#ff6b6b', fontSize:13, cursor:'pointer', fontWeight:600 }}>Sign Out All Devices</button>
          <button onClick={logout} style={{ width:'100%', padding:12, background:'rgba(255,107,107,0.15)', border:'1px solid rgba(255,107,107,0.3)', borderRadius:12, color:'#ff6b6b', fontSize:13, cursor:'pointer', fontWeight:600 }}>Sign Out</button>
        </div>
      </div>
    );
  };

  const TABS = { dashboard:DashboardTab, accounts:AccountsTab, transactions:TransactionsTab, analytics:AnalyticsTab, settings:SettingsTab };
  const ActiveContent = TABS[activeTab] || DashboardTab;
  const NAV = [
    { id:'dashboard',    icon:'⬡', label:'Home' },
    { id:'accounts',     icon:'💳', label:'Cards' },
    { id:'transactions', icon:'↕',  label:'History' },
    { id:'analytics',    icon:'📊', label:'Analytics' },
    { id:'settings',     icon:'⚙',  label:'Settings' },
  ];

  if (loadingMap.init) {
    return (
      <div style={{ minHeight:'100vh', background:'#080c18', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'linear-gradient(135deg,#00f5c4,#7c6fff)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:24 }}>⬡</div>
          <div style={{ color:'#00f5c4', fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>Loading your accounts…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
        @keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
        @keyframes modalIn{from{transform:scale(0.9) translateY(20px);opacity:0}to{transform:none;opacity:1}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        select option{background:#0f1422;color:#fff}
      `}</style>

      <div style={S.app}>
        <div style={S.header}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:10, background:'linear-gradient(135deg,#00f5c4,#7c6fff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>⬡</div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:18, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:-0.5 }}>nexa<span style={{ color:'#00f5c4' }}>bank</span></div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center', position:'relative' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,245,196,0.1)', border:'1px solid rgba(0,245,196,0.2)', borderRadius:20, padding:'4px 10px' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#00f5c4' }} />
              <span style={{ color:'#00f5c4', fontSize:11, fontWeight:700 }}>LIVE</span>
            </div>
            <button onClick={() => setShowNotifs(n => !n)} style={{ position:'relative', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:16 }}>
              🔔
              {unreadCount > 0 && <div style={{ position:'absolute', top:-3, right:-3, width:16, height:16, borderRadius:'50%', background:'#ff6b6b', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', fontWeight:700 }}>{unreadCount}</div>}
            </button>
            {showNotifs && <NotificationPanel notifications={notifs} onClose={() => setShowNotifs(false)} onMarkRead={handleMarkNotifRead} />}
          </div>
        </div>

        <div style={S.content}><ActiveContent /></div>

        <div style={S.nav}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={S.navBtn(activeTab===item.id)}>
              <span style={{ fontSize:20 }}>{item.icon}</span>
              <span style={{ fontSize:10, fontWeight:600 }}>{item.label}</span>
              {activeTab===item.id && <div style={{ width:16, height:2, borderRadius:1, background:'#00f5c4', marginTop:-1 }} />}
            </button>
          ))}
        </div>
      </div>

      {showSend && <SendMoneyModal onClose={() => setShowSend(false)} accounts={accs} contacts={contacts} onSuccess={handleSendSuccess} />}
      {txnDetail && <TxnDetail txn={txnDetail} onClose={() => setTxnDetail(null)} />}
      <Toast toasts={toasts} />
    </>
  );
}