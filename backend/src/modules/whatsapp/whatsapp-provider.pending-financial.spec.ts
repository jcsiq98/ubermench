import {
  PENDING_FIN_PREFIX,
  PENDING_FIN_TTL,
  looksLikeFinancialClarificationQuestion,
  extractMoneyAndDesc,
  inferPossibleType,
  shouldPlantPending,
  classifyPendingResolution,
} from './whatsapp-provider.pending-financial';

// Pure-helper tests for Cap. 47 / M1. No I/O, no Nest module, no Redis.
// Every helper is exported from the source file and the integration
// commit (commit 3) reuses these exact functions inside the handler.
//
// The matrix below intentionally mirrors the design doc — any
// regression here breaks the M1 promise that the Vero flow ends with
// a real DB record, not a fake confirmation.

describe('Cap. 47 — pending financial constants', () => {
  it('uses the documented Redis key prefix', () => {
    expect(PENDING_FIN_PREFIX).toBe('wa_pending_financial:');
  });

  it('uses the same 10-minute TTL as wa_pending_timezone', () => {
    expect(PENDING_FIN_TTL).toBe(600);
  });
});

describe('looksLikeFinancialClarificationQuestion', () => {
  describe('type questions (positive)', () => {
    const cases = [
      '¿Es un gasto o un ingreso?',
      '¿Es gasto o cobro?',
      '¿Eso fue un gasto o un cobro?',
      'eso fue gasto o ingreso?',
      '¿gasto o ingreso?',
      '¿Es un cobro o un gasto?',
      '¿Es un gasto?',
    ];
    for (const text of cases) {
      it(`detects "${text}" as kind=type`, () => {
        expect(looksLikeFinancialClarificationQuestion(text)).toEqual({
          kind: 'type',
        });
      });
    }
  });

  describe('amount questions (positive)', () => {
    const cases = [
      '¿De cuánto fue?',
      '¿De cuánto fue, maestro?',
      '¿Cuánto cobraste?',
      '¿Cuánto te pagaron?',
      '¿De cuánto?',
      '¿Cuál fue el monto?',
      '¿Cuanto fue?',
    ];
    for (const text of cases) {
      it(`detects "${text}" as kind=amount`, () => {
        expect(looksLikeFinancialClarificationQuestion(text)).toEqual({
          kind: 'amount',
        });
      });
    }
  });

  describe('negatives', () => {
    const cases: Array<[string, string]> = [
      ['', 'empty string'],
      ['Anotado el gasto', 'no question mark'],
      ['Tu gasto o ingreso de la semana', 'declarative, no question mark'],
      ['¿Cómo estás, maestro?', 'question but not financial'],
      ['¿Agendamos a las 5?', 'scheduling question'],
      ['Listo, gasto registrado', 'confirmation, no question'],
      ['¿Y el cliente?', 'unrelated question'],
    ];
    for (const [text, label] of cases) {
      it(`returns null for ${label} ("${text}")`, () => {
        expect(looksLikeFinancialClarificationQuestion(text)).toBeNull();
      });
    }
  });
});

describe('extractMoneyAndDesc', () => {
  describe('amount + description (Vero shape)', () => {
    const cases: Array<[string, { amount: number; description: string }]> = [
      ['lavandería 200', { amount: 200, description: 'lavandería' }],
      ['200 lavandería', { amount: 200, description: 'lavandería' }],
      ['$200 lavandería', { amount: 200, description: 'lavandería' }],
      ['lavandería 200.00', { amount: 200, description: 'lavandería' }],
      ['lavandería 200.50', { amount: 200.5, description: 'lavandería' }],
    ];
    for (const [input, expected] of cases) {
      it(`parses "${input}"`, () => {
        expect(extractMoneyAndDesc(input)).toEqual(expected);
      });
    }
  });

  describe('Mexican thousands separator', () => {
    it('parses "lavandería 1,200" as 1200', () => {
      expect(extractMoneyAndDesc('lavandería 1,200')).toEqual({
        amount: 1200,
        description: 'lavandería',
      });
    });
    it('parses "$1,200 lavandería" as 1200', () => {
      expect(extractMoneyAndDesc('$1,200 lavandería')).toEqual({
        amount: 1200,
        description: 'lavandería',
      });
    });
    it('parses "$1,200.50 lavandería" as 1200.5', () => {
      expect(extractMoneyAndDesc('$1,200.50 lavandería')).toEqual({
        amount: 1200.5,
        description: 'lavandería',
      });
    });
    it('parses "1,000,000 obra grande" as 1000000', () => {
      expect(extractMoneyAndDesc('1,000,000 obra grande')).toEqual({
        amount: 1000000,
        description: 'obra grande',
      });
    });
  });

  describe('"X mil" pattern', () => {
    it('parses "3 mil pesos" as 3000', () => {
      const r = extractMoneyAndDesc('3 mil pesos');
      expect(r.amount).toBe(3000);
    });
    it('parses "lavandería 3 mil" with description', () => {
      expect(extractMoneyAndDesc('lavandería 3 mil')).toEqual({
        amount: 3000,
        description: 'lavandería',
      });
    });
  });

  describe('description-only (no amount)', () => {
    it('returns description only when no number is present', () => {
      expect(extractMoneyAndDesc('compré material')).toEqual({
        description: 'compré material',
      });
    });

    it('returns "lavandería" alone', () => {
      expect(extractMoneyAndDesc('lavandería')).toEqual({
        description: 'lavandería',
      });
    });
  });

  describe('amount-only (no description)', () => {
    it('returns amount only for "200"', () => {
      expect(extractMoneyAndDesc('200')).toEqual({ amount: 200 });
    });

    it('returns amount only for "$200"', () => {
      expect(extractMoneyAndDesc('$200')).toEqual({ amount: 200 });
    });
  });

  describe('edge cases', () => {
    it('returns empty for ""', () => {
      expect(extractMoneyAndDesc('')).toEqual({});
    });

    it('does not match single-digit numbers as amounts', () => {
      // "1 cosa" must not be treated as amount=1 — too noisy.
      const r = extractMoneyAndDesc('compré 1 cosa');
      expect(r.amount).toBeUndefined();
    });

    it('does not parse 0 as a valid amount', () => {
      // Both layers reject: bare regex requires \d{2,}; parseAmount
      // requires > 0. Defense in depth.
      const r = extractMoneyAndDesc('lavandería 0');
      expect(r.amount).toBeUndefined();
    });

    it('strips Spanish fillers from description', () => {
      const r = extractMoneyAndDesc('lavandería de la casa 200');
      expect(r.amount).toBe(200);
      expect(r.description).toBe('lavandería casa');
    });

    it('trims whitespace and is empty-equivalent for "   "', () => {
      expect(extractMoneyAndDesc('   ')).toEqual({});
    });
  });
});

