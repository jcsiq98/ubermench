import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../config/redis.service';
import { ConversationMessage } from './ai.types';

const CONTEXT_PREFIX = 'ai_conv:';
const CONTEXT_TTL = 3600; // 1 hour
const MAX_MESSAGES = 20;

@Injectable()
export class AiContextService {
  private readonly logger = new Logger(AiContextService.name);

  constructor(private redis: RedisService) {}

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
  ): Promise<void> {
    const history = await this.getHistory(providerPhone);

    history.push({ role, content, timestamp: Date.now() });

    // Keep only the last N messages to control token costs
    const trimmed = history.slice(-MAX_MESSAGES);

    await this.redis.set(
      `${CONTEXT_PREFIX}${providerPhone}`,
      JSON.stringify(trimmed),
      CONTEXT_TTL,
    );
  }

  async clearHistory(providerPhone: string): Promise<void> {
    await this.redis.del(`${CONTEXT_PREFIX}${providerPhone}`);
  }
}
