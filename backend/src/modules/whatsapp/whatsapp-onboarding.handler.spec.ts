/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { WhatsAppOnboardingHandler } from './whatsapp-onboarding.handler';

// Pure-helper tests for the Cap. 46 phone gate + skip phrase detector.
// Both helpers are deterministic and have no I/O, so we instantiate the
// handler with all deps as `null` and exercise the private methods via
// casts — same pattern the financial-firewall spec uses.

function makeHandler(): any {
  const noop = null as any;
  return new (WhatsAppOnboardingHandler as any)(
    noop, noop, noop, noop, noop, noop,
  );
}

describe('WhatsAppOnboardingHandler — isMexicanPhone', () => {
  const handler = makeHandler();

  const mexican = [
    '+5215512345678',
    '+525512345678',
    '5215512345678',
    '52 55 1234 5678',
    '+52(55)1234-5678',
  ];

  it.each(mexican)('treats %s as Mexican', (phone) => {
    expect(handler.isMexicanPhone(phone)).toBe(true);
  });

  const nonMexican = [
    '+15755716627',   // Roberto, US country code in NL
    '+13055551234',   // Miami
    '+34911234567',   // Madrid
    '+31207777777',   // Amsterdam direct
    '+5491155555555', // Buenos Aires
  ];

  it.each(nonMexican)('treats %s as non-Mexican', (phone) => {
    expect(handler.isMexicanPhone(phone)).toBe(false);
  });
});

describe('WhatsAppOnboardingHandler — isSkipPhrase', () => {
  const handler = makeHandler();

  const skip = [
    'luego',
    'Luego',
    'LUEGO',
    'después',
    'despues',
    'más tarde',
    'mas tarde',
    'saltar',
    'skip',
    'no sé',
    'no se',
    'paso',
    'omitir',
    'olvídalo',
    'olvidalo',
    'ninguna',
    'luego, gracias',
    'paso por ahora',
  ];

  it.each(skip)('detects "%s" as skip', (text) => {
    expect(handler.isSkipPhrase(text)).toBe(true);
  });

  const notSkip = [
    'Holanda',
    'Amsterdam',
    'Miami',
    'Países Bajos',
    'estoy en madrid',
    'no sabes lo que dices', // starts with "no" but not a skip phrase
  ];

  it.each(notSkip)('does not flag "%s" as skip', (text) => {
    expect(handler.isSkipPhrase(text)).toBe(false);
  });
});
