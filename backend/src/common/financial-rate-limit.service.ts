import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../config/redis.service';
import {
  FINANCIAL_EVENT,
  emitFinancialEvent,
  type FinancialKind,
} from './utils/financial-audit';

// ──────────────────────────────────────────────
// Financial rate-limit guard (Gap 1 — agent-security audit, jun 2026)
// ──────────────────────────────────────────────
//
// Chalán turns natural-language WhatsApp messages into money-mutating tool
// calls (registrar_ingreso, registrar_gasto, ...). The integrity firewall
// (Cap. 44 / 45 / 47) already proves "if Chalán confirmed it, it exists"
// and blocks fake confirmations and invented figures. What it does NOT
// bound is *volume*: a loop, a bug, a spammed thread, or a compromised
// session can drive hundreds of real writes — or a single absurd amount —
// with every individual write looking perfectly valid.
//
// This guard is an independent control (per the LLM-agent security threat
// model): it caps per-transaction amount and per-provider write rate, and
// trips a circuit breaker on bursts. It lives at the service boundary
// (IncomeService.create / ExpenseService.create) so it covers every
// entrypoint — WhatsApp today, the web dashboard tomorrow — not one handler.
//
// Limits are [andamio] defaults, tuned for a human maestro logging by hand
// over WhatsApp (a real operator rarely exceeds a few dozen writes a day).
// Override per-deployment via env. Counters live in Redis with a per-process
// in-memory fallback (RedisService); on a multi-instance deploy that fallback
// splits counts — acceptable at current scale, revisit when Chalán runs more
// than one backend instance.

/** Thrown when a financial write would breach a limit. `userMessage` is
 *  Chalán-voice and safe to surface to the maestro verbatim. */
export class FinancialRateLimitError extends Error {
  constructor(
    readonly reason: 'single_tx_amount' | 'hourly_rate' | 'daily_rate',
    readonly userMessage: string,
  ) {
    super(`financial rate limit: ${reason}`);
    this.name = 'FinancialRateLimitError';
  }
}

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

@Injectable()
export class FinancialRateLimitService {
  private readonly logger = new Logger(FinancialRateLimitService.name);

  /** A single write above this almost certainly is a fat-finger or an
   *  injected figure, not a real trades transaction (MXN). */
  readonly maxSingleTx = envInt('FINANCIAL_MAX_SINGLE_TX', 500_000);
  /** Burst circuit breaker: more writes than this in a rolling hour means
   *  something automated, not a human typing. */
  readonly maxHourlyWrites = envInt('FINANCIAL_MAX_HOURLY_WRITES', 30);
  /** Daily ceiling: even a busy maestro logs a few dozen entries a day. */
  readonly maxDailyWrites = envInt('FINANCIAL_MAX_DAILY_WRITES', 100);

  constructor(private redis: RedisService) {}

  /**
   * Throws {@link FinancialRateLimitError} when a write would breach a
   * limit. Call before the DB write in Income/Expense create().
   *
   * Fails OPEN on Redis errors — a human maestro must never be blocked by
   * an infra blip. The per-transaction amount check needs no state and
   * always runs, so the absurd-amount floor holds even when Redis is down.
   */
  async assertWithinLimits(input: {
    providerId: string;
    /** Counters are shared across kinds on purpose: the breaker bounds the
     *  provider's *total* money-mutation rate, not each kind separately. */
    kind: FinancialKind | 'payment_link';
    amount: number;
  }): Promise<void> {
    const { providerId, kind, amount } = input;

    if (amount > this.maxSingleTx) {
      this.block(
        providerId,
        kind,
        amount,
        'single_tx_amount',
        `Ese monto ($${amount.toLocaleString('es-MX')}) se ve fuera de lo ` +
          `normal, así que no lo registré. Si es correcto, dímelo otra vez y ` +
          `lo confirmo.`,
      );
    }

    let hourly: number;
    let daily: number;
    try {
      hourly = await this.bump(this.hourKey(providerId), 3600);
      daily = await this.bump(this.dayKey(providerId), 86400);
    } catch (err) {
      this.logger.error(
        `Rate-limit counters unavailable, allowing write for ${providerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return; // fail open
    }

    if (hourly > this.maxHourlyWrites) {
      this.block(
        providerId,
        kind,
        amount,
        'hourly_rate',
        'Detecté muchísimos registros muy rápido y me detuve por seguridad. ' +
          'Si de verdad necesitas cargar tantos, dame unos minutos y seguimos.',
      );
    }
    if (daily > this.maxDailyWrites) {
      this.block(
        providerId,
        kind,
        amount,
        'daily_rate',
        'Llegamos al tope de registros por hoy. Lo hago así para que ningún ' +
          'error te llene las cuentas. Mañana seguimos, o avísame si fue a propósito.',
      );
    }
  }

  private block(
    providerId: string,
    kind: FinancialKind | 'payment_link',
    amount: number,
    reason: 'single_tx_amount' | 'hourly_rate' | 'daily_rate',
    userMessage: string,
  ): never {
    emitFinancialEvent(this.logger, {
      event: FINANCIAL_EVENT.WRITE_BLOCKED,
      // payload.kind is the integrity FinancialKind (expense|income); for a
      // payment link there's no ledger kind, so surface it via `reason`.
      ...(kind === 'payment_link' ? {} : { kind }),
      reason: kind === 'payment_link' ? `payment_link:${reason}` : reason,
      providerId,
      amount,
    });
    throw new FinancialRateLimitError(reason, userMessage);
  }

  /** Increment a windowed counter, setting its TTL on the first write of
   *  the window so it resets cleanly. RedisService exposes no `expire`, so
   *  the first-write `set` (with the same value) carries the TTL. */
  private async bump(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.set(key, '1', ttlSeconds);
    }
    return count;
  }

  private hourKey(providerId: string): string {
    // YYYY-MM-DDTHH bucket (UTC). Exact window edges don't matter for a
    // burst breaker — what matters is "many writes close together".
    return `frl:h:${providerId}:${new Date().toISOString().slice(0, 13)}`;
  }

  private dayKey(providerId: string): string {
    return `frl:d:${providerId}:${new Date().toISOString().slice(0, 10)}`;
  }
}
