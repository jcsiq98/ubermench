/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  WhatsAppOnboardingHandler,
  OnboardingStep,
} from './whatsapp-onboarding.handler';

// Pure-helper tests for the Cap. 46 phone gate + skip phrase detector.
// Both helpers are deterministic and have no I/O, so we instantiate the
// handler with all deps as `null` and exercise the private methods via
// casts — same pattern the financial-firewall spec uses.

function makeHandler(): any {
  const noop = null as any;
  return new (WhatsAppOnboardingHandler as any)(
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
}

describe('WhatsAppOnboardingHandler — isMexicanPhone', () => {
  const handler = makeHandler();

  const mexican = [
    '+5215512345678',
    '+525512345678',
    '5215512345678',
    '52 55 1234 5678',
    '+52(55)1234-5678',
  ];

  it.each(mexican)('treats %s as Mexican', (phone) => {
    expect(handler.isMexicanPhone(phone)).toBe(true);
  });

  const nonMexican = [
    '+15755716627',   // Roberto, US country code in NL
    '+13055551234',   // Miami
    '+34911234567',   // Madrid
    '+31207777777',   // Amsterdam direct
    '+5491155555555', // Buenos Aires
  ];

  it.each(nonMexican)('treats %s as non-Mexican', (phone) => {
    expect(handler.isMexicanPhone(phone)).toBe(false);
  });
});

describe('WhatsAppOnboardingHandler — isSkipPhrase', () => {
  const handler = makeHandler();

  const skip = [
    'luego',
    'Luego',
    'LUEGO',
    'después',
    'despues',
    'más tarde',
    'mas tarde',
    'saltar',
    'skip',
    'no sé',
    'no se',
    'paso',
    'omitir',
    'olvídalo',
    'olvidalo',
    'ninguna',
    'luego, gracias',
    'paso por ahora',
  ];

  it.each(skip)('detects "%s" as skip', (text) => {
    expect(handler.isSkipPhrase(text)).toBe(true);
  });

  const notSkip = [
    'Holanda',
    'Amsterdam',
    'Miami',
    'Países Bajos',
    'estoy en madrid',
    'no sabes lo que dices', // starts with "no" but not a skip phrase
  ];

  it.each(notSkip)('does not flag "%s" as skip', (text) => {
    expect(handler.isSkipPhrase(text)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// End-to-end flow test (Cap. 46 — Roberto regression)
//
// Reproduces the exact path GPT-5.5 flagged: TRADE creates the User +
// ProviderProfile, the next message must reach handleTimezoneResponse
// even though existing.providerProfile is now truthy. Failing version
// short-circuits with "Ya tienes tu cuenta activa".
// ───────────────────────────────────────────────────────────────────

interface RedisState {
  store: Map<string, string>;
}

function makeRedis(state: RedisState) {
  return {
    get: jest.fn(async (key: string) => state.store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      state.store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      state.store.delete(key);
    }),
  };
}

function makeFullHandler(opts: {
  initialSession?: { step: OnboardingStep; name?: string; trade?: string };
  extractFromTextImpl?: (text: string, prompt: string) => Promise<any>;
  processMessageImpl?: (phone: string, text: string) => Promise<any[]>;
}) {
  const phone = '+15755716627'; // Roberto-style: +1 country code
  const redisState: RedisState = { store: new Map() };
  if (opts.initialSession) {
    redisState.store.set(
      `wa_onboarding:${phone}`,
      JSON.stringify(opts.initialSession),
    );
  }

  const redis = makeRedis(redisState);

  const sendTextMessage = jest.fn(async () => undefined);
  const whatsapp = { sendTextMessage };

  const userCreate = jest.fn(async () => ({
    id: 'user-1',
    phone: phone.replace(/\D/g, ''),
    name: 'Roberto',
    providerProfile: { id: 'pp-123' },
  }));
  const userFindUnique = jest.fn(async () => null);
  const applicationUpsert = jest.fn(async () => undefined);
  const prisma = {
    user: { create: userCreate, findUnique: userFindUnique },
    providerApplication: { upsert: applicationUpsert },
  };

  const aiService = {
    extractFromText: jest.fn(
      opts.extractFromTextImpl ?? (async () => ({ location: null })),
    ),
    processMessage: jest.fn(opts.processMessageImpl ?? (async () => [])),
    answerChalanSelfQuestion: jest.fn(async () =>
      'Soy tu Chalán. Estoy para que no se te caiga lo administrativo mientras trabajas.\n\nPara dejarte listo, dime a qué te dedicas.',
    ),
  };
  const aiContextService = {
    addMessage: jest.fn(async () => undefined),
  };

  const setTimezone = jest.fn(async () => ({
    success: true,
    message: 'Zona horaria configurada: Europe/Amsterdam',
  }));
  const getWorkspace = jest.fn(async () => ({ providerId: 'pp-123' }));
  const markTimezonePromptSkipped = jest.fn(async () => undefined);
  const workspaceService = {
    getWorkspace,
    setTimezone,
    markTimezonePromptSkipped,
  };
  const incomeService = {
    create: jest.fn(async () => ({ id: 'income-1' })),
    formatIncomeConfirmation: jest.fn(() => 'Anotado. *$5,000*.'),
  };
  const remindersService = {
    // 1h in the future so the BullMQ scheduling code path runs (delay > 0).
    // Was previously hardcoded to 2026-05-09 — broke once that date passed.
    parseScheduledDate: jest.fn(() => new Date(Date.now() + 60 * 60 * 1000)),
    create: jest.fn(async () => ({ id: 'reminder-1' })),
    formatReminderConfirmation: jest.fn(() => 'Recordatorio creado.'),
  };
  const queueService = {
    addJob: jest.fn(async () => 'job-1'),
  };
  const welcomeExamplesService = {
    generateExamples: jest.fn(async () => null),
  };

  const handler = new (WhatsAppOnboardingHandler as any)(
    whatsapp,
    prisma,
    redis,
    aiService,
    aiContextService,
    workspaceService,
    incomeService,
    remindersService,
    queueService,
    welcomeExamplesService,
  );

  return {
    handler,
    phone,
    redisState,
    redis,
    sendTextMessage,
    userCreate,
    userFindUnique,
    applicationUpsert,
    aiService,
    aiContextService,
    workspaceService,
    incomeService,
    remindersService,
    queueService,
    welcomeExamplesService,
    setTimezone,
    getWorkspace,
    markTimezonePromptSkipped,
  };
}

describe('WhatsAppOnboardingHandler — end-to-end TRADE → TIMEZONE (Roberto regression)', () => {
  it('does not short-circuit on "Ya tienes tu cuenta activa" between TRADE and TIMEZONE', async () => {
    const env = makeFullHandler({
      initialSession: { step: OnboardingStep.TRADE, name: 'Roberto' },
      extractFromTextImpl: async (text: string, prompt: string) => {
        if (prompt.includes('"¿A qué te dedicas?"')) {
          return { trade: 'plomero' };
        }
        if (prompt.includes('"¿En qué ciudad o país trabajas?"')) {
          return { location: 'Holanda' };
        }
        return null;
      },
    });

    // 1. Provider answers their trade. TRADE handler creates the
    //    User + ProviderProfile and advances the session to TIMEZONE.
    await env.handler.handleMessage(env.phone, 'Roberto', 'plomero');

    expect(env.userCreate).toHaveBeenCalledTimes(1);
    expect(env.applicationUpsert).toHaveBeenCalledTimes(1);

    const sessionAfterTrade = JSON.parse(
      env.redisState.store.get(`wa_onboarding:${env.phone}`)!,
    );
    expect(sessionAfterTrade.step).toBe(OnboardingStep.TIMEZONE);
    expect(sessionAfterTrade.providerProfileId).toBe('pp-123');

    expect(env.setTimezone).not.toHaveBeenCalled();

    const tradeQuestion = env.sendTextMessage.mock.calls
      .map((c) => c[1] as string)
      .join('\n');
    expect(tradeQuestion).toMatch(/ciudad o país/i);

    // 2. Provider answers "Holanda". This is the message that, before
    //    the fix, was eaten by the "Ya tienes tu cuenta activa" early
    //    return because ProviderProfile now exists.
    env.sendTextMessage.mockClear();
    await env.handler.handleMessage(env.phone, 'Roberto', 'Holanda');

    // The early-return user lookup must NOT run while a session is
    // active — that was the root cause of the blocker.
    expect(env.userFindUnique).not.toHaveBeenCalled();

    // The "Ya tienes tu cuenta activa" message must NOT be sent.
    const allMessagesAfterHolanda = env.sendTextMessage.mock.calls
      .map((c) => c[1] as string)
      .join('\n');
    expect(allMessagesAfterHolanda).not.toMatch(/Ya tienes tu cuenta activa/i);

    // setTimezone called with the resolved tz and the explicit source.
    expect(env.setTimezone).toHaveBeenCalledTimes(1);
    expect(env.setTimezone).toHaveBeenCalledWith(
      'pp-123',
      'Europe/Amsterdam',
      'user_explicit',
    );

    // Workspace row ensured to exist before the update (lazy create).
    expect(env.getWorkspace).toHaveBeenCalledWith('pp-123');

    // Final welcome message mentions the configured zone.
    expect(allMessagesAfterHolanda).toMatch(/Tu zona quedó como/i);

    // Session cleared.
    expect(env.redisState.store.has(`wa_onboarding:${env.phone}`)).toBe(false);

    // markTimezonePromptSkipped MUST NOT fire on the happy path.
    expect(env.markTimezonePromptSkipped).not.toHaveBeenCalled();
  });

  it('falls back to "Ya tienes tu cuenta activa" only when there is no active session', async () => {
    const env = makeFullHandler({});
    env.userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Roberto',
      providerProfile: { id: 'pp-123' },
    } as any);

    await env.handler.handleMessage(env.phone, 'Roberto', 'cobré 800');

    const messages = env.sendTextMessage.mock.calls
      .map((c) => c[1] as string)
      .join('\n');
    expect(messages).toMatch(/Ya tienes tu cuenta activa/i);
    expect(env.userFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsAppOnboardingHandler — self-model questions during trade onboarding', () => {
  it('answers scope questions without creating the provider yet', async () => {
    const env = makeFullHandler({
      initialSession: { step: OnboardingStep.TRADE, name: 'Jesus Martinez' },
      extractFromTextImpl: async (_text: string, prompt: string) => {
        if (prompt.includes('Clasifica su mensaje')) {
          return { intent: 'scope_question' };
        }
        throw new Error('trade extractor should not run for scope question');
      },
    });

    await env.handler.handleMessage(
      env.phone,
      'Jesus Martinez',
      'estas inclinado a cierta profesion? o mas general?',
    );

    expect(env.aiService.answerChalanSelfQuestion).toHaveBeenCalledWith(
      'estas inclinado a cierta profesion? o mas general?',
      'onboarding',
    );
    expect(env.userCreate).not.toHaveBeenCalled();
    expect(env.sendTextMessage).toHaveBeenCalledWith(
      env.phone,
      expect.stringContaining('Para dejarte listo'),
    );
  });

  it('still accepts a plain trade answer without self-model detour', async () => {
    const env = makeFullHandler({
      initialSession: { step: OnboardingStep.TRADE, name: 'Jesus Martinez' },
      extractFromTextImpl: async (_text: string, prompt: string) => {
        if (prompt.includes('"¿A qué te dedicas?"')) {
          return { trade: 'comerciante' };
        }
        return null;
      },
    });

    await env.handler.handleMessage(env.phone, 'Jesus Martinez', 'comerciante');

    expect(env.aiService.answerChalanSelfQuestion).not.toHaveBeenCalled();
    expect(env.userCreate).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsAppOnboardingHandler — trade extraction edge cases', () => {
  it('accepts "trabajador independiente" via the LLM extractor', async () => {
    const env = makeFullHandler({
      initialSession: { step: OnboardingStep.TRADE, name: 'Jose Carlos' },
      extractFromTextImpl: async (_text: string, prompt: string) => {
        if (prompt.includes('"¿A qué te dedicas?"')) {
          return { trade: 'trabajador independiente' };
        }
        return null;
      },
    });

    await env.handler.handleMessage(
      env.phone,
      'Jose Carlos',
      'soy trabajador independiente',
    );

    expect(env.userCreate).toHaveBeenCalledTimes(1);
    const userCreateArgs = env.userCreate.mock.calls[0][0];
    expect(userCreateArgs.data.providerProfile.create.bio).toBe(
      'trabajador independiente',
    );
  });

  it('falls back to raw text after 2 LLM rejections to unblock onboarding', async () => {
    const env = makeFullHandler({
      initialSession: { step: OnboardingStep.TRADE, name: 'Jose Carlos' },
      // LLM keeps returning null no matter what — simulate a strict extractor.
      extractFromTextImpl: async (_text: string, prompt: string) => {
        if (prompt.includes('Clasifica su mensaje')) {
          return { intent: 'trade_answer' };
        }
        if (prompt.includes('"¿A qué te dedicas?"')) {
          return { trade: null };
        }
        return null;
      },
    });

    // First attempt — should be rejected, increment counter.
    await env.handler.handleMessage(env.phone, 'JC', 'algo raro que el LLM no entiende');
    expect(env.userCreate).not.toHaveBeenCalled();
    const sessionAfter1 = JSON.parse(
      env.redisState.store.get(`wa_onboarding:${env.phone}`)!,
    );
    expect(sessionAfter1.tradeAttempts).toBe(1);

    // Second attempt — fallback kicks in, accepts raw text.
    await env.handler.handleMessage(env.phone, 'JC', 'consultor de negocios');
    expect(env.userCreate).toHaveBeenCalledTimes(1);
    const userCreateArgs = env.userCreate.mock.calls[0][0];
    expect(userCreateArgs.data.providerProfile.create.bio).toBe(
      'consultor de negocios',
    );
  });
});

describe('WhatsAppOnboardingHandler — pending first request', () => {
  it('keeps the first operational request and processes it after timezone', async () => {
    const env = makeFullHandler({
      processMessageImpl: async () => [
        {
          intent: 'registrar_ingreso',
          data: { amount: 5000, description: 'cobro inicial' },
        },
        {
          intent: 'crear_recordatorio',
          data: { description: 'cita', date: undefined, time: undefined },
        },
      ],
      extractFromTextImpl: async (_text: string, prompt: string) => {
        if (prompt.includes('"¿A qué te dedicas?"')) return { trade: 'electricista' };
        if (prompt.includes('"¿En qué ciudad o país trabajas?"')) return { location: 'Los Ángeles' };
        return null;
      },
    });

    await env.handler.handleMessage(
      env.phone,
      'Gil',
      'puedes ingresar un cobro de 5 mil pesos y darme un recordatorio en una hora para una cita',
    );

    let session = JSON.parse(env.redisState.store.get(`wa_onboarding:${env.phone}`)!);
    expect(session.pendingInitialRequest).toContain('cobro de 5 mil');

    await env.handler.handleMessage(env.phone, 'Gil', 'electricista');
    session = JSON.parse(env.redisState.store.get(`wa_onboarding:${env.phone}`)!);
    expect(session.pendingInitialRequest).toContain('cobro de 5 mil');

    await env.handler.handleMessage(env.phone, 'Gil', 'Los Ángeles');

    expect(env.aiService.processMessage).toHaveBeenCalledWith(
      env.phone,
      expect.stringContaining('cobro de 5 mil'),
      'Gil',
    );
    expect(env.incomeService.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, providerId: 'pp-123' }),
    );
    expect(env.remindersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'cita', providerId: 'pp-123' }),
    );
    expect(env.queueService.addJob).toHaveBeenCalled();
  });
});
