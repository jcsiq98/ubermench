import { Prisma } from '@prisma/client';
import { AiContextService } from './ai-context.service';

describe('AiContextService — phone canonicalization', () => {
  function makeService() {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      conversationLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AiContextService(redis as any, prisma as any);
    return { service, redis, prisma };
  }

  it('stores Redis context and conversation logs under canonical +52 identity', async () => {
    const { service, redis, prisma } = makeService();

    await service.addMessage('5216564351052', 'user', 'hola', 'onboarding');

    expect(redis.set).toHaveBeenCalledWith(
      'ai_conv:+526564351052',
      expect.any(String),
      3600,
    );
    expect(prisma.conversationLog.create).toHaveBeenCalledWith({
      data: {
        phone: '+526564351052',
        role: 'user',
        content: 'hola',
        intent: 'onboarding',
        metadata: Prisma.DbNull,
      },
    });
  });

  it('uses the same memory counter key for +52 and +521 variants', async () => {
    const { service, redis } = makeService();

    await service.incrementAndCheckMemoryCounter('+5216564351052');
    await service.incrementAndCheckMemoryCounter('+526564351052');

    expect(redis.get).toHaveBeenNthCalledWith(1, 'memory_counter:+526564351052');
    expect(redis.get).toHaveBeenNthCalledWith(2, 'memory_counter:+526564351052');
  });
});

describe('AiContextService — 24h service window', () => {
  function makeService(lastInboundAt: Date | null) {
    const redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
    };
    const prisma = {
      conversationLog: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            lastInboundAt ? { createdAt: lastInboundAt } : null,
          ),
      },
    };
    const service = new AiContextService(redis as any, prisma as any);
    return { service, prisma };
  }

  it('queries the last inbound (role: user) under the canonical identity', async () => {
    const { service, prisma } = makeService(new Date());

    await service.isWithinServiceWindow('5216564351052');

    expect(prisma.conversationLog.findFirst).toHaveBeenCalledWith({
      where: { phone: '+526564351052', role: 'user' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
  });

  it('is inside the window when the last inbound is < 24h old', async () => {
    const { service } = makeService(new Date(Date.now() - 60 * 60 * 1000));
    expect(await service.isWithinServiceWindow('+526564351052')).toBe(true);
  });

  it('is outside the window when the last inbound is > 24h old', async () => {
    const { service } = makeService(
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );
    expect(await service.isWithinServiceWindow('+526564351052')).toBe(false);
  });

  it('is outside the window when there is no inbound on record', async () => {
    const { service } = makeService(null);
    expect(await service.isWithinServiceWindow('+526564351052')).toBe(false);
  });
});
