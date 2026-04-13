import { Injectable, Optional, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS, QueueName } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger('QueueService');
  private readonly queues: Partial<Record<QueueName, Queue>> = {};

  constructor(
    @Optional() @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    notificationsQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.TRUST_SCORE)
    trustScoreQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.WEBHOOKS)
    webhooksQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.VERIFICATION)
    verificationQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.PAYMENTS)
    paymentsQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.APPOINTMENT_FOLLOWUP)
    appointmentFollowupQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.APPOINTMENT_REMINDER)
    appointmentReminderQueue?: Queue,
  ) {
    if (notificationsQueue) this.queues[QUEUE_NAMES.NOTIFICATIONS] = notificationsQueue;
    if (trustScoreQueue) this.queues[QUEUE_NAMES.TRUST_SCORE] = trustScoreQueue;
    if (webhooksQueue) this.queues[QUEUE_NAMES.WEBHOOKS] = webhooksQueue;
    if (verificationQueue) this.queues[QUEUE_NAMES.VERIFICATION] = verificationQueue;
    if (paymentsQueue) this.queues[QUEUE_NAMES.PAYMENTS] = paymentsQueue;
    if (appointmentFollowupQueue) this.queues[QUEUE_NAMES.APPOINTMENT_FOLLOWUP] = appointmentFollowupQueue;
    if (appointmentReminderQueue) this.queues[QUEUE_NAMES.APPOINTMENT_REMINDER] = appointmentReminderQueue;
  }

  async addJob<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<string | null> {
    const queue = this.queues[queueName];

    if (!queue) {
      this.logger.warn(
        `Queue "${queueName}" not available — job "${jobName}" DROPPED. Is REDIS_URL configured?`,
      );
      return null;
    }

    try {
      const job = await queue.add(jobName, data, {
        ...DEFAULT_JOB_OPTIONS,
        ...options,
      });
      this.logger.debug(`Job "${jobName}" added to "${queueName}" (id: ${job.id})`);
      return job.id ?? null;
    } catch (error: any) {
      this.logger.error(
        `Failed to add job "${jobName}" to "${queueName}": ${error.message}`,
      );
      return null;
    }
  }

  async getQueueStats(queueName: QueueName) {
    const queue = this.queues[queueName];
    if (!queue) return null;

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      return { waiting, active, completed, failed, delayed };
    } catch {
      return null;
    }
  }

  isEnabled(): boolean {
    return Object.keys(this.queues).length > 0;
  }
}
