export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'trial' | 'expired';
export type NotificationChannel = 'push' | 'email' | 'sms';

export interface NotificationPreference {
  id: string;
  channels: NotificationChannel[];
  daysBeforeRenewal: number[];
  zombieAlertsEnabled: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  baseCurrency: string;
  timezone: string;
  notificationPreference?: NotificationPreference | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  colorHex: string | null;
  isSystem: boolean;
}

export interface ServiceProvider {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface Subscription {
  id: string;
  userId: string;
  sharedAccountId: string | null;
  serviceProviderId: string | null;
  categoryId: string | null;
  customName: string | null;
  price: string;
  currency: string;
  billingCycle: BillingCycle;
  customCycleDays: number | null;
  paymentMethod?: string | null;
  status: SubscriptionStatus;
  startDate: string;
  nextBillingDate: string;
  trialEndDate: string | null;
  lastUsedAt: string | null;
  notes: string | null;
  serviceProvider?: ServiceProvider | null;
  category?: Category | null;
}

export interface SubscriptionHistoryEntry {
  id: string;
  changedField: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
}

export interface BurnRateResult {
  monthlyTotal: number;
  yearlyTotal: number;
  currency: string;
  subscriptionCount: number;
}

export interface CategorySpend {
  categoryName: string;
  monthlyTotal: number;
  colorHex: string | null;
  sharePercent: number;
}

export interface ZombieScore {
  subscriptionId: string;
  name: string;
  score: number;
  isZombie: boolean;
  reasons: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
