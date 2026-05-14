/**
 * Trade-specific welcome examples shown right after onboarding completes.
 *
 * Context (Cap. 49 — May 2026): user feedback from Alberto + Oscar said the
 * post-onboarding "Dime qué necesitas" was too vague — they finished
 * registering and didn't know what to do next. Solution: show 3 concrete
 * examples tailored to the trade they just declared.
 *
 * Rules for new entries:
 * - 3 examples per trade, each one a literal phrase the user could send.
 * - Cover 3 distinct capabilities (e.g. ingreso, agenda/cita, recordatorio
 *   or gasto). Pick whatever combo feels most natural for that gremio.
 * - Every example must map to a tool that exists today in `ai.tools.ts`.
 *   Don't promise features that aren't shipped.
 * - No emojis, no marketing copy, no "would you like to...". Just a phrase
 *   the user could speak to the Chalán.
 * - Keep each line under ~60 chars so WhatsApp doesn't wrap awkwardly on
 *   phones with smaller screens.
 *
 * Lookup is tolerant: lowercase, strip diacritics, match against a list of
 * synonyms per entry. Unknown trades fall back to `default`.
 */

export interface TradeExampleSet {
  readonly trade: string;
  readonly synonyms: readonly string[];
  readonly examples: readonly [string, string, string];
}

const TRADE_EXAMPLE_SETS: readonly TradeExampleSet[] = [
  {
    trade: 'plomero',
    synonyms: ['plomero', 'fontanero'],
    examples: [
      'Cobré 800 por destapar un baño',
      'Mañana 10am tengo fuga en casa del señor López',
      'Recuérdame pasar por material el viernes',
    ],
  },
  {
    trade: 'electricista',
    synonyms: ['electricista', 'electrico'],
    examples: [
      'Me pagaron 1,500 por cambiar un centro de carga',
      'El jueves a las 9 voy a revisar instalación en Pedregal',
      'Recuérdame cotizar el trabajo de la señora Ruiz mañana',
    ],
  },
  {
    trade: 'albanil',
    synonyms: ['albanil', 'maestro de obra', 'maestro obra', 'obrero'],
    examples: [
      'Cobré 2,000 del adelanto de la obra de los Martínez',
      'Lunes 7am empiezo el aplanado en Las Lomas',
      'Gasté 450 en cemento hoy',
    ],
  },
  {
    trade: 'pintor',
    synonyms: ['pintor'],
    examples: [
      'Me pagaron 3,200 por pintar el departamento',
      'Sábado 8am, pintura en casa del señor Reyes',
      'Recuérdame comprar más blanco mañana',
    ],
  },
  {
    trade: 'carpintero',
    synonyms: ['carpintero'],
    examples: [
      'Cobré 1,800 por el clóset de la señora Hernández',
      'Jueves a las 10 entrego mueble en Misiones',
      'Gasté 600 en bisagras y tornillería',
    ],
  },
  {
    trade: 'mecanico',
    synonyms: ['mecanico', 'hojalatero'],
    examples: [
      'Me pagaron 1,200 por la afinación del Tsuru',
      'Mañana 11am recibo el Jetta del señor Pérez',
      'Recuérdame pedirle al cliente la factura del aceite',
    ],
  },
  {
    trade: 'jardinero',
    synonyms: ['jardinero', 'paisajista'],
    examples: [
      'Cobré 700 por el jardín de los Ramírez',
      'Viernes 8am, poda en casa de la señora Aguilar',
      'Recuérdame regresar por el rastrillo el lunes',
    ],
  },
  {
    trade: 'estilista',
    synonyms: ['estilista', 'peluquero', 'peluquera', 'barbero'],
    examples: [
      'Cobré 350 de un corte y peinado',
      'Mañana 4pm, cita con Karla',
      'Recuérdame pedir más tinte rubio el sábado',
    ],
  },
  {
    trade: 'manicurista',
    synonyms: ['manicurista', 'unas', 'unista'],
    examples: [
      'Me pagaron 450 de un acrílico',
      'Jueves a las 6pm, cita con Daniela',
      'Recuérdame reponer el quitaesmalte mañana',
    ],
  },
  {
    trade: 'costurera',
    synonyms: ['costurera', 'costurero', 'sastre', 'modista'],
    examples: [
      'Cobré 250 por ajustar un vestido',
      'Recuérdame entregar el saco del señor Vega el viernes',
      'Gasté 180 en hilos y botones hoy',
    ],
  },
  {
    trade: 'dentista',
    synonyms: ['dentista', 'odontologo'],
    examples: [
      'Cobré 1,500 por una limpieza',
      'Lunes 10am, primera cita con Laura',
      'Recuérdame llamar al laboratorio por la corona el jueves',
    ],
  },
  {
    trade: 'doctor',
    synonyms: ['doctor', 'doctora', 'medico', 'medica'],
    examples: [
      'Cobré 800 de una consulta',
      'Mañana 5pm, paciente de seguimiento',
      'Recuérdame revisar los estudios de la señora Soto el viernes',
    ],
  },
  {
    trade: 'ama de casa',
    synonyms: ['ama de casa', 'amo de casa', 'hogar'],
    examples: [
      'Gasté 320 en la despensa hoy',
      'Recuérdame pagar la luz el martes',
      'Cuánto llevo gastado esta semana',
    ],
  },
];

