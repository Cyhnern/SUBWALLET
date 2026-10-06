import type { BillingCycle, Subscription, SubscriptionStatus } from '../types/api';

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'haftalık',
  monthly: 'aylık',
  quarterly: '3 aylık',
  yearly: 'yıllık',
  custom: 'özel',
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  trial: 'Deneme',
  cancelled: 'İptal Edildi',
  expired: 'Süresi Doldu',
};

export function subscriptionName(subscription: Pick<Subscription, 'customName' | 'serviceProvider'>): string {
  return subscription.serviceProvider?.name ?? subscription.customName ?? 'İsimsiz Abonelik';
}

export function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMoney(amount: number | string, currency: string) {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return `${value.toFixed(2)} ${currency}`;
}
