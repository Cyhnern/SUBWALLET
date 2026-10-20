import { apiRequest } from './client';
import type { Subscription, SubscriptionHistoryEntry, SubscriptionStatus } from '../types/api';

export interface CreateSubscriptionInput {
  customName: string;
  price: number;
  currency: string;
  billingCycle: Subscription['billingCycle'];
  startDate: string;
  categoryId?: string;
  notes?: string;
  invoiceUrl?: string;
}

export interface UpdateSubscriptionInput {
  customName?: string;
  price?: number;
  currency?: string;
  billingCycle?: Subscription['billingCycle'];
  categoryId?: string | null;
  notes?: string;
  invoiceUrl?: string | null;
}

export const subscriptionsApi = {
  list: (status?: SubscriptionStatus) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest<Subscription[]>(`/subscriptions${query}`);
  },

  get: (id: string) => apiRequest<Subscription>(`/subscriptions/${id}`),

  history: (id: string) => apiRequest<SubscriptionHistoryEntry[]>(`/subscriptions/${id}/history`),

  create: (input: CreateSubscriptionInput) =>
    apiRequest<Subscription>('/subscriptions', { method: 'POST', body: input }),

  update: (id: string, input: UpdateSubscriptionInput) =>
    apiRequest<Subscription>(`/subscriptions/${id}`, { method: 'PATCH', body: input }),

  markUsed: (id: string) => apiRequest<Subscription>(`/subscriptions/${id}/mark-used`, { method: 'POST' }),

  pause: (id: string) => apiRequest<Subscription>(`/subscriptions/${id}/pause`, { method: 'POST' }),

  resume: (id: string) => apiRequest<Subscription>(`/subscriptions/${id}/resume`, { method: 'POST' }),

  cancel: (id: string) => apiRequest<Subscription>(`/subscriptions/${id}/cancel`, { method: 'POST' }),

  remove: (id: string) => apiRequest<void>(`/subscriptions/${id}`, { method: 'DELETE' }),
};
