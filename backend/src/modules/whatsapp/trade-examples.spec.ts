import {
  buildShortGreeting,
  buildExamplesBlock,
  buildWelcomeMessage,
} from './trade-examples';

describe('trade-examples — buildShortGreeting', () => {
  it('uses the name when provided', () => {
    expect(buildShortGreeting('Alberto')).toBe('Listo, Alberto. Ya tienes tu Chalán.');
  });

  it('falls back to no-name greeting when empty', () => {
    expect(buildShortGreeting('')).toBe('Listo. Ya tienes tu Chalán.');
    expect(buildShortGreeting('   ')).toBe('Listo. Ya tienes tu Chalán.');
  });
});

describe('trade-examples — buildExamplesBlock', () => {
  it('renders 3 LLM-generated examples as bullets', () => {
    const examples = [
      'Cobré 800 por destapar un baño',
      'Mañana 10am, fuga en casa del Sr. López',
      'Recuérdame pasar por material el viernes',
    ];
    const block = buildExamplesBlock(examples);
    expect(block).toContain('Te puedo ayudar con cosas así:');
    expect(block.match(/^• /gm)?.length).toBe(3);
    expect(block).toContain('destapar un baño');
    expect(block).toContain('Por texto o por audio, como te acomode.');
  });

  it('falls back to a short closer when examples are null (LLM failure)', () => {
    const block = buildExamplesBlock(null);
    expect(block).toBe('Dime qué necesitas — por texto o por audio.');
    expect(block).not.toContain('•');
  });

  it('falls back to short closer when examples is empty array', () => {
    const block = buildExamplesBlock([]);
    expect(block).toBe('Dime qué necesitas — por texto o por audio.');
  });

  it('handles any number of examples (not just 3) without breaking', () => {
    // Defensive: if upstream sanitization changes, we don't want crashes.
    const block = buildExamplesBlock(['solo uno']);
    expect(block).toContain('• "solo uno"');
  });
});

describe('trade-examples — buildWelcomeMessage', () => {
  it('combines greeting + examples in a single message', () => {
    const examples = ['frase a', 'frase b', 'frase c'];
    const msg = buildWelcomeMessage('Alberto', examples);
    expect(msg).toContain('Listo, Alberto. Ya tienes tu Chalán.');
    expect(msg).toContain('Te puedo ayudar con cosas así:');
    expect(msg).toContain('• "frase a"');
  });

  it('with null examples, produces greeting + short closer', () => {
    const msg = buildWelcomeMessage('Alberto', null);
    expect(msg).toContain('Listo, Alberto. Ya tienes tu Chalán.');
    expect(msg).toContain('Dime qué necesitas');
    expect(msg).not.toContain('•');
  });

  it('uses no emojis (chalan-voice principio 2)', () => {
    const examples = ['una frase', 'otra frase', 'tercera'];
    const msg = buildWelcomeMessage('Alberto', examples);
    const stripped = msg.replace(/•/g, '');
    expect(stripped).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
