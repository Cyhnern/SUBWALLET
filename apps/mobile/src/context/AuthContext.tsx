import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { tokenStorage } from '../api/token-storage';
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
        await tokenStorage.clearTokens();
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
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {
        // Sunucuya ulaşamasak bile yerel token'ları temizlemeye devam ediyoruz —
        // kullanıcının cihazından çıkış yapabilmesi ağ durumuna bağlı olmamalı.
      });
    }
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
