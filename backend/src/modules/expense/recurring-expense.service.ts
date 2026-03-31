import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseService } from './expense.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Prisma } from '@prisma/client';

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
    const recurring = await this.prisma.recurringExpense.findFirst({
      where: {
        providerId,
        isActive: true,
        description: { contains: description, mode: 'insensitive' },
      },
    });

    if (!recurring) return false;

    await this.prisma.recurringExpense.update({
      where: { id: recurring.id },
      data: { isActive: false },
    });

    this.logger.log(`Recurring expense cancelled: ${recurring.description}`);
    return true;
  }

  async listActive(providerId: string) {
    return this.prisma.recurringExpense.findMany({
      where: { providerId, isActive: true },
      orderBy: { createdAt: 'desc' },
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

  private calculateNextDueDate(
    frequency: string,
    dayOfMonth: number,
  ): Date {
    const now = new Date();

    if (frequency === 'weekly') {
      const next = new Date(now);
      next.setDate(next.getDate() + 7);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    // Monthly: next occurrence of dayOfMonth
    const safeDay = Math.min(dayOfMonth, 28);
    let next = new Date(now.getFullYear(), now.getMonth(), safeDay, 0, 0, 0, 0);
    if (next <= now) {
      next = new Date(now.getFullYear(), now.getMonth() + 1, safeDay, 0, 0, 0, 0);
    }
    return next;
  }
}
