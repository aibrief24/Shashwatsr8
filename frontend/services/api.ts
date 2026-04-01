const BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://aibrief24-backend.onrender.com';

async function request(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const api = {
  // Auth
  signup: (email: string, password: string, name: string) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),

  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getMe: (token: string) =>
    request('/auth/me', { headers: authHeaders(token) }),

  logout: (token: string) =>
    request('/auth/logout', { method: 'POST', headers: authHeaders(token) }),

  refreshToken: (refreshToken: string) =>
    request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),

  forgotPassword: (email: string) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email }) }),

  // Articles
  getArticles: (category?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (category && category !== 'Latest') params.set('category', category);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return request(`/articles?${params.toString()}`);
  },

  getArticle: (id: string) => request(`/articles/${id}`),

  searchArticles: (q: string) => request(`/articles/search?q=${encodeURIComponent(q)}`),

  getBreaking: () => request('/articles/breaking'),

  // Categories
  getCategories: () => request('/categories'),

  // Bookmarks
  getBookmarks: (token: string) =>
    request('/bookmarks', { headers: authHeaders(token) }),

  getBookmarkIds: (token: string) =>
    request('/bookmarks/ids', { headers: authHeaders(token) }),

  addBookmark: (token: string, articleId: string) =>
    request('/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ article_id: articleId }),
      headers: authHeaders(token),
    }),

  removeBookmark: (token: string, articleId: string) =>
    request(`/bookmarks/${articleId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  // Push Notifications
  registerPushToken: (pushToken: string, platform: string) =>
    request('/push/register', { method: 'POST', body: JSON.stringify({ token: pushToken, platform }) }),

  // Settings
  getSettings: () => request('/settings'),

  // Health
  health: () => request('/health'),

  // Admin
  triggerIngestion: () =>
    request('/admin/ingest', { method: 'POST' }),
};
