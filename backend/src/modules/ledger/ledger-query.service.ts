import { Injectable, Logger } from '@nestjs/common';
import { PaymentLinkStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_CLIENT_HISTORY_LIMIT = 5;
const DEFAULT_INACTIVE_DAYS = 90;
const DEFAULT_LIST_LIMIT = 5;

/**
 * Provenance for a ledger read: the row ids that back the answer.
 * Memory policy rule 4 (`.sanctuary/memory-policy.md` [roca]): every
 * financial/operational answer must be traceable to a ledger row id.
 * Emitted to logs even when not shown to the user.
 */
export interface LedgerProvenance {
  incomeIds: string[];
  appointmentIds: string[];
  paymentLinkIds: string[];
  contactIds: string[];
}

export interface LedgerClientActivity {
  id: string;
  type: 'income' | 'appointment' | 'payment_link';
  date: Date;
  amount?: number | null;
  description?: string | null;
  status?: string | null;
}

export interface LedgerClientHistory {
  query: string;
  clientLabel: string;
  totalIncome: number;
  incomeCount: number;
  appointmentCount: number;
  pendingPaymentLinkCount: number;
  lastActivityAt: Date | null;
  recentActivity: LedgerClientActivity[];
  provenance: LedgerProvenance;
}

export interface InactiveClientItem {
  clientLabel: string;
  contactId: string | null;
  lastActivityAt: Date;
  daysInactive: number;
  totalIncome: number;
  incomeCount: number;
  appointmentCount: number;
}

export interface PendingChargeItem {
  id: string;
  type: 'payment_link';
  clientLabel: string;
  amount?: number | null;
  description?: string | null;
  date: Date;
  status: string;
}

export interface PendingChargesResult {
  items: PendingChargeItem[];
  totalAmount: number;
  provenance: LedgerProvenance;
}

type ClientRecordBucket = {
  clientLabel: string;
  contactId: string | null;
  lastActivityAt: Date | null;
  totalIncome: number;
  incomeCount: number;
  appointmentCount: number;
};

@Injectable()
export class LedgerQueryService {
  private readonly logger = new Logger(LedgerQueryService.name);

  constructor(private readonly prisma: PrismaService) {}

  private emptyProvenance(): LedgerProvenance {
    return {
      incomeIds: [],
      appointmentIds: [],
      paymentLinkIds: [],
      contactIds: [],
    };
  }

  private logProvenance(
    query: string,
    providerId: string,
    provenance: LedgerProvenance,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'ledger_query',
        query,
        providerId,
        incomeIds: provenance.incomeIds,
        appointmentIds: provenance.appointmentIds,
        paymentLinkIds: provenance.paymentLinkIds,
        contactIds: provenance.contactIds,
      }),
    );
  }

  async getClientHistory(input: {
    providerId: string;
    clientName: string;
    limit?: number;
  }): Promise<LedgerClientHistory | null> {
    const query = input.clientName.trim();
    if (!query) return null;

    const limit = this.normalizeLimit(
      input.limit,
      DEFAULT_CLIENT_HISTORY_LIMIT,
    );
    const contacts = await this.prisma.contact.findMany({
      where: {
        providerId: input.providerId,
        name: { contains: query, mode: 'insensitive' },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 5,
    });
    const contactIds = contacts.map((c) => c.id);
    const clientFilter = this.clientMatchFilter(query, contactIds);

    const [incomes, appointments, paymentLinks] = await Promise.all([
      this.prisma.income.findMany({
        where: {
          providerId: input.providerId,
          OR: clientFilter,
        },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.prisma.appointment.findMany({
        where: {
          providerId: input.providerId,
          OR: clientFilter,
        },
        orderBy: { scheduledAt: 'desc' },
        take: 20,
      }),
      this.prisma.paymentLink.findMany({
        where: {
          providerId: input.providerId,
          OR: clientFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    if (
      contacts.length === 0 &&
      incomes.length === 0 &&
      appointments.length === 0 &&
      paymentLinks.length === 0
    ) {
      return null;
    }

    const recentActivity = [
      ...incomes.map(
        (income): LedgerClientActivity => ({
          id: income.id,
          type: 'income',
          date: income.date,
          amount: Number(income.amount),
          description: income.description,
          status: income.paymentMethod,
        }),
      ),
      ...appointments.map(
        (appointment): LedgerClientActivity => ({
          id: appointment.id,
          type: 'appointment',
          date: appointment.scheduledAt,
          amount: appointment.estimatedPrice,
          description: appointment.description,
          status: appointment.status,
        }),
      ),
      ...paymentLinks.map(
        (link): LedgerClientActivity => ({
          id: link.id,
          type: 'payment_link',
          date: link.createdAt,
          amount: Number(link.amount),
          description: link.description,
          status: link.status,
        }),
      ),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);

    const provenance: LedgerProvenance = {
      incomeIds: incomes.map((i) => i.id),
      appointmentIds: appointments.map((a) => a.id),
      paymentLinkIds: paymentLinks.map((p) => p.id),
      contactIds,
    };
    this.logProvenance('consultar_cliente', input.providerId, provenance);

    return {
      query,
      clientLabel:
        contacts[0]?.name ||
        this.bestClientName(query, [
          ...incomes.map((i) => i.clientName),
          ...appointments.map((a) => a.clientName),
          ...paymentLinks.map((p) => p.clientName),
        ]),
      totalIncome: incomes.reduce(
        (sum, income) => sum + Number(income.amount),
        0,
      ),
      incomeCount: incomes.length,
      appointmentCount: appointments.length,
      pendingPaymentLinkCount: paymentLinks.filter(
        (link) => link.status === PaymentLinkStatus.PENDING,
      ).length,
      lastActivityAt:
        recentActivity[0]?.date ?? contacts[0]?.lastUsedAt ?? null,
      recentActivity,
      provenance,
    };
  }

  async listInactiveClients(input: {
    providerId: string;
    days?: number;
    limit?: number;
  }): Promise<InactiveClientItem[]> {
    const days = this.normalizePositiveInt(input.days, DEFAULT_INACTIVE_DAYS);
    const limit = this.normalizeLimit(input.limit, DEFAULT_LIST_LIMIT);
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [contacts, incomes, appointments, paymentLinks] = await Promise.all([
      this.prisma.contact.findMany({
        where: { providerId: input.providerId },
        take: 250,
      }),
      this.prisma.income.findMany({
        where: { providerId: input.providerId, date: { lte: now } },
        orderBy: { date: 'desc' },
        take: 500,
      }),
      this.prisma.appointment.findMany({
        where: { providerId: input.providerId, scheduledAt: { lte: now } },
        orderBy: { scheduledAt: 'desc' },
        take: 500,
      }),
      this.prisma.paymentLink.findMany({
        where: { providerId: input.providerId, createdAt: { lte: now } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const buckets = new Map<string, ClientRecordBucket>();
    const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));

    for (const contact of contacts) {
      if (contact.lastUsedAt) {
        this.touchBucket(
          buckets,
          `contact:${contact.id}`,
          contact.name,
          contact.lastUsedAt,
          contact.id,
        );
      }
    }

    for (const income of incomes) {
      const key = this.bucketKey(income.contactId, income.clientName);
      if (!key) continue;
      const label = this.bucketLabel(
        income.contactId,
        income.clientName,
        contactNameById,
      );
      const bucket = this.touchBucket(
        buckets,
        key,
        label,
        income.date,
        income.contactId,
      );
      bucket.totalIncome += Number(income.amount);
      bucket.incomeCount += 1;
    }

    for (const appointment of appointments) {
      const key = this.bucketKey(appointment.contactId, appointment.clientName);
      if (!key) continue;
      const label = this.bucketLabel(
        appointment.contactId,
        appointment.clientName,
        contactNameById,
      );
      const bucket = this.touchBucket(
        buckets,
        key,
        label,
        appointment.scheduledAt,
        appointment.contactId,
      );
      bucket.appointmentCount += 1;
    }

    for (const link of paymentLinks) {
      const key = this.bucketKey(link.contactId, link.clientName);
      if (!key) continue;
      const label = this.bucketLabel(
        link.contactId,
        link.clientName,
        contactNameById,
      );
      this.touchBucket(buckets, key, label, link.createdAt, link.contactId);
    }

    const items = Array.from(buckets.values())
      .filter(
        (bucket) => bucket.lastActivityAt && bucket.lastActivityAt <= cutoff,
      )
      .sort((a, b) => a.lastActivityAt!.getTime() - b.lastActivityAt!.getTime())
      .slice(0, limit)
      .map((bucket) => ({
        clientLabel: bucket.clientLabel,
        contactId: bucket.contactId,
        lastActivityAt: bucket.lastActivityAt!,
        daysInactive: Math.floor(
          (now.getTime() - bucket.lastActivityAt!.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
        totalIncome: bucket.totalIncome,
        incomeCount: bucket.incomeCount,
        appointmentCount: bucket.appointmentCount,
      }));

    const provenance = this.emptyProvenance();
    provenance.contactIds = items
      .map((item) => item.contactId)
      .filter((id): id is string => Boolean(id));
    this.logProvenance('clientes_inactivos', input.providerId, provenance);

    return items;
  }

  async listPendingCharges(input: {
    providerId: string;
    limit?: number;
  }): Promise<PendingChargesResult> {
    const limit = this.normalizeLimit(input.limit, DEFAULT_LIST_LIMIT);
    const now = new Date();

    const links = await this.prisma.paymentLink.findMany({
      where: {
        providerId: input.providerId,
        status: PaymentLinkStatus.PENDING,
        incomeId: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const items = [
      ...links.map(
        (link): PendingChargeItem => ({
          id: link.id,
          type: 'payment_link',
          clientLabel: link.clientName || 'Cliente sin nombre',
          amount: Number(link.amount),
          description: link.description,
          date: link.createdAt,
          status: link.status,
        }),
      ),
    ]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, limit);

    const provenance = this.emptyProvenance();
    provenance.paymentLinkIds = items.map((item) => item.id);
    this.logProvenance('cobros_pendientes', input.providerId, provenance);

    return {
      items,
      totalAmount: items.reduce((sum, item) => sum + (item.amount ?? 0), 0),
      provenance,
    };
  }

  private clientMatchFilter(query: string, contactIds: string[]) {
    const clauses: Record<string, unknown>[] = [
      { clientName: { contains: query, mode: 'insensitive' } },
    ];
    if (contactIds.length > 0) {
      clauses.unshift({ contactId: { in: contactIds } });
    }
    return clauses;
  }

  private normalizeLimit(value: number | undefined, fallback: number): number {
    return Math.min(
      Math.max(this.normalizePositiveInt(value, fallback), 1),
      10,
    );
  }

  private normalizePositiveInt(
    value: number | undefined,
    fallback: number,
  ): number {
    if (!value || !Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
  }

  private bestClientName(query: string, names: Array<string | null>): string {
    return (
      names.find((name) => name && name.trim().length > 0)?.trim() || query
    );
  }

  private bucketKey(
    contactId?: string | null,
    clientName?: string | null,
  ): string | null {
    if (contactId) return `contact:${contactId}`;
    const normalized = this.normalizeName(clientName);
    return normalized ? `name:${normalized}` : null;
  }

  private bucketLabel(
    contactId: string | null,
    clientName: string | null,
    contactNameById: Map<string, string>,
  ): string {
    if (contactId && contactNameById.has(contactId)) {
      return contactNameById.get(contactId)!;
    }
    return clientName?.trim() || 'Cliente sin nombre';
  }

  private touchBucket(
    buckets: Map<string, ClientRecordBucket>,
    key: string,
    clientLabel: string,
    date: Date,
    contactId?: string | null,
  ): ClientRecordBucket {
    const existing = buckets.get(key) ?? {
      clientLabel,
      contactId: null,
      lastActivityAt: null,
      totalIncome: 0,
      incomeCount: 0,
      appointmentCount: 0,
    };
    if (!existing.lastActivityAt || date > existing.lastActivityAt) {
      existing.lastActivityAt = date;
    }
    if (!existing.contactId && contactId) {
      existing.contactId = contactId;
    }
    buckets.set(key, existing);
    return existing;
  }

  private normalizeName(value?: string | null): string | null {
    const normalized = value
      ?.trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
    return normalized || null;
  }
}
