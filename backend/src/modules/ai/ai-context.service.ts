import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../config/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationMessage } from './ai.types';

const CONTEXT_PREFIX = 'ai_conv:';
const CONTEXT_TTL = 3600; // 1 hour
const MAX_MESSAGES = 20;

@Injectable()
export class AiContextService {
  private readonly logger = new Logger(AiContextService.name);

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async getHistory(providerPhone: string): Promise<ConversationMessage[]> {
    const raw = await this.redis.get(`${CONTEXT_PREFIX}${providerPhone}`);
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
    // Redis: fast context for LLM (ephemeral, last 20 messages)
    const history = await this.getHistory(providerPhone);
    history.push({ role, content, timestamp: Date.now() });
    const trimmed = history.slice(-MAX_MESSAGES);

    await this.redis.set(
      `${CONTEXT_PREFIX}${providerPhone}`,
      JSON.stringify(trimmed),
      CONTEXT_TTL,
    );

    // PostgreSQL: permanent log (non-blocking)
    this.prisma.conversationLog
      .create({
        data: {
          phone: providerPhone,
          role,
          content,
          intent: intent ?? null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to persist conversation log for ${providerPhone}: ${err.message}`,
        );
      });
  }

  async clearHistory(providerPhone: string): Promise<void> {
    await this.redis.del(`${CONTEXT_PREFIX}${providerPhone}`);
  }
}
