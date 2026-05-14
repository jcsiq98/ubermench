import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

/**
 * Generates 3 onboarding examples tailored to the user's declared trade
 * by asking the LLM to produce realistic phrases anchored to capabilities
 * the bot actually has.
 *
 * Design (Cap. 49 — revision):
 * - No hardcoded trade list. Whatever the user says ("plomero", "doctor",
 *   "trabajador independiente", "DJ", "vendedor de tamales") gets handled.
 * - The prompt explicitly lists the bot's real capabilities so the LLM
 *   doesn't promise unshipped features (e.g. "envíame fotos del trabajo").
 * - Hard 5-second timeout. If the LLM is slow or fails, the caller falls
 *   back to a short greeting without examples — activation is lost but
 *   the onboarding flow never breaks.
 */
@Injectable()
export class WelcomeExamplesService {
  private readonly logger = new Logger(WelcomeExamplesService.name);

  // Real capabilities the Chalán has today, expressed as actions the user
  // can request. Update this list when a new tool ships in ai.tools.ts.
  private static readonly CAPABILITIES = [
    'registrar un ingreso o cobro (con o sin descripción y cliente)',
    'registrar un gasto (con o sin categoría)',
    'agendar una cita o trabajo (con fecha y hora)',
    'crear un recordatorio personal con fecha y hora',
    'pedir un resumen financiero (semana, mes, periodo custom)',
    'generar un link de cobro para mandar a un cliente',
  ];

  private static readonly TIMEOUT_MS = 5000;

  constructor(private readonly aiService: AiService) {}

  /**
   * Generate 3 example phrases for the user. Returns null if the LLM
   * times out or fails — the caller should fall back to a short greeting.
   */
  async generateExamples(trade: string): Promise<string[] | null> {
    const cleanTrade = (trade || '').trim();
    if (!cleanTrade) return null;

    const capabilitiesList = WelcomeExamplesService.CAPABILITIES
      .map((c) => `- ${c}`)
      .join('\n');

    const instruction = `Eres un copywriter mexicano que ayuda a un asistente llamado Chalán a darle la bienvenida a un trabajador independiente que acaba de registrarse.

El usuario se presentó como: "${cleanTrade}"

Tu tarea: generar EXACTAMENTE 3 ejemplos de frases que el usuario podría enviarle al Chalán por WhatsApp, personalizadas a su oficio.

Las capacidades reales del Chalán son únicamente:
${capabilitiesList}

Reglas estrictas:
1. Cada ejemplo debe ser una frase realista en español mexicano, en primera persona, como si el usuario la estuviera dictando.
2. Cada ejemplo debe corresponder a UNA de las capacidades listadas. NO inventes capacidades que no estén ahí.
3. Cubre 3 capacidades DIFERENTES entre los 3 ejemplos (típicamente: un cobro/ingreso, una cita o recordatorio, y un gasto o algo más).
4. Cada frase debe ser corta: máximo 60 caracteres.
5. Usa contexto específico del oficio: nombres de herramientas, materiales, clientes, situaciones típicas. Si el oficio es vago (ej. "trabajador independiente"), usa ejemplos genéricos pero naturales.
6. Sin emojis. Sin comillas dentro de la frase. Sin formato markdown.
7. No empieces con "que", "como", "tipo" — son frases directas.

Responde SOLO con JSON con esta forma exacta:
{"examples": ["frase 1", "frase 2", "frase 3"]}`;

    try {
      const result = await this.withTimeout(
        this.aiService.extractFromText(cleanTrade, instruction),
        WelcomeExamplesService.TIMEOUT_MS,
      );

      if (!result || !Array.isArray(result.examples)) {
        this.logger.warn(
          `Welcome examples LLM returned invalid shape for trade="${cleanTrade}"`,
        );
        return null;
      }

      const examples = result.examples
        .filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
        .map((e: string) => e.trim())
        .slice(0, 3);

      if (examples.length !== 3) {
        this.logger.warn(
          `Welcome examples LLM returned ${examples.length} valid items for trade="${cleanTrade}"`,
        );
        return null;
      }

      return examples;
    } catch (err: any) {
      this.logger.warn(
        `Welcome examples generation failed for trade="${cleanTrade}": ${err.message}`,
      );
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out after ${ms}ms`)),
        ms,
      );
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
