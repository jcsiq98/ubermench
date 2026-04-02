import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RedisService } from '../../config/redis.service';
import { AiContextService } from './ai-context.service';
import {
  AiIntent,
  AiResponse,
  ConversationMessage,
  WorkspaceContextDto,
} from './ai.types';
import { AI_TOOLS, TOOL_TO_INTENT } from './ai.tools';

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
  const isoDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

  const dayOfMonth = now.getDate();
  const tomorrowDay = new Date(now.getTime() + 86400000).getDate();

  return `Eres **Handy**, asistente de negocios por WhatsApp para trabajadores de oficios en México.

Fecha: **${dateStr}**, ${timeStr} (CDMX). ISO: ${isoDate}. Día del mes: ${dayOfMonth}. Mañana es día: ${tomorrowDay}.

Personalidad: español mexicano natural, conciso, profesional, emojis con moderación.

## Reglas
1. Siempre responde en español mexicano.
2. No inventes datos — pide clarificación si falta info.
3. Montos en palabras: "tres mil" = 3000, "mil doscientos" = 1200.
4. No des consejos legales, fiscales ni médicos.
5. Usa las tools disponibles para acciones. Si no aplica ninguna tool, responde conversacionalmente.
6. Si el usuario acaba de recibir un resumen y hace una pregunta de seguimiento ("por qué", "explícame"), NO uses ver_resumen de nuevo — responde con texto usando los datos del contexto.
7. Sobre gastos recurrentes: el sistema envía 3 notificaciones automáticas (8pm recordatorio, medianoche registro, 7am briefing). Si preguntan, explica esto.` + buildWorkspaceSection(workspaceContext);
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

  if (ctx.notes) {
    lines.push(`- Notas: ${ctx.notes}`);
  }

  if (ctx.learnedFacts && ctx.learnedFacts.length > 0) {
    lines.push('\n## Lo que sabes de este proveedor');
    lines.push(
      'Estos son datos que has aprendido de conversaciones anteriores. Úsalos para personalizar tus respuestas:',
    );
    for (const fact of ctx.learnedFacts) {
      lines.push(`- ${fact}`);
    }
  }

  if (ctx.recentExpenses && ctx.recentExpenses.length > 0) {
    lines.push('\n## Gastos recientes del proveedor');
    for (const e of ctx.recentExpenses) {
      const cat = e.category ? ` (${e.category})` : '';
      const desc = e.description || 'Sin descripción';
      lines.push(`- $${e.amount}${cat} — ${desc} — ${e.date}`);
    }
  }

  if (ctx.activeRecurringExpenses && ctx.activeRecurringExpenses.length > 0) {
    lines.push('\n## Gastos recurrentes activos');
    for (const e of ctx.activeRecurringExpenses) {
      const freq = e.frequency === 'monthly' ? 'mensual' : 'semanal';
      const day = e.dayOfMonth ? ` (día ${e.dayOfMonth})` : '';
      lines.push(`- $${e.amount} — ${e.description} — ${freq}${day}`);
    }
  }

  if (lines.length === 1) return '';

  lines.push(
    '\nUsa este contexto para personalizar tus respuestas. Si preguntan por precios, usa los del proveedor. Si quieren convertir un gasto reciente a recurrente, usa los datos de "Gastos recientes".',
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
      const history = await this.contextService.getHistory(providerPhone);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: buildSystemPrompt(workspaceContext) },
      ];

      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }

      messages.push({ role: 'user', content: userMessage });

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_tokens: 500,
        temperature: 0.3,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) {
        this.logger.warn('Empty response from OpenAI');
        return FALLBACK_RESPONSE;
      }

      const parsed = this.parseToolCallResponse(choice);

      await this.contextService.addMessage(providerPhone, 'user', userMessage, parsed.intent);
      await this.contextService.addMessage(
        providerPhone,
        'assistant',
        parsed.message,
        parsed.intent,
      );

      const firstTool = choice.tool_calls?.[0];
      const toolLabel = firstTool && firstTool.type === 'function'
        ? ` (tool: ${firstTool.function.name})`
        : ' (text)';
      this.logger.log(
        `AI response for ${providerPhone}: intent=${parsed.intent}${toolLabel}`,
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

  private parseToolCallResponse(
    message: OpenAI.Chat.Completions.ChatCompletionMessage,
  ): AiResponse {
    const toolCall = message.tool_calls?.[0];

    if (!toolCall || toolCall.type !== 'function') {
      return {
        intent: AiIntent.CONVERSACION_GENERAL,
        message: message.content || FALLBACK_RESPONSE.message,
        data: {},
      };
    }

    const toolName = toolCall.function.name;
    const mapping = TOOL_TO_INTENT[toolName];

    if (!mapping) {
      this.logger.warn(`Unknown tool called: ${toolName}`);
      return {
        intent: AiIntent.CONVERSACION_GENERAL,
        message: message.content || FALLBACK_RESPONSE.message,
        data: {},
      };
    }

    let args: Record<string, any> = {};
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      this.logger.warn(`Failed to parse tool arguments for ${toolName}: ${toolCall.function.arguments}`);
    }

    const data = { ...mapping.defaultData, ...args };

    return {
      intent: mapping.intent,
      message: message.content || '',
      data,
    };
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

  /**
   * Match a user's natural language description to one of the provided options.
   * Handles synonyms, paraphrases, and voice transcription errors.
   * Returns the exact matching description or null if no confident match.
   */
  async matchToList(
    userDescription: string,
    options: string[],
  ): Promise<string | null> {
    if (!this.client || options.length === 0) return null;

    const optionsList = options.map((o, i) => `${i + 1}. "${o}"`).join('\n');

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `Eres un matcher. El usuario se refiere a un gasto de una lista. Identifica cuál es.

Opciones:
${optionsList}

Reglas:
- Si hay una coincidencia clara (sinónimos, paráfrasis, errores de transcripción), responde con la descripción EXACTA de la lista.
- Si no hay coincidencia clara, responde null.
- Responde SOLO con JSON: { "match": "descripción exacta" } o { "match": null }`,
          },
          { role: 'user', content: userDescription },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 80,
        temperature: 0.1,
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (parsed.match && options.includes(parsed.match)) {
        this.logger.log(`matchToList: "${userDescription}" → "${parsed.match}"`);
        return parsed.match;
      }

      return null;
    } catch (err: any) {
      this.logger.error(`matchToList failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Analyze recent conversation history and extract/update learned facts about the provider.
   * Returns an updated array of facts (max 30).
   */
  async extractLearnedFacts(
    history: ConversationMessage[],
    currentFacts: string[],
  ): Promise<string[]> {
    if (!this.client || history.length === 0) return currentFacts;

    const conversationText = history
      .map((m) => `${m.role === 'user' ? 'Proveedor' : 'Asistente'}: ${m.content}`)
      .join('\n');

    const prompt = `Analiza esta conversación entre un trabajador de oficios y su asistente de negocios.
Extrae o actualiza facts útiles sobre el proveedor: patrones de pago, clientes frecuentes, zonas de trabajo, preferencias, hábitos, gastos recurrentes.

Facts actuales del proveedor:
${currentFacts.length > 0 ? currentFacts.map((f, i) => `${i + 1}. ${f}`).join('\n') : '(ninguno todavía)'}

Conversación reciente:
${conversationText}

Reglas:
- Máximo 30 facts en total
- Solo facts que se puedan inferir con confianza de la conversación
- Mantén facts existentes que sigan siendo válidos
- Elimina facts que la conversación contradiga
- Cada fact debe ser una oración corta y clara en español
- NO incluyas información obvia que ya esté en el perfil de servicios/horarios
- Responde SOLO con JSON válido: { "facts": ["fact1", "fact2", ...] }`;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.3,
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return currentFacts;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.facts)) {
        const trimmed = parsed.facts
          .filter((f: unknown) => typeof f === 'string' && f.trim().length > 0)
          .slice(0, 30);
        this.logger.log(`Extracted ${trimmed.length} learned facts`);
        return trimmed;
      }

      return currentFacts;
    } catch (err: any) {
      this.logger.error(`extractLearnedFacts failed: ${err.message}`);
      return currentFacts;
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
