import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { RedisService } from '../../config/redis.service';

const DEFAULT_PROVIDER = 'frankfurter';
const DEFAULT_BASE_URL = 'https://api.frankfurter.dev/v1';
const DEFAULT_TARGET_CURRENCY = 'MXN';
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export const SUPPORTED_CURRENCIES = [
  'MXN',
  'USD',
  'EUR',
  'CAD',
  'GBP',
  'JPY',
  'BRL',
  'ARS',
  'COP',
  'CLP',
  'PEN',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface ExchangeRateConversion {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  exchangeRate: number;
  exchangeRateProvider: string;
  exchangeRateDate: Date;
}

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

export class ExchangeRateUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExchangeRateUnavailableError';
  }
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly client: AxiosInstance;
  private readonly provider: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.provider =
      this.config.get<string>('EXCHANGE_RATE_PROVIDER') || DEFAULT_PROVIDER;
    this.client = axios.create({
      baseURL:
        this.config.get<string>('EXCHANGE_RATE_BASE_URL') || DEFAULT_BASE_URL,
      timeout: 5000,
    });
  }

  normalizeCurrency(value?: string | null): string {
    if (!value) return DEFAULT_TARGET_CURRENCY;

    const normalized = String(value).trim().toUpperCase();
    const aliases: Record<string, string> = {
      DLL: 'USD',
      DLLS: 'USD',
      DLS: 'USD',
      DOL: 'USD',
      DOLAR: 'USD',
      DOLARES: 'USD',
      DÓLAR: 'USD',
      DÓLARES: 'USD',
      PESO: 'MXN',
      PESOS: 'MXN',
      EURO: 'EUR',
      EUROS: 'EUR',
    };

    return aliases[normalized] || normalized;
  }

  isSupportedCurrency(value: string): value is SupportedCurrency {
    return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency);
  }

  async convertToMxn(input: {
    amount: number;
    currency?: string | null;
    date: Date;
    timezone: string;
  }): Promise<ExchangeRateConversion | null> {
    const from = this.normalizeCurrency(input.currency);
    if (from === DEFAULT_TARGET_CURRENCY) return null;

    if (!this.isSupportedCurrency(from)) {
      throw new ExchangeRateUnavailableError(`Unsupported currency: ${from}`);
    }

    const rateDate = this.formatRateDate(input.date, input.timezone);
    const rate = await this.getRate({
      from,
      to: DEFAULT_TARGET_CURRENCY,
      date: rateDate,
    });

    return {
      originalAmount: input.amount,
      originalCurrency: from,
      convertedAmount: this.roundMoney(input.amount * rate.rate),
      convertedCurrency: DEFAULT_TARGET_CURRENCY,
      exchangeRate: rate.rate,
      exchangeRateProvider: this.provider,
      exchangeRateDate: new Date(`${rate.date}T00:00:00.000Z`),
    };
  }

  private async getRate(input: {
    from: string;
    to: string;
    date: string;
  }): Promise<{ rate: number; date: string }> {
    const cacheKey = `fx:${this.provider}:${input.from}:${input.to}:${input.date}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as { rate: number; date: string };
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const fetched = await this.fetchFrankfurterRate(input);
    await this.redis.set(cacheKey, JSON.stringify(fetched), CACHE_TTL_SECONDS);
    return fetched;
  }

  private async fetchFrankfurterRate(input: {
    from: string;
    to: string;
    date: string;
  }): Promise<{ rate: number; date: string }> {
    try {
      const response = await this.client.get<FrankfurterResponse>(
        `/${input.date}`,
        {
          params: {
            base: input.from,
            symbols: input.to,
          },
        },
      );

      const rate = response.data.rates?.[input.to];
      const responseDate = response.data.date || input.date;
      if (!rate || !Number.isFinite(rate) || rate <= 0) {
        throw new ExchangeRateUnavailableError(
          `No ${input.from}/${input.to} rate for ${input.date}`,
        );
      }

      return { rate, date: responseDate };
    } catch (error) {
      if (error instanceof ExchangeRateUnavailableError) {
        throw error;
      }
      this.logger.warn(
        `FX lookup failed for ${input.from}/${input.to} ${input.date}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ExchangeRateUnavailableError(
        `Could not fetch ${input.from}/${input.to} rate for ${input.date}`,
      );
    }
  }

  private formatRateDate(date: Date, timezone: string): string {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
