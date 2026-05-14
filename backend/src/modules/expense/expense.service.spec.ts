import { ExpenseService, ExpenseSummary } from './expense.service';

function makeService(): ExpenseService {
  return new ExpenseService(null as any);
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
    const emojiMatches = msg.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
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
        date: d(`2026-0${i < 5 ? 4 : 5}-${String((i % 9) + 1).padStart(2, '0')}T18:00:00Z`),
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
