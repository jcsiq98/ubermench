import { ExpenseService, ExpenseSummary } from './expense.service';

function makeService(): ExpenseService {
  // Pure-formatting tests never call create(), so the rate-limit guard is
  // a no-op stub here.
  return new ExpenseService(null as any, {
    assertWithinLimits: jest.fn().mockResolvedValue(undefined),
  } as any);
}

const tz = 'America/Mexico_City';

function d(iso: string): Date {
  return new Date(iso);
}

describe('ExpenseService.formatExpenseSummaryMessage — empty / single-category', () => {
  const service = makeService();

  it('returns single-line message when count is 0', () => {
    const summary: ExpenseSummary = {
      period: 'esta semana',
      total: 0,
      count: 0,
      byCategory: [],
      items: [],
    };
    expect(service.formatExpenseSummaryMessage(summary, tz)).toBe(
      '📊 No tienes gastos registrados esta semana.',
    );
  });

  it('omits "Por categoría" when only one category is used', () => {
    const summary: ExpenseSummary = {
      period: 'esta semana',
      total: 450,
      count: 1,
      byCategory: [{ category: 'material', total: 450, count: 1 }],
      items: [
        {
          amount: 450,
          category: 'material',
          description: 'cemento',
          date: d('2026-05-13T18:00:00Z'),
        },
      ],
    };
    const msg = service.formatExpenseSummaryMessage(summary, tz);
    expect(msg).not.toContain('Por categoría');
    expect(msg).toContain('Detalle:');
    expect(msg).toContain('cemento, material');
  });

  it('uses exactly one emoji (header) for non-empty summaries', () => {
    const summary: ExpenseSummary = {
      period: 'esta semana',
      total: 450,
      count: 1,
      byCategory: [{ category: 'material', total: 450, count: 1 }],
      items: [
        {
          amount: 450,
          category: 'material',
          description: 'cemento',
          date: d('2026-05-13T18:00:00Z'),
        },
      ],
    };
    const msg = service.formatExpenseSummaryMessage(summary, tz);
    const emojiMatches =
      msg.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
    expect(emojiMatches.length).toBe(1);
    expect(msg).toContain('📊');
  });
});

describe('ExpenseService.formatExpenseSummaryMessage — detail block (count <= 8)', () => {
  const service = makeService();

  it('shows up to 8 records with date, amount, description, category', () => {
    const summary: ExpenseSummary = {
      period: 'este mes',
      total: 950,
      count: 3,
      byCategory: [
        { category: 'material', total: 700, count: 2 },
        { category: 'gasolina', total: 250, count: 1 },
      ],
      items: [
        {
          amount: 450,
          category: 'material',
          description: 'cemento',
          date: d('2026-05-02T16:00:00Z'),
        },
        {
          amount: 250,
          category: 'gasolina',
          description: null,
          date: d('2026-05-06T20:00:00Z'),
        },
        {
          amount: 250,
          category: 'material',
          description: 'tornillería',
          date: d('2026-05-10T18:00:00Z'),
        },
      ],
    };
    const msg = service.formatExpenseSummaryMessage(summary, tz);

    expect(msg).toContain('Detalle:');
    expect(msg).toContain('cemento, material');
    expect(msg).toContain('tornillería, material');
    // expense without description still shows category
    expect(msg).toContain('gasolina');
  });

  it('respects provider tz for dates', () => {
    const summary: ExpenseSummary = {
      period: 'esta semana',
      total: 250,
      count: 1,
      byCategory: [{ category: 'gasolina', total: 250, count: 1 }],
      items: [
        {
          amount: 250,
          category: 'gasolina',
          description: null,
          date: d('2026-05-13T06:00:00Z'),
        },
      ],
    };
    const msg = service.formatExpenseSummaryMessage(summary, tz);
    expect(msg).toMatch(/13 may/);
  });
});

describe('ExpenseService.formatExpenseSummaryMessage — grouped block (count > 8)', () => {
  const service = makeService();

  function makeNItems(n: number) {
    const items = [];
    for (let i = 0; i < n; i++) {
      items.push({
        amount: 100 * (i + 1),
        category: 'material',
        description: `compra ${i + 1}`,
        date: d(
          `2026-0${i < 5 ? 4 : 5}-${String((i % 9) + 1).padStart(2, '0')}T18:00:00Z`,
        ),
      });
    }
    return items;
  }

  it('shows "Por mes" + "Más recientes" when count > 8', () => {
    const items = makeNItems(10);
    const total = items.reduce((s, i) => s + i.amount, 0);
    const summary: ExpenseSummary = {
      period: 'este mes',
      total,
      count: 10,
      byCategory: [{ category: 'material', total, count: 10 }],
      items,
    };
    const msg = service.formatExpenseSummaryMessage(summary, tz);
    expect(msg).toContain('Por mes:');
    expect(msg).toContain('Más recientes:');
    const recentSection = msg.split('Más recientes:')[1];
    expect(recentSection.match(/^• /gm)?.length).toBe(5);
  });
});

