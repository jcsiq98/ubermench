import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseService } from './expense.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { IncomeService } from '../income/income.service';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  getLocalHour,
  getLocalDayRange,
  formatTime,
  DEFAULT_TIMEZONE,
} from '../../common/utils/timezone.utils';

@Injectable()
export class RecurringExpenseService {
  private readonly logger = new Logger(RecurringExpenseService.name);

  constructor(
    private prisma: PrismaService,
    private expenseService: ExpenseService,
    private whatsappService: WhatsAppService,
    private incomeService: IncomeService,
  ) {}

  async create(dto: {
    providerId: string;
    amount: number;
    category?: string;
    description: string;
    frequency?: string;
    dayOfMonth?: number;
  }) {
    const frequency = dto.frequency || 'monthly';
    const dayOfMonth = dto.dayOfMonth || new Date().getDate();
    const nextDueDate = this.calculateNextDueDate(frequency, dayOfMonth);

    const recurring = await this.prisma.recurringExpense.create({
      data: {
        providerId: dto.providerId,
        amount: new Prisma.Decimal(dto.amount),
        category: dto.category,
        description: dto.description,
        frequency,
        dayOfMonth,
        nextDueDate,
      },
    });

    this.logger.log(
      `Recurring expense created: $${dto.amount} ${frequency} for provider ${dto.providerId}`,
    );

    return recurring;
  }

  async cancel(providerId: string, description: string, dayOfMonth?: number) {
    const recurring = await this.findByFuzzyDescription(providerId, description, dayOfMonth);
    if (!recurring) return null;

    await this.prisma.recurringExpense.update({
      where: { id: recurring.id },
      data: { isActive: false },
    });

    this.logger.log(`Recurring expense cancelled: ${recurring.description} (day ${recurring.dayOfMonth})`);
    return recurring;
  }

  async update(
    providerId: string,
    description: string,
    updates: { amount?: number; frequency?: string; dayOfMonth?: number },
    filterDayOfMonth?: number,
  ): Promise<boolean> {
    const recurring = await this.findByFuzzyDescription(providerId, description, filterDayOfMonth);
    if (!recurring) return false;

    const data: Record<string, any> = {};
    if (updates.amount !== undefined) data.amount = new Prisma.Decimal(updates.amount);
    if (updates.frequency !== undefined) data.frequency = updates.frequency;
    if (updates.dayOfMonth !== undefined) {
      data.dayOfMonth = Math.min(updates.dayOfMonth, 28);
      data.nextDueDate = this.calculateNextDueDate(
        updates.frequency || recurring.frequency,
        data.dayOfMonth,
      );
    }

    await this.prisma.recurringExpense.update({
      where: { id: recurring.id },
      data,
    });

    this.logger.log(`Recurring expense updated: ${recurring.description}`);
    return true;
  }

