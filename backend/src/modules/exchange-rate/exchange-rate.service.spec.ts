import axios from 'axios';
import {
  ExchangeRateService,
  ExchangeRateUnavailableError,
} from './exchange-rate.service';

jest.mock('axios');

const getMock = jest.fn();

function makeService() {
  (axios.create as jest.Mock).mockReturnValue({ get: getMock });

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'EXCHANGE_RATE_PROVIDER') return 'frankfurter';
      if (key === 'EXCHANGE_RATE_BASE_URL')
        return 'https://api.frankfurter.dev/v1';
      return undefined;
    }),
  };

  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new ExchangeRateService(config as any, redis as any),
    redis,
  };
}

describe('ExchangeRateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for MXN expenses without calling the provider', async () => {
    const { service, redis } = makeService();

    const result = await service.convertToMxn({
      amount: 500,
      currency: 'MXN',
      date: new Date('2026-06-22T15:00:00Z'),
      timezone: 'America/Mexico_City',
    });

    expect(result).toBeNull();
    expect(redis.get).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('converts USD to MXN using the historical date response', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        date: '2026-06-21',
        rates: { MXN: 18.5 },
      },
    });
    const { service, redis } = makeService();

    const result = await service.convertToMxn({
      amount: 35,
      currency: 'USD',
      date: new Date('2026-06-21T18:00:00Z'),
      timezone: 'America/Mexico_City',
    });

    expect(result).toMatchObject({
      originalAmount: 35,
      originalCurrency: 'USD',
      convertedAmount: 647.5,
      convertedCurrency: 'MXN',
      exchangeRate: 18.5,
      exchangeRateProvider: 'frankfurter',
    });
    expect(getMock).toHaveBeenCalledWith('/2026-06-21', {
      params: { base: 'USD', symbols: 'MXN' },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'fx:frankfurter:USD:MXN:2026-06-21',
      JSON.stringify({ rate: 18.5, date: '2026-06-21' }),
      expect.any(Number),
    );
  });

  it('throws a domain error when no rate is available', async () => {
    getMock.mockResolvedValueOnce({ data: { date: '2026-06-21', rates: {} } });
    const { service } = makeService();

    await expect(
      service.convertToMxn({
        amount: 35,
        currency: 'USD',
        date: new Date('2026-06-21T18:00:00Z'),
        timezone: 'America/Mexico_City',
      }),
    ).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });
});
