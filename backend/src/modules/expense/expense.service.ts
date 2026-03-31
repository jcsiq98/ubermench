import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateExpenseDto {
  providerId: string;
  amount: number;
  category?: string;
  description?: string;
  date?: Date;
}

export interface ExpenseSummary {
  period: string;
  total: number;
  count: number;
  byCategory: { category: string; total: number; count: number }[];
}

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({
      data: {
        providerId: dto.providerId,
        amount: new Prisma.Decimal(dto.amount),
        category: dto.category,
        description: dto.description,
        date: dto.date || new Date(),
      },
    });

    this.logger.log(
      `Expense created: $${dto.amount} for provider ${dto.providerId}`,
    );

    return expense;
  }

  async getWeekSummary(providerId: string): Promise<ExpenseSummary> {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    return this.getSummary(providerId, startOfWeek, now, 'esta semana');
  }

  async getMonthSummary(providerId: string): Promise<ExpenseSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.getSummary(providerId, startOfMonth, now, 'este mes');
  }

  private async getSummary(
    providerId: string,
    from: Date,
    to: Date,
    period: string,
  ): Promise<ExpenseSummary> {
    const expenses = await this.prisma.expense.findMany({
      where: {
        providerId,
        date: { gte: from, lte: to },
      },
    });

    const total = expenses.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );

    const categoryMap = new Map<string, { total: number; count: number }>();
    for (const expense of expenses) {
      const cat = expense.category || 'Sin categoría';
      const existing = categoryMap.get(cat) || { total: 0, count: 0 };
      existing.total += Number(expense.amount);
      existing.count += 1;
      categoryMap.set(cat, existing);
    }

    const byCategory = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({ category, ...data }),
    );

    return { period, total, count: expenses.length, byCategory };
  }

  async getRecent(providerId: string, limit = 5) {
    return this.prisma.expense.findMany({
      where: { providerId },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        amount: true,
        category: true,
        description: true,
        date: true,
      },
    });
  }

  formatExpenseConfirmation(
    amount: number,
    category?: string,
    description?: string,
  ): string {
    let msg = `✅ *¡Gasto registrado!*\n\n💸 *$${amount.toLocaleString('es-MX')}*`;

    if (category) msg += `\n🏷️ ${category}`;
    if (description) msg += `\n📝 ${description}`;

    return msg;
  }

  formatExpenseSummaryMessage(summary: ExpenseSummary): string {
    if (summary.count === 0) {
      return `📊 No tienes gastos registrados ${summary.period}.`;
    }

    let msg =
      `📊 *Gastos ${summary.period}*\n\n` +
      `💸 Total: *$${summary.total.toLocaleString('es-MX')}*\n` +
      `📝 Gastos: ${summary.count}\n`;

    if (summary.byCategory.length > 1) {
      msg += '\nPor categoría:\n';
      for (const c of summary.byCategory) {
        msg += `  🏷️ ${c.category}: $${c.total.toLocaleString('es-MX')} (${c.count})\n`;
      }
    }

    return msg;
  }
}
