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
    const now = new Date();

    if (!dateStr && !timeStr) return null;

    // Parse time components
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
      const date = new Date(now);
      date.setHours(hours, minutes, 0, 0);
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      return date;
    }

    try {
      let date: Date;
      const lower = (dateStr || '').toLowerCase().trim();

      // Handle relative dates in Spanish
      if (lower === 'hoy' || lower === 'today') {
        date = new Date(now);
      } else if (lower === 'mañana' || lower === 'manana' || lower === 'tomorrow') {
        date = new Date(now);
        date.setDate(date.getDate() + 1);
      } else if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
        date = new Date(now);
        date.setDate(date.getDate() + 2);
      } else if (/^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/.test(lower)) {
        date = this.getNextDayOfWeek(lower, now);
      } else {
        // ISO format from AI: "2026-03-18"
        // Parse manually to avoid timezone issues with new Date(string)
        const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
          const [, y, m, d] = isoMatch.map(Number);
          date = new Date(y, m - 1, d);
        } else {
          date = new Date(dateStr!);
          if (isNaN(date.getTime())) return null;
        }
      }

      date.setHours(hours, minutes, 0, 0);
      return date;
    } catch {
      return null;
    }
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
