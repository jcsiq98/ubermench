import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { WhatsAppService } from '../../../modules/whatsapp/whatsapp.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiContextService } from '../../../modules/ai/ai-context.service';
import { RedisService } from '../../../config/redis.service';
import { AppointmentStatus } from '@prisma/client';
import { formatTime, DEFAULT_TIMEZONE } from '../../utils/timezone.utils';
import { canonicalizePhoneE164 } from '../../utils/phone.utils';

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
    private readonly redis: RedisService,
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
    let msg = `📋 Oye, ya pasó tu cita de las *${timeStr}* con *${clientLabel}*. ¿Se hizo? ¿Cuánto cobraste?`;

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

    await this.whatsappService
      .sendInteractiveButtons(providerPhone, msg, [
        { id: `appt_done_${appointmentId}`, title: 'Sí se hizo' },
        { id: `appt_no_${appointmentId}`, title: 'No se hizo' },
      ])
      .catch(async (err) => {
        this.logger.warn(`Failed to send followup buttons, falling back to text: ${err.message}`);
        await this.whatsappService.sendTextMessage(providerPhone, msg);
      });

    await this.addPendingFollowup(providerPhone, {
      appointmentId,
      providerProfileId: appointment.providerId,
      clientName: appointment.clientName,
      description: appointment.description,
      scheduledAt: appointment.scheduledAt.toISOString(),
      askedAt: new Date().toISOString(),
    }).catch((err) =>
      this.logger.warn(`Failed to store pending appointment followup: ${err.message}`),
    );

    await this.aiContextService.addMessage(providerPhone, 'assistant', msg, 'followup_cita')
      .catch((err) => this.logger.warn(`Failed to log followup context: ${err.message}`));
  }

  private async addPendingFollowup(
    providerPhone: string,
    item: {
      appointmentId: string;
      providerProfileId: string;
      clientName?: string | null;
      description?: string | null;
      scheduledAt: string;
      askedAt: string;
    },
  ): Promise<void> {
    const key = `wa_pending_appointment_followups:${canonicalizePhoneE164(providerPhone)}`;
    const raw = await this.redis.get(key);
    const existing = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(existing) ? existing : [];
    const next = [
      ...items.filter((x) => x?.appointmentId !== item.appointmentId),
      item,
    ].sort((a, b) => String(a.askedAt).localeCompare(String(b.askedAt)));

    await this.redis.set(key, JSON.stringify(next), 12 * 60 * 60);
  }
}
