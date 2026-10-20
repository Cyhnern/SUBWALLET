import { Injectable, Logger } from '@nestjs/common';

// Default exchange rates relative to USD
const USD_RATES: Record<string, number> = {
  USD: 1.0,
  TRY: 34.25,
  EUR: 0.915,
  GBP: 0.765,
};

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  /**
   * Convert an amount from one currency to another using exchange rates
   */
  convert(amount: number, fromCurrency: string, toCurrency: string): number {
    const from = (fromCurrency || 'TRY').toUpperCase().trim();
    const to = (toCurrency || 'TRY').toUpperCase().trim();

    if (from === to) return amount;

    const fromRateToUsd = USD_RATES[from] ?? (from === 'TRY' ? 34.25 : 1.0);
    const toRateToUsd = USD_RATES[to] ?? (to === 'TRY' ? 34.25 : 1.0);

    // Convert 'from' amount to USD, then from USD to 'to' currency
    const amountInUsd = amount / fromRateToUsd;
    const convertedAmount = amountInUsd * toRateToUsd;

    return Math.round(convertedAmount * 100) / 100;
  }

  getRatesMap(baseCurrency = 'TRY'): Record<string, number> {
    const base = baseCurrency.toUpperCase().trim();
    const baseRateToUsd = USD_RATES[base] ?? (base === 'TRY' ? 34.25 : 1.0);

    const rates: Record<string, number> = {};
    for (const cur of Object.keys(USD_RATES)) {
      const curRateToUsd = USD_RATES[cur];
      rates[cur] = Math.round((curRateToUsd / baseRateToUsd) * 10000) / 10000;
    }
    return rates;
  }
}
