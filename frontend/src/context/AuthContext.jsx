import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth as authApi, users as usersApi, setTokens, clearTokens, getTokens } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [ready,   setReady]   = useState(false); // true once we've verified the session

  // ── On every app load: check if the stored token is still valid ──────────────
  // If it is → fetch fresh user data from DB and show dashboard
  // If it isn't → clear everything and show login screen
  useEffect(() => {
    const verify = async () => {
      const { access, refresh } = getTokens();

      if (!access && !refresh) {
        // No tokens at all → go straight to login
        setReady(true);
        return;
      }

      try {
        // This calls GET /users/me with the stored access token.
        // If the token is expired, apiFetch will auto-refresh it using the
        // refresh token. If that also fails, it throws → we catch below.
        const u = await usersApi.me();
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));
      } catch {
        // Token invalid / expired / server unreachable → force login
        clearTokens();
        setUser(null);
      } finally {
        setReady(true);
      }
    };

    verify();
  }, []);

  const saveSession = useCallback((data) => {
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    localStorage.setItem('user', JSON.stringify(data.user));
  }, []);

  const logout = useCallback(async () => {
    const { refresh } = getTokens();
    // Clear immediately → UI jumps to login right away
    clearTokens();
    setUser(null);
    // Revoke on server in background
    try { await authApi.logout({ refreshToken: refresh }); } catch { /* ignore */ }
  }, []);

  const logoutAll = useCallback(async () => {
    clearTokens();
    setUser(null);
    try { await authApi.logoutAll(); } catch { /* ignore */ }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const u = await usersApi.me();
      setUser(u);
      localStorage.setItem('user', JSON.stringify(u));
    } catch { /* ignore */ }
  }, []);

  // Check if user is admin - using admin emails list
  const isAdmin = useCallback(() => {
    // Add your admin emails here
    const adminEmails = ['admin@nexabank.com', 'franknkem0049@gmail.com'];
    return user && adminEmails.includes(user.email);
  }, [user]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      ready, 
      setUser, 
      saveSession, 
      logout, 
      logoutAll, 
      refreshUser,
      isAdmin: isAdmin()
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);