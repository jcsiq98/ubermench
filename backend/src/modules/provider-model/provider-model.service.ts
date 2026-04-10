import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import {
  ProviderModel,
  FinancialPatterns,
  ClientPatterns,
  SchedulePatterns,
} from './provider-model.types';

const CACHE_PREFIX = 'provider_model:';
const CACHE_TTL = 300; // 5 minutes

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

@Injectable()
export class ProviderModelService {
  private readonly logger = new Logger(ProviderModelService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getProviderModel(providerId: string): Promise<ProviderModel | null> {
    const cacheKey = `${CACHE_PREFIX}${providerId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // cache miss, compute fresh
    }

    try {
      const [financial, clients, schedule] = await Promise.all([
        this.computeFinancialPatterns(providerId),
        this.computeClientPatterns(providerId),
        this.computeSchedulePatterns(providerId),
      ]);

      const model: ProviderModel = { financial, clients, schedule };

      await this.redis
        .set(cacheKey, JSON.stringify(model), CACHE_TTL)
        .catch(() => {});

      return model;
    } catch (err: any) {
      this.logger.error(
        `Failed to compute provider model: ${err.message}`,
      );
      return null;
    }
  }

  async invalidate(providerId: string): Promise<void> {
    await this.redis.del(`${CACHE_PREFIX}${providerId}`).catch(() => {});
  }

  private async computeFinancialPatterns(
    providerId: string,
  ): Promise<FinancialPatterns> {
    const now = this.cdmxNow();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const thisWeekStart = this.getWeekStart(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const thisMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    );

    const [incomes30d, expensesMonth] = await Promise.all([
      this.prisma.income.findMany({
        where: { providerId, date: { gte: thirtyDaysAgo } },
        select: { amount: true, date: true },
      }),
      this.prisma.expense.findMany({
        where: { providerId, date: { gte: thisMonthStart } },
        select: { amount: true },
      }),
    ]);

    let thisWeekIncome = 0;
    let lastWeekIncome = 0;
    let thisMonthIncome = 0;
    const dayTotals = new Map<number, number>();

    for (const inc of incomes30d) {
      const amount = Number(inc.amount);
      const date = new Date(inc.date);
      const dow = date.getDay();

      dayTotals.set(dow, (dayTotals.get(dow) || 0) + amount);

      if (date >= thisWeekStart) thisWeekIncome += amount;
      else if (date >= lastWeekStart) lastWeekIncome += amount;
      if (date >= thisMonthStart) thisMonthIncome += amount;
    }

    const totalExpensesThisMonth = expensesMonth.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );

    // Average weekly income: total last 30 days / ~4.3 weeks
    const total30d = incomes30d.reduce(
      (sum, i) => sum + Number(i.amount),
      0,
    );
    const weeksInPeriod = 30 / 7;
    const avgWeeklyIncome =
      incomes30d.length > 0
        ? Math.round(total30d / weeksInPeriod)
        : null;

    const avgTicket =
      incomes30d.length > 0
        ? Math.round(total30d / incomes30d.length)
        : null;

    // Best day of week by total income
    let bestDayOfWeek: string | null = null;
    if (dayTotals.size > 0) {
      let maxDay = 0;
      let maxAmount = 0;
      for (const [day, total] of dayTotals) {
        if (total > maxAmount) {
          maxAmount = total;
          maxDay = day;
        }
      }
      bestDayOfWeek = DAY_NAMES[maxDay];
    }

    return {
      avgWeeklyIncome,
      avgTicket,
      bestDayOfWeek,
      thisWeekIncome: Math.round(thisWeekIncome),
      lastWeekIncome: Math.round(lastWeekIncome),
      thisMonthIncome: Math.round(thisMonthIncome),
      totalExpensesThisMonth: Math.round(totalExpensesThisMonth),
      netThisMonth: Math.round(thisMonthIncome - totalExpensesThisMonth),
    };
  }

  private async computeClientPatterns(
    providerId: string,
  ): Promise<ClientPatterns> {
    const thirtyDaysAgo = new Date(this.cdmxNow());
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const incomes = await this.prisma.income.findMany({
      where: {
        providerId,
        date: { gte: thirtyDaysAgo },
        clientName: { not: null },
      },
      select: { clientName: true, amount: true },
    });

    const clientMap = new Map<
      string,
      { totalJobs: number; totalAmount: number }
    >();

    for (const inc of incomes) {
      const name = inc.clientName!.trim();
      if (!name) continue;
      const existing = clientMap.get(name) || {
        totalJobs: 0,
        totalAmount: 0,
      };
      existing.totalJobs += 1;
      existing.totalAmount += Number(inc.amount);
      clientMap.set(name, existing);
    }

    const topClients = Array.from(clientMap.entries())
      .map(([name, data]) => ({
        name,
        totalJobs: data.totalJobs,
        totalAmount: Math.round(data.totalAmount),
      }))
      .sort((a, b) => b.totalJobs - a.totalJobs)
      .slice(0, 5);

    const uniqueClients = clientMap.size;
    const repeatClients = Array.from(clientMap.values()).filter(
      (c) => c.totalJobs > 1,
    ).length;
    const repeatClientRate =
      uniqueClients > 0
        ? Math.round((repeatClients / uniqueClients) * 100)
        : null;

    return {
      topClients,
      uniqueClientsLast30Days: uniqueClients,
      repeatClientRate,
    };
  }

  private async computeSchedulePatterns(
    providerId: string,
  ): Promise<SchedulePatterns> {
    const now = this.cdmxNow();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const thisWeekStart = this.getWeekStart(now);
    const nextWeekStart = new Date(thisWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

    const [recentAppointments, thisWeekCount, nextWeekCount] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            providerId,
            scheduledAt: { gte: thirtyDaysAgo, lte: now },
          },
          select: { scheduledAt: true },
        }),
        this.prisma.appointment.count({
          where: {
            providerId,
            scheduledAt: { gte: thisWeekStart, lt: nextWeekStart },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
        this.prisma.appointment.count({
          where: {
            providerId,
            scheduledAt: { gte: nextWeekStart, lt: nextWeekEnd },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
      ]);

    let busiestDay: string | null = null;
    if (recentAppointments.length > 0) {
      const dayCounts = new Map<number, number>();
      for (const apt of recentAppointments) {
        const dow = new Date(apt.scheduledAt).getDay();
        dayCounts.set(dow, (dayCounts.get(dow) || 0) + 1);
      }
      let maxDay = 0;
      let maxCount = 0;
      for (const [day, count] of dayCounts) {
        if (count > maxCount) {
          maxCount = count;
          maxDay = day;
        }
      }
      busiestDay = DAY_NAMES[maxDay];
    }

    return {
      busiestDay,
      appointmentsThisWeek: thisWeekCount,
      appointmentsNextWeek: nextWeekCount,
    };
  }

  private cdmxNow(): Date {
    const utc = new Date();
    const cdmxOffset = -6 * 60;
    return new Date(utc.getTime() + cdmxOffset * 60 * 1000);
  }

  private getWeekStart(date: Date): Date {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return start;
  }
}
