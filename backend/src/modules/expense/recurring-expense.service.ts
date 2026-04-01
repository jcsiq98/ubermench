import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseService } from './expense.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AppointmentStatus, Prisma } from '@prisma/client';

@Injectable()
export class RecurringExpenseService {
  private readonly logger = new Logger(RecurringExpenseService.name);

  constructor(
    private prisma: PrismaService,
    private expenseService: ExpenseService,
    private whatsappService: WhatsAppService,
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

  async cancel(providerId: string, description: string): Promise<boolean> {
    const recurring = await this.findByFuzzyDescription(providerId, description);
    if (!recurring) return false;

    await this.prisma.recurringExpense.update({
      where: { id: recurring.id },
      data: { isActive: false },
    });

    this.logger.log(`Recurring expense cancelled: ${recurring.description}`);
    return true;
  }

  async update(
    providerId: string,
    description: string,
    updates: { amount?: number; frequency?: string; dayOfMonth?: number },
  ): Promise<boolean> {
    const recurring = await this.findByFuzzyDescription(providerId, description);
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

  /**
   * Bidirectional fuzzy match: "suscripción de Railway" matches DB record "Railway"
   * and vice versa. Prisma's `contains` only works one way.
   */
  private async findByFuzzyDescription(providerId: string, description: string) {
    const all = await this.prisma.recurringExpense.findMany({
      where: { providerId, isActive: true },
    });

    const needle = description.toLowerCase();
    return all.find((e) => {
      const desc = e.description.toLowerCase();
      return desc.includes(needle) || needle.includes(desc);
    }) || null;
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
   * Cron: runs daily at midnight (Mexico City time).
   * Finds all active recurring expenses due today or earlier, creates an Expense for each,
   * and advances nextDueDate.
   */
  @Cron('0 0 * * *', { timeZone: 'America/Mexico_City' })
  async processRecurringExpenses(): Promise<void> {
    const now = new Date();
    this.logger.log('Processing recurring expenses...');

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

    if (due.length === 0) {
      this.logger.log('No recurring expenses due today.');
      return;
    }

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

    this.logger.log(`Processed ${due.length} recurring expenses.`);
  }

  /**
   * Cron: 8pm Mexico City — remind providers about recurring expenses due tomorrow.
   */
  @Cron('0 20 * * *', { timeZone: 'America/Mexico_City' })
  async sendExpenseReminders(): Promise<void> {
    const { start: tomorrowStart, end: tomorrowEnd } = this.getCDMXDayRange(1);

    this.logger.log(
      `Checking reminders for tomorrow CDMX: ${tomorrowStart.toISOString()} — ${tomorrowEnd.toISOString()}`,
    );

    const upcoming = await this.prisma.recurringExpense.findMany({
      where: {
        isActive: true,
        nextDueDate: { gte: tomorrowStart, lte: tomorrowEnd },
      },
      include: {
        provider: {
          include: { user: { select: { phone: true } } },
        },
      },
    });

    if (upcoming.length === 0) {
      this.logger.log('No recurring expense reminders to send.');
      return;
    }

    const byProvider = new Map<string, typeof upcoming>();
    for (const exp of upcoming) {
      const phone = exp.provider?.user?.phone;
      if (!phone) continue;
      const list = byProvider.get(phone) || [];
      list.push(exp);
      byProvider.set(phone, list);
    }

    for (const [phone, expenses] of byProvider) {
      const lines = expenses.map(
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

    this.logger.log(`Sent expense reminders to ${byProvider.size} providers.`);
  }

  /**
   * Cron: 7am Mexico City — daily briefing with today's appointments + expenses due.
   */
  @Cron('0 7 * * *', { timeZone: 'America/Mexico_City' })
  async sendMorningBriefing(): Promise<void> {
    const { start: startOfDay, end: endOfDay } = this.getCDMXDayRange(0);

    this.logger.log(
      `Morning briefing for CDMX today: ${startOfDay.toISOString()} — ${endOfDay.toISOString()}`,
    );

    const [todayExpenses, todayAppointments] = await Promise.all([
      this.prisma.recurringExpense.findMany({
        where: {
          isActive: true,
          lastProcessedAt: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          provider: {
            include: { user: { select: { phone: true, name: true } } },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          scheduledAt: { gte: startOfDay, lte: endOfDay },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
        include: {
          provider: {
            include: { user: { select: { phone: true, name: true } } },
          },
        },
      }),
    ]);

    const briefings = new Map<string, { name: string; appointments: any[]; expenses: any[] }>();

    for (const appt of todayAppointments) {
      const phone = appt.provider?.user?.phone;
      if (!phone) continue;
      const entry = briefings.get(phone) || {
        name: appt.provider?.user?.name || '',
        appointments: [],
        expenses: [],
      };
      entry.appointments.push(appt);
      briefings.set(phone, entry);
    }

    for (const exp of todayExpenses) {
      const phone = exp.provider?.user?.phone;
      if (!phone) continue;
      const entry = briefings.get(phone) || {
        name: exp.provider?.user?.name || '',
        appointments: [],
        expenses: [],
      };
      entry.expenses.push(exp);
      briefings.set(phone, entry);
    }

    if (briefings.size === 0) {
      this.logger.log('No morning briefings to send.');
      return;
    }

    for (const [phone, data] of briefings) {
      const greeting = data.name ? `Buenos días, *${data.name}*` : 'Buenos días';
      const lines: string[] = [`☀️ ${greeting}! Tu día de un vistazo:\n`];

      if (data.appointments.length > 0) {
        lines.push(`📅 *${data.appointments.length} cita${data.appointments.length > 1 ? 's' : ''}:*`);
        for (const a of data.appointments) {
          const timeStr = new Date(a.scheduledAt).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Mexico_City',
          });
          let line = `  ⏰ *${timeStr}*`;
          if (a.clientName) line += ` — ${a.clientName}`;
          if (a.description) line += ` (${a.description})`;
          if (a.address) line += `\n      📍 ${a.address}`;
          lines.push(line);
        }
      }

      if (data.expenses.length > 0) {
        if (data.appointments.length > 0) lines.push('');
        lines.push(`💸 *${data.expenses.length} gasto${data.expenses.length > 1 ? 's' : ''} fijo${data.expenses.length > 1 ? 's' : ''}:*`);
        for (const e of data.expenses) {
          lines.push(`  💸 *$${Number(e.amount).toLocaleString('es-MX')}* — ${e.description}`);
        }
        lines.push('  _(se registran automáticamente)_');
      }

      if (data.appointments.length === 0 && data.expenses.length === 0) continue;

      lines.push('\n¡Éxito hoy! 💪');

      this.whatsappService
        .sendTextMessage(phone, lines.join('\n'))
        .catch((err) =>
          this.logger.warn(`Failed to send briefing to ${phone}: ${err.message}`),
        );
    }

    this.logger.log(`Sent morning briefings to ${briefings.size} providers.`);
  }

  /**
   * Returns { year, month (0-indexed), day } in CDMX timezone.
   * Ensures all cron date logic uses CDMX calendar dates regardless of server TZ.
   */
  private getCDMXDate(date?: Date): { year: number; month: number; day: number } {
    const d = date || new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const [year, month, day] = parts.split('-').map(Number);
    return { year, month: month - 1, day };
  }

  /**
   * Returns start (00:00 UTC) and end (23:59:59.999 UTC) for a CDMX calendar date.
   * nextDueDate is stored at midnight UTC, so this range captures it.
   */
  private getCDMXDayRange(offsetDays: number = 0): { start: Date; end: Date } {
    const { year, month, day } = this.getCDMXDate();
    const start = new Date(Date.UTC(year, month, day + offsetDays, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, day + offsetDays, 23, 59, 59, 999));
    return { start, end };
  }

  private calculateNextDueDate(
    frequency: string,
    dayOfMonth: number,
  ): Date {
    const { year, month, day } = this.getCDMXDate();

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
