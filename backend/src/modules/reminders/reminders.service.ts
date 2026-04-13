import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ReminderStatus } from '@prisma/client';

export interface CreateReminderDto {
  providerId: string;
  description: string;
  remindAt: Date;
}

export interface UpdateReminderDto {
  description?: string;
  remindAt?: Date;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateReminderDto) {
    const reminder = await this.prisma.reminder.create({
      data: {
        providerId: dto.providerId,
        description: dto.description,
        remindAt: dto.remindAt,
      },
    });

    this.logger.log(
      `Reminder created for provider ${dto.providerId}: "${dto.description}" at ${dto.remindAt.toISOString()}`,
    );

    return reminder;
  }

  async findActive(providerId: string) {
    return this.prisma.reminder.findMany({
      where: {
        providerId,
        status: ReminderStatus.PENDING,
      },
      orderBy: { remindAt: 'asc' },
    });
  }

  /**
   * Fuzzy match by description for modify/cancel operations.
   * Searches active reminders whose description contains the search term.
   */
  async findByDescription(providerId: string, description: string) {
    const reminders = await this.findActive(providerId);
    if (!reminders.length) return [];

    const needle = description.toLowerCase().trim();

    const scored = reminders.map((r) => {
      const desc = r.description.toLowerCase();
      let score = 0;
      if (desc === needle) score = 100;
      else if (desc.includes(needle) || needle.includes(desc)) score = 80;
      else {
        const needleWords = needle.split(/\s+/);
        const descWords = desc.split(/\s+/);
        const overlap = needleWords.filter((w) =>
          descWords.some((dw) => dw.includes(w) || w.includes(dw)),
        ).length;
        score = overlap > 0 ? 50 + overlap * 10 : 0;
      }
      return { reminder: r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (scored[0]?.score > 0) {
      return scored.filter((s) => s.score > 0).map((s) => s.reminder);
    }

    return [];
  }

  async update(id: string, data: UpdateReminderDto) {
    const reminder = await this.prisma.reminder.update({
      where: { id },
      data,
    });

    this.logger.log(`Reminder ${id} updated`);
    return reminder;
  }

  async cancel(id: string) {
    const reminder = await this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.CANCELLED },
    });

    this.logger.log(`Reminder ${id} cancelled`);
    return reminder;
  }

  async markSent(id: string) {
    return this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.SENT },
    });
  }

  formatReminderConfirmation(description: string, remindAt: Date): string {
    const dateStr = remindAt.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Mexico_City',
    });
    const timeStr = remindAt.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Mexico_City',
    });

    return `🔔 *¡Recordatorio creado!*\n\n📝 ${description}\n🗓 ${dateStr}\n⏰ ${timeStr}`;
  }

  formatReminderModified(description: string, remindAt: Date): string {
    const dateStr = remindAt.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Mexico_City',
    });
    const timeStr = remindAt.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Mexico_City',
    });

    return `✏️ *¡Recordatorio modificado!*\n\n📝 ${description}\n🗓 ${dateStr}\n⏰ ${timeStr}`;
  }

  formatReminderCancelled(description: string): string {
    return `🗑️ *Recordatorio cancelado:* ${description}`;
  }

  formatRemindersList(reminders: any[]): string {
    if (reminders.length === 0) {
      return '📋 No tienes recordatorios pendientes.';
    }

    let msg = `📋 *Recordatorios pendientes* (${reminders.length}):\n`;

    for (const r of reminders) {
      const dateStr = new Date(r.remindAt).toLocaleDateString('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Mexico_City',
      });
      const timeStr = new Date(r.remindAt).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Mexico_City',
      });

      msg += `\n🔔 *${r.description}*\n   📅 ${dateStr}, ${timeStr}\n`;
    }

    return msg;
  }

  /**
   * Reuse AppointmentsService's date parsing logic.
   * Kept here to avoid cross-module dependency for a simple utility.
   */
  parseScheduledDate(dateStr?: string, timeStr?: string): Date | null {
    if (!dateStr && !timeStr) return null;

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

  private cdmxToUtc(dateCdmx: Date, hours: number, minutes: number): Date {
    const year = dateCdmx.getFullYear();
    const month = dateCdmx.getMonth();
    const day = dateCdmx.getDate();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const isoStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00-06:00`;
    return new Date(isoStr);
  }

  private toCdmx(utcDate: Date): Date {
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

  /**
   * Safety net: mark reminders still PENDING 1+ hour after their
   * remind_at time as SENT. Runs every 30 minutes.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markStaleReminders(): Promise<number> {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);

    const result = await this.prisma.reminder.updateMany({
      where: {
        status: ReminderStatus.PENDING,
        remindAt: { lt: cutoff },
      },
      data: { status: ReminderStatus.SENT },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Marked ${result.count} stale reminder(s) as SENT (remind_at before ${cutoff.toISOString()})`,
      );
    }

    return result.count;
  }
}
