import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

export interface WebhookJobData {
  source: 'whatsapp' | 'truora' | 'metamap' | 'stripe';
  messageId: string;
  payload: any;
  receivedAt: string;
}

@Processor(QUEUE_NAMES.WEBHOOKS, { concurrency: 10 })
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger('WebhookProcessor');

  async process(job: Job<WebhookJobData>): Promise<any> {
    const { source, messageId } = job.data;
    this.logger.debug(`Processing webhook from ${source} (messageId: ${messageId})`);

    return { source, messageId, processedAt: new Date().toISOString() };
  }
}
