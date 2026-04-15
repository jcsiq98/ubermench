import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethod, Prisma } from '@prisma/client';

export interface CreateIncomeDto {
  providerId: string;
  amount: number;
  description?: string;
  paymentMethod?: PaymentMethod;
  clientName?: string;
  date?: Date;
}

export interface IncomeSummary {
  period: string;
  total: number;
  count: number;
  byMethod: { method: string; total: number; count: number }[];
}

@Injectable()
export class IncomeService {
  private readonly logger = new Logger(IncomeService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateIncomeDto) {
    const income = await this.prisma.income.create({
      data: {
        providerId: dto.providerId,
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
        clientName: dto.clientName,
        date: dto.date || new Date(),
      },
    });

    this.logger.log(
      `Income created: $${dto.amount} for provider ${dto.providerId}`,
    );

    return income;
  }

  async getWeekSummary(providerId: string): Promise<IncomeSummary> {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    return this.getSummary(providerId, startOfWeek, now, 'esta semana');
  }

  async getMonthSummary(providerId: string): Promise<IncomeSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.getSummary(providerId, startOfMonth, now, 'este mes');
  }

  async getTodaySummary(providerId: string): Promise<IncomeSummary> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    return this.getSummary(providerId, startOfDay, now, 'hoy');
  }

  async getRecentIncomes(providerId: string, limit = 5) {
    return this.prisma.income.findMany({
      where: { providerId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  private async getSummary(
    providerId: string,
    from: Date,
    to: Date,
    period: string,
  ): Promise<IncomeSummary> {
    const incomes = await this.prisma.income.findMany({
      where: {
        providerId,
        date: { gte: from, lte: to },
      },
    });

    const total = incomes.reduce(
      (sum, i) => sum + Number(i.amount),
      0,
    );

    const methodMap = new Map<string, { total: number; count: number }>();
    for (const income of incomes) {
      const method = income.paymentMethod;
      const existing = methodMap.get(method) || { total: 0, count: 0 };
      existing.total += Number(income.amount);
      existing.count += 1;
      methodMap.set(method, existing);
    }

    const byMethod = Array.from(methodMap.entries()).map(([method, data]) => ({
      method,
      ...data,
    }));

    return { period, total, count: incomes.length, byMethod };
  }

  formatSummaryMessage(summary: IncomeSummary): string {
    if (summary.count === 0) {
      return `📊 No tienes ingresos registrados ${summary.period}.`;
    }

    const methodLabels: Record<string, string> = {
      CASH: '💵 Efectivo',
      TRANSFER: '📲 Transferencia',
      CARD: '💳 Tarjeta',
      PAYMENT_LINK: '🔗 Link de cobro',
      OTHER: '📦 Otro',
    };

    let msg =
      `📊 *Resumen ${summary.period}*\n\n` +
      `💰 Total: *$${summary.total.toLocaleString('es-MX')}*\n` +
      `📝 Trabajos: ${summary.count}\n`;

    if (summary.byMethod.length > 1) {
      msg += '\nPor método de pago:\n';
      for (const m of summary.byMethod) {
        msg += `  ${methodLabels[m.method] || m.method}: $${m.total.toLocaleString('es-MX')} (${m.count})\n`;
      }
    }

    return msg;
  }

  formatIncomeConfirmation(
    amount: number,
    description?: string,
    clientName?: string,
    paymentMethod?: string,
  ): string {
    const methodLabels: Record<string, string> = {
      CASH: 'efectivo',
      TRANSFER: 'transferencia',
      CARD: 'tarjeta',
      PAYMENT_LINK: 'link de cobro',
      OTHER: 'otro',
    };

    let msg = `Anotado. *$${amount.toLocaleString('es-MX')}*`;

    if (description) msg += ` por ${description}`;
    if (clientName) msg += ` — ${clientName}`;
    if (paymentMethod) msg += `, en ${methodLabels[paymentMethod] || paymentMethod}`;
    msg += '.';

    return msg;
  }
}
