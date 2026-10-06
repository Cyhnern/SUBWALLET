import { calculateNextBillingDate, normalizeToMonthly } from './billing-cycle.util';

describe('calculateNextBillingDate', () => {
  it('haftalık döngüde 7 gün ekler', () => {
    const result = calculateNextBillingDate(new Date('2026-07-01'), 'weekly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-08');
  });

  it('aylık döngüde 1 ay ekler', () => {
    const result = calculateNextBillingDate(new Date('2026-07-15'), 'monthly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-08-15');
  });

  it('yıllık döngüde 1 yıl ekler', () => {
    const result = calculateNextBillingDate(new Date('2026-07-15'), 'yearly');
    expect(result.toISOString().slice(0, 10)).toBe('2027-07-15');
  });

  it('ay sonu kenar durumunu doğru yönetir (31 Ocak + 1 ay = 28 Şubat)', () => {
    const result = calculateNextBillingDate(new Date('2026-01-31'), 'monthly');
    // 2026 artık yıl değil, bu yüzden Şubat 28 çeker.
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('artık yılda 31 Ocak + 1 ay = 29 Şubat', () => {
    const result = calculateNextBillingDate(new Date('2028-01-31'), 'monthly');
    expect(result.toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('custom döngüde verilen gün sayısını ekler', () => {
    const result = calculateNextBillingDate(new Date('2026-07-01'), 'custom', 45);
    expect(result.toISOString().slice(0, 10)).toBe('2026-08-15');
  });

  it('custom döngüde gün sayısı verilmezse hata fırlatır', () => {
    expect(() => calculateNextBillingDate(new Date('2026-07-01'), 'custom')).toThrow();
  });
});

describe('normalizeToMonthly', () => {
  it('haftalık fiyatı doğru aylık değere çevirir', () => {
    // 10 * 52/12 ≈ 43.33
    expect(normalizeToMonthly(10, 'weekly')).toBeCloseTo(43.33, 1);
  });

  it('aylık fiyatı olduğu gibi döner', () => {
    expect(normalizeToMonthly(15.99, 'monthly')).toBe(15.99);
  });

  it('yıllık fiyatı 12ye böler', () => {
    expect(normalizeToMonthly(120, 'yearly')).toBe(10);
  });

  it('çeyreklik fiyatı 3e böler', () => {
    expect(normalizeToMonthly(30, 'quarterly')).toBe(10);
  });

  it('custom döngüde 30 güne oranlar', () => {
    // 90 günlük 90 TL'lik abonelik -> günde 1 TL -> ayda 30 TL
    expect(normalizeToMonthly(90, 'custom', 90)).toBe(30);
  });
});