describe('inferPossibleType', () => {
  describe('expense verbs', () => {
    const cases = [
      'gasté 200',
      'compré material',
      'pagué al proveedor',
      'me cobraron 500',
      'me cobró por la chamba',
    ];
    for (const text of cases) {
      it(`infers "expense" from "${text}"`, () => {
        expect(inferPossibleType(text)).toBe('expense');
      });
    }
  });

  describe('income verbs', () => {
    const cases = [
      'cobré 1500',
      'me pagaron por la chamba',
      'me depositaron 1200',
      'recibí el pago',
      'me dieron mil',
    ];
    for (const text of cases) {
      it(`infers "income" from "${text}"`, () => {
        expect(inferPossibleType(text)).toBe('income');
      });
    }
  });

  describe('ambiguous (no verb)', () => {
    const cases = ['lavandería 200', '200 lavandería', 'material', '', '   '];
    for (const text of cases) {
      it(`returns undefined for "${text}"`, () => {
        expect(inferPossibleType(text)).toBeUndefined();
      });
    }
  });

  describe('disambiguation: "me cobraron" must NOT leak into income', () => {
    it('classifies "me cobraron 500" as expense (Cap. 36)', () => {
      // "me cobraron" = someone charged me = I paid = expense.
      // The bare "cobr-" form is income, but the EXPENSE alternative
      // matches first by design.
      expect(inferPossibleType('me cobraron 500')).toBe('expense');
    });
  });
});

describe('shouldPlantPending', () => {
  describe('missing=type (Vero shape)', () => {
    it('plants when amount + description are present', () => {
      const decision = shouldPlantPending('type', 'lavandería 200');
      expect(decision.plant).toBe(true);
      if (!decision.plant) return;
      expect(decision.state.amount).toBe(200);
      expect(decision.state.description).toBe('lavandería');
      expect(decision.state.missing).toBe('type');
      expect(decision.state.originalUserText).toBe('lavandería 200');
    });

    it('does NOT plant when amount is missing', () => {
      const decision = shouldPlantPending('type', 'lavandería');
      expect(decision.plant).toBe(false);
      if (decision.plant) return;
      expect(decision.reason).toBe('missing_type_needs_amount');
    });

    it('does NOT plant when description is missing', () => {
      const decision = shouldPlantPending('type', '200');
      expect(decision.plant).toBe(false);
      if (decision.plant) return;
      expect(decision.reason).toBe('missing_type_needs_description');
    });

    it('does NOT plant for empty input', () => {
      const decision = shouldPlantPending('type', '');
      expect(decision.plant).toBe(false);
      if (decision.plant) return;
      // amount fails first → that's the surfaced reason
      expect(decision.reason).toBe('missing_type_needs_amount');
    });

    it('attaches possibleType when a verb is present', () => {
      // Edge: user said "compré tubo 200" — has all three signals.
      // The LLM should NOT have asked type here, but if it does, we
      // plant and carry the inferred type as a bonus. The user's
      // explicit reply still wins on resolution.
      const decision = shouldPlantPending('type', 'compré tubo 200');
      expect(decision.plant).toBe(true);
      if (!decision.plant) return;
      expect(decision.state.possibleType).toBe('expense');
    });

    it('omits possibleType when no verb is present (Vero shape)', () => {
      const decision = shouldPlantPending('type', 'lavandería 200');
      expect(decision.plant).toBe(true);
      if (!decision.plant) return;
      expect(decision.state.possibleType).toBeUndefined();
    });
  });

  describe('missing=amount', () => {
    it('plants when description + possibleType are inferable (expense)', () => {
      const decision = shouldPlantPending('amount', 'compré material');
      expect(decision.plant).toBe(true);
      if (!decision.plant) return;
      expect(decision.state.description).toBe('compré material');
      expect(decision.state.missing).toBe('amount');
      expect(decision.state.possibleType).toBe('expense');
      expect(decision.state.amount).toBeUndefined();
    });

    it('plants for income side too', () => {
      const decision = shouldPlantPending('amount', 'me pagaron por la chamba');
      expect(decision.plant).toBe(true);
      if (!decision.plant) return;
      expect(decision.state.possibleType).toBe('income');
    });

    it('does NOT plant when possibleType cannot be inferred', () => {
      const decision = shouldPlantPending('amount', 'material');
      expect(decision.plant).toBe(false);
      if (decision.plant) return;
      expect(decision.reason).toBe('missing_amount_needs_possible_type');
    });

    it('does NOT plant when description is missing', () => {
      const decision = shouldPlantPending('amount', '');
      expect(decision.plant).toBe(false);
      if (decision.plant) return;
      expect(decision.reason).toBe('missing_amount_needs_description');
    });
  });
});

