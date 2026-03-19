// Centralised API client – handles JWT refresh transparently

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getTokens() {
  return {
    access:  localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token'),
  };
}

function setTokens({ accessToken, refreshToken }) {
  if (accessToken)  localStorage.setItem('access_token',  accessToken);
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refresh } = getTokens();
    if (!refresh) throw new Error('No refresh token');
    const res = await fetch(`${BASE}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) { clearTokens(); throw new Error('Session expired'); }
    const data = await res.json();
    setTokens({ accessToken: data.accessToken });
    return data.accessToken;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function apiFetch(path, options = {}, retry = true) {
  const { access } = getTokens();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const err = await res.json().catch(() => ({}));
    if (err.code === 'TOKEN_EXPIRED') {
      try {
        await refreshAccessToken();
        return apiFetch(path, options, false);
      } catch {
        clearTokens();
        window.location.href = '/';
        return;
      }
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  signupInit:   (body) => apiFetch('/auth/signup/init',   { method: 'POST', body: JSON.stringify(body) }),
  signupVerify: (body) => apiFetch('/auth/signup/verify', { method: 'POST', body: JSON.stringify(body) }),
  loginInit:    (body) => apiFetch('/auth/login/init',    { method: 'POST', body: JSON.stringify(body) }),
  loginVerify:  (body) => apiFetch('/auth/login/verify',  { method: 'POST', body: JSON.stringify(body) }),
  logout:       (body) => apiFetch('/auth/logout',        { method: 'POST', body: JSON.stringify(body) }),
  logoutAll:    ()     => apiFetch('/auth/logout-all',    { method: 'POST' }),
};

// ─── Accounts ─────────────────────────────────────────────────────────────────
export const accounts = {
  list:         ()   => apiFetch('/accounts'),
  get:          (id) => apiFetch(`/accounts/${id}`),
  toggleFreeze: (id) => apiFetch(`/accounts/${id}/freeze`, { method: 'PATCH' }),
};

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactions = {
  list:     (params = {}) => apiFetch('/transactions?' + new URLSearchParams(params)),
  get:      (id)          => apiFetch(`/transactions/${id}`),
  transfer: (body)        => apiFetch('/transactions/transfer', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = {
  me:               ()     => apiFetch('/users/me'),
  updateMe:         (body) => apiFetch('/users/me',              { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword:   (body) => apiFetch('/users/me/password',     { method: 'PATCH', body: JSON.stringify(body) }),
  notifications:    ()     => apiFetch('/users/notifications'),
  markNotifRead:    ()     => apiFetch('/users/notifications/read-all', { method: 'PATCH' }),
  budgets:          ()     => apiFetch('/users/budgets'),
  setBudget:        (cat, body) => apiFetch(`/users/budgets/${cat}`, { method: 'PUT', body: JSON.stringify(body) }),
  goals:            ()     => apiFetch('/users/goals'),
  addGoal:          (body) => apiFetch('/users/goals',           { method: 'POST', body: JSON.stringify(body) }),
  updateGoal:       (id, body) => apiFetch(`/users/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  contacts:         ()     => apiFetch('/users/contacts'),
  addContact:       (body) => apiFetch('/users/contacts',        { method: 'POST', body: JSON.stringify(body) }),
  analytics:        ()     => apiFetch('/users/analytics'),
};

export { setTokens, clearTokens, getTokens };