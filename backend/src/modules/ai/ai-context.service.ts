import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../config/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationMessage } from './ai.types';
import { canonicalizePhoneE164 } from '../../common/utils/phone.utils';

const CONTEXT_PREFIX = 'ai_conv:';
const CONTEXT_TTL = 3600; // 1 hour
const MAX_MESSAGES = 20;

const MEMORY_COUNTER_PREFIX = 'memory_counter:';
const MEMORY_EXTRACTION_THRESHOLD = 10;
const MEMORY_COUNTER_TTL = 86400; // 24 hours

@Injectable()
export class AiContextService {
  private readonly logger = new Logger(AiContextService.name);

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async getHistory(providerPhone: string): Promise<ConversationMessage[]> {
    const phone = canonicalizePhoneE164(providerPhone);
    const raw = await this.redis.get(`${CONTEXT_PREFIX}${phone}`);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async addMessage(
    providerPhone: string,
    role: 'user' | 'assistant',
    content: string,
    intent?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const phone = canonicalizePhoneE164(providerPhone);

    // Redis: fast context for LLM (ephemeral, last 20 messages)
    const history = await this.getHistory(phone);
    history.push({ role, content, timestamp: Date.now() });
    const trimmed = history.slice(-MAX_MESSAGES);

    await this.redis.set(
      `${CONTEXT_PREFIX}${phone}`,
      JSON.stringify(trimmed),
      CONTEXT_TTL,
    );

    // PostgreSQL: permanent log (non-blocking)
    this.prisma.conversationLog
      .create({
        data: {
          phone,
          role,
          content,
          intent: intent ?? null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to persist conversation log for ${phone}: ${err.message}`,
        );
      });
  }

  async clearHistory(providerPhone: string): Promise<void> {
    const phone = canonicalizePhoneE164(providerPhone);
    await this.redis.del(`${CONTEXT_PREFIX}${phone}`);
  }

  /**
   * Increment message counter and return true when threshold is reached
   * (signals it's time to extract learned facts).
   */
  async incrementAndCheckMemoryCounter(
    providerPhone: string,
  ): Promise<boolean> {
    const phone = canonicalizePhoneE164(providerPhone);
    const key = `${MEMORY_COUNTER_PREFIX}${phone}`;
    const current = await this.redis.get(key);
    const count = current ? parseInt(current, 10) : 0;
    const next = count + 1;

    if (next >= MEMORY_EXTRACTION_THRESHOLD) {
      await this.redis.del(key);
      return true;
    }

    if (count === 0) {
      await this.redis.set(key, '1', MEMORY_COUNTER_TTL);
    } else {
      await this.redis.incr(key);
    }

    return false;
  }
}
