import {
  FinancialRateLimitService,
  FinancialRateLimitError,
} from './financial-rate-limit.service';

// In-memory stand-in for RedisService — only the two methods the guard
// uses (incr, set). Each instance is a fresh counter store.
function makeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    incr: jest.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    set: jest.fn(async () => undefined),
  };
}

function makeService(redis: ReturnType<typeof makeRedis>) {
  return new FinancialRateLimitService(redis as any);
}

const base = { providerId: 'prov-1', kind: 'income' as const, amount: 1200 };

describe('FinancialRateLimitService — per-transaction amount', () => {
  it('allows a normal trades amount', async () => {
    const svc = makeService(makeRedis());
    await expect(svc.assertWithinLimits(base)).resolves.toBeUndefined();
  });

  it('blocks an absurd single amount with reason single_tx_amount', async () => {
    const svc = makeService(makeRedis());
    await expect(
      svc.assertWithinLimits({ ...base, amount: svc.maxSingleTx + 1 }),
    ).rejects.toMatchObject({ reason: 'single_tx_amount' });
  });

  it('blocks before touching Redis when the amount is absurd', async () => {
    const redis = makeRedis();
    const svc = makeService(redis);
    await expect(
      svc.assertWithinLimits({ ...base, amount: svc.maxSingleTx + 1 }),
    ).rejects.toBeInstanceOf(FinancialRateLimitError);
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe('FinancialRateLimitService — rate / circuit breaker', () => {
  it('blocks once the hourly burst limit is exceeded', async () => {
    const svc = makeService(makeRedis());
    // maxHourlyWrites writes succeed; the next one trips the breaker.
    for (let i = 0; i < svc.maxHourlyWrites; i++) {
      await expect(svc.assertWithinLimits(base)).resolves.toBeUndefined();
    }
    await expect(svc.assertWithinLimits(base)).rejects.toMatchObject({
      reason: 'hourly_rate',
    });
  });

  it('counts each provider independently', async () => {
    const svc = makeService(makeRedis());
    for (let i = 0; i < svc.maxHourlyWrites; i++) {
      await svc.assertWithinLimits({ ...base, providerId: 'prov-A' });
    }
    // A different provider starts from zero, so this write passes.
    await expect(
      svc.assertWithinLimits({ ...base, providerId: 'prov-B' }),
    ).resolves.toBeUndefined();
  });
});

describe('FinancialRateLimitService — fail open', () => {
  it('allows the write when Redis throws (infra blip must not block a maestro)', async () => {
    const redis = makeRedis();
    redis.incr.mockRejectedValueOnce(new Error('redis down'));
    const svc = makeService(redis);
    await expect(svc.assertWithinLimits(base)).resolves.toBeUndefined();
  });
});
