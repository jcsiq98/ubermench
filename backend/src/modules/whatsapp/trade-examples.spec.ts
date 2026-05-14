import {
  getExamplesForTrade,
  buildWelcomeMessage,
  buildShortGreeting,
  buildExamplesBlock,
  __testing,
} from './trade-examples';

describe('trade-examples — getExamplesForTrade', () => {
  it('returns plomero set for plomero', () => {
    const ex = getExamplesForTrade('plomero');
    expect(ex[0]).toContain('destapar un baño');
  });

  it('matches synonyms (fontanero -> plomero)', () => {
    const ex = getExamplesForTrade('fontanero');
    expect(ex[0]).toContain('destapar un baño');
  });

  it('matches with diacritics (albañil)', () => {
    const ex = getExamplesForTrade('albañil');
    expect(ex[0]).toContain('adelanto de la obra');
  });

  it('matches without diacritics (albanil)', () => {
    const ex = getExamplesForTrade('albanil');
    expect(ex[0]).toContain('adelanto de la obra');
  });

  it('is case-insensitive', () => {
    const ex = getExamplesForTrade('ELECTRICISTA');
    expect(ex[0]).toContain('centro de carga');
  });

  it('tolerates extra words around the trade ("maestro de obra")', () => {
    const ex = getExamplesForTrade('maestro de obra');
    expect(ex[0]).toContain('adelanto de la obra');
  });

  it('returns ama de casa examples for that trade', () => {
    const ex = getExamplesForTrade('ama de casa');
    expect(ex[0]).toContain('despensa');
  });

  it('falls back to default for unknown trade', () => {
    const ex = getExamplesForTrade('astronauta');
    expect(ex).toEqual(__testing.DEFAULT_EXAMPLES);
  });

  it('falls back to default for empty/null trade', () => {
    expect(getExamplesForTrade(undefined)).toEqual(__testing.DEFAULT_EXAMPLES);
    expect(getExamplesForTrade(null)).toEqual(__testing.DEFAULT_EXAMPLES);
    expect(getExamplesForTrade('')).toEqual(__testing.DEFAULT_EXAMPLES);
  });

  it('falls back to default for the generic "trabajador independiente"', () => {
    // Founder's own profile uses this trade — must NOT match anything.
    const ex = getExamplesForTrade('trabajador independiente');
    expect(ex).toEqual(__testing.DEFAULT_EXAMPLES);
  });
});

describe('trade-examples — buildWelcomeMessage', () => {
  it('includes 3 bullets and the closing line', () => {
    const msg = buildWelcomeMessage('Alberto', 'plomero');
    expect(msg).toContain('Listo, Alberto. Ya tienes tu Chalán.');
    expect(msg).toContain('Te puedo ayudar con cosas así:');
    expect(msg.match(/^• /gm)?.length).toBe(3);
    expect(msg).toContain('Por texto o por audio');
  });

  it('handles missing name gracefully', () => {
    const msg = buildWelcomeMessage('', 'plomero');
    expect(msg).toContain('Listo. Ya tienes tu Chalán.');
    expect(msg).not.toMatch(/Listo, \. /);
  });

  it('handles unknown trade by using default examples', () => {
    const msg = buildWelcomeMessage('Vero', 'lo que sea');
    expect(msg).toContain('Listo, Vero. Ya tienes tu Chalán.');
    expect(msg).toContain('Cobré 1,000 por un trabajo de hoy');
  });

  it('keeps lines short (no awkward WhatsApp wraps)', () => {
    for (const set of __testing.TRADE_EXAMPLE_SETS) {
      for (const example of set.examples) {
        expect(example.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it('emits no emojis (chalan-voice principio 2)', () => {
    const msg = buildWelcomeMessage('Alberto', 'plomero');
    // Strip the bullet character we use deliberately, then check no
    // remaining emoji-range codepoints.
    const stripped = msg.replace(/•/g, '');
    expect(stripped).toMatch(/^[\s\S]*$/);
    expect(stripped).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('trade-examples — buildShortGreeting + buildExamplesBlock (split flow)', () => {
  it('greeting has no examples in it', () => {
    const greeting = buildShortGreeting('Alberto');
    expect(greeting).toBe('Listo, Alberto. Ya tienes tu Chalán.');
    expect(greeting).not.toContain('•');
    expect(greeting).not.toContain('Por texto o por audio');
  });

  it('examples block is self-contained and trade-specific', () => {
    const block = buildExamplesBlock('plomero');
    expect(block).toContain('Te puedo ayudar con cosas así:');
    expect(block).toContain('destapar un baño');
    expect(block).toContain('Por texto o por audio');
    expect(block.match(/^• /gm)?.length).toBe(3);
  });

  it('split helpers, concatenated, produce the same content as the full message', () => {
    // We don't expect byte-for-byte equality (caller decides spacing
    // between the two messages), but content must be the same.
    const full = buildWelcomeMessage('Alberto', 'plomero');
    const split = `${buildShortGreeting('Alberto')}\n\n${buildExamplesBlock('plomero')}`;
    expect(split).toBe(full);
  });
});