  async listActive(providerId: string) {
    return this.prisma.recurringExpense.findMany({
      where: { providerId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findByFuzzyDescription(
    providerId: string,
    description: string,
    dayOfMonth?: number,
  ) {
    const matches = await this.findMatchesByDescription(providerId, description);

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    if (dayOfMonth) {
      const byDay = matches.find((e) => e.dayOfMonth === dayOfMonth);
      if (byDay) return byDay;
    }

    return null;
  }

  async findMatchesByDescription(providerId: string, description: string) {
    const all = await this.prisma.recurringExpense.findMany({
      where: { providerId, isActive: true },
    });

    const needle = description.toLowerCase();
    return all.filter((e) => {
      const desc = e.description.toLowerCase();
      return desc.includes(needle) || needle.includes(desc);
    });
  }

  formatRecurringList(
    expenses: { amount: any; description: string; frequency: string; dayOfMonth: number | null }[],
  ): string {
    if (expenses.length === 0) {
      return '📋 No tienes gastos recurrentes activos.';
    }

    let msg = '📋 *Tus gastos recurrentes:*\n';
    for (const e of expenses) {
      const freq = e.frequency === 'monthly' ? 'mensual' : 'semanal';
      const day = e.frequency === 'monthly' && e.dayOfMonth
        ? ` (día ${e.dayOfMonth})`
        : '';
      msg += `\n💸 *$${Number(e.amount).toLocaleString('es-MX')}* — ${e.description} (${freq}${day})`;
    }
    return msg;
  }

  /**
   * Hourly cron: process due recurring expenses.
   * nextDueDate is stored as UTC midnight, so running every hour
   * catches all providers regardless of timezone.
   */
  @Cron('0 * * * *')
  async processRecurringExpenses(): Promise<void> {
    const now = new Date();

    const due = await this.prisma.recurringExpense.findMany({
      where: {
        isActive: true,
        nextDueDate: { lte: now },
      },
      include: {
        provider: {
          include: { user: { select: { phone: true } } },
        },
      },
    });

    if (due.length === 0) return;

    this.logger.log(`Processing ${due.length} recurring expenses...`);

    for (const recurring of due) {
      try {
        await this.expenseService.create({
          providerId: recurring.providerId,
          amount: Number(recurring.amount),
          category: recurring.category ?? undefined,
          description: `${recurring.description} (recurrente)`,
        });

        const nextDueDate = this.calculateNextDueDate(
          recurring.frequency,
          recurring.dayOfMonth ?? 1,
        );

        await this.prisma.recurringExpense.update({
          where: { id: recurring.id },
          data: {
            lastProcessedAt: now,
            nextDueDate,
          },
        });

        const phone = recurring.provider?.user?.phone;
        if (phone) {
          this.whatsappService
            .sendTextMessage(
              phone,
              `💸 Registré tu gasto recurrente: *$${Number(recurring.amount).toLocaleString('es-MX')}* — ${recurring.description}`,
            )
            .catch((err) =>
              this.logger.warn(`Failed to notify ${phone}: ${err.message}`),
            );
        }

        this.logger.log(
          `Processed recurring expense: $${recurring.amount} — ${recurring.description}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to process recurring expense ${recurring.id}: ${err.message}`,
        );
      }
    }
  }

  /**
   * Hourly cron: send expense reminders at 8pm local time per provider.
   */
  @Cron('0 * * * *')
  async sendExpenseReminders(): Promise<void> {
    const providers = await this.getProvidersWithTimezone();

    for (const { providerId, phone, tz } of providers) {
      if (getLocalHour(tz) !== 20) continue;

      const tomorrow = new Date(Date.now() + 86_400_000);
      const { start: tomorrowStart, end: tomorrowEnd } = getLocalDayRange(tz, tomorrow);

      const upcoming = await this.prisma.recurringExpense.findMany({
        where: {
          providerId,
          isActive: true,
          nextDueDate: { gte: tomorrowStart, lte: tomorrowEnd },
        },
      });

      if (upcoming.length === 0) continue;

      const lines = upcoming.map(
        (e) => `  💸 *$${Number(e.amount).toLocaleString('es-MX')}* — ${e.description}`,
      );
      const msg =
        `🔔 *Recordatorio:* mañana se registran estos gastos fijos:\n\n` +
        lines.join('\n') +
        `\n\nSe registrarán automáticamente a medianoche.`;

      this.whatsappService
        .sendTextMessage(phone, msg)
        .catch((err) =>
          this.logger.warn(`Failed to send reminder to ${phone}: ${err.message}`),
        );
    }
  }

  /**
   * Hourly cron: send morning briefing at 7am local time per provider.
   */
  @Cron('0 * * * *')
  async sendMorningBriefing(): Promise<void> {
    const providers = await this.getProvidersWithTimezone();

    for (const { providerId, phone, name, tz } of providers) {
      if (getLocalHour(tz) !== 7) continue;

      const { start: startOfDay, end: endOfDay } = getLocalDayRange(tz);

      const [todayExpenses, todayAppointments] = await Promise.all([
        this.prisma.recurringExpense.findMany({
          where: {
            providerId,
            isActive: true,
            lastProcessedAt: { gte: startOfDay, lte: endOfDay },
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            providerId,
            scheduledAt: { gte: startOfDay, lte: endOfDay },
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          },
        }),
      ]);

      if (todayAppointments.length === 0 && todayExpenses.length === 0) continue;

      const greeting = name ? `Buenos días, *${name}*.` : 'Buenos días.';
      const lines: string[] = [greeting];

      if (todayAppointments.length > 0) {
        lines.push('');
        const citaWord = todayAppointments.length === 1 ? 'cita' : 'citas';
        lines.push(`Hoy tienes *${todayAppointments.length} ${citaWord}:*`);
        for (const a of todayAppointments) {
          const timeStr = formatTime(new Date(a.scheduledAt), tz);
          let line = `• *${timeStr}*`;
          if (a.clientName) line += ` con ${a.clientName}`;
          if (a.description) line += ` — ${a.description}`;
          if (a.address) line += ` (${a.address})`;
          lines.push(line);
        }
      }

      if (todayExpenses.length > 0) {
        if (todayAppointments.length > 0) lines.push('');
        const gastoWord = todayExpenses.length === 1 ? 'gasto fijo se registra' : 'gastos fijos se registran';
        lines.push(`También ${todayExpenses.length} ${gastoWord} hoy:`);
        for (const e of todayExpenses) {
          lines.push(`• *$${Number(e.amount).toLocaleString('es-MX')}* — ${e.description}`);
        }
      }

      try {
        const weekSummary = await this.incomeService.getWeekSummary(providerId, tz);
        if (weekSummary.total > 0) {
          lines.push('');
          lines.push(`Llevas *$${weekSummary.total.toLocaleString('es-MX')}* esta semana.`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to get weekly income for briefing: ${err.message}`);
      }

      this.whatsappService
        .sendTextMessage(phone, lines.join('\n'))
        .catch((err) =>
          this.logger.warn(`Failed to send briefing to ${phone}: ${err.message}`),
        );
    }
  }

  private async getProvidersWithTimezone(): Promise<
    { providerId: string; phone: string; name: string; tz: string }[]
  > {
    const profiles = await this.prisma.providerProfile.findMany({
      where: { isAvailable: true },
      include: {
        user: { select: { phone: true, name: true } },
        workspaceProfile: { select: { timezone: true } },
      },
    });

    return profiles.map((p) => ({
      providerId: p.id,
      phone: p.user.phone,
      name: p.user.name || '',
      tz: p.workspaceProfile?.timezone || DEFAULT_TIMEZONE,
    }));
  }

  private calculateNextDueDate(
    frequency: string,
    dayOfMonth: number,
  ): Date {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    if (frequency === 'weekly') {
      return new Date(Date.UTC(year, month, day + 7, 0, 0, 0, 0));
    }

    const safeDay = Math.min(dayOfMonth, 28);
    let next = new Date(Date.UTC(year, month, safeDay, 0, 0, 0, 0));
    const today = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (next <= today) {
      next = new Date(Date.UTC(year, month + 1, safeDay, 0, 0, 0, 0));
    }
    return next;
  }
}
