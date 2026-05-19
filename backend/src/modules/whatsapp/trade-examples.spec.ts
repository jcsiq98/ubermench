import {
  buildShortGreeting,
  buildExamplesBlock,
  buildWelcomeMessage,
  buildActivationHelpMessage,
  buildStripeOnboardingMessage,
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
    expect(block).toContain('Para empezar, mándame algo real');
  });

  it('falls back to a short closer when examples are null (LLM failure)', () => {
    const block = buildExamplesBlock(null);
    expect(block).toContain('Mándame algo real para empezar');
    expect(block).toContain('Por texto o por audio');
    expect(block).not.toContain('•');
  });

  it('falls back to short closer when examples is empty array', () => {
    const block = buildExamplesBlock([]);
    expect(block).toContain('Mándame algo real para empezar');
  });

  it('handles any number of examples (not just 3) without breaking', () => {
    // Defensive: if upstream sanitization changes, we don't want crashes.
    const block = buildExamplesBlock(['solo uno']);
    expect(block).toContain('• "solo uno"');
  });
});

describe('trade-examples — buildStripeOnboardingMessage', () => {
  it('lists RFC, CLABE, and social/web prep before the Stripe URL', () => {
    const msg = buildStripeOnboardingMessage('https://connect.stripe.com/setup/test');
    expect(msg).toContain('RFC');
    expect(msg).toContain('CLABE');
    expect(msg).toContain('Instagram, Facebook o LinkedIn');
    expect(msg).toContain('https://connect.stripe.com/setup/test');
    expect(msg).toContain('tarjeta, OXXO o SPEI');
  });
});

describe('trade-examples — buildActivationHelpMessage', () => {
  it('explains the core use cases without becoming a long manual', () => {
    const msg = buildActivationHelpMessage();
    expect(msg).toContain('Soy Chalán, tu ayudante por WhatsApp.');
    expect(msg).toContain('Si trabajas por tu cuenta');
    expect(msg).toContain('"Cobré 450 por gelish a María"');
    expect(msg).toContain('"Agenda con Laura el viernes a las 4"');
    expect(msg).toContain('"Recuérdame comprar insumos mañana"');
    expect(msg).toContain('"Hazme un link de cobro por 500"');
    expect(msg.match(/^• /gm)?.length).toBeLessThanOrEqual(6);
  });

  it('keeps the closing instruction focused on normal text or audio', () => {
    const msg = buildActivationHelpMessage();
    expect(msg).toContain('Mándamelo normal, por texto o audio');
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
    expect(msg).toContain('Mándame algo real para empezar');
    expect(msg).not.toContain('•');
  });

  it('uses no emojis (chalan-voice principio 2)', () => {
    const examples = ['una frase', 'otra frase', 'tercera'];
    const msg = buildWelcomeMessage('Alberto', examples);
    const stripped = msg.replace(/•/g, '');
    expect(stripped).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
