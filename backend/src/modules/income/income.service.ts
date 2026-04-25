import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethod, Prisma } from '@prisma/client';
import { getWeekStartUtc, getMonthStartUtc, getLocalDayRange, DEFAULT_TIMEZONE } from '../../common/utils/timezone.utils';
import {
  FINANCIAL_EVENT,
  emitFinancialEvent,
} from '../../common/utils/financial-audit';

export interface CreateIncomeDto {
  providerId: string;
  amount: number;
  description?: string;
  paymentMethod?: PaymentMethod;
  clientName?: string;
  date?: Date;
  /**
   * Hash of the user message that triggered this write (Cap. 45 — M0).
   * Optional so legacy callers don't break, but every WhatsApp-driven
   * call should pass it so the integrity endpoint can join the chain.
   */
  sourceTextHash?: string;
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
    emitFinancialEvent(this.logger, {
      event: FINANCIAL_EVENT.WRITE_ATTEMPTED,
      kind: 'income',
      providerId: dto.providerId,
      amount: dto.amount,
      sourceTextHash: dto.sourceTextHash,
    });

    try {
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

      emitFinancialEvent(this.logger, {
        event: FINANCIAL_EVENT.WRITE_COMMITTED,
        kind: 'income',
        providerId: dto.providerId,
        amount: dto.amount,
        recordId: income.id,
        sourceTextHash: dto.sourceTextHash,
      });

      this.logger.log(
        `Income created: $${dto.amount} for provider ${dto.providerId}`,
      );

      return income;
    } catch (err) {
      emitFinancialEvent(this.logger, {
        event: FINANCIAL_EVENT.WRITE_FAILED,
        kind: 'income',
        providerId: dto.providerId,
        amount: dto.amount,
        sourceTextHash: dto.sourceTextHash,
        reason: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getWeekSummary(providerId: string, tz: string = DEFAULT_TIMEZONE): Promise<IncomeSummary> {
    const startOfWeek = getWeekStartUtc(tz);
    return this.getSummary(providerId, startOfWeek, new Date(), 'esta semana');
  }

  async getMonthSummary(providerId: string, tz: string = DEFAULT_TIMEZONE): Promise<IncomeSummary> {
    const startOfMonth = getMonthStartUtc(tz);
    return this.getSummary(providerId, startOfMonth, new Date(), 'este mes');
  }

  async getTodaySummary(providerId: string, tz: string = DEFAULT_TIMEZONE): Promise<IncomeSummary> {
    const { start } = getLocalDayRange(tz);
    return this.getSummary(providerId, start, new Date(), 'hoy');
  }

  async getRecentIncomes(providerId: string, limit = 5) {
    return this.prisma.income.findMany({
      where: { providerId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async getCustomSummary(
    providerId: string,
    from: Date,
    to: Date,
    period: string,
  ): Promise<IncomeSummary> {
    return this.getSummary(providerId, from, to, period);
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
