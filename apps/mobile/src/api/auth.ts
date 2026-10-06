import { apiRequest } from './client';
import type { TokenPair, User } from '../types/api';

export const authApi = {
  register: (input: { email: string; password: string; fullName: string }) =>
    apiRequest<TokenPair>('/auth/register', { method: 'POST', body: input, skipAuth: true }),

  login: (input: { email: string; password: string }) =>
    apiRequest<TokenPair>('/auth/login', { method: 'POST', body: input, skipAuth: true }),

  logout: (refreshToken: string) =>
    apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),

  me: () => apiRequest<User>('/users/me'),
};
