import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import { getLocalHour, getLocalDayOfWeek, DEFAULT_TIMEZONE } from '../../common/utils/timezone.utils';

@Injectable()
export class WhatsAppWeeklySummaryService {
  private readonly logger = new Logger(WhatsAppWeeklySummaryService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
  ) {}

  @Cron('0 * * * 0') // Every hour on Sundays
  async sendWeeklySummaries() {
    const providers = await this.prisma.providerProfile.findMany({
      include: {
        user: { select: { phone: true, name: true } },
        workspaceProfile: { select: { timezone: true } },
      },
    });

    let sent = 0;
    for (const provider of providers) {
      try {
        const tz = provider.workspaceProfile?.timezone || DEFAULT_TIMEZONE;

        if (getLocalHour(tz) !== 10) continue;
        if (getLocalDayOfWeek(tz) !== 0) continue;

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 7);
        startOfWeek.setHours(0, 0, 0, 0);

        const weekIncomes = await this.prisma.income.findMany({
          where: {
            providerId: provider.id,
            date: { gte: startOfWeek },
          },
          select: { amount: true, date: true },
        });

        if (weekIncomes.length === 0) continue;

        const total = weekIncomes.reduce((sum, i) => sum + Number(i.amount), 0);

        const byDay: Record<string, number> = {};
        for (const income of weekIncomes) {
          const day = income.date.toLocaleDateString('es-MX', { weekday: 'long', timeZone: tz });
          byDay[day] = (byDay[day] || 0) + Number(income.amount);
        }
        const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

        let msg =
          `📊 *Tu semana*\n\n` +
          `Cobros: ${weekIncomes.length}\n` +
          `Total: *$${total.toLocaleString('es-MX')}*`;

        if (bestDay && bestDay[1] > 0) {
          msg += `\nMejor día: ${bestDay[0]} ($${bestDay[1].toLocaleString('es-MX')})`;
        }

        await this.whatsapp.sendTextMessage(provider.user.phone, msg);
        sent++;
      } catch (error: any) {
        this.logger.error(`Failed to send weekly summary to ${provider.user.phone}: ${error.message}`);
      }
    }

    if (sent > 0) {
      this.logger.log(`Weekly summaries sent: ${sent}/${providers.length}`);
    }
  }
}
