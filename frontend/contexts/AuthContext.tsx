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
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const loadSession = async () => {
    try {
      const [savedToken, onboarded] = await Promise.all([
        AsyncStorage.getItem('auth_token'),
        AsyncStorage.getItem('has_onboarded'),
      ]);
      setHasOnboarded(onboarded === 'true');
      if (savedToken) {
        const userData = await api.getMe(savedToken);
        setUser(userData);
        setToken(savedToken);
        try {
          const bm = await api.getBookmarkIds(savedToken);
          setBookmarkIds(bm.ids || []);
        } catch {}
      }
    } catch {
      await AsyncStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setUser(res.user);
    setToken(res.token);
    await AsyncStorage.setItem('auth_token', res.token);
    try {
      const bm = await api.getBookmarkIds(res.token);
      setBookmarkIds(bm.ids || []);
    } catch {}
  };

  const signup = async (email: string, password: string, name: string) => {
    const res = await api.signup(email, password, name);
    setUser(res.user);
    setToken(res.token);
    await AsyncStorage.setItem('auth_token', res.token);
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    setBookmarkIds([]);
    await AsyncStorage.removeItem('auth_token');
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
    <AuthContext.Provider value={{ user, token, loading, hasOnboarded, bookmarkIds, login, signup, logout, completeOnboarding, toggleBookmark, isBookmarked, refreshBookmarks }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
