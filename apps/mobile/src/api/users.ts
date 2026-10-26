import { apiRequest } from './client';
import type { NotificationPreference, User } from '../types/api';

export const usersApi = {
  updateMe: (input: { fullName?: string; baseCurrency?: string; timezone?: string }) =>
    apiRequest<User>('/users/me', { method: 'PATCH', body: input }),

  registerDevice: (input: { token: string; platform?: string }) =>
    apiRequest<void>('/users/me/devices', { method: 'PUT', body: input }),

  unregisterDevice: (token: string) =>
    apiRequest<void>(`/users/me/devices/${encodeURIComponent(token)}`, { method: 'DELETE' }),

  updateNotificationPreferences: (input: {
    channels?: NotificationPreference['channels'];
    daysBeforeRenewal?: number[];
    zombieAlertsEnabled?: boolean;
  }) =>
    apiRequest<NotificationPreference>('/users/me/notification-preferences', {
      method: 'PATCH',
      body: input,
    }),
};
