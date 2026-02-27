const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('token');
}

export async function api(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Sesiune expirată');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const authApi = {
  login: (email, password) => api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (body) => api('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => api('/auth/me'),
};

export const branchesApi = {
  list: () => api('/branches'),
  get: (id) => api(`/branches/${id}`),
};

export const productsApi = {
  list: () => api('/products'),
};

export const stockApi = {
  list: (params) => {
    const q = new URLSearchParams(params).toString();
    return api('/stock' + (q ? '?' + q : ''));
  },
  update: (body) => api('/stock', { method: 'PUT', body: JSON.stringify(body) }),
  receive: (body) => api('/stock/receive', { method: 'POST', body: JSON.stringify(body) }),
};

export const salesApi = {
  report: (params) => api('/sales/report' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  create: (body) => api('/sales', { method: 'POST', body: JSON.stringify(body) }),
};

export const transfersApi = {
  list: () => api('/transfers'),
  create: (body) => api('/transfers', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id, status) => api(`/transfers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  suggestions: () => api('/transfers/suggestions'),
};
