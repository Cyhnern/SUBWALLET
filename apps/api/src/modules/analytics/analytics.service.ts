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

function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /**
   * Tek kaynak (Single Source of Truth): Kullanıcının kişisel aktif abonelikleri
   * artı üyesi olduğu ortak hesapların aktif abonelikleri (üye sayısına bölünmüş payları)
   * üzerinden anlık döviz kuru dönüşümlü aylık harcama paylarını hesaplar.
   */
  private async monthlyShares(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const targetCurrency = user.baseCurrency || 'TRY';

    const personalSubs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active', deletedAt: null, sharedAccountId: null },
      include: { category: true },
    });

    const sharedSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        sharedAccountId: { not: null },
        sharedAccount: { members: { some: { userId } } },
      },
      include: {
        category: true,
        sharedAccount: { include: { members: true } },
      },
    });

    const items: Array<{
      subId: string;
      categoryId: string | null;
      categoryName: string;
      colorHex: string | null;
      monthlyConverted: number;
    }> = [];

    for (const sub of personalSubs) {
      try {
        const monthlyInSubCurrency = normalizeToMonthly(Number(sub.price), sub.billingCycle, sub.customCycleDays);
        const convertedMonthly = this.exchangeRates.convert(monthlyInSubCurrency, sub.currency, targetCurrency);
        items.push({
          subId: sub.id,
          categoryId: sub.categoryId,
          categoryName: sub.category?.name ?? 'Kategorisiz',
          colorHex: sub.category?.colorHex ?? null,
          monthlyConverted: convertedMonthly,
        });
      } catch (err) {
        this.logger.warn(`Bozuk para birimli kişisel abonelik atlandı (subId=${sub.id}): ${err}`);
      }
    }

    for (const sub of sharedSubs) {
      try {
        const memberCount = sub.sharedAccount?.members?.length ?? 1;
        if (memberCount === 0) continue;

        const monthlyInSubCurrency = normalizeToMonthly(Number(sub.price), sub.billingCycle, sub.customCycleDays);
        const fullConverted = this.exchangeRates.convert(monthlyInSubCurrency, sub.currency, targetCurrency);
        const userShare = Math.round((fullConverted / memberCount) * 100) / 100;

        items.push({
          subId: sub.id,
          categoryId: sub.categoryId,
          categoryName: sub.category?.name ?? 'Kategorisiz',
          colorHex: sub.category?.colorHex ?? null,
          monthlyConverted: userShare,
        });
      } catch (err) {
        this.logger.warn(`Bozuk para birimli ortak abonelik atlandı (subId=${sub.id}): ${err}`);
      }
    }

    return { targetCurrency, items };
  }

  async calculateBurnRate(userId: string): Promise<BurnRateResult> {
    const { targetCurrency, items } = await this.monthlyShares(userId);
    const monthlyTotal = items.reduce((sum, i) => sum + i.monthlyConverted, 0);

    return {
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
      currency: targetCurrency,
      subscriptionCount: items.length,
      exchangeRateStatus: this.exchangeRates.getStatus(),
    };
  }

  async spendingByCategory(userId: string) {
    const { items } = await this.monthlyShares(userId);

    const grouped = new Map<
      string,
      { categoryName: string; monthlyTotal: number; colorHex: string | null }
    >();

    for (const item of items) {
      const key = item.categoryId ?? 'uncategorized';
      const existing = grouped.get(key);
      if (existing) {
        existing.monthlyTotal += item.monthlyConverted;
      } else {
        grouped.set(key, {
          categoryName: item.categoryName,
          monthlyTotal: item.monthlyConverted,
          colorHex: item.colorHex,
        });
      }
    }

    const rows = Array.from(grouped.values()).map((v) => ({
      ...v,
      monthlyTotal: Math.round(v.monthlyTotal * 100) / 100,
    }));
    const grandTotal = rows.reduce((sum, r) => sum + r.monthlyTotal, 0);

    if (grandTotal === 0) {
      return rows.map((v) => ({ ...v, sharePercent: 0 })).sort((a, b) => b.monthlyTotal - a.monthlyTotal);
    }

    // En Büyük Kalan Yöntemi (Largest Remainder Method) ile %100 toplam garantisi
    const rawShares = rows.map((v) => {
      const exact = (v.monthlyTotal / grandTotal) * 100;
      const floored = Math.floor(exact);
      return {
        ...v,
        exact,
        floored,
        remainder: exact - floored,
      };
    });

    const totalFloored = rawShares.reduce((sum, s) => sum + s.floored, 0);
    const diff = 100 - totalFloored;

    rawShares.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < Math.max(0, diff); i++) {
      if (rawShares[i]) {
        rawShares[i].floored += 1;
      }
    }

    return rawShares
      .map((v) => ({
        categoryName: v.categoryName,
        monthlyTotal: v.monthlyTotal,
        colorHex: v.colorHex,
        sharePercent: v.floored,
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
    lines.push([csvCell('SUBWALLET ABONELIK & BUTCE RAPORU')].join(','));
    lines.push([csvCell('Kullanici'), csvCell(`${user.fullName} (${user.email})`)].join(','));
    lines.push([csvCell('Rapor Tarihi'), csvCell(new Date().toLocaleDateString('tr-TR'))].join(','));
    lines.push([csvCell('Aylik Toplam Harcama'), csvCell(`${burnRate.monthlyTotal} ${burnRate.currency}`)].join(','));
    lines.push([csvCell('Yillik Projeksiyon'), csvCell(`${burnRate.yearlyTotal} ${burnRate.currency}`)].join(','));
    lines.push([csvCell('Aktif Abonelik Sayisi'), csvCell(burnRate.subscriptionCount)].join(','));
    lines.push('');

    lines.push(
      [
        csvCell('Abonelik/Servis Adı'),
        csvCell('Fiyat'),
        csvCell('Para Birimi'),
        csvCell('Döngü'),
        csvCell('Kategori'),
        csvCell('Durum'),
        csvCell('Sonraki Yenileme'),
        csvCell('Son Kullanım'),
        csvCell('Ortak Hesap'),
      ].join(','),
    );

    for (const sub of subs) {
      const name = sub.serviceProvider?.name ?? sub.customName ?? 'İsimsiz Abonelik';
      const category = sub.category?.name ?? 'Kategorisiz';
      const shared = sub.sharedAccount?.name ?? 'Kişisel';
      const nextDate = sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString('tr-TR') : '—';
      const lastUsed = sub.lastUsedAt ? new Date(sub.lastUsedAt).toLocaleDateString('tr-TR') : '—';

      lines.push(
        [
          csvCell(name),
          csvCell(sub.price),
          csvCell(sub.currency),
          csvCell(sub.billingCycle),
          csvCell(category),
          csvCell(sub.status),
          csvCell(nextDate),
          csvCell(lastUsed),
          csvCell(shared),
        ].join(','),
      );
    }

    lines.push('');
    lines.push([csvCell('KATEGORI DAGILIMI')].join(','));
    lines.push([csvCell('Kategori Adı'), csvCell(`Aylık Tutar (${burnRate.currency})`), csvCell('Pay (%)')].join(','));
    for (const cat of categorySpending) {
      lines.push([csvCell(cat.categoryName), csvCell(cat.monthlyTotal), csvCell(`%${cat.sharePercent}`)].join(','));
    }

    return lines.join('\r\n');
  }
}
