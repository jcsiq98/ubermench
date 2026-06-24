import { Injectable, Logger } from '@nestjs/common';
import {
  BusinessLoopStatus,
  BusinessLoopType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_CONVERSION_WINDOW_DAYS = 14;

@Injectable()
export class BusinessLoopService {
  private readonly logger = new Logger(BusinessLoopService.name);

  constructor(private prisma: PrismaService) {}

  async createProposedEvent(input: {
    providerId: string;
    type: BusinessLoopType;
    message: string;
    contactId?: string | null;
    clientName?: string | null;
    sourcePaymentLinkId?: string | null;
  }) {
    return this.prisma.businessLoopEvent.create({
      data: {
        providerId: input.providerId,
        type: input.type,
        status: BusinessLoopStatus.PROPOSED,
        message: input.message,
        contactId: input.contactId ?? undefined,
        clientName: input.clientName ?? undefined,
        sourcePaymentLinkId: input.sourcePaymentLinkId ?? undefined,
      },
    });
  }

  async markSent(eventId?: string | null): Promise<void> {
    if (!eventId) return;
    await this.prisma.businessLoopEvent
      .update({
        where: { id: eventId },
        data: {
          status: BusinessLoopStatus.SENT,
          sentAt: new Date(),
        },
      })
      .catch((err) =>
        this.logger.warn(`Could not mark loop event sent ${eventId}: ${err.message}`),
      );
  }

  async convertByPaymentLink(input: {
    paymentLinkId: string;
    incomeId: string;
    amount: number;
  }): Promise<void> {
    const event = await this.prisma.businessLoopEvent.findFirst({
      where: {
        sourcePaymentLinkId: input.paymentLinkId,
        type: BusinessLoopType.COLLECTION,
        status: BusinessLoopStatus.SENT,
      },
      orderBy: { sentAt: 'desc' },
    });
    if (!event) return;

    await this.markConverted(event.id, {
      sourceIncomeId: input.incomeId,
      amount: input.amount,
    });
  }

  async convertRecentSentEvent(input: {
    providerId: string;
    contactId?: string | null;
    clientName?: string | null;
    incomeId?: string;
    appointmentId?: string;
    amount?: number | null;
    windowDays?: number;
  }): Promise<void> {
    const since = new Date(
      Date.now() -
        (input.windowDays ?? DEFAULT_CONVERSION_WINDOW_DAYS) *
          24 *
          60 *
          60 *
          1000,
    );
    const clientName = input.clientName?.trim();
    const clientWhere: Prisma.BusinessLoopEventWhereInput[] = [];
    if (input.contactId) clientWhere.push({ contactId: input.contactId });
    if (clientName) {
      clientWhere.push({ clientName: { equals: clientName, mode: 'insensitive' } });
    }
    if (clientWhere.length === 0) return;

    const event = await this.prisma.businessLoopEvent.findFirst({
      where: {
        providerId: input.providerId,
        type: BusinessLoopType.REACTIVATION,
        status: BusinessLoopStatus.SENT,
        sentAt: { gte: since },
        OR: clientWhere,
      },
      orderBy: { sentAt: 'desc' },
    });
    if (!event) return;

    await this.markConverted(event.id, {
      sourceIncomeId: input.incomeId,
      sourceAppointmentId: input.appointmentId,
      amount: input.amount ?? undefined,
    });
  }

  async getAttributablePesos(input: {
    providerId?: string;
    from: Date;
    to: Date;
    limit?: number;
  }) {
    const where: Prisma.BusinessLoopEventWhereInput = {
      status: BusinessLoopStatus.CONVERTED,
      convertedAt: { gte: input.from, lte: input.to },
      ...(input.providerId ? { providerId: input.providerId } : {}),
    };

    const [events, grouped] = await Promise.all([
      this.prisma.businessLoopEvent.findMany({
        where,
        orderBy: { convertedAt: 'desc' },
        take: input.limit ?? 100,
        include: {
          provider: { include: { user: true } },
        },
      }),
      this.prisma.businessLoopEvent.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Totals are derived from the (uncapped) groupBy, not from the `events`
    // preview list below — that list is capped at `take`, so reducing over it
    // would silently under-report once a window exceeds the limit.
    const byType = grouped.map((row) => ({
      type: row.type,
      amount: Number(row._sum.amount ?? 0),
      count: row._count,
    }));
    const totalAmount = byType.reduce((sum, row) => sum + row.amount, 0);
    const totalCount = byType.reduce((sum, row) => sum + row.count, 0);
    const sumForType = (type: BusinessLoopType) =>
      byType.find((row) => row.type === type)?.amount ?? 0;

    return {
      totals: {
        amount: totalAmount,
        count: totalCount,
        byType,
        // Honest attribution split. COLLECTION is causally tight (tied to the
        // exact paid link); REACTIVATION is correlational (a name/time-window
        // match). Keep them separate so the headline number is not read as
        // "pesos the loop caused" when half of it is proximity.
        byConfidence: {
          hard: sumForType(BusinessLoopType.COLLECTION),
          soft: sumForType(BusinessLoopType.REACTIVATION),
        },
      },
      events: events.map((event) => ({
        id: event.id,
        providerId: event.providerId,
        providerPhone: event.provider.user.phone,
        providerName: event.provider.user.name,
        type: event.type,
        clientName: event.clientName,
        amount: Number(event.amount ?? 0),
        convertedAt: event.convertedAt,
        sourceIncomeId: event.sourceIncomeId,
        sourceAppointmentId: event.sourceAppointmentId,
        sourcePaymentLinkId: event.sourcePaymentLinkId,
      })),
    };
  }

  private async markConverted(
    eventId: string,
    input: {
      sourceIncomeId?: string;
      sourceAppointmentId?: string;
      amount?: number;
    },
  ): Promise<void> {
    await this.prisma.businessLoopEvent
      .update({
        where: { id: eventId },
        data: {
          status: BusinessLoopStatus.CONVERTED,
          convertedAt: new Date(),
          sourceIncomeId: input.sourceIncomeId,
          sourceAppointmentId: input.sourceAppointmentId,
          amount:
            input.amount !== undefined
              ? new Prisma.Decimal(input.amount)
              : undefined,
        },
      })
      .catch((err) =>
        this.logger.warn(
          `Could not convert loop event ${eventId}: ${err.message}`,
        ),
      );
  }
}
