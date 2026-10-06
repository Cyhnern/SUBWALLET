import { apiRequest } from './client';
import type { NotificationPreference, User } from '../types/api';

export const usersApi = {
  updateMe: (input: { fullName?: string; baseCurrency?: string; timezone?: string }) =>
    apiRequest<User>('/users/me', { method: 'PATCH', body: input }),

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
