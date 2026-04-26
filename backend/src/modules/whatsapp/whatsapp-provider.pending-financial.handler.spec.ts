/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';
import { AiIntent, type AiResponse } from '../ai/ai.types';
import { PENDING_FIN_PREFIX } from './whatsapp-provider.pending-financial';

// Handler-side tests for Cap. 47 / M1 commit 2 — the planting hook.
// We instantiate the handler with all dependencies as `null` except
// `redis`, which is a minimal mock that records every call. This is
// the same pattern as financial-firewall.spec.ts (Cap. 44) — avoids
// spinning up a full Nest module just to assert on Redis writes.
//
// Coverage target: every gate in `tryPlantPendingFinancial` and
// `plantPendingFinancialDirect`, including the no-overwrite guard,
// the Vero shape (missing=type), the verb shape (missing=amount),
// and the failure modes for both `redis.get` and `redis.set`.

interface RedisCall {
  method: 'get' | 'set' | 'del';
  args: unknown[];
}

interface RedisMock {
  calls: RedisCall[];
  store: Map<string, string>;
  setShouldThrow: boolean;
  getShouldThrow: boolean;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
}

function makeRedisMock(): RedisMock {
  const calls: RedisCall[] = [];
  const store = new Map<string, string>();

  const mock = {
    calls,
    store,
    setShouldThrow: false,
    getShouldThrow: false,
  } as RedisMock;

  mock.get = jest.fn(async (key: string) => {
    calls.push({ method: 'get', args: [key] });
    if (mock.getShouldThrow) throw new Error('redis get down');
    return store.get(key) ?? null;
  });
  mock.set = jest.fn(async (key: string, value: string, ttl?: number) => {
    calls.push({ method: 'set', args: [key, value, ttl] });
    if (mock.setShouldThrow) throw new Error('redis set down');
    store.set(key, value);
  });
  mock.del = jest.fn(async (key: string) => {
    calls.push({ method: 'del', args: [key] });
    store.delete(key);
  });

  return mock;
}

function makeHandler(redis: RedisMock): any {
  const noop = null as any;
  return new (WhatsAppProviderHandler as any)(
    noop, // whatsapp
    noop, // prisma
    redis, // redis ← only dep we exercise
    noop, // bookingsGateway
    noop, // eventEmitter
    noop, // messagesService
    noop, // ratingsService
    noop, // onboardingHandler
    noop, // aiService
    noop, // aiContextService
    noop, // incomeService
    noop, // expenseService
    noop, // recurringExpenseService
    noop, // appointmentsService
    noop, // workspaceService
    noop, // timezoneMigrationService
    noop, // providerModelService
    noop, // queueService
    noop, // remindersService
    noop, // paymentsService
  );
}

const PHONE = '+5215555550000';
const SRC_HASH = 'abc123def456';

function generalResponse(message: string): AiResponse {
  return {
    intent: AiIntent.CONVERSACION_GENERAL,
    message,
    data: {},
  };
}

function findSetCall(redis: RedisMock): RedisCall | undefined {
  return redis.calls.find((c) => c.method === 'set');
}

function decodePlantedState(redis: RedisMock): Record<string, unknown> | null {
  const setCall = findSetCall(redis);
  if (!setCall) return null;
  const [, raw] = setCall.args as [string, string, number | undefined];
  return JSON.parse(raw);
}

