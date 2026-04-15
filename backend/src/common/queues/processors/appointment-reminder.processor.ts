import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { WhatsAppService } from '../../../modules/whatsapp/whatsapp.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiContextService } from '../../../modules/ai/ai-context.service';
import { AppointmentStatus } from '@prisma/client';
import { formatTime, DEFAULT_TIMEZONE } from '../../utils/timezone.utils';

export interface AppointmentReminderJobData {
  appointmentId: string;
  providerPhone: string;
  clientName?: string;
  scheduledAt: string; // ISO string
  reminderMinutes: number;
  timezone?: string;
}

@Processor(QUEUE_NAMES.APPOINTMENT_REMINDER, {
  concurrency: 3,
})
export class AppointmentReminderProcessor extends WorkerHost {
  private readonly logger = new Logger('AppointmentReminderProcessor');

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly prisma: PrismaService,
    private readonly aiContextService: AiContextService,
  ) {
    super();
  }

  async process(job: Job<AppointmentReminderJobData>): Promise<any> {
    const { appointmentId, providerPhone, clientName, scheduledAt, reminderMinutes, timezone } = job.data;
    const tz = timezone || DEFAULT_TIMEZONE;

    this.logger.debug(
      `Processing reminder for appointment ${appointmentId} (${reminderMinutes}min before)`,
    );

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) return;

    if (
      appointment.status !== AppointmentStatus.PENDING &&
      appointment.status !== AppointmentStatus.CONFIRMED
    ) {
      this.logger.debug(
        `Appointment ${appointmentId} already ${appointment.status}, skipping reminder`,
      );
      return;
    }

    const timeStr = formatTime(new Date(scheduledAt), tz);

    const clientLabel = clientName || 'tu cliente';
    const msg = `⏰ Recordatorio: en *${reminderMinutes} minutos* tienes cita de las *${timeStr}* con *${clientLabel}*.`;

    await this.whatsappService.sendTextMessage(providerPhone, msg);
    await this.aiContextService.addMessage(providerPhone, 'assistant', msg, 'recordatorio_cita')
      .catch((err) => this.logger.warn(`Failed to log reminder context: ${err.message}`));
  }
}
