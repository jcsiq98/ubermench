/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';
import { AiIntent } from '../ai/ai.types';

// Cap. 46 — pure-helper test for the runtime gate predicate.
// shouldGateForRiskyDefault only reads its args, so we instantiate the
// handler with noop deps and reach the private method via casts. Same
// pattern as whatsapp-provider.financial-firewall.spec.ts.

function makeHandler(): any {
  const noop = null as any;
  return new (WhatsAppProviderHandler as any)(
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
}

const MX_PHONE = '+5215512345678';
const NL_PHONE = '+15755716627'; // Roberto-style: +1 country code, lives in NL

const DATE_TIME_INTENTS = [
  AiIntent.AGENDAR_CITA,
  AiIntent.MODIFICAR_CITA,
  AiIntent.CREAR_RECORDATORIO,
];

const NON_GATE_INTENTS = [
  AiIntent.REGISTRAR_INGRESO,
  AiIntent.REGISTRAR_GASTO,
  AiIntent.VER_RESUMEN,
  AiIntent.CONVERSACION_GENERAL,
];

const RISKY_DEFAULT = {
  timezone: 'America/Mexico_City',
  timezoneConfirmed: false,
};

describe('WhatsAppProviderHandler — shouldGateForRiskyDefault (Cap. 46)', () => {
  const handler = makeHandler();

  it.each(DATE_TIME_INTENTS)(
    'gates non-Mexican phone + risky default + intent=%s',
    (intent) => {
      const result = handler.shouldGateForRiskyDefault(
        NL_PHONE,
        RISKY_DEFAULT,
        [{ intent, message: '', data: {} }],
      );
      expect(result).toBe(true);
    },
  );

  it.each(NON_GATE_INTENTS)(
    'does NOT gate on non-date intent (intent=%s)',
    (intent) => {
      const result = handler.shouldGateForRiskyDefault(
        NL_PHONE,
        RISKY_DEFAULT,
        [{ intent, message: '', data: {} }],
      );
      expect(result).toBe(false);
    },
  );

  it('does NOT gate Mexican phones even with risky default + date intent', () => {
    const result = handler.shouldGateForRiskyDefault(
      MX_PHONE,
      RISKY_DEFAULT,
      [{ intent: AiIntent.AGENDAR_CITA, message: '', data: {} }],
    );
    expect(result).toBe(false);
  });

  it('does NOT gate when timezone is non-default', () => {
    const result = handler.shouldGateForRiskyDefault(
      NL_PHONE,
      { timezone: 'Europe/Amsterdam', timezoneConfirmed: false },
      [{ intent: AiIntent.AGENDAR_CITA, message: '', data: {} }],
    );
    expect(result).toBe(false);
  });

  it('does NOT gate when timezoneConfirmed is true', () => {
    const result = handler.shouldGateForRiskyDefault(
      NL_PHONE,
      { timezone: 'America/Mexico_City', timezoneConfirmed: true },
      [{ intent: AiIntent.AGENDAR_CITA, message: '', data: {} }],
    );
    expect(result).toBe(false);
  });

  it('does NOT gate when workspaceContext is undefined', () => {
    const result = handler.shouldGateForRiskyDefault(
      NL_PHONE,
      undefined,
      [{ intent: AiIntent.AGENDAR_CITA, message: '', data: {} }],
    );
    expect(result).toBe(false);
  });

  it('gates if ANY response in the batch has a date/time intent', () => {
    const result = handler.shouldGateForRiskyDefault(
      NL_PHONE,
      RISKY_DEFAULT,
      [
        { intent: AiIntent.REGISTRAR_INGRESO, message: '', data: {} },
        { intent: AiIntent.AGENDAR_CITA, message: '', data: {} },
      ],
    );
    expect(result).toBe(true);
  });
});
