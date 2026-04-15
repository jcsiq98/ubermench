import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { WhatsAppService } from '../../../modules/whatsapp/whatsapp.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiContextService } from '../../../modules/ai/ai-context.service';
import { AppointmentStatus } from '@prisma/client';
import { formatTime, DEFAULT_TIMEZONE } from '../../utils/timezone.utils';

export interface AppointmentFollowupJobData {
  appointmentId: string;
  providerPhone: string;
  clientName?: string;
  scheduledAt: string; // ISO string
  timezone?: string;
}

@Processor(QUEUE_NAMES.APPOINTMENT_FOLLOWUP, {
  concurrency: 3,
})
export class AppointmentFollowupProcessor extends WorkerHost {
  private readonly logger = new Logger('AppointmentFollowupProcessor');

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly prisma: PrismaService,
    private readonly aiContextService: AiContextService,
  ) {
    super();
  }

  async process(job: Job<AppointmentFollowupJobData>): Promise<any> {
    const { appointmentId, providerPhone, clientName, scheduledAt, timezone } = job.data;
    const tz = timezone || DEFAULT_TIMEZONE;

    this.logger.debug(
      `Processing followup for appointment ${appointmentId} (provider: ${providerPhone})`,
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
        `Appointment ${appointmentId} already ${appointment.status}, skipping followup`,
      );
      return;
    }

    const timeStr = formatTime(new Date(scheduledAt), tz);

    const clientLabel = clientName || 'tu cliente';
    let msg = `📋 Oye, ya pasó tu cita de las *${timeStr}* con *${clientLabel}*. ¿Se hizo?`;

    const JUNK_NAMES = ['ninguno', 'ninguna', 'no', 'n/a', 'na', 'nada', 'sin nombre', 'desconocido', 'nadie'];
    const cleanName = clientName?.trim();
    if (cleanName && !JUNK_NAMES.includes(cleanName.toLowerCase())) {
      try {
        const lastIncome = await this.prisma.income.findFirst({
          where: {
            providerId: appointment.providerId,
            clientName: { contains: cleanName, mode: 'insensitive' },
          },
          orderBy: { date: 'desc' },
          select: { amount: true },
        });

        if (lastIncome) {
          msg += `\nLa vez pasada le cobraste *$${Number(lastIncome.amount).toLocaleString('es-MX')}*.`;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to get client history for followup: ${err.message}`);
      }
    }

    await this.whatsappService.sendTextMessage(providerPhone, msg);
    await this.aiContextService.addMessage(providerPhone, 'assistant', msg, 'followup_cita')
      .catch((err) => this.logger.warn(`Failed to log followup context: ${err.message}`));
  }
}
