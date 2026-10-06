import { API_BASE_URL } from './config';
import { tokenStorage } from './token-storage';
import type { TokenPair } from '../types/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<TokenPair | null> | null = null;

async function refreshAccessToken(): Promise<TokenPair | null> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;

    const tokens: TokenPair = await res.json();
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
    return tokens;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
}

/**
 * Tüm API çağrılarının geçtiği tek nokta. 401 aldığında refresh token'ı
 * kullanarak SESSIZCE bir kez daha dener (kullanıcı hiçbir şey fark etmez).
 * Refresh de başarısız olursa, çağıran taraf (AuthContext) kullanıcıyı
 * login ekranına yönlendirmekle sorumludur.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const accessToken = await tokenStorage.getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const doFetch = () =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && !skipAuth) {
    // Aynı anda birden fazla istek 401 alırsa, refresh'i sadece BİR kez tetikle
    // (aksi halde her istek kendi refresh'ini tetikler, refresh token rotasyonu
    // yüzünden birbirini geçersiz kılar).
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const newTokens = await refreshInFlight;

    if (newTokens) {
      headers.Authorization = `Bearer ${newTokens.accessToken}`;
      res = await doFetch();
    } else {
      await tokenStorage.clearTokens();
      throw new ApiError(401, 'Oturum süresi doldu');
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: res.statusText }));
    const rawMessage = (errorBody as { message?: string | string[] }).message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : (rawMessage ?? 'Bir hata oluştu');
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
