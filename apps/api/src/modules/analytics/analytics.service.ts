import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeToMonthly } from '../subscriptions/billing-cycle.util';

export interface BurnRateResult {
  monthlyTotal: number;
  yearlyTotal: number;
  currency: string;
  subscriptionCount: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kullanıcının erişebildiği tüm aktif abonelikleri (kişisel + ortak hesap payları)
   * kullanıcının base_currency'sine normalize ederek aylık/yıllık toplam harcamayı hesaplar.
   *
   * Not: Üretimde `exchange_rates` tablosundan güncel kur çekilir; bu iskelette
   * basitlik için 1:1 varsayılır — TODO: gerçek kur servisiyle değiştirilecek.
   */
  async calculateBurnRate(userId: string): Promise<BurnRateResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const personalSubs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active', deletedAt: null, sharedAccountId: null },
    });

    // Ortak hesaplardaki abonelikler için kullanıcının kendi payı (cost_splits) esas alınır,
    // aboneliğin tam fiyatı değil — aksi halde kullanıcı arkadaşının payını da "harcaması" gibi görünür.
    const sharedSplits = await this.prisma.costSplit.findMany({
      where: { userId, subscription: { status: 'active', deletedAt: null } },
      include: { subscription: true },
      distinct: ['subscriptionId'],
      orderBy: { billingPeriodStart: 'desc' },
    });

    let monthlyTotal = 0;
    for (const sub of personalSubs) {
      monthlyTotal += normalizeToMonthly(Number(sub.price), sub.billingCycle, sub.customCycleDays);
    }
    for (const split of sharedSplits) {
      monthlyTotal += normalizeToMonthly(
        Number(split.computedAmount),
        split.subscription.billingCycle,
        split.subscription.customCycleDays,
      );
    }

    return {
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
      currency: user.baseCurrency,
      subscriptionCount: personalSubs.length + sharedSplits.length,
    };
  }

  async spendingByCategory(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active', deletedAt: null },
      include: { category: true },
    });

    const grouped = new Map<string, { categoryName: string; monthlyTotal: number }>();
    for (const sub of subs) {
      const key = sub.categoryId ?? 'uncategorized';
      const name = sub.category?.name ?? 'Kategorisiz';
      const monthly = normalizeToMonthly(Number(sub.price), sub.billingCycle, sub.customCycleDays);

      const existing = grouped.get(key);
      if (existing) {
        existing.monthlyTotal += monthly;
      } else {
        grouped.set(key, { categoryName: name, monthlyTotal: monthly });
      }
    }

    return Array.from(grouped.values())
      .map((v) => ({ ...v, monthlyTotal: Math.round(v.monthlyTotal * 100) / 100 }))
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  }

  async upcomingRenewals(userId: string, days: number) {
    const today = new Date();
    const horizon = new Date();
    horizon.setDate(today.getDate() + days);

    return this.prisma.subscription.findMany({
      where: {
        userId,
        status: 'active',
        deletedAt: null,
        nextBillingDate: { gte: today, lte: horizon },
      },
      include: { serviceProvider: true, category: true },
      orderBy: { nextBillingDate: 'asc' },
    });
  }
}
