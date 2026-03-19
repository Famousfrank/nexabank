import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../api/client';

// ─── Shared Styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
  borderRadius:14, padding:'14px 18px', color:'#fff', fontSize:15,
  fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box', transition:'border 0.2s'
};
const btnPrimary = {
  padding:15, borderRadius:14, border:'none', cursor:'pointer', fontWeight:700,
  fontSize:15, fontFamily:"'DM Sans',sans-serif",
  background:'linear-gradient(135deg,#00f5c4,#00c9a7)', color:'#0a0e1a', width:'100%', marginTop:8
};
const label = { color:'#8892a4', fontSize:11, textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:8 };

function Field({ label: lbl, type='text', value, onChange, placeholder }) {
  return (
    <div>
      <label style={label}>{lbl}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

// ─── OTP Input ─────────────────────────────────────────────────────────────────
function OTPInput({ value, onChange }) {
  return (
    <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
      {[0,1,2,3,4,5].map(i => (
        <input
          key={i}
          type="text"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => {
            const val = e.target.value.replace(/\D/,'');
            const arr = value.split('');
            arr[i] = val;
            onChange(arr.join(''));
            if (val && i < 5) document.getElementById(`otp-${i+1}`)?.focus();
          }}
          onKeyDown={e => { if (e.key==='Backspace' && !value[i] && i>0) document.getElementById(`otp-${i-1}`)?.focus(); }}
          id={`otp-${i}`}
          style={{ width:44, height:56, borderRadius:12, background:'rgba(255,255,255,0.06)', border:`1.5px solid ${value[i] ? '#00f5c4' : 'rgba(255,255,255,0.12)'}`, color:'#00f5c4', fontSize:22, textAlign:'center', fontFamily:"'DM Mono',monospace", outline:'none', caretColor:'#00f5c4' }}
        />
      ))}
    </div>
  );
}

// ─── Signup Form ──────────────────────────────────────────────────────────────
function SignupForm({ onSwitch, onDone }) {
  const [step,         setStep]         = useState(1);
  const [fullName,     setFullName]     = useState('');
  const [email,        setEmail]        = useState('');
  const [phone,        setPhone]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirmPass,  setConfirmPass]  = useState('');
  const [otp,          setOtp]          = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [resendTimer,  setResendTimer]  = useState(0);

  const { saveSession } = useAuth();

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => setResendTimer(t => { if (t<=1) { clearInterval(interval); return 0; } return t-1; }), 1000);
  };

  const handleSignupInit = async () => {
    setError('');
    if (!fullName || !email || !phone || !password) return setError('All fields are required');
    if (password !== confirmPass) return setError('Passwords do not match');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true);
    try {
      const res = await authApi.signupInit({ full_name: fullName, email, phone, password });
      setPendingToken(res.pendingToken);
      setStep(2);
      startResendTimer();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) return setError('Enter the 6-digit OTP');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.signupVerify({ pendingToken, otp });
      saveSession(res);
      onDone();
    } catch (err) { setError(err.message); setOtp(''); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      const res = await authApi.signupInit({ full_name: fullName, email, phone, password });
      setPendingToken(res.pendingToken);
      setOtp(''); startResendTimer(); setError('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div style={{ display:'flex', gap:6, marginBottom:28 }}>
        {[1,2].map(s => (
          <div key={s} style={{ flex:1, height:3, borderRadius:2, background: step>=s ? '#00f5c4' : 'rgba(255,255,255,0.1)', transition:'background 0.3s' }} />
        ))}
      </div>
      {step === 1 ? (
        <>
          <div style={{ color:'#fff', fontWeight:700, fontSize:20, marginBottom:6 }}>Create account</div>
          <div style={{ color:'#8892a4', fontSize:13, marginBottom:24 }}>Fill in your details to get started</div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Full Name"        value={fullName}   onChange={setFullName}   placeholder="Alex Morgan" />
            <Field label="Email" type="email" value={email}    onChange={setEmail}      placeholder="you@example.com" />
            <Field label="Phone"            value={phone}      onChange={setPhone}      placeholder="+1 (555) 000-0000" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />
            <Field label="Confirm Password" type="password" value={confirmPass} onChange={setConfirmPass} placeholder="Repeat password" />
            {error && <div style={{ color:'#ff6b6b', fontSize:13, textAlign:'center' }}>{error}</div>}
            <button onClick={handleSignupInit} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Sending OTP…' : 'Continue →'}
            </button>
            <div style={{ textAlign:'center', color:'#8892a4', fontSize:13 }}>
              Already have an account?{' '}
              <span onClick={onSwitch} style={{ color:'#00f5c4', cursor:'pointer', fontWeight:600 }}>Sign in</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:44, marginBottom:12 }}>📬</div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:18 }}>Check your email</div>
            <div style={{ color:'#8892a4', fontSize:13, marginTop:8 }}>
              We sent a 6-digit code to<br/>
              <span style={{ color:'#00f5c4', fontWeight:600 }}>{email}</span>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <OTPInput value={otp} onChange={setOtp} />
            {error && <div style={{ color:'#ff6b6b', fontSize:13, textAlign:'center' }}>{error}</div>}
            <button onClick={handleVerifyOTP} disabled={loading || otp.length!==6} style={{ ...btnPrimary, opacity: (loading||otp.length!==6) ? 0.7 : 1 }}>
              {loading ? 'Verifying…' : 'Verify & Create Account'}
            </button>
            <div style={{ textAlign:'center', color:'#8892a4', fontSize:13 }}>
              {resendTimer > 0
                ? <span>Resend in <span style={{ color:'#00f5c4' }}>{resendTimer}s</span></span>
                : <span onClick={handleResend} style={{ color:'#00f5c4', cursor:'pointer' }}>Resend OTP</span>}
            </div>
            <div onClick={() => { setStep(1); setError(''); setOtp(''); }} style={{ textAlign:'center', color:'#8892a4', fontSize:13, cursor:'pointer' }}>← Back to details</div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────
