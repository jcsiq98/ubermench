import { Module, Global, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';
import { NotificationProcessor } from './processors/notification.processor';
import { TrustScoreProcessor } from './processors/trust-score.processor';
import { WebhookProcessor } from './processors/webhook.processor';
import { AppointmentFollowupProcessor } from './processors/appointment-followup.processor';
import { AppointmentReminderProcessor } from './processors/appointment-reminder.processor';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    username: parsed.username && parsed.username !== 'default' ? parsed.username : undefined,
    maxRetriesPerRequest: null as null,
  };
}

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

    const connection = parseRedisUrl(redisUrl);
    this.logger.log(`BullMQ queues enabled — Redis at ${connection.host}:${connection.port}`);

    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRoot({ connection }),
        BullModule.registerQueue(
          { name: QUEUE_NAMES.NOTIFICATIONS },
          { name: QUEUE_NAMES.TRUST_SCORE },
          { name: QUEUE_NAMES.WEBHOOKS },
          { name: QUEUE_NAMES.VERIFICATION },
          { name: QUEUE_NAMES.PAYMENTS },
          { name: QUEUE_NAMES.APPOINTMENT_FOLLOWUP },
          { name: QUEUE_NAMES.APPOINTMENT_REMINDER },
        ),
      ],
      providers: [
        QueueService,
        NotificationProcessor,
        TrustScoreProcessor,
        WebhookProcessor,
        AppointmentFollowupProcessor,
        AppointmentReminderProcessor,
      ],
      exports: [QueueService, BullModule],
    };
  }
}
