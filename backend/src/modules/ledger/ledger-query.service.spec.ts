import {
  AppointmentStatus,
  PaymentLinkStatus,
  PaymentMethod,
} from '@prisma/client';
import { LedgerQueryService } from './ledger-query.service';

function d(iso: string): Date {
  return new Date(iso);
}

function makePrisma() {
  return {
    contact: {
      findMany: jest.fn(),
    },
    income: {
      findMany: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
    },
    paymentLink: {
      findMany: jest.fn(),
    },
  };
}

describe('LedgerQueryService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns client history from incomes, appointments, and payment links', async () => {
    const prisma = makePrisma();
    prisma.contact.findMany.mockResolvedValueOnce([
      {
        id: 'contact-1',
        name: 'Sra. García',
        lastUsedAt: d('2026-04-01T15:00:00Z'),
        updatedAt: d('2026-04-01T15:00:00Z'),
      },
    ]);
    prisma.income.findMany.mockResolvedValueOnce([
      {
        id: 'income-1',
        amount: 1200,
        description: 'mantenimiento',
        paymentMethod: PaymentMethod.CASH,
        clientName: 'Sra. García',
        date: d('2026-06-01T15:00:00Z'),
      },
    ]);
    prisma.appointment.findMany.mockResolvedValueOnce([
      {
        id: 'appt-1',
        description: 'boiler',
        estimatedPrice: 900,
        clientName: 'Sra. García',
        scheduledAt: d('2026-05-01T15:00:00Z'),
        status: AppointmentStatus.COMPLETED,
      },
    ]);
    prisma.paymentLink.findMany.mockResolvedValueOnce([
      {
        id: 'link-1',
        amount: 500,
        description: 'anticipo',
        clientName: 'Sra. García',
        createdAt: d('2026-06-05T15:00:00Z'),
        status: PaymentLinkStatus.PENDING,
      },
    ]);

    const service = new LedgerQueryService(prisma as any);
    const result = await service.getClientHistory({
      providerId: 'provider-1',
      clientName: 'garcia',
    });

    expect(result).toMatchObject({
      clientLabel: 'Sra. García',
      totalIncome: 1200,
      incomeCount: 1,
      appointmentCount: 1,
      pendingPaymentLinkCount: 1,
    });
    expect(result?.recentActivity[0]).toMatchObject({
      id: 'link-1',
      type: 'payment_link',
      amount: 500,
    });
    expect(result?.provenance).toEqual({
      incomeIds: ['income-1'],
      appointmentIds: ['appt-1'],
      paymentLinkIds: ['link-1'],
      contactIds: ['contact-1'],
    });
    expect(prisma.income.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerId: 'provider-1',
          OR: expect.arrayContaining([{ contactId: { in: ['contact-1'] } }]),
        }),
      }),
    );
  });

  it('returns null when a client has no ledger records', async () => {
    const prisma = makePrisma();
    prisma.contact.findMany.mockResolvedValueOnce([]);
    prisma.income.findMany.mockResolvedValueOnce([]);
    prisma.appointment.findMany.mockResolvedValueOnce([]);
    prisma.paymentLink.findMany.mockResolvedValueOnce([]);

    const service = new LedgerQueryService(prisma as any);
    await expect(
      service.getClientHistory({
        providerId: 'provider-1',
        clientName: 'Pedro',
      }),
    ).resolves.toBeNull();
  });

  it('lists clients inactive beyond the configured threshold', async () => {
    jest.useFakeTimers().setSystemTime(d('2026-06-22T12:00:00Z'));
    const prisma = makePrisma();
    prisma.contact.findMany.mockResolvedValueOnce([]);
    prisma.income.findMany.mockResolvedValueOnce([
      {
        id: 'income-mariana',
        contactId: 'contact-mariana',
        clientName: 'Mariana',
        amount: 800,
        date: d('2026-02-01T12:00:00Z'),
      },
      {
        id: 'income-luis',
        contactId: null,
        clientName: 'Luis',
        amount: 500,
        date: d('2026-06-01T12:00:00Z'),
      },
    ]);
    prisma.appointment.findMany.mockResolvedValueOnce([]);
    prisma.paymentLink.findMany.mockResolvedValueOnce([]);

    const service = new LedgerQueryService(prisma as any);
    const result = await service.listInactiveClients({
      providerId: 'provider-1',
      days: 90,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      clientLabel: 'Mariana',
      contactId: 'contact-mariana',
      totalIncome: 800,
      incomeCount: 1,
    });
    expect(result[0].daysInactive).toBeGreaterThan(90);
  });

  it('lists pending charges from pending payment links', async () => {
    const prisma = makePrisma();
    prisma.paymentLink.findMany.mockResolvedValueOnce([
      {
        id: 'link-pedro',
        amount: 1500,
        description: 'reparación',
        clientName: 'Pedro',
        createdAt: d('2026-06-01T12:00:00Z'),
        status: PaymentLinkStatus.PENDING,
      },
    ]);
    const service = new LedgerQueryService(prisma as any);
    const result = await service.listPendingCharges({
      providerId: 'provider-1',
    });

    expect(result.totalAmount).toBe(1500);
    expect(result.items.map((item) => item.clientLabel)).toEqual(['Pedro']);
    expect(result.provenance.paymentLinkIds).toEqual(['link-pedro']);
    expect(prisma.paymentLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PaymentLinkStatus.PENDING,
          incomeId: null,
        }),
      }),
    );
  });
});
