import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WhatsAppWeeklySummaryService {
  private readonly logger = new Logger(WhatsAppWeeklySummaryService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
  ) {}

  @Cron('0 10 * * 0') // Every Sunday at 10:00 AM
  async sendWeeklySummaries() {
    this.logger.log('Starting weekly summary cron...');

    const providers = await this.prisma.providerProfile.findMany({
      where: { isAvailable: true },
      include: {
        user: { select: { phone: true, name: true, ratingAverage: true, ratingCount: true } },
      },
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    let sent = 0;
    for (const provider of providers) {
      try {
        const weekJobs = await this.prisma.booking.findMany({
          where: {
            providerId: provider.id,
            status: { in: ['COMPLETED', 'RATED'] },
            completedAt: { gte: startOfWeek },
          },
          select: { price: true, completedAt: true },
        });

        if (weekJobs.length === 0) continue;

        const totalEarnings = weekJobs.reduce((sum, j) => sum + (j.price || 0), 0);

        // Find best day
        const byDay: Record<string, number> = {};
        for (const job of weekJobs) {
          if (job.completedAt) {
            const day = job.completedAt.toLocaleDateString('es-MX', { weekday: 'long' });
            byDay[day] = (byDay[day] || 0) + (job.price || 0);
          }
        }
        const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

        const rating = provider.user.ratingAverage?.toFixed(1) || '0.0';

        let msg =
          `💰 *Resumen Semanal*\n\n` +
          `Trabajos: ${weekJobs.length}\n` +
          `Rating: ${rating} ⭐\n`;

        if (totalEarnings > 0) {
          msg += `Ganancias: $${totalEarnings.toLocaleString('es-MX')} MXN\n`;
        }
        if (bestDay && bestDay[1] > 0) {
          msg += `Mejor día: ${bestDay[0]} ($${bestDay[1].toLocaleString('es-MX')})\n`;
        }

        msg += `\n¡Sigue así, ${provider.user.name || 'proveedor'}! 💪`;

        await this.whatsapp.sendTextMessage(provider.user.phone, msg);
        sent++;
      } catch (error: any) {
        this.logger.error(`Failed to send weekly summary to ${provider.user.phone}: ${error.message}`);
      }
    }

    this.logger.log(`Weekly summaries sent: ${sent}/${providers.length}`);
  }
}