function LoginForm({ onSwitch, onDone }) {
  const [step,     setStep]     = useState(1);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [userId,   setUserId]   = useState('');
  const [otp,      setOtp]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const { saveSession } = useAuth();

  const startResendTimer = () => {
    setResendTimer(60);
    const iv = setInterval(() => setResendTimer(t => { if (t<=1) { clearInterval(iv); return 0; } return t-1; }), 1000);
  };

  const handleLoginInit = async () => {
    setError('');
    if (!email || !password) return setError('Email and password required');
    setLoading(true);
    try {
      const res = await authApi.loginInit({ email, password });
      setUserId(res.userId);
      setStep(2);
      startResendTimer();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) return setError('Enter the 6-digit OTP');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.loginVerify({ userId, otp });
      saveSession(res);
      onDone();
    } catch (err) { setError(err.message); setOtp(''); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      const res = await authApi.loginInit({ email, password });
      setUserId(res.userId); setOtp(''); startResendTimer();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div style={{ display:'flex', gap:6, marginBottom:28 }}>
        {[1,2].map(s => (
          <div key={s} style={{ flex:1, height:3, borderRadius:2, background: step>=s ? '#00f5c4' : 'rgba(255,255,255,0.1)', transition:'background 0.3s' }} />
        ))}
      </div>
      {step === 1 ? (
        <>
          <div style={{ color:'#fff', fontWeight:700, fontSize:20, marginBottom:6 }}>Welcome back</div>
          <div style={{ color:'#8892a4', fontSize:13, marginBottom:24 }}>Sign in to your NexaBank account</div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" />
            {error && <div style={{ color:'#ff6b6b', fontSize:13, textAlign:'center' }}>{error}</div>}
            <button onClick={handleLoginInit} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Checking credentials…' : 'Sign In →'}
            </button>
            <div style={{ textAlign:'center', color:'#8892a4', fontSize:13 }}>
              New to NexaBank?{' '}
              <span onClick={onSwitch} style={{ color:'#00f5c4', cursor:'pointer', fontWeight:600 }}>Create account</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🔐</div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:18 }}>Two-Factor Auth</div>
            <div style={{ color:'#8892a4', fontSize:13, marginTop:8 }}>
              We sent a 6-digit code to<br/>
              <span style={{ color:'#00f5c4', fontWeight:600 }}>{email}</span>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <OTPInput value={otp} onChange={setOtp} />
            {error && <div style={{ color:'#ff6b6b', fontSize:13, textAlign:'center' }}>{error}</div>}
            <button onClick={handleVerifyOTP} disabled={loading || otp.length!==6} style={{ ...btnPrimary, opacity: (loading||otp.length!==6) ? 0.7 : 1 }}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
            <div style={{ textAlign:'center', color:'#8892a4', fontSize:13 }}>
              {resendTimer > 0
                ? <span>Resend in <span style={{ color:'#00f5c4' }}>{resendTimer}s</span></span>
                : <span onClick={handleResend} style={{ color:'#00f5c4', cursor:'pointer' }}>Resend OTP</span>}
            </div>
            <div onClick={() => { setStep(1); setError(''); setOtp(''); }} style={{ textAlign:'center', color:'#8892a4', fontSize:13, cursor:'pointer' }}>← Back</div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const navigate = useNavigate();

  // Called after successful login or signup — go to home
  const handleDone = () => navigate('/', { replace: true });

  return (
    <div style={{ minHeight:'100vh', background:'#080c18', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", position:'relative', overflow:'hidden', padding:16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
      `}</style>

      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,245,196,0.1),transparent 70%)', top:-120, right:-120, pointerEvents:'none' }} />
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(124,111,255,0.1),transparent 70%)', bottom:-100, left:-100, pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:60, height:60, borderRadius:18, background:'linear-gradient(135deg,#00f5c4,#7c6fff)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:26, boxShadow:'0 12px 40px rgba(0,245,196,0.25)' }}>⬡</div>
          <div style={{ color:'#fff', fontSize:30, fontWeight:800, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:-1 }}>nexa<span style={{ color:'#00f5c4' }}>bank</span></div>
          <div style={{ color:'#8892a4', fontSize:13, marginTop:4 }}>Next-generation banking</div>
        </div>

        <div style={{ display:'flex', background:'rgba(255,255,255,0.04)', borderRadius:14, padding:4, marginBottom:24 }}>
          {['login','signup'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:'10px', borderRadius:11, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:14, background: mode===m ? '#00f5c4' : 'transparent', color: mode===m ? '#0a0e1a' : '#8892a4', transition:'all 0.2s' }}>
              {m==='login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div style={{ background:'rgba(15,20,34,0.9)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:24, padding:32, boxShadow:'0 32px 80px rgba(0,0,0,0.5)' }}>
          {mode === 'login'
            ? <LoginForm  onSwitch={() => setMode('signup')} onDone={handleDone} />
            : <SignupForm onSwitch={() => setMode('login')}  onDone={handleDone} />
          }
        </div>

        <div style={{ textAlign:'center', marginTop:20, color:'#4a5568', fontSize:12 }}>
          Protected by 256-bit TLS encryption 🔒
        </div>
      </div>
    </div>
  );
}