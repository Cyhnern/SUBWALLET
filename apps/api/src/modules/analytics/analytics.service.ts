import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { startOfUtcDay, utcHorizonEnd } from '../../common/date.util';
import { normalizeToMonthly } from '../subscriptions/billing-cycle.util';
import { ExchangeRatesService, ExchangeRateStatus } from './exchange-rates.service';

export interface BurnRateResult {
  monthlyTotal: number;
  yearlyTotal: number;
  currency: string;
  subscriptionCount: number;
  exchangeRateStatus: ExchangeRateStatus;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /**
   * Kullanıcının tüm aktif aboneliklerini (kişisel + ortak hesap payları)
   * kullanıcının baseCurrency'sine anlık kurlar üzerinden çevirerek harcamayı hesaplar.
   */
  async calculateBurnRate(userId: string): Promise<BurnRateResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const targetCurrency = user.baseCurrency || 'TRY';

    const personalSubs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active', deletedAt: null, sharedAccountId: null },
    });

    const sharedSplits = await this.prisma.costSplit.findMany({
      where: { userId, subscription: { status: 'active', deletedAt: null } },
      include: { subscription: true },
      distinct: ['subscriptionId'],
      orderBy: { billingPeriodStart: 'desc' },
    });

    let monthlyTotal = 0;
    for (const sub of personalSubs) {
      try {
        const monthlyInSubCurrency = normalizeToMonthly(Number(sub.price), sub.billingCycle, sub.customCycleDays);
        const convertedMonthly = this.exchangeRates.convert(monthlyInSubCurrency, sub.currency, targetCurrency);
        monthlyTotal += convertedMonthly;
      } catch (err) {
        this.logger.warn(`Bozuk para birimli abonelik atlandı (subId=${sub.id}): ${err}`);
      }
    }
    for (const split of sharedSplits) {
      try {
        const monthlyInSubCurrency = normalizeToMonthly(
          Number(split.computedAmount),
          split.subscription.billingCycle,
          split.subscription.customCycleDays,
        );
        const convertedMonthly = this.exchangeRates.convert(
          monthlyInSubCurrency,
          split.subscription.currency,
          targetCurrency,
        );
        monthlyTotal += convertedMonthly;
      } catch (err) {
        this.logger.warn(`Bozuk para birimli ortak pay atlandı (splitId=${split.id}): ${err}`);
      }
    }

    return {
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
      currency: targetCurrency,
      subscriptionCount: personalSubs.length + sharedSplits.length,
      exchangeRateStatus: this.exchangeRates.getStatus(),
    };
  }

  async spendingByCategory(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const targetCurrency = user.baseCurrency || 'TRY';

    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active', deletedAt: null },
      include: { category: true },
    });

    const grouped = new Map<
      string,
      { categoryName: string; monthlyTotal: number; colorHex: string | null }
    >();
    for (const sub of subs) {
      try {
        const key = sub.categoryId ?? 'uncategorized';
        const name = sub.category?.name ?? 'Kategorisiz';
        const monthlyInSubCurrency = normalizeToMonthly(Number(sub.price), sub.billingCycle, sub.customCycleDays);
        const monthly = this.exchangeRates.convert(monthlyInSubCurrency, sub.currency, targetCurrency);

        const existing = grouped.get(key);
        if (existing) {
          existing.monthlyTotal += monthly;
        } else {
          grouped.set(key, {
            categoryName: name,
            monthlyTotal: monthly,
            colorHex: sub.category?.colorHex ?? null,
          });
        }
      } catch (err) {
        this.logger.warn(`Bozuk para birimli abonelik atlandı (subId=${sub.id}): ${err}`);
      }
    }

    const rows = Array.from(grouped.values()).map((v) => ({
      ...v,
      monthlyTotal: Math.round(v.monthlyTotal * 100) / 100,
    }));
    const grandTotal = rows.reduce((sum, r) => sum + r.monthlyTotal, 0);

    return rows
      .map((v) => ({
        ...v,
        sharePercent: grandTotal === 0 ? 0 : Math.round((v.monthlyTotal / grandTotal) * 100),
      }))
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  }

  async upcomingRenewals(userId: string, days: number) {
    const start = startOfUtcDay();
    const horizon = utcHorizonEnd(days);

    return this.prisma.subscription.findMany({
      where: {
        userId,
        status: 'active',
        deletedAt: null,
        nextBillingDate: { gte: start, lte: horizon },
      },
      include: { serviceProvider: true, category: true },
      orderBy: { nextBillingDate: 'asc' },
    });
  }

  async generateCsvReport(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const burnRate = await this.calculateBurnRate(userId);
    const categorySpending = await this.spendingByCategory(userId);
    const subs = await this.prisma.subscription.findMany({
      where: { userId, deletedAt: null },
      include: { serviceProvider: true, category: true, sharedAccount: true },
      orderBy: { createdAt: 'desc' },
    });

    const lines: string[] = [];
    lines.push(`"SUBWALLET ABONELIK & BUTCE RAPORU"`);
    lines.push(`"Kullanici","${user.fullName} (${user.email})"`);
    lines.push(`"Rapor Tarihi","${new Date().toLocaleDateString('tr-TR')}"`);
    lines.push(`"Aylik Toplam Harcama","${burnRate.monthlyTotal} ${burnRate.currency}"`);
    lines.push(`"Yillik Projeksiyon","${burnRate.yearlyTotal} ${burnRate.currency}"`);
    lines.push(`"Aktif Abonelik Sayisi","${burnRate.subscriptionCount}"`);
    lines.push('');

    lines.push(`"Abonelik/Servis Adı","Fiyat","Para Birimi","Döngü","Kategori","Durum","Sonraki Yenileme","Son Kullanım","Ortak Hesap"`);

    for (const sub of subs) {
      const name = sub.serviceProvider?.name ?? sub.customName ?? 'İsimsiz Abonelik';
      const category = sub.category?.name ?? 'Kategorisiz';
      const shared = sub.sharedAccount?.name ?? 'Kişisel';
      const nextDate = sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString('tr-TR') : '—';
      const lastUsed = sub.lastUsedAt ? new Date(sub.lastUsedAt).toLocaleDateString('tr-TR') : '—';

      lines.push(
        `"${name}","${sub.price}","${sub.currency}","${sub.billingCycle}","${category}","${sub.status}","${nextDate}","${lastUsed}","${shared}"`
      );
    }

    lines.push('');
    lines.push(`"KATEGORI DAGILIMI"`);
    lines.push(`"Kategori Adı","Aylık Tutar (${burnRate.currency})","Pay (%)"`);
    for (const cat of categorySpending) {
      lines.push(`"${cat.categoryName}","${cat.monthlyTotal}","%${cat.sharePercent}"`);
    }

    return lines.join('\n');
  }
}
