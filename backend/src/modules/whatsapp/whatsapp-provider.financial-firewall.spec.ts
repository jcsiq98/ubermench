/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';

// Pure-helper tests for the financial firewall (Cap. 44 v3). The detectors
// have no I/O and don't depend on any constructor field, so we instantiate
// the handler with all deps as `null` and reach into the (private) methods
// via casts. Avoids spinning up the full Nest module just to assert on
// string matchers.

function makeHandler(): any {
  const noop = null as any;
  return new (WhatsAppProviderHandler as any)(
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  );
}

describe('Financial Firewall — classifyFinancialRead (Cap. 44 v3)', () => {
  const handler = makeHandler();

  describe('summary queries', () => {
    const summaryPhrases = [
      'totalízame',
      'el acumulado',
      'total hasta ahorita',
      'cuánto llevo gastado',
      'cuánto llevo cobrado',
      'dame el total de la semana',
      'cuánto he ganado',
      'cuánto he gastado',
      'súmame los gastos',
      'cómo voy',
      'dame el resumen',
    ];

    for (const phrase of summaryPhrases) {
      it(`classifies "${phrase}" as 'summary'`, () => {
        expect(handler.classifyFinancialRead(phrase)).toBe('summary');
      });
    }
  });

  describe('unsupported aggregates', () => {
    const unsupportedPhrases = [
      'cuál fue mi gasto mayor',
      'mi mayor gasto del mes',
      'cuál fue mi mayor ingreso',
      'top 3 gastos',
      'top 5 ingresos',
      'cuántos cobros llevo',
      'gastos por categoría',
    ];

    for (const phrase of unsupportedPhrases) {
      it(`classifies "${phrase}" as 'unsupportedAggregate'`, () => {
        expect(handler.classifyFinancialRead(phrase)).toBe(
          'unsupportedAggregate',
        );
      });
    }
  });

  describe('non-financial reads', () => {
    const passthroughPhrases = [
      'gasté 500 en material',
      'me cobraron 4 mil del rancho',
      'cobré 1200 de la fuga',
      'agéndame una cita mañana',
      'recuérdame ir al super',
      'hola, cómo estás',
    ];

    for (const phrase of passthroughPhrases) {
      it(`classifies "${phrase}" as 'notFinancialRead'`, () => {
        expect(handler.classifyFinancialRead(phrase)).toBe('notFinancialRead');
      });
    }
  });
});

describe('Financial Firewall — fake-confirmation detectors', () => {
  const handler = makeHandler();

  describe('looksLikeFinancialConfirmation', () => {
    const confirmations = [
      '✅ Gasto registrado',
      'Gasto registrado por $500',
      'Cobro registrado',
      'Listo, $500 guardado',
      '✅ Anotado tu gasto de $500',
      '✅ $500',
    ];
    for (const text of confirmations) {
      it(`detects "${text}" as a financial confirmation`, () => {
        expect(handler.looksLikeFinancialConfirmation(text)).toBe(true);
      });
    }

    const benignTexts = [
      'Hola maestro, ¿en qué te ayudo?',
      'No tengo ese dato a la mano',
      '¡Anotado!',
      'Hecho',
      '',
    ];
    for (const text of benignTexts) {
      it(`does NOT mark "${text}" as a financial confirmation`, () => {
        expect(handler.looksLikeFinancialConfirmation(text)).toBe(false);
      });
    }
  });

  describe('userMessageHasFinancialVerb', () => {
    const financial = [
      'gasté 500 en material',
      'me cobraron 4 mil del rancho',
      'cobré 1200 de la fuga',
      'pagué 800 al proveedor',
      'me pagaron por la chamba',
      'compré tubo nuevo',
    ];
    for (const text of financial) {
      it(`detects financial verb in "${text}"`, () => {
        expect(handler.userMessageHasFinancialVerb(text)).toBe(true);
      });
    }

    const nonFinancial = [
      'totalízame',
      'cómo estás maestro',
      'agéndame una cita',
    ];
    for (const text of nonFinancial) {
      it(`does NOT detect financial verb in "${text}"`, () => {
        expect(handler.userMessageHasFinancialVerb(text)).toBe(false);
      });
    }
  });

  describe('looksLikeMonetaryAnswer', () => {
    it('matches "$3,200 esta semana"', () => {
      expect(
        handler.looksLikeMonetaryAnswer('Llevas $3,200 esta semana, maestro.'),
      ).toBe(true);
    });
    it('matches "5000 pesos"', () => {
      expect(handler.looksLikeMonetaryAnswer('5000 pesos en total')).toBe(true);
    });
    it('matches "3 mil"', () => {
      expect(handler.looksLikeMonetaryAnswer('llevas 3 mil esta semana')).toBe(
        true,
      );
    });
    it('does NOT match plain text', () => {
      expect(handler.looksLikeMonetaryAnswer('Hola, ¿cómo te va?')).toBe(false);
    });
  });
});

