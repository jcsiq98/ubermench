import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';

export interface CreateAppointmentDto {
  providerId: string;
  clientName?: string;
  clientPhone?: string;
  description?: string;
  address?: string;
  scheduledAt: Date;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto) {
    const appointment = await this.prisma.appointment.create({
      data: {
        providerId: dto.providerId,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        description: dto.description,
        address: dto.address,
        scheduledAt: dto.scheduledAt,
      },
    });

    this.logger.log(
      `Appointment created for provider ${dto.providerId} at ${dto.scheduledAt.toISOString()}`,
    );

    return appointment;
  }

  async getTodayAgenda(providerId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getAgenda(providerId, startOfDay, endOfDay);
  }

  async getTomorrowAgenda(providerId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfDay = new Date(tomorrow);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(tomorrow);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getAgenda(providerId, startOfDay, endOfDay);
  }

  async getWeekAgenda(providerId: string) {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    return this.getAgenda(providerId, now, endOfWeek);
  }

  async getUpcoming(providerId: string, limit = 5) {
    return this.prisma.appointment.findMany({
      where: {
        providerId,
        scheduledAt: { gte: new Date() },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  private async getAgenda(providerId: string, from: Date, to: Date) {
    return this.prisma.appointment.findMany({
      where: {
        providerId,
        scheduledAt: { gte: from, lte: to },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  formatAppointmentConfirmation(
    scheduledAt: Date,
    clientName?: string,
    description?: string,
    address?: string,
  ): string {
    const dateStr = scheduledAt.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Mexico_City',
    });
    const timeStr = scheduledAt.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Mexico_City',
    });

    let msg = `📅 *¡Cita agendada!*\n\n🗓 ${dateStr}\n⏰ ${timeStr}`;
    if (clientName) msg += `\n👤 ${clientName}`;
    if (description) msg += `\n📝 ${description}`;
    if (address) msg += `\n📍 ${address}`;

    return msg;
  }

  formatAgendaMessage(appointments: any[], label: string): string {
    if (appointments.length === 0) {
      return `📅 No tienes citas ${label}.`;
    }

    let msg = `📅 *Agenda ${label}* (${appointments.length} cita${appointments.length > 1 ? 's' : ''}):\n`;

    for (const apt of appointments) {
      const timeStr = new Date(apt.scheduledAt).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Mexico_City',
      });

      msg += `\n⏰ *${timeStr}*`;
      if (apt.clientName) msg += ` — ${apt.clientName}`;
      if (apt.description) msg += `\n   📝 ${apt.description}`;
      if (apt.address) msg += `\n   📍 ${apt.address}`;
      msg += '\n';
    }

    return msg;
  }

  parseScheduledDate(dateStr?: string, timeStr?: string): Date | null {
    if (!dateStr && !timeStr) return null;

    // All date math in CDMX timezone
    const nowCdmx = this.toCdmx(new Date());

    let hours = 9;
    let minutes = 0;
    if (timeStr) {
      const parts = timeStr.split(':').map(Number);
      if (!isNaN(parts[0])) {
        hours = parts[0];
        minutes = parts[1] || 0;
      }
    }

    // If only time is provided, assume today (or tomorrow if past)
    if (!dateStr && timeStr) {
      const date = new Date(nowCdmx);
      date.setHours(hours, minutes, 0, 0);
      if (date <= nowCdmx) {
        date.setDate(date.getDate() + 1);
      }
      return this.cdmxToUtc(date, hours, minutes);
    }

    try {
      let dateCdmx: Date;
      const lower = (dateStr || '').toLowerCase().trim();

      if (lower === 'hoy' || lower === 'today') {
        dateCdmx = new Date(nowCdmx);
      } else if (lower === 'mañana' || lower === 'manana' || lower === 'tomorrow') {
        dateCdmx = new Date(nowCdmx);
        dateCdmx.setDate(dateCdmx.getDate() + 1);
      } else if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
        dateCdmx = new Date(nowCdmx);
        dateCdmx.setDate(dateCdmx.getDate() + 2);
      } else if (/^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/.test(lower)) {
        dateCdmx = this.getNextDayOfWeek(lower, nowCdmx);
      } else {
        const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
          const [, y, m, d] = isoMatch.map(Number);
          dateCdmx = new Date(y, m - 1, d);
        } else {
          dateCdmx = new Date(dateStr!);
          if (isNaN(dateCdmx.getTime())) return null;
        }
      }

      return this.cdmxToUtc(dateCdmx, hours, minutes);
    } catch {
      return null;
    }
  }

  /**
   * Convert a "wall clock" CDMX date+time to a proper UTC Date.
   * E.g. 10:00 CDMX (UTC-6) → 16:00 UTC.
   */
  private cdmxToUtc(dateCdmx: Date, hours: number, minutes: number): Date {
    const year = dateCdmx.getFullYear();
    const month = dateCdmx.getMonth();
    const day = dateCdmx.getDate();
    // Build an ISO string that represents the CDMX wall-clock time
    const pad = (n: number) => n.toString().padStart(2, '0');
    const isoStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00-06:00`;
    return new Date(isoStr);
  }

  private toCdmx(utcDate: Date): Date {
    // Get CDMX representation by formatting and re-parsing
    const cdmxStr = utcDate.toLocaleString('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return new Date(cdmxStr);
  }

  private getNextDayOfWeek(dayName: string, from: Date): Date {
    const days: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2,
      'miércoles': 3, miercoles: 3,
      jueves: 4, viernes: 5,
      'sábado': 6, sabado: 6,
    };

    const targetDay = days[dayName.split(' ')[0]];
    if (targetDay === undefined) return new Date(from);

    const result = new Date(from);
    const currentDay = result.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    result.setDate(result.getDate() + daysAhead);
    return result;
  }
}
