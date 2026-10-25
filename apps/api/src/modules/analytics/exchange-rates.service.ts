import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SUPPORTED_CURRENCIES } from '../../common/currency';

// Fallback exchange rates relative to USD
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1.0,
  TRY: 34.25,
  EUR: 0.915,
  GBP: 0.765,
};

@Injectable()
export class ExchangeRatesService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private ratesCache: Record<string, number> = { ...FALLBACK_USD_RATES };
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;

  async onModuleInit() {
    // Non-blocking background fetch so module initialization never hangs or times out in tests/startup
    this.refreshRatesIfStale().catch((err) => {
      this.logger.warn(`Başlangıç kur güncellemesi uyarısı: ${err}`);
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCronRefresh() {
    await this.refreshRatesIfStale();
  }

  private validateCurrency(currency: string): string {
    const curr = (currency || '').toUpperCase().trim();
    if (!curr || !(SUPPORTED_CURRENCIES as readonly string[]).includes(curr)) {
      throw new BadRequestException(
        `Desteklenmeyen veya geçersiz para birimi: '${currency}'. Desteklenenler: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }
    return curr;
  }

  async refreshRatesIfStale(): Promise<void> {
    const now = Date.now();
    if (this.lastFetchTime > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && data.rates) {
          this.ratesCache = {
            USD: 1.0,
            TRY: data.rates.TRY ?? FALLBACK_USD_RATES.TRY,
            EUR: data.rates.EUR ?? FALLBACK_USD_RATES.EUR,
            GBP: data.rates.GBP ?? FALLBACK_USD_RATES.GBP,
          };
          this.lastFetchTime = now;
          this.logger.log('Döviz kurları canlı API üzerinden güncellendi');
          return;
        }
      }
    } catch (error) {
      this.logger.warn('Canlı döviz kuru çekilemedi, yedek kurlar kullanılıyor');
    }
  }

  convert(amount: number, fromCurrency: string, toCurrency: string): number {
    const from = this.validateCurrency(fromCurrency);
    const to = this.validateCurrency(toCurrency);

    if (from === to) return amount;

    // Background refresh trigger if stale
    this.refreshRatesIfStale().catch(() => {});

    const fromRateToUsd = this.ratesCache[from] ?? FALLBACK_USD_RATES[from];
    const toRateToUsd = this.ratesCache[to] ?? FALLBACK_USD_RATES[to];

    const amountInUsd = amount / fromRateToUsd;
    const convertedAmount = amountInUsd * toRateToUsd;

    return Math.round(convertedAmount * 100) / 100;
  }

  getRatesMap(baseCurrency = 'TRY'): Record<string, number> {
    const base = this.validateCurrency(baseCurrency);

    // Background refresh trigger if stale
    this.refreshRatesIfStale().catch(() => {});

    const baseRateToUsd = this.ratesCache[base] ?? FALLBACK_USD_RATES[base];

    const rates: Record<string, number> = {};
    for (const cur of SUPPORTED_CURRENCIES) {
      const curRateToUsd = this.ratesCache[cur] ?? FALLBACK_USD_RATES[cur];
      rates[cur] = Math.round((curRateToUsd / baseRateToUsd) * 10000) / 10000;
    }
    return rates;
  }
}