describe('classifyPendingResolution', () => {
  const typePending = { missing: 'type' as const };
  const amountPending = { missing: 'amount' as const };

  describe('missing=type — affirmative answers', () => {
    const expenseReplies = [
      'gasto',
      'es gasto',
      'fue gasto',
      'fue un gasto',
      'gasté',
      'pagué',
      'compré',
      'me cobraron',
    ];
    for (const reply of expenseReplies) {
      it(`resolves "${reply}" → expense`, () => {
        expect(classifyPendingResolution(reply, typePending)).toEqual({
          kind: 'expense',
        });
      });
    }

    const incomeReplies = [
      'ingreso',
      'es ingreso',
      'cobro',
      'cobré',
      'fue cobro',
      'me pagaron',
      'me depositaron',
      'recibí',
    ];
    for (const reply of incomeReplies) {
      it(`resolves "${reply}" → income`, () => {
        expect(classifyPendingResolution(reply, typePending)).toEqual({
          kind: 'income',
        });
      });
    }
  });

  describe('missing=type — discards', () => {
    const cases: Array<[string, string]> = [
      ['agéndame mañana', 'date keyword'],
      ['recuérdame ir al gym', 'reminder verb'],
      ['cancela mi cita', 'cancel verb'],
      ['mueve la cita a las 5:00', 'time format'],
      ['lavandería', 'description-shaped reply'],
      ['200', 'amount-shaped reply'],
      ['no sé', 'non-answer'],
      ['', 'empty'],
      ['borra el último gasto', 'destructive verb'],
    ];
    for (const [reply, label] of cases) {
      it(`discards (unrelated) for ${label} ("${reply}")`, () => {
        expect(classifyPendingResolution(reply, typePending)).toEqual({
          kind: 'unrelated',
        });
      });
    }
  });

  describe('missing=amount — resolves', () => {
    const cases: Array<[string, number]> = [
      ['200', 200],
      ['$300', 300],
      ['fueron 500', 500],
      ['1,200 pesos', 1200],
      ['$1,500', 1500],
    ];
    for (const [reply, expected] of cases) {
      it(`resolves "${reply}" → amount=${expected}`, () => {
        expect(classifyPendingResolution(reply, amountPending)).toEqual({
          kind: 'amount',
          amount: expected,
        });
      });
    }
  });

  describe('missing=amount — discards', () => {
    const cases: Array<[string, string]> = [
      ['agéndame mañana', 'other intent'],
      ['no me acuerdo', 'non-answer'],
      ['lavandería', 'description but no number'],
      ['', 'empty'],
      ['borra ese gasto', 'destructive verb'],
    ];
    for (const [reply, label] of cases) {
      it(`discards (unrelated) for ${label} ("${reply}")`, () => {
        expect(classifyPendingResolution(reply, amountPending)).toEqual({
          kind: 'unrelated',
        });
      });
    }
  });

  describe('reply length cap', () => {
    it('discards replies longer than 30 chars regardless of content', () => {
      const long = 'gasto en realidad fue un poco más complicado';
      expect(classifyPendingResolution(long, typePending)).toEqual({
        kind: 'unrelated',
      });
    });

    it('discards a long reply that still contains a money amount', () => {
      const long = 'me parece que fueron unos 500 pesos pero no recuerdo';
      expect(classifyPendingResolution(long, amountPending)).toEqual({
        kind: 'unrelated',
      });
    });
  });

  describe('precedence: other-intent always wins over a partial match', () => {
    it('"agéndame gasto mañana" is unrelated, not expense', () => {
      // "gasto" appears but the date keyword + agendar verb signal a
      // different intent. We must NOT resolve to expense.
      const reply = 'agéndame gasto mañana';
      expect(classifyPendingResolution(reply, typePending)).toEqual({
        kind: 'unrelated',
      });
    });
  });
});
