import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';

describe('ExchangeRatesService', () => {
  let service: ExchangeRatesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ExchangeRatesService],
    }).compile();

    service = module.get(ExchangeRatesService);
  });

  it('100 USD -> TRY çevrimini doğru hesaplar', () => {
    const result = service.convert(100, 'USD', 'TRY');
    expect(result).toBeGreaterThan(3000);
  });

  it('Aynı para birimi çevriminde aynı miktarı döner', () => {
    const result = service.convert(150, 'TRY', 'TRY');
    expect(result).toBe(150);
  });

  it('Desteklenmeyen para biriminde BadRequestException fırlatır', () => {
    expect(() => service.convert(100, 'XYZ', 'TRY')).toThrow(BadRequestException);
  });

  it('Desteklenen para birimleri haritasını döner', () => {
    const rates = service.getRatesMap('TRY');
    expect(rates.TRY).toBe(1);
    expect(rates.USD).toBeDefined();
  });
});
