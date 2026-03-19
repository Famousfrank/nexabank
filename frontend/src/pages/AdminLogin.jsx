import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { saveSession } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Use the new admin-login endpoint (no OTP)
      const res = await fetch('http://localhost:4000/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      console.log('Login response:', data);
      
      if (data.user && data.accessToken) {
        saveSession({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken
        });
        window.location.href = '/admin/dashboard';
      } else {
        alert('Login failed: ' + (data.error || 'Invalid credentials'));
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#1a1f2e'
    }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 10, width: 400 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 30 }}>Admin Login</h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 10, marginBottom: 15, border: '1px solid #ddd', borderRadius: 5 }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 10, marginBottom: 20, border: '1px solid #ddd', borderRadius: 5 }}
            required
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: 12, 
              background: '#012169', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 5,
              cursor: 'pointer'
            }}
          >
            {loading ? 'Logging in...' : 'Login to Admin'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: 20, color: '#888', fontSize: 14 }}>
          Admin access only
        </p>
      </div>
    </div>
  );
}