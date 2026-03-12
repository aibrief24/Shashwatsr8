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
  toggleBookmark: (articleId: string) => Promise<void>;
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
    try {
      const [savedToken, savedRefresh, onboarded] = await Promise.all([
        AsyncStorage.getItem('auth_token'),
        AsyncStorage.getItem('auth_refresh_token'),
        AsyncStorage.getItem('has_onboarded'),
      ]);
      setHasOnboarded(onboarded === 'true');
      if (savedToken) {
        try {
          const userData = await api.getMe(savedToken);
          setUser(userData);
          setToken(savedToken);
          try {
            const bm = await api.getBookmarkIds(savedToken);
            setBookmarkIds(bm.ids || []);
          } catch {}
        } catch {
          // Token expired — try refresh
          if (savedRefresh) {
            try {
              const refreshRes = await api.refreshToken(savedRefresh);
              const newToken = refreshRes.access_token;
              const newRefresh = refreshRes.refresh_token;
              if (newToken) {
                await AsyncStorage.setItem('auth_token', newToken);
                if (newRefresh) await AsyncStorage.setItem('auth_refresh_token', newRefresh);
                const userData = await api.getMe(newToken);
                setUser(userData);
                setToken(newToken);
                try {
                  const bm = await api.getBookmarkIds(newToken);
                  setBookmarkIds(bm.ids || []);
                } catch {}
              } else {
                await clearStoredAuth();
              }
            } catch {
              await clearStoredAuth();
            }
          } else {
            await clearStoredAuth();
          }
        }
      }
    } catch {
      await clearStoredAuth();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    const accessToken = res.access_token;
    if (!accessToken) throw new Error('Login failed: no token returned');
    setUser(res.user);
    setToken(accessToken);
    await AsyncStorage.setItem('auth_token', accessToken);
    if (res.refresh_token) await AsyncStorage.setItem('auth_refresh_token', res.refresh_token);
    try {
      const bm = await api.getBookmarkIds(accessToken);
      setBookmarkIds(bm.ids || []);
    } catch {}
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
    } catch {}
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

  const toggleBookmark = useCallback(async (articleId: string) => {
    if (!token) return;
    if (bookmarkIds.includes(articleId)) {
      setBookmarkIds(prev => prev.filter(id => id !== articleId));
      await api.removeBookmark(token, articleId);
    } else {
      setBookmarkIds(prev => [...prev, articleId]);
      await api.addBookmark(token, articleId);
    }
  }, [token, bookmarkIds]);

  const isBookmarked = useCallback((articleId: string) => {
    return bookmarkIds.includes(articleId);
  }, [bookmarkIds]);

  const refreshBookmarks = useCallback(async () => {
    if (!token) return;
    try {
      const bm = await api.getBookmarkIds(token);
      setBookmarkIds(bm.ids || []);
    } catch {}
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, hasOnboarded, bookmarkIds, login, signup, logout, forgotPassword, completeOnboarding, toggleBookmark, isBookmarked, refreshBookmarks }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
