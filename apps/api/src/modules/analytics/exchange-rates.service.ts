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

export interface ExchangeRateStatus {
  source: 'live' | 'fallback';
  asOf: Date | null;
}

@Injectable()
export class ExchangeRatesService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private ratesCache: Record<string, number> = { ...FALLBACK_USD_RATES };
  private lastFetchTime = 0;
  private lastAttempt = 0;
  private inFlight: Promise<void> | null = null;
  private readonly CACHE_TTL_MS = 55 * 60 * 1000;
  private readonly RETRY_MS = 60 * 1000;

  async onModuleInit() {
    void this.refreshRatesIfStale();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCronRefresh() {
    await this.refreshRatesIfStale();
  }

  getStatus(): ExchangeRateStatus {
    return {
      source: this.lastFetchTime > 0 && Date.now() - this.lastFetchTime < 6 * 60 * 60 * 1000 ? 'live' : 'fallback',
      asOf: this.lastFetchTime > 0 ? new Date(this.lastFetchTime) : null,
    };
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

  refreshRatesIfStale(): Promise<void> {
    const now = Date.now();
    const fresh = this.lastFetchTime > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS;
    // Taze ise ya da son deneme çok yeniyse (kesinti anında fırtına olmasın) dış istek yapma
    if (fresh || now - this.lastAttempt < this.RETRY_MS) return this.inFlight ?? Promise.resolve();
    this.inFlight ??= this.doRefresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doRefresh(): Promise<void> {
    const now = Date.now();
    this.lastAttempt = now;
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.rates) {
          const newRates: Record<string, number> = { USD: 1.0 };
          let allValid = true;

          for (const cur of SUPPORTED_CURRENCIES) {
            if (cur === 'USD') continue;
            const rate = data.rates[cur];
            if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
              allValid = false;
              break;
            }
            newRates[cur] = rate;
          }

          if (allValid) {
            this.ratesCache = newRates;
            this.lastFetchTime = now;
            this.logger.log('Döviz kurları canlı API üzerinden güncellendi');
            return;
          } else {
            this.logger.warn(
              'Canlı API yanıtında geçersiz/eksik kur değerleri algılandı, kurlar değiştirilmedi',
            );
          }
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

    void this.refreshRatesIfStale();

    const fromRateToUsd = this.ratesCache[from] ?? FALLBACK_USD_RATES[from];
    const toRateToUsd = this.ratesCache[to] ?? FALLBACK_USD_RATES[to];

    const amountInUsd = amount / fromRateToUsd;
    const convertedAmount = amountInUsd * toRateToUsd;

    return Math.round(convertedAmount * 100) / 100;
  }

  getRatesMap(baseCurrency = 'TRY'): Record<string, number> {
    const base = this.validateCurrency(baseCurrency);

    void this.refreshRatesIfStale();

    const baseRateToUsd = this.ratesCache[base] ?? FALLBACK_USD_RATES[base];

    const rates: Record<string, number> = {};
    for (const cur of SUPPORTED_CURRENCIES) {
      const curRateToUsd = this.ratesCache[cur] ?? FALLBACK_USD_RATES[cur];
      rates[cur] = Math.round((curRateToUsd / baseRateToUsd) * 10000) / 10000;
    }
    return rates;
  }
}