describe('Cap. 47 / M1 — tryPlantPendingFinancial (post-firewall hook)', () => {
  describe('plants for the Vero shape', () => {
    it('persists pending when user msg has amount + description and assistant asks "¿gasto o ingreso?"', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería 200',
        [generalResponse('¿Es un gasto o un ingreso?')],
        SRC_HASH,
      );

      const setCall = findSetCall(redis);
      expect(setCall).toBeDefined();
      expect(setCall!.args[0]).toBe(`${PENDING_FIN_PREFIX}${PHONE}`);
      expect(setCall!.args[2]).toBe(600); // PENDING_FIN_TTL

      const state = decodePlantedState(redis)!;
      expect(state).toEqual(
        expect.objectContaining({
          amount: 200,
          description: 'lavandería',
          missing: 'type',
          sourceTextHash: SRC_HASH,
          originalUserText: 'lavandería 200',
        }),
      );
      expect(typeof state.createdAt).toBe('number');
      expect(state.possibleType).toBeUndefined();
    });

    it('plants for amount question with verb (compré tubo)', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'compré tubo',
        [generalResponse('¿De cuánto fue?')],
        SRC_HASH,
      );

      const state = decodePlantedState(redis)!;
      expect(state).toEqual(
        expect.objectContaining({
          missing: 'amount',
          description: 'compré tubo',
          possibleType: 'expense',
          sourceTextHash: SRC_HASH,
        }),
      );
      expect(state.amount).toBeUndefined();
    });
  });

  describe('does NOT plant when shouldPlantPending refuses', () => {
    it('skips when amount is missing (type case)', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería',
        [generalResponse('¿Es un gasto o un ingreso?')],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });

    it('skips when description is missing (type case)', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        '200',
        [generalResponse('¿Es un gasto o un ingreso?')],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });

    it('skips when possibleType cannot be inferred (amount case)', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'tubo',
        [generalResponse('¿De cuánto fue?')],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });
  });

  describe('does NOT plant when assistant message is not a clarification', () => {
    it('skips when text is a generic confirmation', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería 200',
        [generalResponse('Anotado, maestro.')],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });

    it('skips when text has no question mark', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      // Declarative sentence containing "gasto o ingreso" must NOT
      // trigger the type detector (the no-? guard saves us).
      await handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería 200',
        [generalResponse('Tu gasto o ingreso de la semana')],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });
  });

  describe('does NOT plant on shape mismatches', () => {
    it('skips when responses.length !== 1', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería 200',
        [
          generalResponse('¿Es un gasto o un ingreso?'),
          { intent: AiIntent.REGISTRAR_GASTO, message: '', data: {} },
        ],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });

    it('skips when intent is not CONVERSACION_GENERAL', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería 200',
        [
          {
            intent: AiIntent.REGISTRAR_GASTO,
            message: '¿Es un gasto o un ingreso?',
            data: { amount: 200 },
          },
        ],
        SRC_HASH,
      );

      expect(findSetCall(redis)).toBeUndefined();
    });

    it('skips when responses array is empty', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      await handler.tryPlantPendingFinancial(PHONE, 'lavandería 200', [], SRC_HASH);

      expect(findSetCall(redis)).toBeUndefined();
    });
  });
});

describe('Cap. 47 / M1 — plantPendingFinancialDirect (firewall recovery clarify branch)', () => {
  it('plants with kind=type when called from clarify branch (razon=falta_tipo)', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    await handler.plantPendingFinancialDirect(
      PHONE,
      'compré tubo 200',
      'type',
      SRC_HASH,
    );

    const state = decodePlantedState(redis)!;
    expect(state).toEqual(
      expect.objectContaining({
        missing: 'type',
        amount: 200,
        possibleType: 'expense',
        sourceTextHash: SRC_HASH,
      }),
    );
  });

  it('plants with kind=amount when called from clarify branch (razon=falta_monto)', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    await handler.plantPendingFinancialDirect(
      PHONE,
      'compré material',
      'amount',
      SRC_HASH,
    );

    const state = decodePlantedState(redis)!;
    expect(state).toEqual(
      expect.objectContaining({
        missing: 'amount',
        description: 'compré material',
        possibleType: 'expense',
      }),
    );
  });

  it('logs skip and does NOT call set when data is insufficient', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    // tubo (no verb) + kind=amount → needs possibleType, refused
    await handler.plantPendingFinancialDirect(PHONE, 'tubo', 'amount', SRC_HASH);

    expect(findSetCall(redis)).toBeUndefined();
  });
});

