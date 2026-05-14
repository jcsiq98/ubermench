import { IncomeService, IncomeSummary } from './income.service';

// Pure-formatting tests for the new "Detalle" / "Por mes" + "Más recientes"
// blocks introduced in Cap. 49. The service is constructed with a null
// PrismaService since formatSummaryMessage is pure.

function makeService(): IncomeService {
  return new IncomeService(null as any);
}

const tz = 'America/Mexico_City';

function d(iso: string): Date {
  return new Date(iso);
}

describe('IncomeService.formatSummaryMessage — empty / single-method', () => {
  const service = makeService();

  it('returns single-line message when count is 0', () => {
    const summary: IncomeSummary = {
      period: 'esta semana',
      total: 0,
      count: 0,
      byMethod: [],
      items: [],
    };
    expect(service.formatSummaryMessage(summary, tz)).toBe(
      '📊 No tienes ingresos registrados esta semana.',
    );
  });

  it('omits "Por método de pago" when only one method is used', () => {
    const summary: IncomeSummary = {
      period: 'esta semana',
      total: 1500,
      count: 1,
      byMethod: [{ method: 'CASH', total: 1500, count: 1 }],
      items: [
        {
          amount: 1500,
          description: 'destape baño',
          clientName: 'Sr. López',
          paymentMethod: 'CASH',
          date: d('2026-05-13T18:00:00Z'),
        },
      ],
    };
    const msg = service.formatSummaryMessage(summary, tz);
    expect(msg).not.toContain('Por método de pago');
    expect(msg).toContain('Detalle:');
    expect(msg).toContain('destape baño');
  });

  it('uses exactly one emoji (header) for non-empty summaries', () => {
    const summary: IncomeSummary = {
      period: 'esta semana',
      total: 1500,
      count: 1,
      byMethod: [{ method: 'CASH', total: 1500, count: 1 }],
      items: [
        {
          amount: 1500,
          description: 'destape',
          clientName: null,
          paymentMethod: 'CASH',
          date: d('2026-05-13T18:00:00Z'),
        },
      ],
    };
    const msg = service.formatSummaryMessage(summary, tz);
    const emojiMatches = msg.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
    expect(emojiMatches.length).toBe(1);
    expect(msg).toContain('📊');
  });
});

describe('IncomeService.formatSummaryMessage — detail block (count <= 8)', () => {
  const service = makeService();

  it('shows up to 8 records with date, amount, description, client, method', () => {
    const summary: IncomeSummary = {
      period: 'este mes',
      total: 3500,
      count: 3,
      byMethod: [
        { method: 'CASH', total: 2000, count: 2 },
        { method: 'TRANSFER', total: 1500, count: 1 },
      ],
      items: [
        {
          amount: 1200,
          description: 'tinaco',
          clientName: 'Sr. López',
          paymentMethod: 'CASH',
          date: d('2026-05-02T16:00:00Z'),
        },
        {
          amount: 1500,
          description: 'instalación calentador',
          clientName: null,
          paymentMethod: 'TRANSFER',
          date: d('2026-05-06T20:00:00Z'),
        },
        {
          amount: 800,
          description: null,
          clientName: 'Sra. Aguilar',
          paymentMethod: 'CASH',
          date: d('2026-05-10T18:00:00Z'),
        },
      ],
    };
    const msg = service.formatSummaryMessage(summary, tz);

    expect(msg).toContain('Detalle:');
    // each item has its own bullet line
    expect(msg.match(/^• /gm)?.length).toBe(2 + 3); // 2 method bullets + 3 detail bullets
    expect(msg).toContain('tinaco, Sr. López');
    expect(msg).toContain('(efectivo)');
    expect(msg).toContain('(transferencia)');
    expect(msg).toContain('Sra. Aguilar'); // no description still OK
  });

  it('formats dates with the provider tz (Mexico City)', () => {
    const summary: IncomeSummary = {
      period: 'esta semana',
      total: 800,
      count: 1,
      byMethod: [{ method: 'CASH', total: 800, count: 1 }],
      items: [
        {
          amount: 800,
          description: 'destape',
          clientName: null,
          // 2026-05-13 06:00 UTC = 2026-05-13 00:00 in Mexico City (still 13 May)
          paymentMethod: 'CASH',
          date: d('2026-05-13T06:00:00Z'),
        },
      ],
    };
    const msg = service.formatSummaryMessage(summary, tz);
    expect(msg).toMatch(/13 may/);
  });

  it('formats dates with a different tz (NY)', () => {
    const summary: IncomeSummary = {
      period: 'esta semana',
      total: 800,
      count: 1,
      byMethod: [{ method: 'CASH', total: 800, count: 1 }],
      items: [
        {
          amount: 800,
          description: 'destape',
          clientName: null,
          // 2026-05-14 02:00 UTC = 2026-05-13 22:00 in New York
          paymentMethod: 'CASH',
          date: d('2026-05-14T02:00:00Z'),
        },
      ],
    };
    const msg = service.formatSummaryMessage(summary, 'America/New_York');
    expect(msg).toMatch(/13 may/);
  });
});

describe('IncomeService.formatSummaryMessage — grouped block (count > 8)', () => {
  const service = makeService();

  function makeNItems(n: number) {
    const items = [];
    for (let i = 0; i < n; i++) {
      items.push({
        amount: 100 * (i + 1),
        description: `trabajo ${i + 1}`,
        clientName: null,
        paymentMethod: 'CASH',
        date: d(`2026-0${i < 5 ? 4 : 5}-${String((i % 9) + 1).padStart(2, '0')}T18:00:00Z`),
      });
    }
    return items;
  }

  it('shows "Por mes" + "Más recientes" when count > 8', () => {
    const items = makeNItems(10);
    const total = items.reduce((s, i) => s + i.amount, 0);
    const summary: IncomeSummary = {
      period: 'este mes',
      total,
      count: 10,
      byMethod: [{ method: 'CASH', total, count: 10 }],
      items,
    };
    const msg = service.formatSummaryMessage(summary, tz);
    expect(msg).toContain('Por mes:');
    expect(msg).toContain('Más recientes:');
    // "Más recientes" cap at 5
    const recentSection = msg.split('Más recientes:')[1];
    expect(recentSection.match(/^• /gm)?.length).toBe(5);
  });

  it('does NOT show "Detalle:" when count > 8', () => {
    const items = makeNItems(10);
    const summary: IncomeSummary = {
      period: 'este mes',
      total: 5500,
      count: 10,
      byMethod: [{ method: 'CASH', total: 5500, count: 10 }],
      items,
    };
    const msg = service.formatSummaryMessage(summary, tz);
    expect(msg).not.toContain('Detalle:');
  });
});
