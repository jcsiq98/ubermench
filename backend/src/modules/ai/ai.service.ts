import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RedisService } from '../../config/redis.service';
import { AiContextService } from './ai-context.service';
import { AiIntent, AiResponse, WorkspaceContextDto } from './ai.types';

const RATE_LIMIT_PREFIX = 'ai_rate:';
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 3600; // 1 hour

function buildSystemPrompt(workspaceContext?: WorkspaceContextDto): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  });
  const isoDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); // YYYY-MM-DD

  return `Eres **Handy**, un asistente de negocios por WhatsApp para trabajadores de oficios (plomeros, electricistas, pintores, albañiles, etc.) en México.

## Fecha y hora actual
Hoy es **${dateStr}**, son las **${timeStr}** (hora de México, zona central).
Fecha ISO de hoy: ${isoDate}

## Tu personalidad
- Amigable, directo y profesional
- Hablas español mexicano natural — puedes usar "¿qué onda?", "sale", "va", "¡chido!" cuando sea natural, sin exagerar
- Eres conciso — los mensajes de WhatsApp deben ser cortos y claros
- Usas emojis con moderación para dar calidez

## Tus capacidades
Puedes entender y responder a estas intenciones:
1. **registrar_ingreso** — cuando el usuario dice cuánto cobró (ej: "cobré 1,200", "me pagaron 500 por una fuga", "hoy gané 3 mil")
2. **ver_resumen** — cuando pregunta por sus ganancias (ej: "¿cuánto llevo?", "resumen de la semana", "¿cómo voy este mes?")
3. **agendar_cita** — cuando menciona un trabajo futuro (ej: "mañana tengo trabajo a las 10 en Polanco", "agenda para el jueves")
4. **confirmar_cliente** — cuando quiere confirmar o contactar a un cliente (ej: "confírmale a la señora García", "mándale mensaje al cliente")
5. **ver_agenda** — cuando pregunta por su agenda (ej: "¿qué tengo hoy?", "mis citas de mañana")
6. **ayuda** — cuando pide ayuda o pregunta qué puedes hacer
7. **configurar_perfil** — cuando el proveedor quiere cambiar su perfil de trabajo: servicios, precios, horarios o respuesta automática (ej: "cobro 800 por visita", "ya no hago trabajos de gas", "trabajo lunes a viernes de 8 a 6", "si no contesto diles que les llamo después"). En data incluye: { action: "add_service"|"remove_service"|"set_schedule"|"set_auto_reply"|"add_note", ...campos relevantes }

Si el mensaje no encaja en ninguna de esas intenciones, usa **conversacion_general**.

## Reglas
1. SIEMPRE responde en español
2. Si no entiendes algo, pide clarificación amablemente — NUNCA inventes datos
3. No des consejos legales, fiscales ni médicos
4. Sé empático con los problemas del trabajador
5. Cuando detectes un ingreso, extrae: monto, descripción del trabajo, método de pago (efectivo/transferencia/tarjeta), nombre del cliente
6. Cuando detectes una cita, extrae: fecha, hora, nombre del cliente, dirección, descripción del trabajo
7. Si el monto es ambiguo (ej: "tres mil" = 3000, "mil doscientos" = 1200), interpreta correctamente
8. Para fechas: SIEMPRE calcula la fecha ISO correcta basándote en la fecha actual. "Mañana" = día siguiente a hoy. "El jueves" = el próximo jueves a partir de hoy.

## Formato de respuesta
Responde SIEMPRE en JSON válido con esta estructura:
{
  "intent": "registrar_ingreso|ver_resumen|agendar_cita|confirmar_cliente|ver_agenda|ayuda|configurar_perfil|conversacion_general",
  "message": "Tu respuesta al usuario en texto plano (esto se envía por WhatsApp)",
  "data": {}
}

Para **registrar_ingreso**, data debe incluir (si están disponibles):
{ "amount": 1200, "description": "fuga en baño", "paymentMethod": "CASH|TRANSFER|CARD|OTHER", "clientName": "Sr. Ramírez" }

Para **agendar_cita**, data DEBE incluir la fecha en formato ISO (YYYY-MM-DD) calculada correctamente:
{ "date": "${isoDate}", "time": "10:00", "clientName": "Sra. García", "address": "Polanco", "description": "revisión de tubería" }
Ejemplo: si hoy es ${isoDate} y el usuario dice "mañana", date debe ser el día siguiente en formato YYYY-MM-DD.

Para **configurar_perfil**, data debe incluir:
{ "action": "add_service", "serviceName": "plomería", "servicePrice": 800, "serviceUnit": "visita" }
{ "action": "remove_service", "serviceName": "gas" }
{ "action": "set_schedule", "days": ["lunes","martes","miércoles","jueves","viernes"], "timeStart": "08:00", "timeEnd": "18:00" }
{ "action": "set_auto_reply", "autoReplyEnabled": true, "autoReplyMessage": "Les llamo en una hora" }
{ "action": "add_note", "note": "lo que el proveedor quiera recordar" }

Para otros intents, data puede estar vacío {}.` + buildWorkspaceSection(workspaceContext);
}

function buildWorkspaceSection(ctx?: WorkspaceContextDto): string {
  if (!ctx) return '';

  const lines: string[] = ['\n\n## Perfil de trabajo del proveedor actual'];

  if (ctx.services.length > 0) {
    const list = ctx.services
      .map((s) => `${s.name}: $${s.price} por ${s.unit}`)
      .join(', ');
    lines.push(`- Servicios: ${list}`);
  }

  if (ctx.schedule.days?.length) {
    lines.push(
      `- Disponibilidad: ${ctx.schedule.days.join(', ')}, ${ctx.schedule.timeStart} - ${ctx.schedule.timeEnd}`,
    );
  }

  if (ctx.autoReply?.enabled) {
    lines.push(
      `- Respuesta automática activa: "${ctx.autoReply.message}"`,
    );
  }

  if (ctx.notes) {
    lines.push(`- Notas: ${ctx.notes}`);
  }

  if (lines.length === 1) return '';

  lines.push(
    '\nUsa este contexto para personalizar tus respuestas. Si preguntan por precios, usa los del proveedor.',
  );

  return lines.join('\n');
}

