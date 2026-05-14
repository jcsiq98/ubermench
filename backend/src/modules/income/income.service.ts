import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethod, Prisma } from '@prisma/client';
import {
  getWeekStartUtc,
  getMonthStartUtc,
  getLocalDayRange,
  DEFAULT_TIMEZONE,
  formatDate,
} from '../../common/utils/timezone.utils';
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

export interface IncomeSummaryItem {
  amount: number;
  description: string | null;
  clientName: string | null;
  paymentMethod: string;
  date: Date;
}

export interface IncomeSummary {
  period: string;
  total: number;
  count: number;
  byMethod: { method: string; total: number; count: number }[];
  items: IncomeSummaryItem[];
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
      orderBy: { date: 'asc' },
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

    const items: IncomeSummaryItem[] = incomes.map((i) => ({
      amount: Number(i.amount),
      description: i.description,
      clientName: i.clientName,
      paymentMethod: i.paymentMethod,
      date: i.date,
    }));

    return { period, total, count: incomes.length, byMethod, items };
  }

  formatSummaryMessage(
    summary: IncomeSummary,
    tz: string = DEFAULT_TIMEZONE,
  ): string {
    if (summary.count === 0) {
      return `📊 No tienes ingresos registrados ${summary.period}.`;
    }

    let msg =
      `📊 *Resumen ${summary.period}*\n\n` +
      `Total: *$${summary.total.toLocaleString('es-MX')}*\n` +
      `Trabajos: ${summary.count}`;

    if (summary.byMethod.length > 1) {
      msg += '\n\nPor método de pago:\n';
      for (const m of summary.byMethod) {
        const label = methodLabel(m.method);
        msg += `• ${label}: $${m.total.toLocaleString('es-MX')} (${m.count})\n`;
      }
      msg = msg.replace(/\n$/, '');
    }

    // Detail block — different shapes depending on number of records.
    if (summary.items.length > 0 && summary.items.length <= 8) {
      msg += '\n\nDetalle:\n';
      for (const item of summary.items) {
        msg += `${formatIncomeLine(item, tz)}\n`;
      }
      msg = msg.replace(/\n$/, '');
    } else if (summary.items.length > 8) {
      const groupedByMonth = groupItemsByMonth(summary.items, tz);
      msg += '\n\nPor mes:\n';
      for (const group of groupedByMonth) {
        msg += `• ${group.label}: $${group.total.toLocaleString('es-MX')} (${group.count})\n`;
      }
      msg = msg.replace(/\n$/, '');

      const recent = summary.items.slice(-5).reverse();
      msg += '\n\nMás recientes:\n';
      for (const item of recent) {
        msg += `${formatIncomeLine(item, tz)}\n`;
      }
      msg = msg.replace(/\n$/, '');
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

// ──────────────────────────────────────────────
// Module-private formatting helpers (Cap. 49)
// ──────────────────────────────────────────────

function methodLabel(method: string): string {
  switch (method) {
    case 'CASH': return 'efectivo';
    case 'TRANSFER': return 'transferencia';
    case 'CARD': return 'tarjeta';
    case 'PAYMENT_LINK': return 'link de cobro';
    case 'OTHER': return 'otro';
    default: return method.toLowerCase();
  }
}

function formatShortDate(date: Date, tz: string): string {
  // "02 may" style. Intl in es-MX returns "02-may" or "2 may." depending on
  // node/icu version — normalize both into "DD may".
  const raw = formatDate(date, tz, {
    weekday: undefined,
    day: '2-digit',
    month: 'short',
  });
  return raw
    .replace(/\./g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatIncomeLine(item: IncomeSummaryItem, tz: string): string {
  const date = formatShortDate(item.date, tz);
  const amount = `$${item.amount.toLocaleString('es-MX')}`;
  const parts: string[] = [`${date} — ${amount}`];

  const detailBits: string[] = [];
  if (item.description) detailBits.push(item.description);
  if (item.clientName) detailBits.push(item.clientName);

  if (detailBits.length > 0) parts.push(detailBits.join(', '));
  parts.push(`(${methodLabel(item.paymentMethod)})`);

  return `• ${parts.join(' ')}`;
}

function groupItemsByMonth(
  items: IncomeSummaryItem[],
  tz: string,
): { label: string; total: number; count: number }[] {
  const groups = new Map<string, { label: string; total: number; count: number }>();
  for (const item of items) {
    const label = formatDate(item.date, tz, {
      weekday: undefined,
      day: undefined,
      month: 'long',
      year: 'numeric',
    });
    const existing = groups.get(label) ?? { label, total: 0, count: 0 };
    existing.total += item.amount;
    existing.count += 1;
    groups.set(label, existing);
  }
  return Array.from(groups.values());
}
