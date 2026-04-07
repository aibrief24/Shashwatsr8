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
      }
    } catch (e) {
      console.error('[Perf] Auth Restore Error:', e);
      await clearStoredAuth();
    } finally {
      console.log('[Perf] Session restore complete. Setting loading=false');
      setLoading(false);
    }
  };

  // Delayed User Sync Effect
  useEffect(() => {
    if (token && !user) {
      const syncUser = async () => {
        try {
          const userData = await api.getMe(token);
          setUser(userData);
        } catch (e) {
          console.log('[Perf] Background User Sync Failed for now');
        }
      };
      const timer = setTimeout(syncUser, 800);
      return () => clearTimeout(timer);
    }
  }, [token, user]);

  // Delayed Bookmark Sync Effect
  useEffect(() => {
    if (token && user?.id) {
      const syncBookmarks = async () => {
        try {
          const bm = await api.getBookmarkIds(token);
          setBookmarkIds(bm.ids || []);
        } catch (e) {
          console.log('[Perf] Background Bookmark Sync Failed');
        }
      };
      const timer = setTimeout(syncBookmarks, 1500);
      return () => clearTimeout(timer);
    }
  }, [token, user?.id]);

  const login = async (email: string, password: string) => {
    try {
      console.log('[LOGIN] before api.login');

      // api.login handles its own internal 30-second AbortController securely
      const res = await api.login(email, password) as any;

      console.log('[LOGIN] after api.login response');

      const accessToken = res.access_token;
      if (!accessToken) throw new Error('Login failed: no token returned');

      console.log('[LOGIN] before AsyncStorage save');
      // Timeout wrapper around AsyncStorage to prevent silent UX freezes on Android
      await Promise.race([
        Promise.all([
          AsyncStorage.setItem('auth_token', accessToken),
          res.refresh_token ? AsyncStorage.setItem('auth_refresh_token', res.refresh_token) : Promise.resolve(),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AsyncStorage timeout')), 2000))
      ]).catch(e => console.warn('[LOGIN] AsyncStorage warning:', e));
      console.log('[LOGIN] after AsyncStorage save');

      console.log('[LOGIN] before token/user state set');
      setToken(accessToken);
      setUser(res.user);
      console.log('[LOGIN] after token/user state set');

      console.log('[LOGIN] before post-login sync');
      // Post-sync is detached automatically by our useEffects (syncUser/syncBookmarks)
      // reacting to the token/user state mutations safely in the background.

    } catch (error: any) {
      console.error('[LOGIN ERROR]', error);
      throw error;
    }
  };

  const signup = async (email: string, password: string, name: string): Promise<{ needsConfirmation?: boolean }> => {
    const signupPromise = api.signup(email, password, name);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Signup timeout')), 10000));
    const res = await Promise.race([signupPromise, timeoutPromise]) as any;

    const accessToken = res.access_token;
    if (accessToken) {
      setUser(res.user);
      setToken(accessToken);
      Promise.race([
        Promise.all([
          AsyncStorage.setItem('auth_token', accessToken),
          res.refresh_token ? AsyncStorage.setItem('auth_refresh_token', res.refresh_token) : Promise.resolve(),
        ]),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))
      ]).catch(() => { });
      return { needsConfirmation: false };
    }
    return { needsConfirmation: true };
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    setBookmarkIds([]);
    // Fire and forget, no unhandled rejections
    if (token) api.logout(token).catch(() => { });
    clearStoredAuth().catch(() => { });
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
