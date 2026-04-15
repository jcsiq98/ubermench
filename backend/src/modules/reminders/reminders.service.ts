import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ReminderStatus } from '@prisma/client';
import {
  formatDate,
  formatTime,
  parseScheduledDate as tzParseScheduledDate,
  DEFAULT_TIMEZONE,
} from '../../common/utils/timezone.utils';

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

  formatReminderConfirmation(
    description: string,
    remindAt: Date,
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    const dateStr = formatDate(remindAt, tz);
    const timeStr = formatTime(remindAt, tz);
    return `🔔 *¡Recordatorio creado!*\n\n📝 ${description}\n🗓 ${dateStr}\n⏰ ${timeStr}`;
  }

  formatReminderModified(
    description: string,
    remindAt: Date,
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    const dateStr = formatDate(remindAt, tz);
    const timeStr = formatTime(remindAt, tz);
    return `✏️ *¡Recordatorio modificado!*\n\n📝 ${description}\n🗓 ${dateStr}\n⏰ ${timeStr}`;
  }

  formatReminderCancelled(description: string): string {
    return `🗑️ *Recordatorio cancelado:* ${description}`;
  }

  formatRemindersList(
    reminders: any[],
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    if (reminders.length === 0) {
      return '📋 No tienes recordatorios pendientes.';
    }

    let msg = `📋 *Recordatorios pendientes* (${reminders.length}):\n`;

    for (const r of reminders) {
      const dateStr = formatDate(new Date(r.remindAt), tz, {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      const timeStr = formatTime(new Date(r.remindAt), tz);
      msg += `\n🔔 *${r.description}*\n   📅 ${dateStr}, ${timeStr}\n`;
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