describe('ExpenseService — currency metadata', () => {
  it('persists converted amount and FX metadata', async () => {
    const prisma = {
      expense: {
        create: jest.fn().mockResolvedValue({ id: 'expense-1' }),
      },
    };
    const rateLimit = {
      assertWithinLimits: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExpenseService(prisma as any, rateLimit as any);
    const exchangeRateDate = d('2026-06-21T00:00:00.000Z');

    await service.create({
      providerId: 'provider-1',
      amount: 647.5,
      currency: 'MXN',
      originalAmount: 35,
      originalCurrency: 'USD',
      exchangeRate: 18.5,
      exchangeRateProvider: 'frankfurter',
      exchangeRateDate,
      description: 'material',
    });

    expect(prisma.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 'provider-1',
        currency: 'MXN',
        originalCurrency: 'USD',
        exchangeRateProvider: 'frankfurter',
        exchangeRateDate,
        description: 'material',
      }),
    });
  });

  it('formats a foreign-currency confirmation with MXN and original amount', () => {
    const service = makeService();

    const msg = service.formatExpenseConfirmation(647.5, 'material', 'tubo', {
      originalAmount: 35,
      originalCurrency: 'USD',
      exchangeRate: 18.5,
      exchangeRateDate: d('2026-06-21T00:00:00.000Z'),
    });

    expect(msg).toContain('$647.5 MXN');
    expect(msg).toContain('Original: 35 USD');
    expect(msg).toContain('Tipo de cambio: 18.5 (2026-06-21)');
  });
});

describe('ExpenseService.editByDescription', () => {
  function makeServiceWithExpenses(expenses: any[]) {
    const update = jest.fn().mockImplementation(({ where }) => ({
      id: where.id,
    }));
    const prisma = {
      expense: {
        findMany: jest.fn().mockResolvedValue(expenses),
        update,
      },
    };
    const rateLimit = { assertWithinLimits: jest.fn() };
    const service = new ExpenseService(prisma as any, rateLimit as any);
    return { service, update };
  }

  it('edits the unique expense whose description matches the needle', async () => {
    const { service, update } = makeServiceWithExpenses([
      { id: 'gorditas', description: 'gorditas', category: 'comida', amount: 110 },
      { id: 'gasolina', description: 'gasolina', category: 'transporte', amount: 534 },
    ]);

    const result = await service.editByDescription('p1', 'gasolina', {
      amount: 574,
    });

    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.previous.id).toBe('gasolina');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'gasolina' } }),
    );
  });

  it('does NOT match an expense with null description and category (empty-string bug)', async () => {
    const { service, update } = makeServiceWithExpenses([
      { id: 'blank', description: null, category: null, amount: 999 },
      { id: 'gasolina', description: 'gasolina', category: 'transporte', amount: 534 },
    ]);

    const result = await service.editByDescription('p1', 'gasolina', {
      amount: 574,
    });

    expect(result.status === 'ok' && result.previous.id).toBe('gasolina');
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'blank' } }),
    );
  });

  it('does NOT edit (asks) when several expenses match the needle', async () => {
    const { service, update } = makeServiceWithExpenses([
      { id: 'luz-1', description: 'luz', category: 'servicios', amount: 500 },
      { id: 'luz-2', description: 'luz oficina', category: 'servicios', amount: 800 },
    ]);

    const result = await service.editByDescription('p1', 'luz', { amount: 999 });

    expect(result.status).toBe('ambiguous');
    expect(result.status === 'ambiguous' && result.matches).toHaveLength(2);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not edit for a non-finite or non-positive amount', async () => {
    const { service, update } = makeServiceWithExpenses([
      { id: 'gasolina', description: 'gasolina', category: 'transporte', amount: 534 },
    ]);

    expect((await service.editByDescription('p1', 'gasolina', { amount: Infinity })).status).toBe('not_found');
    expect((await service.editByDescription('p1', 'gasolina', { amount: -5 })).status).toBe('not_found');
    expect(update).not.toHaveBeenCalled();
  });
});
