import { addDays, addMonths, addYears } from 'date-fns';
import { BillingCycle } from '@prisma/client';

/**
 * Bir sonraki fatura tarihini hesaplar. Ay sonu kenar durumları
 * (ör. 31 Ocak + 1 ay) date-fns tarafından otomatik olarak en yakın
 * geçerli tarihe (28/29 Şubat) indirgenir.
 */
export function calculateNextBillingDate(
  fromDate: Date,
  cycle: BillingCycle,
  customCycleDays?: number | null,
): Date {
  switch (cycle) {
    case 'weekly':
      return addDays(fromDate, 7);
    case 'monthly':
      return addMonths(fromDate, 1);
    case 'quarterly':
      return addMonths(fromDate, 3);
    case 'yearly':
      return addYears(fromDate, 1);
    case 'custom':
      if (!customCycleDays || customCycleDays <= 0) {
        throw new Error('custom_cycle_days pozitif bir değer olmalı');
      }
      return addDays(fromDate, customCycleDays);
    default:
      throw new Error(`Bilinmeyen fatura döngüsü: ${cycle}`);
  }
}

const MONTHLY_MULTIPLIER: Partial<Record<BillingCycle, number>> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Herhangi bir fatura döngüsündeki fiyatı aylık normalize eder (burn rate hesaplaması için). */
export function normalizeToMonthly(
  price: number,
  cycle: BillingCycle,
  customCycleDays?: number | null,
): number {
  if (cycle === 'custom') {
    if (!customCycleDays) throw new Error('custom_cycle_days zorunlu');
    return price * (30 / customCycleDays);
  }
  return price * (MONTHLY_MULTIPLIER[cycle] ?? 1);
}
