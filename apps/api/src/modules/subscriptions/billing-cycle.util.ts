import { addDays, addMonths, addYears } from 'date-fns';
import { BillingCycle } from '@prisma/client';

export function addCycles(
  anchor: Date,
  cycle: BillingCycle,
  customDays: number | null | undefined,
  n: number,
): Date {
  switch (cycle) {
    case 'weekly':
      return addDays(anchor, 7 * n);
    case 'monthly':
      return addMonths(anchor, n);
    case 'quarterly':
      return addMonths(anchor, 3 * n);
    case 'yearly':
      return addYears(anchor, n);
    case 'custom':
      if (!customDays || customDays <= 0) {
        throw new Error('custom_cycle_days pozitif olmalı');
      }
      return addDays(anchor, customDays * n);
    default:
      throw new Error(`Bilinmeyen fatura döngüsü: ${cycle}`);
  }
}

export function nextBillingDateOnOrAfter(
  anchor: Date,
  cycle: BillingCycle,
  customDays: number | null | undefined,
  after: Date,
): Date {
  for (let n = 1; n <= 5000; n++) {
    const d = addCycles(anchor, cycle, customDays, n);
    if (d >= after) return d;
  }
  throw new Error('Fatura tarihi hesaplanamadı');
}

export function calculateNextBillingDate(
  fromDate: Date,
  cycle: BillingCycle,
  customCycleDays?: number | null,
): Date {
  return addCycles(fromDate, cycle, customCycleDays, 1);
}

const MONTHLY_MULTIPLIER: Partial<Record<BillingCycle, number>> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

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