describe('Financial Firewall — parseRecoveryToolCall', () => {
  const handler = makeHandler();

  it('parses registrar_gasto into expense kind with data', () => {
    const result = handler.parseRecoveryToolCall([
      {
        name: 'registrar_gasto',
        arguments: JSON.stringify({ amount: 500, description: 'material' }),
      },
    ]);
    expect(result.kind).toBe('expense');
    expect(result.data).toEqual({ amount: 500, description: 'material' });
  });

  it('parses registrar_ingreso into income kind with data', () => {
    const result = handler.parseRecoveryToolCall([
      {
        name: 'registrar_ingreso',
        arguments: JSON.stringify({ amount: 1200 }),
      },
    ]);
    expect(result.kind).toBe('income');
    expect(result.data).toEqual({ amount: 1200 });
  });

  it('parses necesita_aclaracion with razon=falta_monto', () => {
    const result = handler.parseRecoveryToolCall([
      {
        name: 'necesita_aclaracion',
        arguments: JSON.stringify({ razon: 'falta_monto' }),
      },
    ]);
    expect(result.kind).toBe('clarify');
    expect(result.razon).toBe('falta_monto');
  });

  it('parses necesita_aclaracion with razon=falta_tipo', () => {
    const result = handler.parseRecoveryToolCall([
      {
        name: 'necesita_aclaracion',
        arguments: JSON.stringify({ razon: 'falta_tipo' }),
      },
    ]);
    expect(result.kind).toBe('clarify');
    expect(result.razon).toBe('falta_tipo');
  });

  it('parses necesita_aclaracion with razon=mensaje_ambiguo', () => {
    const result = handler.parseRecoveryToolCall([
      {
        name: 'necesita_aclaracion',
        arguments: JSON.stringify({ razon: 'mensaje_ambiguo' }),
      },
    ]);
    expect(result.kind).toBe('clarify');
    expect(result.razon).toBe('mensaje_ambiguo');
  });

  it('falls back to mensaje_ambiguo when razon is unknown', () => {
    const result = handler.parseRecoveryToolCall([
      {
        name: 'necesita_aclaracion',
        arguments: JSON.stringify({ razon: 'something_else' }),
      },
    ]);
    expect(result.kind).toBe('clarify');
    expect(result.razon).toBe('mensaje_ambiguo');
  });

  it('returns no_tool_called when array is empty', () => {
    expect(handler.parseRecoveryToolCall([])).toEqual({
      kind: 'no_tool_called',
    });
  });

  it('returns no_tool_called for unknown tool names', () => {
    expect(
      handler.parseRecoveryToolCall([
        { name: 'borrar_ultimo_gasto', arguments: '{}' },
      ]),
    ).toEqual({ kind: 'no_tool_called' });
  });
});

describe('Financial Firewall — clarifyMessageForReason', () => {
  const handler = makeHandler();

  it('returns the right copy for falta_monto', () => {
    expect(handler.clarifyMessageForReason('falta_monto')).toBe(
      '¿De cuánto fue, maestro?',
    );
  });

  it('returns the right copy for falta_tipo', () => {
    expect(handler.clarifyMessageForReason('falta_tipo')).toBe(
      '¿Eso fue un gasto o un cobro?',
    );
  });

  it('returns the right copy for mensaje_ambiguo', () => {
    expect(handler.clarifyMessageForReason('mensaje_ambiguo')).toBe(
      'No me quedó claro, ¿me lo repites?',
    );
  });
});

describe('Financial Firewall — featureGapMessage', () => {
  const handler = makeHandler();

  it('does NOT promise "movimientos recientes"', () => {
    const msg: string = handler.featureGapMessage();
    expect(msg).not.toMatch(/movimientos recientes/i);
  });

  it('points the user to the "resumen" command', () => {
    const msg: string = handler.featureGapMessage();
    expect(msg).toContain('"resumen"');
  });

  it('admits the gap honestly without inventing data', () => {
    const msg: string = handler.featureGapMessage();
    expect(msg).toContain('Ese detalle todavía no lo puedo sacar');
    expect(msg).toContain('Estamos trabajando');
  });
});
