import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../api/client';

/* ─────────────────────────────────────────────────────────────────────────────
   OTP digit input group
───────────────────────────────────────────────────────────────────────────── */
function OTPInput({ value, onChange }) {
  const refs = Array.from({ length: 6 }, () => useRef(null));

  const handleChange = (i, e) => {
    const digit = e.target.value.replace(/\D/, '').slice(-1);
    const arr = value.split('');
    arr[i] = digit;
    onChange(arr.join(''));
    if (digit && i < 5) refs[i + 1].current?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      onChange(pasted.padEnd(6, '').slice(0, 6));
      refs[Math.min(pasted.length, 5)].current?.focus();
      e.preventDefault();
    }
  };

  return (
    <div className="otp-group">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`otp-digit${value[i] ? ' filled' : ''}`}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared form field
───────────────────────────────────────────────────────────────────────────── */
function Field({ label, type = 'text', value, onChange, placeholder, autoComplete }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="input-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="input"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={focused ? { borderColor: 'var(--navy)', boxShadow: '0 0 0 3px rgba(13,27,42,0.08)' } : {}}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NexaBank logo mark (SVG)
───────────────────────────────────────────────────────────────────────────── */
function LogoMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="8" width="24" height="16" rx="3" fill="white" fillOpacity="0.9"/>
      <rect x="4" y="13" width="24" height="3" fill="var(--red)"/>
      <rect x="8" y="18" width="6" height="2" rx="1" fill="var(--red)"/>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN AUTH SCREEN
───────────────────────────────────────────────────────────────────────────── */
export default function AuthScreen({ onAuthenticated }) {
  const { saveSession } = useAuth();

  /* ── Mode ── */
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'otp'

  /* ── Login fields ── */
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  /* ── Signup fields ── */
  const [fullName, setFullName] = useState('');
  const [phone,    setPhone]    = useState('');
  const [signupEmail,    setSignupEmail]    = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /* ── OTP ── */
  const [otp,          setOtp]          = useState('');
  const [pendingToken, setPendingToken]  = useState(''); // signup
  const [userId,       setUserId]        = useState(''); // login
  const [otpPurpose,   setOtpPurpose]   = useState('login');

  /* ── UI ── */
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const clearMessages = () => { setError(''); setSuccess(''); };

  /* ─── LOGIN ─── */
  const handleLogin = async () => {
    if (!email || !password) return setError('Please enter your email and password');
    clearMessages(); setLoading(true);
    try {
      const res = await authApi.loginInit({ email, password });
      setUserId(res.userId);
      setOtpPurpose('login');
      setOtp('');
      setMode('otp');
      setSuccess('Check your email — a 6-digit code has been sent');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  /* ─── SIGNUP ─── */
  const handleSignup = async () => {
    if (!fullName || !signupEmail || !signupPassword)
      return setError('Please fill in all required fields');
    if (signupPassword !== confirmPassword)
      return setError('Passwords do not match');
    if (signupPassword.length < 8)
      return setError('Password must be at least 8 characters');
    clearMessages(); setLoading(true);
    try {
      const res = await authApi.signupInit({ full_name:fullName, email:signupEmail, password:signupPassword, phone });
      setPendingToken(res.pendingToken);
      setOtpPurpose('signup');
      setOtp('');
      setMode('otp');
      setSuccess('Check your email — a verification code has been sent');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  /* ─── OTP VERIFY ─── */
  const handleVerifyOtp = async () => {
    if (otp.length < 6) return setError('Enter the full 6-digit code');
    if (loading) return; // prevent double submit
    clearMessages(); setLoading(true);
    try {
      let res;
      if (otpPurpose === 'login') {
        res = await authApi.loginVerify({ userId, otp });
      } else {
        res = await authApi.signupVerify({ pendingToken, otp });
      }
      saveSession(res.accessToken, res.refreshToken, res.user);
      onAuthenticated?.();
    } catch (e) {
      setError(e.message || 'Invalid code, please try again');
      setOtp('');
    }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setError(''); setSuccess('');
    try {
      if (otpPurpose === 'login') {
        const res = await authApi.loginInit({ email, password });
        setUserId(res.userId);
      } else {
        const res = await authApi.signupInit({ full_name:fullName, email:signupEmail, password:signupPassword, phone });
        setPendingToken(res.pendingToken);
      }
      setOtp('');
      setSuccess('A new code has been sent');
    } catch (e) { setError(e.message); }
  };

  /* ════════════════════════════════════════════════════════
     RENDER — OTP SCREEN
  ════════════════════════════════════════════════════════ */
  if (mode === 'otp') {
    const targetEmail = otpPurpose === 'login' ? email : signupEmail;
    return (
      <div className="auth-page">
        <div className="auth-card">

          {/* Header */}
          <div className="auth-header">
            <div className="auth-logo">
              <LogoMark size={28} />
            </div>
            <div className="auth-title">Verify Your Identity</div>
            <div className="auth-subtitle">
              Code sent to <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{targetEmail}</strong>
            </div>
          </div>

          <div className="auth-body" style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {success && (
              <div style={{ background:'var(--green-bg)', border:'1px solid #A7F3D0', color:'var(--green)', borderRadius:10, padding:'10px 14px', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                ✅ {success}
              </div>
            )}

            <div style={{ textAlign:'center' }}>
              <div style={{ color:'var(--g1)', fontSize:14, marginBottom:6, fontFamily:"'Sora',sans-serif" }}>
                Enter the 6-digit code
              </div>
              <OTPInput value={otp} onChange={setOtp} />
            </div>

            {error && <div className="error-msg">⚠️ {error}</div>}

            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length < 6}
              className="btn btn-primary btn-full"
              style={{ padding:15, borderRadius:14, fontSize:16, opacity: (loading || otp.length < 6) ? 0.6 : 1 }}
            >
              {loading ? (
                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <svg style={{ animation:'spin 0.8s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  Verifying…
                </span>
              ) : 'Verify & Sign In'}
            </button>

            <div style={{ textAlign:'center' }}>
              <span style={{ color:'var(--g2)', fontSize:13, fontFamily:"'Sora',sans-serif" }}>Didn't receive it? </span>
              <span onClick={handleResend} style={{ color:'var(--red)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>Resend code</span>
            </div>
          </div>

          <div className="auth-footer">
            <span onClick={()=>{setMode(otpPurpose==='login'?'login':'signup');setError('');}} style={{ color:'var(--g2)', fontSize:13, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     RENDER — SIGNUP SCREEN
  ════════════════════════════════════════════════════════ */
  if (mode === 'signup') {
    return (
      <div className="auth-page">
        <div className="auth-card">

          <div className="auth-header">
            <div className="auth-logo"><LogoMark size={28}/></div>
            <div className="auth-title">Create Account</div>
            <div className="auth-subtitle">Join NexaBank — it's free</div>
          </div>

          <div className="auth-body" style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {error && <div className="error-msg">⚠️ {error}</div>}

            <Field label="Full Name" value={fullName} onChange={setFullName} placeholder="Michael Johnson" autoComplete="name"/>
            <Field label="Email Address" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="you@email.com" autoComplete="email"/>
            <Field label="Phone Number" type="tel" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" autoComplete="tel"/>
            <Field label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="Min. 8 characters" autoComplete="new-password"/>
            <Field label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat password" autoComplete="new-password"/>

            {/* Password strength */}
            {signupPassword.length > 0 && (
              <div>
                <div style={{ height:4, borderRadius:2, background:'var(--g4)', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(signupPassword.length/12*100,100)}%`, background: signupPassword.length < 8 ? 'var(--danger)' : signupPassword.length < 12 ? 'var(--warn)' : 'var(--green)', borderRadius:2, transition:'all 0.3s' }}/>
                </div>
                <div style={{ color: signupPassword.length < 8 ? 'var(--danger)' : signupPassword.length < 12 ? 'var(--warn)' : 'var(--green)', fontSize:11, marginTop:4, fontWeight:600, fontFamily:"'Sora',sans-serif" }}>
                  {signupPassword.length < 8 ? 'Weak' : signupPassword.length < 12 ? 'Good' : 'Strong'}
                </div>
              </div>
            )}

            <button
              onClick={handleSignup}
              disabled={loading}
              className="btn btn-primary btn-full"
              style={{ padding:15, borderRadius:14, fontSize:16, opacity:loading?0.7:1, marginTop:4 }}
            >
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>

            <div style={{ textAlign:'center', color:'var(--g2)', fontSize:12, fontFamily:"'Sora',sans-serif" }}>
              By creating an account, you agree to our{' '}
              <span style={{ color:'var(--red)', fontWeight:600, cursor:'pointer' }}>Terms of Service</span>
              {' '}and{' '}
              <span style={{ color:'var(--red)', fontWeight:600, cursor:'pointer' }}>Privacy Policy</span>
            </div>
          </div>

          <div className="auth-footer">
            <span style={{ color:'var(--g2)', fontSize:14, fontFamily:"'Sora',sans-serif" }}>
              Already have an account?{' '}
            </span>
            <span onClick={()=>{setMode('login');setError('');}} style={{ color:'var(--red)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
              Sign In
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     RENDER — LOGIN SCREEN (default)
  ════════════════════════════════════════════════════════ */
  return (
    <div className="auth-page">

      {/* Top wordmark */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28, animation:'fadeUp 0.4s ease' }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(200,16,46,0.35)' }}>
          <LogoMark size={22}/>
        </div>
        <div>
          <div style={{ color:'var(--navy)', fontWeight:800, fontSize:20, fontFamily:"'Sora',sans-serif", lineHeight:1 }}>NexaBank</div>
          <div style={{ color:'var(--g2)', fontSize:11, fontFamily:"'Sora',sans-serif", marginTop:2 }}>Secure Online Banking</div>
        </div>
      </div>

      <div className="auth-card">

        {/* Card header */}
        <div className="auth-header">
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, textTransform:'uppercase', letterSpacing:1.5, fontFamily:"'Sora',sans-serif", marginBottom:6 }}>Welcome back</div>
            <div className="auth-title">Sign In</div>
            <div className="auth-subtitle">Use your NexaBank credentials</div>
          </div>
        </div>

        <div className="auth-body" style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {error && <div className="error-msg">⚠️ {error}</div>}

          <Field label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@email.com" autoComplete="email"/>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span className="input-label" style={{ marginBottom:0 }}>Password</span>
              <span style={{ color:'var(--red)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>Forgot password?</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="input"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn btn-primary btn-full"
            style={{ padding:15, borderRadius:14, fontSize:16, opacity:loading?0.7:1 }}
          >
            {loading ? (
              <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                <svg style={{ animation:'spin 0.8s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                Signing In…
              </span>
            ) : 'Sign In'}
          </button>

          {/* Security badge */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, color:'var(--g2)', fontSize:12, fontFamily:"'Sora',sans-serif" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            256-bit SSL encrypted · Bank-grade security
          </div>
        </div>

        <div className="auth-footer">
          <span style={{ color:'var(--g2)', fontSize:14, fontFamily:"'Sora',sans-serif" }}>
            New to NexaBank?{' '}
          </span>
          <span onClick={()=>{setMode('signup');setError('');}} style={{ color:'var(--red)', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Sora',sans-serif" }}>
            Open an Account
          </span>
        </div>
      </div>

      {/* Bottom trust strip */}
      <div style={{ marginTop:24, display:'flex', gap:20, alignItems:'center', animation:'fadeUp 0.5s ease 0.1s both' }}>
        {['FDIC Insured', '2FA Security', '24/7 Support'].map((t,i)=>(
          <div key={t} style={{ display:'flex', alignItems:'center', gap:5, color:'var(--g2)', fontSize:11, fontFamily:"'Sora',sans-serif" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}