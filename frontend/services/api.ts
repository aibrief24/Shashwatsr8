const BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://aibrief24-backend.onrender.com';

async function request(path: string, options: RequestInit = {}, timeoutMs = 30000) {
  const url = `${BASE_URL}/api${path}`;
  console.log(`[API] => START ${options.method || 'GET'} ${url}`);

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal as any,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    clearTimeout(id);

    console.log(`[API] <= FINISH ${options.method || 'GET'} ${url} [${res.status}]`);

    if (!res.ok) {
      let errDetail = 'Request failed';
      try {
        const errJson = await res.json();
        errDetail = errJson.detail || errDetail;
      } catch (e) {
        errDetail = `Non-200 response (${res.status}) and failed to parse error JSON`;
      }
      throw new Error(errDetail);
    }

    try {
      return await res.json();
    } catch (e) {
      throw new Error('Failed to parse JSON response from server');
    }
  } catch (error: any) {
    clearTimeout(id);
    console.log(`[API] <= ERROR ${options.method || 'GET'} ${url}: `, error.message);
    if (error.name === 'AbortError') {
      throw new Error(`Network request timed out after ${timeoutMs / 1000}s. Please check your connection or wait for server cold start.`);
    }
    if (error.message === 'Network request failed') {
      throw new Error('Network failure: Unable to reach the server. Are you online?');
    }
    throw error;
  }
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

  updatePassword: (access_token: string, new_password: string) =>
    request('/auth/update-password', { method: 'POST', body: JSON.stringify({ access_token, new_password }) }),

  // Articles
  getArticles: (category?: string, limit = 15, offset = 0) => {
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
  registerPushToken: (pushToken: string, platform: string, authToken: string) =>
    request('/push/register', { method: 'POST', body: JSON.stringify({ token: pushToken, platform }), headers: authHeaders(authToken) }),

  // Settings
  getSettings: () => request('/settings'),

  // Health
  health: () => request('/health'),

  // Admin
  triggerIngestion: () =>
    request('/admin/ingest', { method: 'POST' }),
};
