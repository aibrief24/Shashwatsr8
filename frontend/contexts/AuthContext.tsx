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
  toggleBookmark: (articleId: string, isCurrentlyBookmarked: boolean) => Promise<void>;
  isBookmarked: (articleId: string) => boolean;
  refreshBookmarks: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);

  useEffect(() => {
    loadSession();
  }, []);

  const clearStoredAuth = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'auth_refresh_token']);
  };

  const loadSession = async () => {
    console.time('[Perf] App Startup: Session Restore');
    try {
      const [savedToken, savedRefresh, onboarded] = await Promise.all([
        AsyncStorage.getItem('auth_token'),
        AsyncStorage.getItem('auth_refresh_token'),
        AsyncStorage.getItem('has_onboarded'),
      ]);

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
    } catch {
      await clearStoredAuth();
    } finally {
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

  const toggleBookmark = useCallback(async (articleId: string, isCurrentlyBookmarked: boolean) => {
    if (!token) return;
    if (isCurrentlyBookmarked) {
      setBookmarkIds(prev => prev.filter(id => id !== articleId));
      await api.removeBookmark(token, articleId);
    } else {
      setBookmarkIds(prev => [...prev, articleId]);
      await api.addBookmark(token, articleId);
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
    <AuthContext.Provider value={{ user, token, loading, hasOnboarded, bookmarkIds, login, signup, logout, forgotPassword, completeOnboarding, toggleBookmark, isBookmarked, refreshBookmarks }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
