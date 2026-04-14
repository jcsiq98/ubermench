import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { RedisService } from '../../../config/redis.service';
import { WhatsAppProviderHandler } from '../../../modules/whatsapp/whatsapp-provider.handler';

export interface DebounceJobData {
  phone: string;
  senderName: string;
}

const BUFFER_PREFIX = 'wa_buf:';

@Processor(QUEUE_NAMES.WHATSAPP_DEBOUNCE, { concurrency: 5 })
export class WhatsAppDebounceProcessor extends WorkerHost {
  private readonly logger = new Logger('WhatsAppDebounceProcessor');

  constructor(
    private readonly redis: RedisService,
    private readonly providerHandler: WhatsAppProviderHandler,
  ) {
    super();
  }

  async process(job: Job<DebounceJobData>): Promise<any> {
    const { phone, senderName } = job.data;
    const bufKey = `${BUFFER_PREFIX}${phone}`;

    const items = await this.redis.lrange(bufKey, 0, -1);
    if (items.length === 0) return { skipped: true };

    // Keep only items added after our read (safe against race with new rpush)
    await this.redis.ltrim(bufKey, items.length, -1);

    const combinedText = items.join('\n');

    this.logger.debug(
      `Debounce fired for ${phone}: ${items.length} message(s), ${combinedText.length} chars`,
    );

    await this.providerHandler.handleBufferedMessage(
      phone,
      senderName,
      combinedText,
    );

    return { processed: items.length };
  }
}
