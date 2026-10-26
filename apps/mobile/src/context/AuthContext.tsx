import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { usersApi } from '../api/users';
import { tokenStorage } from '../api/token-storage';
import { authEvents } from '../api/auth-events';
import type { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Oturum bitti olayını dinle (401/403 invalid refresh durumunda tetiklenir)
  useEffect(() => {
    const unsubscribe = authEvents.subscribe(() => {
      queryClient.clear();
      setUser(null);
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Uygulama açılışında kayıtlı bir token varsa, geçerliliğini /users/me ile doğrula.
  useEffect(() => {
    (async () => {
      try {
        const accessToken = await tokenStorage.getAccessToken();
        if (accessToken) {
          const me = await authApi.me();
          setUser(me);
        }
      } catch {
        // Yalnızca /users/me 401/403 verdiğinde token'lar silinir (client.ts içindeki mantık)
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const tokens = await authApi.login({ email, password });
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
    const me = await authApi.me();
    setUser(me);
  }

  async function register(email: string, password: string, fullName: string) {
    const tokens = await authApi.register({ email, password, fullName });
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
    const me = await authApi.me();
    setUser(me);
  }

  async function refreshUser() {
    const me = await authApi.me();
    setUser(me);
  }

  async function logout() {
    // 1. Çıkış yapmadan önce cihaz push token kaydını temizle (Adım 11)
    if (user?.deviceTokens?.[0]?.token) {
      await usersApi.unregisterDevice(user.deviceTokens[0].token).catch(() => {});
    }

    // 2. Refresh token'ı iptal et
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {});
    }

    // 3. Öncesindeki kullanıcı verisi sızmasın diye Query önbelleğini temizle
    queryClient.clear();
    await tokenStorage.clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
