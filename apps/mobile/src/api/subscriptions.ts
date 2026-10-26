import { apiRequest } from './client';
import type { Subscription, SubscriptionHistoryEntry, SubscriptionStatus } from '../types/api';

export interface CreateSubscriptionInput {
  serviceProviderId?: string;
  customName?: string;
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

export interface SubscriptionFilters {
  status?: SubscriptionStatus | 'all';
  search?: string;
  sortBy?: 'nextBillingDate' | 'priceAsc' | 'priceDesc' | 'nameAsc' | 'nameDesc';
  categoryId?: string;
  limit?: number;
  cursor?: string;
}

export const subscriptionsApi = {
  list: async (filters?: SubscriptionFilters) => {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.cursor) params.append('cursor', filters.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<{ items: Subscription[]; nextCursor?: string } | Subscription[]>(`/subscriptions${query}`);
    if (Array.isArray(res)) return res;
    return res.items ?? [];
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
