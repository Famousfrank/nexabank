// Centralised API client – handles JWT refresh transparently

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getTokens() {
  const access = localStorage.getItem('access_token');
  const refresh = localStorage.getItem('refresh_token');
  console.log('📦 getTokens - access_token:', access ? 'Present (length: ' + access.length + ')' : 'Missing');
  console.log('📦 getTokens - refresh_token:', refresh ? 'Present' : 'Missing');
  return {
    access: access,
    refresh: refresh,
  };
}

function setTokens({ accessToken, refreshToken }) {
  console.log('💾 setTokens - Saving tokens to localStorage');
  if (accessToken) {
    localStorage.setItem('access_token', accessToken);
    console.log('✅ access_token saved');
  }
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
    console.log('✅ refresh_token saved');
  }
}

function clearTokens() {
  console.log('🗑️ clearTokens - Removing all tokens');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

let refreshPromise = null;

async function refreshAccessToken() {
  console.log('🔄 refreshAccessToken - Attempting to refresh token');
  
  if (refreshPromise) {
    console.log('⏳ refreshAccessToken - Already refreshing, waiting...');
    return refreshPromise;
  }
  
  refreshPromise = (async () => {
    const { refresh } = getTokens();
    if (!refresh) {
      console.error('❌ refreshAccessToken - No refresh token available');
      throw new Error('No refresh token');
    }
    
    console.log('📡 refreshAccessToken - Calling refresh endpoint');
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    
    if (res.status === 429) {
      console.warn('⏰ refreshAccessToken - Rate limited, waiting 5 seconds');
      await new Promise(resolve => setTimeout(resolve, 5000));
      throw new Error('Rate limited. Please try again later.');
    }
    
    if (!res.ok) {
      console.error('❌ refreshAccessToken - Refresh failed with status:', res.status);
      clearTokens();
      throw new Error('Session expired');
    }
    
    const data = await res.json();
    console.log('✅ refreshAccessToken - Success, new token received');
    setTokens({ accessToken: data.accessToken });
    return data.accessToken;
  })().finally(() => {
    console.log('🔓 refreshAccessToken - Promise finished');
    refreshPromise = null;
  });
  
  return refreshPromise;
}

async function apiFetch(path, options = {}, retry = true) {
  console.log(`🌐 apiFetch - ${options.method || 'GET'} ${path}`);
  
  const { access } = getTokens();
  
  const headers = { 
    'Content-Type': 'application/json', 
    ...(options.headers || {}) 
  };
  
  if (access) {
    headers['Authorization'] = `Bearer ${access}`;
    console.log('✅ apiFetch - Authorization header added');
  } else {
    console.warn('⚠️ apiFetch - No access token available');
  }

  console.log('📋 apiFetch - Headers:', headers);

  try {
    const url = `${BASE}${path}`;
    console.log('📡 apiFetch - Fetching:', url);
    
    const res = await fetch(url, { 
      ...options, 
      headers,
      credentials: 'include'
    });

    console.log(`📥 apiFetch - Response status: ${res.status} ${res.statusText}`);

    // Handle 401 Unauthorized - token might be expired
    if (res.status === 401 && retry) {
      console.log('🔄 apiFetch - Got 401, attempting token refresh');
      const err = await res.json().catch(() => ({}));
      
      if (err.code === 'TOKEN_EXPIRED' || err.error === 'Token expired') {
        console.log('🔄 apiFetch - Token expired, refreshing...');
        try {
          const newToken = await refreshAccessToken();
          if (newToken) {
            console.log('✅ apiFetch - Token refreshed, retrying request');
            return apiFetch(path, options, false);
          }
        } catch (refreshError) {
          console.error('❌ apiFetch - Token refresh failed:', refreshError);
          clearTokens();
          window.location.href = '/';
          return;
        }
      }
    }

    // Handle 429 Too Many Requests
    if (res.status === 429) {
      console.warn('⏰ apiFetch - Rate limited (429)');
      const error = new Error('Too many requests. Please wait a moment and try again.');
      error.status = 429;
      throw error;
    }

    const data = await res.json().catch(() => {
      console.warn('⚠️ apiFetch - Could not parse JSON response');
      return null;
    });
    
    if (!res.ok) {
      console.error('❌ apiFetch - Request failed:', { status: res.status, data });
      const errorMessage = data?.error || `HTTP ${res.status} - ${res.statusText}`;
      const error = new Error(errorMessage);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    
    console.log('✅ apiFetch - Request successful');
    return data;
    
  } catch (error) {
    console.error('❌ apiFetch - Network or other error:', error);
    throw error;
  }
}

// ─── Auth ──────────────────────────────────────────────────────────────────
export const auth = {
  signupInit:   (body) => apiFetch('/auth/signup/init',   { method: 'POST', body: JSON.stringify(body) }),
  signupVerify: (body) => apiFetch('/auth/signup/verify', { method: 'POST', body: JSON.stringify(body) }),
  loginInit:    (body) => apiFetch('/auth/login/init',    { method: 'POST', body: JSON.stringify(body) }),
  loginVerify:  (body) => apiFetch('/auth/login/verify',  { method: 'POST', body: JSON.stringify(body) }),
  logout:       (body) => apiFetch('/auth/logout',        { method: 'POST', body: JSON.stringify(body) }),
  logoutAll:    ()     => apiFetch('/auth/logout-all',    { method: 'POST' }),
};

// ─── Accounts ─────────────────────────────────────────────────────────────
export const accounts = {
  list:         ()   => apiFetch('/accounts'),
  get:          (id) => apiFetch(`/accounts/${id}`),
  toggleFreeze: (id) => apiFetch(`/accounts/${id}/freeze`, { method: 'PATCH' }),
  details:       (id)       => apiFetch(`/accounts/${id}/details`),
  cardRequest:   (body)     => apiFetch('/accounts/card-request',        { method: 'POST',  body: JSON.stringify(body) }),
  cardReqStatus: ()         => apiFetch('/accounts/card-request/status'),
  cardDetails:   (id)       => apiFetch(`/accounts/${id}/card-details`),
  setCardStatus: (id, body) => apiFetch(`/accounts/${id}/card-status`,   { method: 'PATCH', body: JSON.stringify(body) }),
  setPin:        (id, body) => apiFetch(`/accounts/${id}/set-pin`,       { method: 'POST',  body: JSON.stringify(body) }),
};

// ─── Transactions ──────────────────────────────────────────────────────────
export const transactions = {
  list:     (params = {}) => apiFetch('/transactions?' + new URLSearchParams(params)),
  get:      (id)          => apiFetch(`/transactions/${id}`),
  transfer: (body)        => apiFetch('/transactions/transfer', { method: 'POST', body: JSON.stringify(body) }),
  deposit:  (body)        => apiFetch('/transactions/deposit',  { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Users ────────────────────────────────────────────────────────────────
export const users = {
  me:             ()          => apiFetch('/users/me'),
  updateMe:       (body)      => apiFetch('/users/me',              { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body)      => apiFetch('/users/me/password',     { method: 'PATCH', body: JSON.stringify(body) }),
  notifications:  ()          => apiFetch('/users/notifications'),
  markOneRead:    (id)        => apiFetch(`/users/notifications/${id}/read`, { method: 'PATCH' }),
  statement:      (body)      => apiFetch('/users/statement', { method: 'POST', body: JSON.stringify(body) }),
  markNotifRead:  ()          => apiFetch('/users/notifications/read-all', { method: 'PATCH' }),
  budgets:        ()          => apiFetch('/users/budgets'),
  setBudget:      (cat, body) => apiFetch(`/users/budgets/${cat}`,  { method: 'PUT',   body: JSON.stringify(body) }),
  goals:          ()          => apiFetch('/users/goals'),
  addGoal:        (body)      => apiFetch('/users/goals',           { method: 'POST',  body: JSON.stringify(body) }),
  updateGoal:     (id, body)  => apiFetch(`/users/goals/${id}`,     { method: 'PATCH', body: JSON.stringify(body) }),
  contacts:       ()          => apiFetch('/users/contacts'),
  addContact:     (body)      => apiFetch('/users/contacts',        { method: 'POST',  body: JSON.stringify(body) }),
  analytics:      ()          => apiFetch('/users/analytics'),
};

// ─── Limits ───────────────────────────────────────────────────────────────
export const limitsApi = {
  me:      ()     => apiFetch('/limits/me'),
  upgrade: (body) => apiFetch('/limits/upgrade', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Loans ────────────────────────────────────────────────────────────────
export const loansApi = {
  submit:     (body) => apiFetch('/loans',                     { method: 'POST', body: JSON.stringify(body) }),
  list:       ()     => apiFetch('/loans'),
  listAll:    ()     => apiFetch('/loans/admin/all'),
  get:        (id)   => apiFetch(`/loans/${id}`),
  review:     (id)   => apiFetch(`/loans/${id}/review`,     { method: 'POST' }),
  specialist: (id)   => apiFetch(`/loans/${id}/specialist`, { method: 'POST' }),
  approve:    (id)   => apiFetch(`/loans/${id}/approve`,    { method: 'POST' }),
  decline:    (id, reason) => apiFetch(`/loans/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

export const profileApi = {
  me:           ()      => apiFetch('/profile/me'),
  update:       (body)  => apiFetch('/profile/me',          { method:'PATCH', body:JSON.stringify(body) }),
  sendOtp:      (type)  => apiFetch('/profile/contact-otp', { method:'POST',  body:JSON.stringify({ type }) }),
  changeContact:(body)  => apiFetch('/profile/contact',     { method:'PATCH', body:JSON.stringify(body) }),
  setPin:       (body)  => apiFetch('/profile/set-pin',     { method:'POST',  body:JSON.stringify(body) }),
  verifyPin:    (pin)   => apiFetch('/profile/verify-pin',  { method:'POST',  body:JSON.stringify({ pin }) }),
  toggle:       (field) => apiFetch('/profile/toggle',      { method:'PATCH', body:JSON.stringify({ field }) }),
  submitKyc:    (body)  => apiFetch('/profile/kyc',         { method:'POST',  body:JSON.stringify(body) }),
  kycStatus:    ()      => apiFetch('/profile/kyc'),
  kycAdminAll:  ()          => apiFetch('/profile/kyc/admin/all'),
  kycApprove:   (id)        => apiFetch(`/profile/kyc/${id}/approve`, { method:'POST' }),
  kycReject:    (id,reason) => apiFetch(`/profile/kyc/${id}/reject`,  { method:'POST', body:JSON.stringify({ reason }) }),
};

// Admin endpoints
export const adminApi = {
  // Users
  getAllUsers: () => apiFetch('/admin/users'),
  getUser: (id) => apiFetch(`/admin/users/${id}`),
  createUser: (body) => apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => apiFetch(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  toggleUserStatus: (id) => apiFetch(`/admin/users/${id}/toggle-active`, { method: 'PATCH' }),
  updateUserTier: (id, tier) => apiFetch(`/admin/users/${id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier }) }),
  
  // Accounts
  getAllAccounts: () => apiFetch('/admin/accounts'),
  freezeAccount: (id) => apiFetch(`/admin/accounts/${id}/freeze`, { method: 'PATCH' }),
  
  // Transactions
  getAllTransactions: () => apiFetch('/admin/transactions'),
  
  // Card Requests
  getAllCardRequests: () => apiFetch('/admin/card-requests'),
  approveCardRequest: (id) => apiFetch(`/admin/card-requests/${id}/approve`, { method: 'POST' }),
  declineCardRequest: (id, reason) => apiFetch(`/admin/card-requests/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
  
  // Loan Applications
  getAllLoanApplications: () => apiFetch('/admin/loans'),
  approveLoan: (id) => apiFetch(`/admin/loans/${id}/approve`, { method: 'POST' }),
  declineLoan: (id, reason) => apiFetch(`/admin/loans/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
  
  // KYC Submissions
  getAllKycSubmissions: () => apiFetch('/admin/kyc'),
  
  // Limit Upgrade Requests
  getAllLimitRequests: () => apiFetch('/admin/limit-upgrades'),
  approveLimitUpgrade: (id) => apiFetch(`/admin/limit-upgrades/${id}/approve`, { method: 'POST' }),
  declineLimitUpgrade: (id, reason) => apiFetch(`/admin/limit-upgrades/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
  
  // System Settings
  getSettings: () => apiFetch('/admin/settings'),
  updateSettings: (body) => apiFetch('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  
  // Statistics
  getStats: () => apiFetch('/admin/stats'),
};

export { setTokens, clearTokens, getTokens };