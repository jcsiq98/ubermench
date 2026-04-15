import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';
import {
  formatDate,
  formatTime,
  getLocalDayRange,
  parseScheduledDate as tzParseScheduledDate,
  wallClockToUtc,
  toLocalTime,
  DEFAULT_TIMEZONE,
} from '../../common/utils/timezone.utils';

export interface CreateAppointmentDto {
  providerId: string;
  clientName?: string;
  clientPhone?: string;
  description?: string;
  address?: string;
  scheduledAt: Date;
  reminderMinutes?: number;
}

export interface UpdateAppointmentDto {
  scheduledAt?: Date;
  clientName?: string;
  clientPhone?: string;
  description?: string;
  address?: string;
  reminderMinutes?: number | null;
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
        reminderMinutes: dto.reminderMinutes ?? null,
      },
    });

    this.logger.log(
      `Appointment created for provider ${dto.providerId} at ${dto.scheduledAt.toISOString()}`,
    );

    return appointment;
  }

  /**
   * Find appointments matching a context (client name, date range).
   * When dateHint includes a specific time (not midnight), ties are broken
   * by proximity to that time — so "cancela la de las 2" picks the 2pm
   * appointment, not the 11am one.
   */
  async findByContext(
    providerId: string,
    clientName?: string,
    dateHint?: Date,
  ) {
    const where: any = {
      providerId,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    };

    if (dateHint) {
      const dayStart = new Date(dateHint);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateHint);
      dayEnd.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: dayStart, lte: dayEnd };
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });

    if (appointments.length <= 1) return appointments;

    if (!clientName) {
      return this.sortByTimeProximity(appointments, dateHint);
    }

    const needle = clientName.toLowerCase().trim();
    const scored = appointments.map((a) => {
      const name = (a.clientName || '').toLowerCase();
      let score = 0;
      if (name === needle) score = 100;
      else if (name.includes(needle) || needle.includes(name)) score = 80;
      else {
        const needleWords = needle.split(/\s+/);
        const nameWords = name.split(/\s+/);
        const overlap = needleWords.filter((w) =>
          nameWords.some((nw) => nw.includes(w) || w.includes(nw)),
        ).length;
        score = overlap > 0 ? 50 + overlap * 10 : 0;
      }
      return { appointment: a, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (!dateHint) return 0;
      const distA = Math.abs(a.appointment.scheduledAt.getTime() - dateHint.getTime());
      const distB = Math.abs(b.appointment.scheduledAt.getTime() - dateHint.getTime());
      return distA - distB;
    });

    if (scored[0]?.score > 0) {
      return scored.filter((s) => s.score > 0).map((s) => s.appointment);
    }

    return this.sortByTimeProximity(appointments, dateHint);
  }

  private sortByTimeProximity(appointments: any[], dateHint?: Date) {
    if (!dateHint || dateHint.getHours() === 0 && dateHint.getMinutes() === 0) {
      return appointments;
    }
    return [...appointments].sort((a, b) => {
      const distA = Math.abs(a.scheduledAt.getTime() - dateHint.getTime());
      const distB = Math.abs(b.scheduledAt.getTime() - dateHint.getTime());
      return distA - distB;
    });
  }

  async update(id: string, data: UpdateAppointmentDto) {
    const appointment = await this.prisma.appointment.update({
      where: { id },
      data,
    });

    this.logger.log(`Appointment ${id} updated`);
    return appointment;
  }

  async cancel(id: string) {
    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
    });

    this.logger.log(`Appointment ${id} cancelled`);
    return appointment;
  }

  async markResult(id: string, status: 'completed' | 'no_show' | 'cancelled') {
    const statusMap: Record<string, AppointmentStatus> = {
      completed: AppointmentStatus.COMPLETED,
      no_show: AppointmentStatus.NO_SHOW,
      cancelled: AppointmentStatus.CANCELLED,
    };

    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: { status: statusMap[status] },
    });

    this.logger.log(`Appointment ${id} marked as ${status}`);
    return appointment;
  }

  private static readonly INVALID_CLIENT_NAMES = new Set([
    'ninguna', 'ninguno', 'nada', 'nadie', 'no', 'none',
    'no sé', 'no se', 'no recuerdo', 'cualquiera', 'n/a',
  ]);

  async findRecentPastAppointment(providerId: string, clientName?: string) {
    const normalized = clientName?.trim().toLowerCase();
    const isValidName = normalized
      && normalized.length > 1
      && !AppointmentsService.INVALID_CLIENT_NAMES.has(normalized);

    const where: any = {
      providerId,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      scheduledAt: { lt: new Date() },
    };

    if (isValidName) {
      where.clientName = { contains: clientName!.trim(), mode: 'insensitive' };
    }

    return this.prisma.appointment.findFirst({
      where,
      orderBy: { scheduledAt: 'desc' },
    });
  }

  formatAppointmentModified(
    scheduledAt: Date,
    clientName?: string,
    description?: string,
    address?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    const dateStr = formatDate(scheduledAt, tz);
    const timeStr = formatTime(scheduledAt, tz);

    let msg = `✏️ *¡Cita modificada!*\n\n🗓 ${dateStr}\n⏰ ${timeStr}`;
    if (clientName) msg += `\n👤 ${clientName}`;
    if (description) msg += `\n📝 ${description}`;
    if (address) msg += `\n📍 ${address}`;

    return msg;
  }

  formatAppointmentCancelled(
    clientName?: string,
    scheduledAt?: Date,
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    let msg = '🗑️ *Cita cancelada.* Registrado.';
    if (clientName) msg += `\n👤 ${clientName}`;
    if (scheduledAt) {
      msg += `\n⏰ ${formatTime(scheduledAt, tz)}`;
    }
    return msg;
  }

  async getTodayAgenda(providerId: string, tz: string = DEFAULT_TIMEZONE) {
    const { start, end } = getLocalDayRange(tz);
    return this.getAgenda(providerId, start, end);
  }

  async getTomorrowAgenda(providerId: string, tz: string = DEFAULT_TIMEZONE) {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const { start, end } = getLocalDayRange(tz, tomorrow);
    return this.getAgenda(providerId, start, end);
  }

  async getWeekAgenda(providerId: string, tz: string = DEFAULT_TIMEZONE) {
    const { start } = getLocalDayRange(tz);
    const endDate = new Date(start.getTime() + 7 * 86_400_000);
    const { end } = getLocalDayRange(tz, endDate);
    return this.getAgenda(providerId, start, end);
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
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    const dateStr = formatDate(scheduledAt, tz);
    const timeStr = formatTime(scheduledAt, tz);

    let msg = `Listo, quedó tu cita. *${dateStr}* a las *${timeStr}*`;
    if (clientName) msg += ` con ${clientName}`;
    if (description) msg += ` — ${description}`;
    if (address) msg += `.\n📍 ${address}`;
    else msg += '.';

    return msg;
  }

  formatAgendaMessage(
    appointments: any[],
    label: string,
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    if (appointments.length === 0) {
      return `📅 No tienes citas ${label}.`;
    }

    let msg = `📅 *Agenda ${label}* (${appointments.length} cita${appointments.length > 1 ? 's' : ''}):\n`;

    for (const apt of appointments) {
      const timeStr = formatTime(new Date(apt.scheduledAt), tz);

      msg += `\n⏰ *${timeStr}*`;
      if (apt.clientName) msg += ` — ${apt.clientName}`;
      if (apt.description) msg += `\n   📝 ${apt.description}`;
      if (apt.address) msg += `\n   📍 ${apt.address}`;
      msg += '\n';
    }

    return msg;
  }

  parseScheduledDate(
    dateStr?: string,
    timeStr?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Date | null {
    return tzParseScheduledDate(dateStr, timeStr, tz);
  }

  /**
   * Convert wall-clock time to UTC for a given timezone.
   * Used by the handler for time-only modifications.
   */
  wallClockToUtc(
    date: Date,
    hours: number,
    minutes: number,
    tz: string = DEFAULT_TIMEZONE,
  ): Date {
    const local = toLocalTime(date, tz);
    return wallClockToUtc(
      local.getFullYear(), local.getMonth(), local.getDate(),
      hours, minutes, tz,
    );
  }

  /**
   * Safety net: mark appointments still PENDING/CONFIRMED 2+ hours after
   * their scheduled time as NO_SHOW. Runs every 30 minutes independently
   * of BullMQ so zombie appointments don't accumulate if Redis is down.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markStaleAppointments(): Promise<number> {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const result = await this.prisma.appointment.updateMany({
      where: {
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        scheduledAt: { lt: cutoff },
      },
      data: { status: AppointmentStatus.NO_SHOW },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Marked ${result.count} stale appointment(s) as NO_SHOW (scheduled before ${cutoff.toISOString()})`,
      );
    }

    return result.count;
  }
}
