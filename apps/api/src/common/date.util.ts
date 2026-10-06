/** UTC takvim gününün başlangıcı — Prisma `@db.Date` alanlarıyla karşılaştırmak için. */
export function startOfUtcDay(from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
}

/** Bugünden `daysAhead` gün sonrasının UTC gün sonu (dahil). */
export function utcHorizonEnd(daysAhead: number, from = new Date()): Date {
  const start = startOfUtcDay(from);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + daysAhead);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
