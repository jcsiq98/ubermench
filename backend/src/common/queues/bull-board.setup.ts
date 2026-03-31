import { INestApplication, Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { QUEUE_NAMES } from './queue.constants';

export function setupBullBoard(app: INestApplication): void {
  const logger = new Logger('BullBoard');

  if (!process.env.REDIS_URL) {
    logger.debug('Bull Board skipped — no REDIS_URL configured');
    return;
  }

  try {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    const queues = Object.values(QUEUE_NAMES).map((name) => {
      const queue = app.get<Queue>(getQueueToken(name));
      return new BullMQAdapter(queue);
    });

    createBullBoard({
      queues,
      serverAdapter,
    });

    const httpAdapter = app.getHttpAdapter();
    httpAdapter.use('/admin/queues', serverAdapter.getRouter());

    logger.log('Bull Board dashboard available at /admin/queues');
  } catch (error: any) {
    logger.warn(`Bull Board setup skipped: ${error.message}`);
  }
}
