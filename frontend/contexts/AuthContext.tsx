import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  hasOnboarded: boolean;
  bookmarkIds: string[];
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<{ needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  toggleBookmark: (article: any, isCurrentlyBookmarked: boolean) => Promise<void>;
  isBookmarked: (articleId: string) => boolean;
  refreshBookmarks: () => Promise<void>;
  bookmarkedArticlesCache: any[];
  setBookmarkedArticlesCache: React.Dispatch<React.SetStateAction<any[]>>;
  feedArticlesCache: any[];
  setFeedArticlesCache: React.Dispatch<React.SetStateAction<any[]>>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);
  const [bookmarkedArticlesCache, setBookmarkedArticlesCache] = useState<any[]>([]);
  const [feedArticlesCache, setFeedArticlesCache] = useState<any[]>([]);

  useEffect(() => {
    loadSession();
  }, []);

  const clearStoredAuth = async () => {
    try {
      await AsyncStorage.multiRemove(['auth_token', 'auth_refresh_token']);
    } catch (e) {
      console.error('[Perf] Failed to clear auth:', e);
    }
  };

  const loadSession = async () => {
    console.log('[Perf] App Startup: Session Restore init');
    try {
      // Add a race condition to force load if AsyncStorage hangs
      const storagePromise = Promise.all([
        AsyncStorage.getItem('auth_token'),
        AsyncStorage.getItem('auth_refresh_token'),
        AsyncStorage.getItem('has_onboarded'),
      ]);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AsyncStorage timeout')), 3000)
      );

      const [savedToken, savedRefresh, onboarded] = await Promise.race([storagePromise, timeoutPromise]) as any;

      setHasOnboarded(onboarded === 'true');

      if (savedToken) {
        // Optimistically trust local token to unblock splash immediately
        setToken(savedToken);
        setUser({ id: 'temp', email: '', name: 'User' }); // placeholder until network sync

        console.timeEnd('[Perf] App Startup: Session Restore');

        // Background network sync
        ; (async () => {
          console.time('[Perf] Background User Sync');
          try {
            const userData = await api.getMe(savedToken);
            setUser(userData);
            console.timeEnd('[Perf] Background User Sync');

            try {
              console.time('[Perf] Background Bookmark Sync');
              const bm = await api.getBookmarkIds(savedToken);
              setBookmarkIds(bm.ids || []);
              console.timeEnd('[Perf] Background Bookmark Sync');
            } catch { }
          } catch {
            // Token expired — try refresh silently
            if (savedRefresh) {
              try {
                const refreshRes = await api.refreshToken(savedRefresh);
                const newToken = refreshRes.access_token;
                const newRefresh = refreshRes.refresh_token;
                if (newToken) {
                  await AsyncStorage.setItem('auth_token', newToken);
                  if (newRefresh) await AsyncStorage.setItem('auth_refresh_token', newRefresh);
                  setToken(newToken);
                  const userData = await api.getMe(newToken);
                  setUser(userData);
                  try {
                    const bm = await api.getBookmarkIds(newToken);
                    setBookmarkIds(bm.ids || []);
                  } catch { }
                } else {
                  await logout();
                }
              } catch {
                await logout();
              }
            } else {
              await logout();
            }
          }
        })();
      }
    } catch (e) {
      console.error('[Perf] Auth Restore Error:', e);
      await clearStoredAuth();
    } finally {
      console.log('[Perf] Session restore complete. Setting loading=false');
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    console.time('[Perf] Login Request Lifecycle');
    const res = await api.login(email, password);
    const accessToken = res.access_token;
    if (!accessToken) throw new Error('Login failed: no token returned');

    setUser(res.user);
    setToken(accessToken);
    await AsyncStorage.setItem('auth_token', accessToken);
    if (res.refresh_token) await AsyncStorage.setItem('auth_refresh_token', res.refresh_token);

    console.timeEnd('[Perf] Login Request Lifecycle');

    // Background fetch (non-blocking)
    console.time('[Perf] Post-Login Background Bookmarks');
    api.getBookmarkIds(accessToken)
      .then(bm => { setBookmarkIds(bm.ids || []); console.timeEnd('[Perf] Post-Login Background Bookmarks'); })
      .catch(() => { });
  };

  const signup = async (email: string, password: string, name: string): Promise<{ needsConfirmation?: boolean }> => {
    const res = await api.signup(email, password, name);
    const accessToken = res.access_token;
    if (accessToken) {
      setUser(res.user);
      setToken(accessToken);
      await AsyncStorage.setItem('auth_token', accessToken);
      if (res.refresh_token) await AsyncStorage.setItem('auth_refresh_token', res.refresh_token);
      return { needsConfirmation: false };
    }
    // Email confirmation required — Supabase returned user but no session
    return { needsConfirmation: true };
  };

  const logout = async () => {
    try {
      if (token) await api.logout(token);
    } catch { }
    setUser(null);
    setToken(null);
    setBookmarkIds([]);
    await clearStoredAuth();
  };

  const forgotPassword = async (email: string) => {
    await api.forgotPassword(email);
  };

  const completeOnboarding = async () => {
    setHasOnboarded(true);
    await AsyncStorage.setItem('has_onboarded', 'true');
  };

  const toggleBookmark = useCallback(async (article: any, isCurrentlyBookmarked: boolean) => {
    if (!token) return;

    // Fallback for when ID is passed directly instead of the full object
    const articleId = typeof article === 'string' ? article : article.id;
    const fullArticle = typeof article === 'string' ? null : article;

    // Optimistic UI updates
    if (isCurrentlyBookmarked) {
      setBookmarkIds(prev => prev.filter(id => id !== articleId));
      setBookmarkedArticlesCache(prev => prev.filter(a => a.id !== articleId));
    } else {
      setBookmarkIds(prev => [...prev, articleId]);
      if (fullArticle) {
        setBookmarkedArticlesCache(prev => [fullArticle, ...prev]);
      }
    }

    // Background sync with fallback rollback on failure
    try {
      if (isCurrentlyBookmarked) {
        await api.removeBookmark(token, articleId);
      } else {
        await api.addBookmark(token, articleId);
      }
    } catch {
      // Rollback on network failure
      if (isCurrentlyBookmarked) {
        setBookmarkIds(prev => [...prev, articleId]);
      } else {
        setBookmarkIds(prev => prev.filter(id => id !== articleId));
      }
    }
  }, [token]);

  const isBookmarked = useCallback((articleId: string) => {
    return bookmarkIds.includes(articleId);
  }, [bookmarkIds]);

  const refreshBookmarks = useCallback(async () => {
    if (!token) return;
    try {
      const bm = await api.getBookmarkIds(token);
      setBookmarkIds(bm.ids || []);
    } catch { }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, hasOnboarded, bookmarkIds, bookmarkedArticlesCache, setBookmarkedArticlesCache, feedArticlesCache, setFeedArticlesCache, login, signup, logout, forgotPassword, completeOnboarding, toggleBookmark, isBookmarked, refreshBookmarks }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
