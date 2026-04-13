import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { WhatsAppService } from '../../../modules/whatsapp/whatsapp.service';
import { AiContextService } from '../../../modules/ai/ai-context.service';
import { RemindersService } from '../../../modules/reminders/reminders.service';

export interface PersonalReminderJobData {
  reminderId: string;
  providerPhone: string;
  description: string;
  remindAt: string; // ISO string
}

@Processor(QUEUE_NAMES.PERSONAL_REMINDER, {
  concurrency: 3,
})
export class PersonalReminderProcessor extends WorkerHost {
  private readonly logger = new Logger('PersonalReminderProcessor');

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly aiContextService: AiContextService,
    private readonly remindersService: RemindersService,
  ) {
    super();
  }

  async process(job: Job<PersonalReminderJobData>): Promise<any> {
    const { reminderId, providerPhone, description } = job.data;

    this.logger.debug(
      `Processing personal reminder ${reminderId}: "${description}"`,
    );

    try {
      const msg = `🔔 *Recordatorio:* ${description}`;

      await this.whatsappService.sendTextMessage(providerPhone, msg);
      await this.aiContextService.addMessage(providerPhone, 'assistant', msg, 'recordatorio_personal')
        .catch((err) => this.logger.warn(`Failed to log personal reminder context: ${err.message}`));
      await this.remindersService.markSent(reminderId).catch((err) =>
        this.logger.warn(`Failed to mark reminder ${reminderId} as sent: ${err.message}`),
      );
    } catch (err: any) {
      this.logger.error(`Failed to send personal reminder ${reminderId}: ${err.message}`);
      throw err;
    }
  }
}
