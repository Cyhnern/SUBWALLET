import { apiRequest } from './client';
import type { BurnRateResult, CategorySpend, Subscription, ZombieScore } from '../types/api';

export const analyticsApi = {
  burnRate: () => apiRequest<BurnRateResult>('/analytics/burn-rate'),
  zombieSubscriptions: () => apiRequest<ZombieScore[]>('/analytics/zombie-subscriptions'),
  spendingByCategory: () => apiRequest<CategorySpend[]>('/analytics/spending-by-category'),
  upcomingRenewals: (days = 14) =>
    apiRequest<Subscription[]>(`/analytics/upcoming-renewals?days=${days}`),
  exchangeRates: (baseCurrency = 'TRY') =>
    apiRequest<Record<string, number>>(`/analytics/exchange-rates?base=${baseCurrency}`),
  exportCsvReport: () =>
    apiRequest<string>('/analytics/export/csv', { responseType: 'text' }),
};
