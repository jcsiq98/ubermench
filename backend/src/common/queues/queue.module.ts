import { Module, Global, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';
import { NotificationProcessor } from './processors/notification.processor';
import { TrustScoreProcessor } from './processors/trust-score.processor';
import { WebhookProcessor } from './processors/webhook.processor';
import { AppointmentFollowupProcessor } from './processors/appointment-followup.processor';

@Global()
@Module({})
export class QueueModule {
  private static readonly logger = new Logger('QueueModule');

  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn(
        'No REDIS_URL — BullMQ queues disabled, jobs will not be queued',
      );
      return {
        module: QueueModule,
        global: true,
        providers: [QueueService],
        exports: [QueueService],
      };
    }

    this.logger.log('BullMQ queues enabled with Redis');

    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRoot({
          connection: {
            url: redisUrl,
            maxRetriesPerRequest: null,
          },
        }),
        BullModule.registerQueue(
          { name: QUEUE_NAMES.NOTIFICATIONS },
          { name: QUEUE_NAMES.TRUST_SCORE },
          { name: QUEUE_NAMES.WEBHOOKS },
          { name: QUEUE_NAMES.VERIFICATION },
          { name: QUEUE_NAMES.PAYMENTS },
          { name: QUEUE_NAMES.APPOINTMENT_FOLLOWUP },
        ),
      ],
      providers: [
        QueueService,
        NotificationProcessor,
        TrustScoreProcessor,
        WebhookProcessor,
        AppointmentFollowupProcessor,
      ],
      exports: [QueueService, BullModule],
    };
  }
}
