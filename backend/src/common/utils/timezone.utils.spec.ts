import {
  resolveTimezone,
  isValidTimezone,
  DEFAULT_TIMEZONE,
} from './timezone.utils';

describe('resolveTimezone', () => {
  describe('Europe/Amsterdam aliases (Cap. 46 — Roberto)', () => {
    const expected = 'Europe/Amsterdam';
    const aliases = [
      'holanda',
      'Holanda',
      'HOLANDA',
      'amsterdam',
      'Amsterdam',
      'ámsterdam',
      'Ámsterdam',
      'paises bajos',
      'países bajos',
      'Países Bajos',
      'netherlands',
      'Netherlands',
      'nl',
      'NL',
    ];

    it.each(aliases)('resolves "%s" to Europe/Amsterdam', (input) => {
      expect(resolveTimezone(input)).toBe(expected);
    });

    it('trims surrounding whitespace before resolving', () => {
      expect(resolveTimezone('  holanda  ')).toBe(expected);
    });
  });

  describe('regression — pre-existing aliases still resolve', () => {
    const cases: Array<[string, string]> = [
      ['cdmx', 'America/Mexico_City'],
      ['Ciudad de México', 'America/Mexico_City'],
      ['Tijuana', 'America/Tijuana'],
      ['Chihuahua', 'America/Chihuahua'],
      ['Cancún', 'America/Cancun'],
      ['Miami', 'America/New_York'],
      ['Nueva York', 'America/New_York'],
      ['Los Ángeles', 'America/Los_Angeles'],
      ['Madrid', 'Europe/Madrid'],
      ['Londres', 'Europe/London'],
      ['eastern', 'America/New_York'],
      ['pst', 'America/Los_Angeles'],
    ];

    it.each(cases)('resolves "%s" to %s', (input, expected) => {
      expect(resolveTimezone(input)).toBe(expected);
    });
  });

  describe('IANA passthrough', () => {
    it('returns valid IANA strings as-is', () => {
      expect(resolveTimezone('Europe/Amsterdam')).toBe('Europe/Amsterdam');
      expect(resolveTimezone('America/New_York')).toBe('America/New_York');
      expect(resolveTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
    });
  });

  describe('unresolved input', () => {
    it('returns null for unknown city / non-IANA strings', () => {
      expect(resolveTimezone('marte')).toBeNull();
      expect(resolveTimezone('xxxxxx')).toBeNull();
      expect(resolveTimezone('')).toBeNull();
    });
  });
});

describe('isValidTimezone', () => {
  it('accepts known IANA strings', () => {
    expect(isValidTimezone('Europe/Amsterdam')).toBe(true);
    expect(isValidTimezone('America/Mexico_City')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidTimezone('not/a/real/zone')).toBe(false);
  });
});

describe('DEFAULT_TIMEZONE', () => {
  it('is America/Mexico_City', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/Mexico_City');
  });
});