describe('Cap. 47 / M1 — no-overwrite guard', () => {
  it('preserves existing pending when a second plant attempt arrives', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    // First plant succeeds.
    await handler.tryPlantPendingFinancial(
      PHONE,
      'lavandería 200',
      [generalResponse('¿Es un gasto o un ingreso?')],
      'first_hash',
    );

    const firstSerialized = redis.store.get(`${PENDING_FIN_PREFIX}${PHONE}`);
    expect(firstSerialized).toBeDefined();
    const firstState = JSON.parse(firstSerialized!);
    expect(firstState.sourceTextHash).toBe('first_hash');
    expect(firstState.amount).toBe(200);

    // Second plant attempt with different data must NOT overwrite.
    redis.set.mockClear();
    redis.calls.length = 0;

    await handler.tryPlantPendingFinancial(
      PHONE,
      'gasolina 800',
      [generalResponse('¿Es un gasto o un ingreso?')],
      'second_hash',
    );

    expect(redis.set).not.toHaveBeenCalled();

    const stillStored = redis.store.get(`${PENDING_FIN_PREFIX}${PHONE}`);
    const stillState = JSON.parse(stillStored!);
    expect(stillState.sourceTextHash).toBe('first_hash');
    expect(stillState.amount).toBe(200);
    expect(stillState.description).toBe('lavandería');
  });

  it('proceeds to plant when the existing entry was cleared', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    await handler.tryPlantPendingFinancial(
      PHONE,
      'lavandería 200',
      [generalResponse('¿Es un gasto o un ingreso?')],
      'first_hash',
    );
    await handler.clearPendingFinancial(PHONE);

    redis.set.mockClear();

    await handler.tryPlantPendingFinancial(
      PHONE,
      'gasolina 800',
      [generalResponse('¿Es un gasto o un ingreso?')],
      'second_hash',
    );

    expect(redis.set).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(redis.store.get(`${PENDING_FIN_PREFIX}${PHONE}`)!);
    expect(stored.sourceTextHash).toBe('second_hash');
    expect(stored.amount).toBe(800);
  });

  it('falls open and writes when redis.get fails (best-effort guard)', async () => {
    const redis = makeRedisMock();
    redis.getShouldThrow = true;
    const handler = makeHandler(redis);

    await handler.tryPlantPendingFinancial(
      PHONE,
      'lavandería 200',
      [generalResponse('¿Es un gasto o un ingreso?')],
      SRC_HASH,
    );

    // Guard fails open: set still proceeds. The pending becomes
    // available for the next turn even if the existence-check failed.
    expect(redis.set).toHaveBeenCalledTimes(1);
  });
});

