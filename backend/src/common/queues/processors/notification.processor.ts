import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { WhatsAppService } from '../../../modules/whatsapp/whatsapp.service';

export interface NotificationJobData {
  type: 'text' | 'interactive_buttons' | 'interactive_list' | 'location';
  to: string;
  text?: string;
  bodyText?: string;
  buttons?: { id: string; title: string }[];
  headerText?: string;
  footerText?: string;
  buttonText?: string;
  sections?: {
    title: string;
    rows: { id: string; title: string; description?: string }[];
  }[];
  lat?: number;
  lng?: number;
  locationName?: string;
  locationAddress?: string;
}

@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  concurrency: 5,
  limiter: { max: 20, duration: 1000 },
})
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger('NotificationProcessor');

  constructor(private readonly whatsappService: WhatsAppService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<any> {
    const { type, to } = job.data;
    this.logger.debug(`Processing notification job ${job.id}: ${type} to ${to}`);

    switch (type) {
      case 'text':
        return this.whatsappService.sendTextMessage(to, job.data.text!);

      case 'interactive_buttons':
        return this.whatsappService.sendInteractiveButtons(
          to,
          job.data.bodyText!,
          job.data.buttons!,
        );

      case 'interactive_list':
        return this.whatsappService.sendInteractiveList(
          to,
          job.data.headerText!,
          job.data.bodyText!,
          job.data.footerText!,
          job.data.buttonText!,
          job.data.sections!,
        );

      case 'location':
        return this.whatsappService.sendLocationMessage(
          to,
          job.data.lat!,
          job.data.lng!,
          job.data.locationName!,
          job.data.locationAddress!,
        );

      default:
        this.logger.warn(`Unknown notification type: ${type}`);
    }
  }
}