const FALLBACK_RESPONSE: AiResponse = {
  intent: AiIntent.CONVERSACION_GENERAL,
  message:
    '🤔 Disculpa, no pude procesar tu mensaje. ¿Podrías repetirlo?\n\nEscribe *"ayuda"* para ver lo que puedo hacer.',
  data: {},
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private config: ConfigService,
    private contextService: AiContextService,
    private redis: RedisService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.logger.log(`✅ AI Service initialized (model: ${this.model})`);
    } else {
      this.client = null;
      this.logger.warn(
        '⚠️  AI Service DISABLED — set OPENAI_API_KEY in .env',
      );
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper.
   * Accepts a Buffer of audio data (typically ogg/opus from WhatsApp voice notes).
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string = 'audio/ogg',
  ): Promise<string> {
    if (!this.client) {
      this.logger.warn('Cannot transcribe — OpenAI client not configured');
      return '';
    }

    try {
      const ext = mimeType.includes('ogg') ? 'ogg'
        : mimeType.includes('mp4') ? 'mp4'
        : mimeType.includes('mpeg') ? 'mp3'
        : 'ogg';

      const file = new File(
        [new Uint8Array(audioBuffer)],
        `voice.${ext}`,
        { type: mimeType },
      );

      const transcription = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'es',
      });

      const text = transcription.text?.trim() || '';
      this.logger.log(
        `Whisper transcription (${audioBuffer.length} bytes): "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`,
      );
      return text;
    } catch (error: any) {
      this.logger.error(`Whisper transcription failed: ${error.message}`);
      return '';
    }
  }

  async processMessage(
    providerPhone: string,
    userMessage: string,
    providerName?: string,
    workspaceContext?: WorkspaceContextDto,
  ): Promise<AiResponse> {
    if (!this.client) {
      return {
        intent: AiIntent.CONVERSACION_GENERAL,
        message: `Hola${providerName ? ` ${providerName}` : ''}! El asistente AI no está configurado aún. Escribe *"menu"* para ver tus opciones.`,
      };
    }

    // Rate limiting
    const allowed = await this.checkRateLimit(providerPhone);
    if (!allowed) {
      return {
        intent: AiIntent.CONVERSACION_GENERAL,
        message:
          '⏳ Has enviado muchos mensajes. Espera unos minutos antes de continuar.\n\nEscribe *"menu"* para ver tus opciones.',
      };
    }

    try {
      // Build conversation context
      const history = await this.contextService.getHistory(providerPhone);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: buildSystemPrompt(workspaceContext) },
      ];

      // Add conversation history
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }

      // Add current message
      messages.push({ role: 'user', content: userMessage });

      // Call OpenAI
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.7,
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        this.logger.warn('Empty response from OpenAI');
        return FALLBACK_RESPONSE;
      }

      // Parse JSON response
      const parsed = this.parseAiResponse(raw);

      // Save to conversation history (Redis for context + PostgreSQL for permanent log)
      await this.contextService.addMessage(providerPhone, 'user', userMessage, parsed.intent);
      await this.contextService.addMessage(
        providerPhone,
        'assistant',
        parsed.message,
        parsed.intent,
      );

      this.logger.log(
        `AI response for ${providerPhone}: intent=${parsed.intent}`,
      );

      return parsed;
    } catch (error: any) {
      this.logger.error(`AI processing error: ${error.message}`);

      if (error.status === 429) {
        return {
          intent: AiIntent.CONVERSACION_GENERAL,
          message:
            '⏳ El servicio está ocupado. Intenta de nuevo en unos segundos.',
        };
      }

      return FALLBACK_RESPONSE;
    }
  }

  private parseAiResponse(raw: string): AiResponse {
    try {
      const parsed = JSON.parse(raw);
      const intent =
        Object.values(AiIntent).includes(parsed.intent)
          ? (parsed.intent as AiIntent)
          : AiIntent.CONVERSACION_GENERAL;

      return {
        intent,
        message: parsed.message || FALLBACK_RESPONSE.message,
        data: parsed.data || {},
      };
    } catch {
      this.logger.warn(`Failed to parse AI JSON: ${raw.slice(0, 200)}`);
      return FALLBACK_RESPONSE;
    }
  }

  /**
   * Extract structured data from natural language using LLM.
   * Used for onboarding and other cases where we need specific info from free text.
   */
  async extractFromText(
    text: string,
    instruction: string,
  ): Promise<Record<string, any> | null> {
    if (!this.client) return null;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: instruction + '\nResponde SOLO con JSON válido, sin markdown.',
          },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 150,
        temperature: 0.3,
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err: any) {
      this.logger.error(`extractFromText failed: ${err.message}`);
      return null;
    }
  }

  private async checkRateLimit(providerPhone: string): Promise<boolean> {
    const key = `${RATE_LIMIT_PREFIX}${providerPhone}`;
    const current = await this.redis.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= RATE_LIMIT_MAX) {
      this.logger.warn(`Rate limit exceeded for ${providerPhone}`);
      return false;
    }

    if (count === 0) {
      await this.redis.set(key, '1', RATE_LIMIT_WINDOW);
    } else {
      await this.redis.incr(key);
    }

    return true;
  }
}