describe('Cap. 47 / M1 — failure modes', () => {
  it('does NOT throw when redis.set rejects', async () => {
    const redis = makeRedisMock();
    redis.setShouldThrow = true;
    const handler = makeHandler(redis);

    await expect(
      handler.tryPlantPendingFinancial(
        PHONE,
        'lavandería 200',
        [generalResponse('¿Es un gasto o un ingreso?')],
        SRC_HASH,
      ),
    ).resolves.toBeUndefined();

    expect(redis.set).toHaveBeenCalledTimes(1);
    // Worst case: pending not written. Today's behavior.
    expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
  });

  it('returns silently when responses is null/undefined-equivalent (defensive)', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    // Defensive check: callers shouldn't pass non-arrays, but a
    // length-1 hard gate already protects us. Cover the empty case.
    await handler.tryPlantPendingFinancial(PHONE, 'lavandería 200', [], SRC_HASH);

    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe('Cap. 47 / M1 — tryHandlePendingFinancial (commit 3, pre-AI resolve)', () => {
  const PROVIDER_ID = 'provider-uuid-1';

  function plantedTypeState(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      amount: 200,
      description: 'lavandería',
      missing: 'type' as const,
      sourceTextHash: 'H1_original',
      originalUserText: 'lavandería 200',
      createdAt: Date.now(),
      ...overrides,
    };
  }

  function plantedAmountState(
    possibleType: 'expense' | 'income',
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return {
      description: possibleType === 'expense' ? 'compré material' : 'me pagaron por la chamba',
      missing: 'amount' as const,
      possibleType,
      sourceTextHash: 'H2_original',
      originalUserText: possibleType === 'expense' ? 'compré material' : 'me pagaron por la chamba',
      createdAt: Date.now(),
      ...overrides,
    };
  }

  function seedPending(redis: RedisMock, phone: string, state: unknown) {
    redis.store.set(`${PENDING_FIN_PREFIX}${phone}`, JSON.stringify(state));
  }

  describe('happy paths — type missing', () => {
    it('Vero gasto: pending type + reply "gasto" → handleRegistrarGasto with original srcHash', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedTypeState());

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);
      const ingresoSpy = jest
        .spyOn(handler, 'handleRegistrarIngreso')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'gasto',
        PROVIDER_ID,
      );

      expect(result).toBe(true);
      expect(gastoSpy).toHaveBeenCalledTimes(1);
      expect(gastoSpy).toHaveBeenCalledWith(
        PHONE,
        { amount: 200, description: 'lavandería' },
        PROVIDER_ID,
        'America/Mexico_City', // DEFAULT_TIMEZONE
        'H1_original',
      );
      expect(ingresoSpy).not.toHaveBeenCalled();

      // Pending cleared BEFORE write was dispatched.
      expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
      const delIdx = redis.calls.findIndex((c) => c.method === 'del');
      expect(delIdx).toBeGreaterThanOrEqual(0);
      // Spy was invoked AFTER del happened.
      expect(gastoSpy.mock.invocationCallOrder[0]).toBeGreaterThan(0);
    });

    it('reply "ingreso" → handleRegistrarIngreso', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedTypeState());

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);
      const ingresoSpy = jest
        .spyOn(handler, 'handleRegistrarIngreso')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'ingreso',
        PROVIDER_ID,
      );

      expect(result).toBe(true);
      expect(ingresoSpy).toHaveBeenCalledWith(
        PHONE,
        { amount: 200, description: 'lavandería' },
        PROVIDER_ID,
        'America/Mexico_City',
        'H1_original',
      );
      expect(gastoSpy).not.toHaveBeenCalled();
    });

    it('reply "cobré" resolves to income too', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedTypeState());

      const ingresoSpy = jest
        .spyOn(handler, 'handleRegistrarIngreso')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'cobré',
        PROVIDER_ID,
      );

      expect(result).toBe(true);
      expect(ingresoSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('happy paths — amount missing', () => {
    it('amount + possibleType=expense + reply "$200" → handleRegistrarGasto', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedAmountState('expense'));

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        '$200',
        PROVIDER_ID,
      );

      expect(result).toBe(true);
      expect(gastoSpy).toHaveBeenCalledWith(
        PHONE,
        { amount: 200, description: 'compré material' },
        PROVIDER_ID,
        'America/Mexico_City',
        'H2_original',
      );
    });

    it('amount + possibleType=income + reply "1500" → handleRegistrarIngreso', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedAmountState('income'));

      const ingresoSpy = jest
        .spyOn(handler, 'handleRegistrarIngreso')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        '1500',
        PROVIDER_ID,
      );

      expect(result).toBe(true);
      expect(ingresoSpy).toHaveBeenCalledWith(
        PHONE,
        { amount: 1500, description: 'me pagaron por la chamba' },
        PROVIDER_ID,
        'America/Mexico_City',
        'H2_original',
      );
    });
  });

  describe('unrelated reply discards pending and returns false', () => {
    it('"agéndame mañana" with type pending → flow normal', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedTypeState());

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);
      const ingresoSpy = jest
        .spyOn(handler, 'handleRegistrarIngreso')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'agéndame mañana',
        PROVIDER_ID,
      );

      expect(result).toBe(false);
      expect(gastoSpy).not.toHaveBeenCalled();
      expect(ingresoSpy).not.toHaveBeenCalled();
      expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
    });

    it('"recuérdame ir al gym" with amount pending → flow normal', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedAmountState('expense'));

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'recuérdame ir al gym',
        PROVIDER_ID,
      );

      expect(result).toBe(false);
      expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
    });
  });

  describe('no pending / expired returns false without side effects', () => {
    it('returns false immediately when no pending exists', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'gasto',
        PROVIDER_ID,
      );

      expect(result).toBe(false);
      expect(gastoSpy).not.toHaveBeenCalled();
      // No del was called either — there was nothing to clear.
      expect(redis.calls.some((c) => c.method === 'del')).toBe(false);
    });
  });

  describe('redis.get failure does not break the turn', () => {
    it('returns false and logs warn when Redis is down', async () => {
      const redis = makeRedisMock();
      redis.getShouldThrow = true;
      const handler = makeHandler(redis);

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        'gasto',
        PROVIDER_ID,
      );

      expect(result).toBe(false);
      expect(gastoSpy).not.toHaveBeenCalled();
    });
  });

  describe('handler throw — pending already cleared', () => {
    it('clears pending before invoking handler so a thrown error does not leave a retry trap', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(redis, PHONE, plantedTypeState());

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockRejectedValue(new Error('db down'));

      await expect(
        handler.tryHandlePendingFinancial(PHONE, 'gasto', PROVIDER_ID),
      ).rejects.toThrow('db down');

      // Pending must be already gone — that's the invariant the
      // cleanup-before-write ordering exists to guarantee.
      expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
      expect(gastoSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalid state — option B: clear pending, do not preserve trap', () => {
    it('missing=amount without possibleType → clears pending, returns false, logs warn', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);

      // Hand-crafted corrupt state: missing=amount but no possibleType.
      // Cannot be produced by shouldPlantPending in normal operation.
      seedPending(redis, PHONE, {
        description: 'misterio',
        missing: 'amount',
        sourceTextHash: 'H3_corrupt',
        originalUserText: 'misterio',
        createdAt: Date.now(),
        // possibleType deliberately absent
      });

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);
      const ingresoSpy = jest
        .spyOn(handler, 'handleRegistrarIngreso')
        .mockResolvedValue(undefined);

      const result = await handler.tryHandlePendingFinancial(
        PHONE,
        '$300',
        PROVIDER_ID,
      );

      expect(result).toBe(false);
      expect(gastoSpy).not.toHaveBeenCalled();
      expect(ingresoSpy).not.toHaveBeenCalled();

      // Pending was cleared by the pre-write clear (option B): no
      // trap for the next turn.
      expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
    });
  });

  describe('hash invariant', () => {
    it('always uses pending.sourceTextHash, never recomputes from current text', async () => {
      const redis = makeRedisMock();
      const handler = makeHandler(redis);
      seedPending(
        redis,
        PHONE,
        plantedTypeState({ sourceTextHash: 'ORIGINAL_TURN_HASH' }),
      );

      const gastoSpy = jest
        .spyOn(handler, 'handleRegistrarGasto')
        .mockResolvedValue(undefined);

      await handler.tryHandlePendingFinancial(PHONE, 'gasto', PROVIDER_ID);

      const callArgs = gastoSpy.mock.calls[0];
      // 5th arg is srcHash. Must be the planted one, not anything
      // derived from "gasto".
      expect(callArgs[4]).toBe('ORIGINAL_TURN_HASH');
    });
  });
});

