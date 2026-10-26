import { API_BASE_URL } from './config';
import { tokenStorage } from './token-storage';
import { authEvents } from './auth-events';
import type { TokenPair } from '../types/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

let refreshInFlight: Promise<
  { ok: true; tokens: TokenPair } | { ok: false; reason: 'invalid' | 'network' }
> | null = null;

async function refreshAccessToken(): Promise<
  { ok: true; tokens: TokenPair } | { ok: false; reason: 'invalid' | 'network' }
> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return { ok: false, reason: 'invalid' };

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'invalid' };
    }
    if (!res.ok) {
      return { ok: false, reason: 'network' };
    }

    const tokens: TokenPair = await res.json();
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
    return { ok: true, tokens };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
  responseType?: 'json' | 'text';
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const accessToken = await tokenStorage.getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const doFetch = () =>
    fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && !skipAuth) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const refreshResult = await refreshInFlight;

    if (refreshResult && refreshResult.ok) {
      headers.Authorization = `Bearer ${refreshResult.tokens.accessToken}`;
      res = await doFetch();
    } else {
      if (refreshResult && refreshResult.reason === 'invalid') {
        await tokenStorage.clearTokens();
        authEvents.emitSessionExpired();
        throw new ApiError(401, 'Oturum süresi doldu');
      } else {
        throw new ApiError(0, 'Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.');
      }
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
  if (options.responseType === 'text' || res.headers.get('content-type')?.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }
  return res.json();
}
