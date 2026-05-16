import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  'https://aibrief24-backend.onrender.com';

// These paths must never trigger a token refresh on 401 (no token yet, or would loop)
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/signup'];

// Promise lock — concurrent 401s share one refresh call instead of stampeding
let _refreshPromise: Promise<string | null> | null = null;

// Callback registered by AuthContext to sync the new token into React state
let _tokenUpdateHandler: ((newToken: string) => void) | null = null;

export function setTokenUpdateHandler(handler: (newToken: string) => void): void {
  _tokenUpdateHandler = handler;
}

async function _doRefresh(): Promise<string | null> {
  try {
    const rt = await AsyncStorage.getItem('auth_refresh_token');
    if (!rt) return null;
    const res = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (res?.access_token) {
      await AsyncStorage.setItem('auth_token', res.access_token);
      if (res.refresh_token) {
        await AsyncStorage.setItem('auth_refresh_token', res.refresh_token);
      }
      if (_tokenUpdateHandler) _tokenUpdateHandler(res.access_token);
      return res.access_token;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function request(path: string, options: RequestInit = {}, timeoutMs = 30000, _isRetry = false) {
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
      if (res.status === 401) {
        const isAuthPath = NO_REFRESH_PATHS.some(p => path.startsWith(p));
        if (isAuthPath || _isRetry) {
          // Auth endpoints or already-retried requests go straight to SESSION_EXPIRED
          throw new Error(JSON.stringify({ code: "SESSION_EXPIRED", message: "Session expired. Please login again." }));
        }

        // Use promise lock so concurrent 401s share one refresh call
        if (!_refreshPromise) {
          _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
        }

        let newToken: string | null = null;
        try {
          newToken = await _refreshPromise;
        } catch {
          newToken = null;
        }

        if (!newToken) {
          throw new Error(JSON.stringify({ code: "SESSION_EXPIRED", message: "Session expired. Please login again." }));
        }

        // Retry the original request once with the refreshed token
        console.log(`[API] => RETRY after token refresh ${options.method || 'GET'} ${url}`);
        return request(path, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        }, timeoutMs, true);
      }

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

  exchangeCode: (code: string) =>
    request('/auth/exchange-code', { method: 'POST', body: JSON.stringify({ code }) }),

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