describe('Cap. 47 / M1 — Redis helpers (get/set/clear pending financial)', () => {
  it('round-trips state through set + get', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    const state = {
      amount: 200,
      description: 'lavandería',
      missing: 'type' as const,
      sourceTextHash: SRC_HASH,
      originalUserText: 'lavandería 200',
      createdAt: Date.now(),
    };

    await handler.setPendingFinancial(PHONE, state);
    const back = await handler.getPendingFinancial(PHONE);

    expect(back).toEqual(state);
  });

  it('returns null when key is absent', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    const back = await handler.getPendingFinancial(PHONE);
    expect(back).toBeNull();
  });

  it('returns null on malformed JSON (defensive — never throws upstream)', async () => {
    const redis = makeRedisMock();
    redis.store.set(`${PENDING_FIN_PREFIX}${PHONE}`, 'not-json');
    const handler = makeHandler(redis);

    const back = await handler.getPendingFinancial(PHONE);
    expect(back).toBeNull();
  });

  it('clearPendingFinancial deletes the key', async () => {
    const redis = makeRedisMock();
    const handler = makeHandler(redis);

    await handler.setPendingFinancial(PHONE, {
      amount: 200,
      description: 'lavandería',
      missing: 'type',
      sourceTextHash: SRC_HASH,
      originalUserText: 'lavandería 200',
      createdAt: Date.now(),
    });

    await handler.clearPendingFinancial(PHONE);

    expect(redis.store.has(`${PENDING_FIN_PREFIX}${PHONE}`)).toBe(false);
  });
});
