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
  deviceTokens?: Array<{ id: string; token: string; platform?: string }>;
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
  invoiceUrl?: string | null;
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
  exchangeRateStatus?: {
    source: 'live' | 'fallback';
    asOf: string | null;
  };
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

export interface SharedAccountMember {
  id: string;
  sharedAccountId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface SharedAccount {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members: SharedAccountMember[];
  subscriptions?: Subscription[];
}

export interface CostSplit {
  id: string;
  subscriptionId: string;
  userId: string;
  splitType: 'equal' | 'percentage' | 'fixed_amount';
  splitValue: string | null;
  computedAmount: string;
  isSettled: boolean;
  settledAt: string | null;
  billingPeriodStart: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
  };
  subscription?: {
    id: string;
    customName: string | null;
    price: string;
    currency: string;
  };
}
