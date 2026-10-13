import { apiRequest } from './client';
import type { SharedAccount, CostSplit } from '../types/api';

export interface CreateSharedAccountInput {
  name: string;
}

export interface InviteMemberInput {
  email: string;
  role?: 'admin' | 'member';
}

export const sharedAccountsApi = {
  list: () => apiRequest<SharedAccount[]>('/shared-accounts'),

  get: (id: string) => apiRequest<SharedAccount>(`/shared-accounts/${id}`),

  create: (input: CreateSharedAccountInput) =>
    apiRequest<SharedAccount>('/shared-accounts', { method: 'POST', body: input }),

  inviteMember: (id: string, input: InviteMemberInput) =>
    apiRequest<SharedAccount>(`/shared-accounts/${id}/members`, { method: 'POST', body: input }),

  removeMember: (id: string, memberUserId: string) =>
    apiRequest<void>(`/shared-accounts/${id}/members/${memberUserId}`, { method: 'DELETE' }),

  recomputeCostSplits: (id: string, billingPeriodStart?: string) =>
    apiRequest<CostSplit[]>(`/shared-accounts/${id}/cost-splits/recompute`, {
      method: 'POST',
      body: { billingPeriodStart: billingPeriodStart || new Date().toISOString() },
    }),

  listCostSplits: (id: string, billingPeriodStart?: string) => {
    const query = billingPeriodStart ? `?billingPeriodStart=${billingPeriodStart}` : '';
    return apiRequest<CostSplit[]>(`/shared-accounts/${id}/cost-splits${query}`);
  },

  settleCostSplit: (id: string, splitId: string) =>
    apiRequest<CostSplit>(`/shared-accounts/${id}/cost-splits/${splitId}/settle`, { method: 'POST' }),
};