const DEFAULT_EXAMPLES: readonly [string, string, string] = [
  'Cobré 1,000 por un trabajo de hoy',
  'Mañana a las 10 tengo una cita',
  'Recuérdame llamar al cliente el viernes',
];

/**
 * Normalize a free-text trade input the way the onboarding LLM extracts it
 * (already lowercase + light cleanup), and strip diacritics so we can match
 * across "albañil" / "albanil" without exploding the synonym list.
 */
function normalizeTrade(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getExamplesForTrade(
  trade: string | undefined | null,
): readonly [string, string, string] {
  const normalized = normalizeTrade(trade);
  if (!normalized) return DEFAULT_EXAMPLES;

  for (const set of TRADE_EXAMPLE_SETS) {
    if (set.synonyms.some((syn) => normalized.includes(syn))) {
      return set.examples;
    }
  }

  return DEFAULT_EXAMPLES;
}

/**
 * Build the full post-onboarding welcome message (no pending request path).
 *
 * Single self-contained message: short greeting + 3 examples tailored to
 * the trade + closing line about text/audio.
 */
export function buildWelcomeMessage(
  name: string,
  trade: string | undefined | null,
): string {
  const greeting = buildGreeting(name);
  const examplesBlock = buildExamplesBlock(trade);
  return `${greeting}\n\n${examplesBlock}`;
}

/**
 * Short greeting used when the user arrived with a pending operational
 * request (e.g. "recuérdame X"). The pending request gets processed first
 * and produces its own confirmation; examples follow in a second message
 * via `buildExamplesBlock`.
 */
export function buildShortGreeting(name: string): string {
  return buildGreeting(name);
}

/**
 * Stand-alone examples block, suitable as a second message after the
 * pending request was processed.
 */
export function buildExamplesBlock(trade: string | undefined | null): string {
  const examples = getExamplesForTrade(trade);
  const bullets = examples.map((e) => `• "${e}"`).join('\n');
  return (
    `Te puedo ayudar con cosas así:\n${bullets}\n\n` +
    `Por texto o por audio, como te acomode.`
  );
}

function buildGreeting(name: string): string {
  const safeName = (name || '').trim();
  return safeName
    ? `Listo, ${safeName}. Ya tienes tu Chalán.`
    : 'Listo. Ya tienes tu Chalán.';
}

// Exported for tests only.
export const __testing = {
  TRADE_EXAMPLE_SETS,
  DEFAULT_EXAMPLES,
  normalizeTrade,
};
