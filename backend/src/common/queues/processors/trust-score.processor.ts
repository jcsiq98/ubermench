import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface TrustScoreJobData {
  providerId: string;
  trigger: 'booking_completed' | 'rating_created' | 'report_created' | 'manual';
  metadata?: Record<string, any>;
}

@Processor(QUEUE_NAMES.TRUST_SCORE, { concurrency: 3 })
export class TrustScoreProcessor extends WorkerHost {
  private readonly logger = new Logger('TrustScoreProcessor');

  constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  async process(job: Job<TrustScoreJobData>): Promise<any> {
    const { providerId, trigger } = job.data;
    this.logger.debug(
      `Recalculating trust score for provider ${providerId} (trigger: ${trigger})`,
    );

    this.eventEmitter.emit('trust-score.recalculate', {
      providerId,
      trigger,
      fromQueue: true,
    });

    return { providerId, trigger, processedAt: new Date().toISOString() };
  }
}
