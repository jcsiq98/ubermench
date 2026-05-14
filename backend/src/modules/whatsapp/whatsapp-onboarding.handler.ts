import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { AiService } from '../ai/ai.service';
import { AiIntent } from '../ai/ai.types';
import { AiContextService } from '../ai/ai-context.service';
import { IncomeService } from '../income/income.service';
import { RemindersService } from '../reminders/reminders.service';
import { QueueService } from '../../common/queues/queue.service';
import { QUEUE_NAMES } from '../../common/queues/queue.constants';
import { PersonalReminderJobData } from '../../common/queues/processors/personal-reminder.processor';
import { WorkspaceService } from '../workspace/workspace.service';
import { sanitizeForWhatsApp } from '../../common/utils/whatsapp-format.utils';
import {
  resolveTimezone,
  getTimezoneLabel,
  isMexicanPhone,
  isTimezoneSkipPhrase,
} from '../../common/utils/timezone.utils';
import { canonicalizePhoneE164 } from '../../common/utils/phone.utils';
import {
  buildShortGreeting,
  buildExamplesBlock,
} from './trade-examples';
import { WelcomeExamplesService } from './welcome-examples.service';

export enum OnboardingStep {
  NAME = 'NAME',
  TRADE = 'TRADE',
  TIMEZONE = 'TIMEZONE',
  DONE = 'DONE',
}

interface OnboardingSession {
  step: OnboardingStep;
  name?: string;
  trade?: string;
  // Cap. 46 — Timezone Confidence System (only set on the TIMEZONE step
  // for non-Mexican phones).
  providerProfileId?: string;
  timezoneAttempts?: number;
  pendingInitialRequest?: string;
  // Cap. 49 — count failed LLM trade extractions to trigger raw fallback.
  tradeAttempts?: number;
}

type OnboardingTradeIntent =
  | 'trade_answer'
  | 'scope_question'
  | 'data_question'
  | 'capability_question'
  | 'unsupported_question'
  | 'other';

const MAX_TIMEZONE_ATTEMPTS = 2;

const SESSION_PREFIX = 'wa_onboarding:';
const SESSION_TTL = 86400;

@Injectable()
export class WhatsAppOnboardingHandler {
  private readonly logger = new Logger(WhatsAppOnboardingHandler.name);

  constructor(
    private whatsapp: WhatsAppService,
    private prisma: PrismaService,
    private redis: RedisService,
    private aiService: AiService,
    private aiContextService: AiContextService,
    private workspaceService: WorkspaceService,
    private incomeService: IncomeService,
    private remindersService: RemindersService,
    private queueService: QueueService,
    private welcomeExamplesService: WelcomeExamplesService,
  ) {}

  private async sendAndLog(
    phone: string,
    message: string,
    intent = 'onboarding',
  ): Promise<void> {
    const clean = sanitizeForWhatsApp(message);
    await this.whatsapp.sendTextMessage(phone, clean);
    await this.aiContextService.addMessage(phone, 'assistant', clean, intent);
  }

  private async getSession(phone: string): Promise<OnboardingSession | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${phone}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async setSession(
    phone: string,
    session: OnboardingSession,
  ): Promise<void> {
    await this.redis.set(
      `${SESSION_PREFIX}${phone}`,
      JSON.stringify(session),
      SESSION_TTL,
    );
  }

  private async clearSession(phone: string): Promise<void> {
    await this.redis.del(`${SESSION_PREFIX}${phone}`);
  }

  async handleMessage(
    senderPhone: string,
    senderName: string,
    text: string,
  ): Promise<void> {
    const phone = canonicalizePhoneE164(senderPhone);
    const session = await this.getSession(phone);
    const dbPhone = this.normalizePhoneForDb(phone);

    // Active onboarding step takes priority over the "you already have an
    // account" early return. Cap. 46: TRADE creates the User +
    // ProviderProfile and hands off to the TIMEZONE step; without this
    // ordering the next user message would hit the early return because
    // the profile now exists, and we would never finish the timezone
    // question.
    const isActiveOnboardingStep =
      !!session && session.step !== OnboardingStep.DONE;

    if (!isActiveOnboardingStep) {
      const existing = await this.prisma.user.findUnique({
        where: { phone: dbPhone },
        include: { providerProfile: true },
      });

      if (existing?.providerProfile) {
        await this.sendAndLog(
          phone,
          `👋 ¡Hola ${existing.name || ''}! Ya tienes tu cuenta activa.\n\n` +
            `Puedes escribirme lo que necesites. Por ejemplo:\n` +
            `• "Cobré 800 de una fuga"\n` +
            `• "Mañana tengo trabajo a las 10"\n` +
            `• "¿Cuánto llevo esta semana?"`,
        );
        return;
      }
    }

    await this.aiContextService.addMessage(phone, 'user', text, 'onboarding');

    if (!session) {
      return this.startOnboarding(phone, senderName, text);
    }

    switch (session.step) {
      case OnboardingStep.NAME:
        return this.handleNameResponse(phone, text, session);
      case OnboardingStep.TRADE:
        return this.handleTradeResponse(phone, text, session);
      case OnboardingStep.TIMEZONE:
        return this.handleTimezoneResponse(phone, text, session);
      case OnboardingStep.DONE:
        await this.sendAndLog(phone, `Ya estás registrado. Escríbeme lo que necesites.`);
        return;
      default:
        return this.startOnboarding(phone, senderName);
    }
  }

  private async startOnboarding(
    phone: string,
    name: string,
    initialText?: string,
  ): Promise<void> {
    const pendingInitialRequest = this.looksLikeOperationalInitialRequest(initialText)
      ? initialText?.trim()
      : undefined;

    if (name) {
      const capitalizedName = name
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      await this.setSession(phone, {
        step: OnboardingStep.TRADE,
        name: capitalizedName,
        pendingInitialRequest,
      });

      await this.sendAndLog(
        phone,
        `👋 ¡Hola, *${capitalizedName}*! Soy tu Chalán.\n\n` +
          `${pendingInitialRequest ? 'Sí puedo ayudarte con eso. Para hacerlo bien, primero te dejo registrado.\n\n' : 'Te ayudo a llevar el control de tus ingresos, tu agenda y tu negocio — todo por aquí, por WhatsApp.\n\n'}` +
          `*¿A qué te dedicas?*\n_(plomero, electricista, albañil, pintor, lo que sea)_`,
      );
    } else {
      await this.setSession(phone, { step: OnboardingStep.NAME, pendingInitialRequest });

      await this.sendAndLog(
        phone,
        `👋 ¡Hola! Soy tu Chalán.\n\n` +
          `Te ayudo a llevar el control de tus ingresos, tu agenda y tu negocio — todo por aquí, por WhatsApp.\n\n` +
          `Para empezar, *¿cómo te llamas?*`,
      );
    }
  }

  private async handleNameResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      await this.sendAndLog(phone, `Dime tu nombre para que sepa cómo llamarte.`);
      return;
    }

    const extracted = await this.aiService.extractFromText(
      trimmed,
      `El usuario está respondiendo a la pregunta "¿Cómo te llamas?".
Extrae SOLO el nombre de la persona de lo que dijo. Ignora frases como "me llamo", "mi nombre es", "soy", etc.
Si el mensaje NO contiene un nombre de persona (por ejemplo, es una pregunta, petición, o texto largo), responde: {"name": null}
Solo responde con un nombre si claramente es un nombre propio de persona.
Responde con JSON: {"name": "Nombre Extraído"} o {"name": null}`,
    );

    if (!extracted?.name) {
      await this.sendAndLog(
        phone,
        `Antes de ayudarte con eso, dime *¿cómo te llamas?* para registrar tu cuenta.`,
      );
      return;
    }

    const name = extracted.name;

    session.name = typeof name === 'string'
      ? name.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : trimmed;

    session.step = OnboardingStep.TRADE;
    await this.setSession(phone, session);

    await this.sendAndLog(
      phone,
      `Mucho gusto, *${session.name}* 👋\n\n` +
        `*¿A qué te dedicas?*\n_(plomero, electricista, albañil, pintor, lo que sea)_`,
    );
  }

  private async handleTradeResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      await this.sendAndLog(phone, `Dime a qué te dedicas. Puede ser cualquier oficio.`);
      return;
    }

    const tradeIntent = await this.classifyTradeStepMessage(trimmed);
    if (tradeIntent !== 'trade_answer') {
      const answer = await this.aiService.answerChalanSelfQuestion(
        trimmed,
        'onboarding',
      );
      await this.sendAndLog(phone, answer);
      return;
    }

    // Extract whatever the user says they do for a living. Accept any
    // honest description — trades, professions, self-employment labels,
    // services, freelance work — and only reject filler/non-answers.
    // The text may come from a long voice transcription (Whisper), so we
    // instruct the LLM to pull out just the role and ignore noise.
    const extracted = await this.aiService.extractFromText(
      trimmed,
      `El usuario está respondiendo a la pregunta "¿A qué te dedicas?".
Tu tarea: extraer una etiqueta corta (1-4 palabras, minúsculas, sin artículos ni muletillas) que describa a qué se dedica.

Acepta CUALQUIER descripción honesta: oficios tradicionales (plomero, electricista, albañil), profesiones (dentista, contador), trabajadores independientes ("trabajador independiente", "freelancer"), comerciantes ("vendedor de tamales", "comerciante"), servicios ("estilista", "manicurista"), creativos ("diseñador", "fotógrafo"), etc.

Reglas:
- Si la respuesta es genérica pero honesta (ej. "trabajador independiente", "freelancer", "ama de casa", "comerciante"), DEVUÉLVELA tal cual normalizada en minúsculas.
- Si menciona oficio específico ("soy plomero", "yo me dedico a la electricidad"), extrae el oficio limpio ("plomero", "electricista").
- Si la transcripción tiene ruido pero hay un oficio claro, extráelo.
- Devuelve {"trade": null} SOLO si el mensaje no contiene ninguna actividad reconocible (ej. "no sé", "hola", "qué tal", "?", "un mensaje al azar sin contexto").

Ejemplos:
- "soy plomero" → {"trade": "plomero"}
- "trabajador independiente" → {"trade": "trabajador independiente"}
- "soy trabajador independiente" → {"trade": "trabajador independiente"}
- "vendedor de tacos" → {"trade": "vendedor de tacos"}
- "el flomero, lo que sea. ah ok, ok..." → {"trade": "plomero"}
- "yo me dedico a la electricidad residencial" → {"trade": "electricista"}
- "ama de casa" → {"trade": "ama de casa"}
- "diseñador gráfico freelance" → {"trade": "diseñador gráfico"}
- "hola" → {"trade": null}
- "no sé" → {"trade": null}

Responde SOLO con JSON.`,
    );

    const sanitized = this.sanitizeTrade(extracted?.trade);

    if (!sanitized) {
      const attempts = (session.tradeAttempts ?? 0) + 1;
      session.tradeAttempts = attempts;
      await this.setSession(phone, session);

      // After 2 failed extractions, accept the user's raw text as-is to
      // unblock onboarding. The trade field is informational, not a gate
      // on functionality — better to record "what they said" than to
      // trap them in a loop. Mirrors the timezone-skip safety net.
      if (attempts >= 2) {
        const fallback = this.sanitizeTradeRawFallback(trimmed);
        if (fallback) {
          session.trade = fallback;
          this.logger.log(
            `Onboarding accepted raw trade after ${attempts} attempts: "${fallback}" for ${phone}`,
          );
          return this.completeTradeStep(phone, session);
        }
      }

      await this.sendAndLog(
        phone,
        `No te entendí bien. Dime en pocas palabras a qué te dedicas — puede ser cualquier oficio, profesión o actividad.`,
      );
      return;
    }

    session.trade = sanitized;
    return this.completeTradeStep(phone, session);
  }

  /**
   * Shared completion for the TRADE step: persists the User +
   * ProviderProfile + ProviderApplication, then either proceeds to the
   * timezone step (non-Mexican phones) or runs the welcome flow.
   *
   * Reached from two paths:
   *   1. The LLM extractor returned a clean trade (normal path).
   *   2. After 2 failed LLM extractions, the raw fallback accepted the
   *      user's text as-is to unblock onboarding.
   */
  private async completeTradeStep(
    phone: string,
    session: OnboardingSession,
  ): Promise<void> {
    const trade = session.trade;
    if (!trade) {
      this.logger.error(`completeTradeStep called without session.trade for ${phone}`);
      return;
    }

    try {
      const dbPhone = this.normalizePhoneForDb(phone);

      const created = await this.prisma.user.create({
        data: {
          phone: dbPhone,
          name: session.name,
          role: 'PROVIDER',
          providerProfile: {
            create: {
              bio: trade,
              serviceTypes: [trade],
              isVerified: true,
              isAvailable: true,
            },
          },
        },
        include: { providerProfile: true },
      });

      await this.prisma.providerApplication.upsert({
        where: { phone: dbPhone },
        update: {
          name: session.name,
          bio: trade,
          categories: [trade],
          onboardingStep: 'DONE',
          verificationStatus: 'APPROVED',
        },
        create: {
          phone: dbPhone,
          name: session.name,
          bio: trade,
          categories: [trade],
          serviceZones: [],
          onboardingStep: 'DONE',
          verificationStatus: 'APPROVED',
        },
      });

      this.logger.log(
        `✅ Provider registered: ${session.name} (${dbPhone}) — ${trade}`,
      );

      // Cap. 46 — for non-Mexican numbers we ask timezone before
      // closing the session. Mexican numbers keep the original flow:
      // default America/Mexico_City + the runtime gate (M4) is a
      // no-op for them.
      if (!this.isMexicanPhone(phone) && created.providerProfile?.id) {
        session.step = OnboardingStep.TIMEZONE;
        session.providerProfileId = created.providerProfile.id;
        session.timezoneAttempts = 0;
        await this.setSession(phone, session);

        await this.sendAndLog(
          phone,
          `Una más, *${session.name}*: ¿en qué *ciudad o país* trabajas normalmente? ` +
            `Es para que tus citas y recordatorios queden a la hora correcta.\n\n` +
            `_(Si quieres dejarlo para después, escribe *luego*.)_`,
        );
        return;
      }

      await this.clearSession(phone);

      await this.sendWelcomeFlow(
        phone,
        session,
        created.providerProfile?.id,
      );
    } catch (error: any) {
      this.logger.error(
        `Error creating provider: ${error.message}`,
        error.stack,
      );
      await this.sendAndLog(phone, `Hubo un error. Intenta de nuevo enviando cualquier mensaje.`);
      await this.clearSession(phone);
    }
  }

  private looksLikeOperationalInitialRequest(text?: string): boolean {
    if (!text) return false;
    const normalized = text.toLowerCase();
    return /\b(cobro|cobré|cobre|ingreso|me pagaron|recordatorio|recu[eé]rdame|agenda|cita|gasto|gast[eé])\b/.test(normalized);
  }

  private async classifyTradeStepMessage(
    text: string,
  ): Promise<OnboardingTradeIntent> {
    const normalized = text.toLowerCase().trim();

    if (this.looksLikeSelfQuestion(normalized)) {
      const classified = await this.aiService.extractFromText(
        text,
        `El usuario está en onboarding y se le preguntó "¿A qué te dedicas?".
Clasifica su mensaje en UNA de estas categorías:
- trade_answer: responde con oficio/profesión/actividad clara ("plomero", "soy abogado", "comerciante")
- scope_question: pregunta qué es Chalán, para quién sirve, cuál es su propósito o alcance
- data_question: pregunta dónde guarda datos, si accede a bancos, si lleva capital/saldo total o privacidad
- capability_question: pregunta si puede hacer algo específico ("me puedes llamar", "sirve para estilistas", "puedes recordar juntas")
- unsupported_question: pregunta algo totalmente fuera del producto
- other: no queda claro
Responde SOLO JSON: {"intent":"..."}.`,
      );
      return this.sanitizeTradeIntent(classified?.intent);
    }

    return 'trade_answer';
  }

  private looksLikeSelfQuestion(normalized: string): boolean {
    return normalized.includes('?')
      || normalized.includes('qué eres')
      || normalized.includes('que eres')
      || normalized.includes('para qué')
      || normalized.includes('para que')
      || normalized.includes('sirve')
      || normalized.includes('alcance')
      || normalized.includes('propósito')
      || normalized.includes('proposito')
      || normalized.includes('datos')
      || normalized.includes('capital')
      || normalized.includes('banco')
      || normalized.includes('guardar')
      || normalized.includes('llamar')
      || normalized.includes('llamada');
  }

  private sanitizeTradeIntent(raw: unknown): OnboardingTradeIntent {
    const allowed: OnboardingTradeIntent[] = [
      'trade_answer',
      'scope_question',
      'data_question',
      'capability_question',
      'unsupported_question',
      'other',
    ];
    return typeof raw === 'string' && allowed.includes(raw as OnboardingTradeIntent)
      ? (raw as OnboardingTradeIntent)
      : 'other';
  }

  /**
   * Cap. 46 — timezone step. Only reached for non-Mexican phones.
   * Reads the user's reply, asks the LLM to extract a city/country,
   * validates it via resolveTimezone, and either sets the timezone or
   * marks the prompt as skipped after a couple of attempts.
   */
  private async handleTimezoneResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const trimmed = text.trim();
    const providerProfileId = session.providerProfileId;
    const name = session.name || '';

    if (!providerProfileId) {
      this.logger.warn(
        `TIMEZONE step reached without providerProfileId for ${phone} — closing session`,
      );
      await this.clearSession(phone);
      await this.sendAndLog(
        phone,
        `Listo, ${name}. Escríbeme lo que necesites.`,
      );
      return;
    }

    if (this.isSkipPhrase(trimmed)) {
      await this.workspaceService.markTimezonePromptSkipped(providerProfileId);
      await this.clearSession(phone);

      await this.sendAndLog(
        phone,
        `Va. Por ahora dejo *Ciudad de México* como referencia. ` +
          `Cuando quieras cambiarla, dime *"estoy en X"* o *"mi zona es X"*.`,
      );

      await this.sendWelcomeFlow(phone, session, providerProfileId, {
        skipGreeting: true,
      });

      this.logger.log(
        `Timezone prompt skipped during onboarding for ${phone}`,
      );
      return;
    }

    const extracted = await this.aiService.extractFromText(
      trimmed,
      `El usuario está respondiendo a "¿En qué ciudad o país trabajas?".
Extrae la ciudad o país que mencionó, en 1-3 palabras, sin artículos.
Ejemplos:
- "Estoy en Holanda" -> {"location": "Holanda"}
- "Vivo en Miami desde hace años" -> {"location": "Miami"}
- "Ámsterdam, ahí mero" -> {"location": "Ámsterdam"}
- "México DF" -> {"location": "CDMX"}
Si NO puedes identificar un lugar, responde {"location": null}.
Responde SOLO con JSON.`,
    );

    const location: string | null = extracted?.location ?? null;
    const resolved = location ? resolveTimezone(location) : null;

    if (resolved) {
      await this.workspaceService.getWorkspace(providerProfileId);
      const result = await this.workspaceService.setTimezone(
        providerProfileId,
        resolved,
        'user_explicit',
      );

      if (!result.success) {
        await this.askTimezoneAgain(phone, session, result.message);
        return;
      }

      await this.clearSession(phone);
      const label = getTimezoneLabel(resolved);

      await this.sendAndLog(
        phone,
        `Listo, *${name}*. Tu zona quedó como *${label}*. ` +
          `Tus citas y recordatorios usarán esta hora.`,
      );

      await this.sendWelcomeFlow(phone, session, providerProfileId, {
        skipGreeting: true,
      });

      this.logger.log(
        `Onboarding timezone set: ${resolved} for ${phone} (provider=${providerProfileId})`,
      );
      return;
    }

    await this.askTimezoneAgain(phone, session);
  }

  private async askTimezoneAgain(
    phone: string,
    session: OnboardingSession,
    extraReason?: string,
  ): Promise<void> {
    const attempts = (session.timezoneAttempts ?? 0) + 1;

    if (attempts >= MAX_TIMEZONE_ATTEMPTS && session.providerProfileId) {
      await this.workspaceService.markTimezonePromptSkipped(
        session.providerProfileId,
      );
      await this.clearSession(phone);

      await this.sendAndLog(
        phone,
        `Mejor seguimos. Por ahora dejo *Ciudad de México* como referencia. ` +
          `Cuando quieras cambiarla, dime *"estoy en X"* o *"mi zona es X"*.`,
      );

      await this.sendWelcomeFlow(
        phone,
        session,
        session.providerProfileId,
        { skipGreeting: true },
      );

      this.logger.log(
        `Timezone prompt exhausted after ${attempts} attempts for ${phone}`,
      );
      return;
    }

    session.timezoneAttempts = attempts;
    await this.setSession(phone, session);

    const prefix = extraReason ? `${extraReason}\n\n` : '';
    await this.sendAndLog(
      phone,
      `${prefix}No me cuadró esa zona. Dímela como ciudad o país: ` +
        `*Amsterdam*, *Miami*, *Madrid*, *Bogotá*, *Buenos Aires*, lo que sea.\n\n` +
        `_(O escribe *luego* si prefieres dejarlo para después.)_`,
    );
  }

  /**
   * Unified welcome flow used at every onboarding terminus (normal close,
   * timezone resolved, timezone skipped, timezone exhausted).
   *
   * Order of operations (Cap. 49 — revision):
   *   1. Send a short greeting (unless `skipGreeting` — caller already sent
   *      a context-specific intro like the timezone confirmation).
   *   2. If there is a pending operational request the user sent during
   *      onboarding ("recuérdame X"), process it now. Its own confirmation
   *      acts as proof the bot is working.
   *   3. Generate trade-specific examples via LLM (with 5s timeout). On
   *      success, send them as a separate "Te puedo ayudar con cosas así"
   *      message. On failure, send a short "Dime qué necesitas" fallback.
   *
   * Splitting greeting and examples into two messages is deliberate (Cap.
   * 49): the LLM call buys the bot a beat that feels like it's thinking
   * about the user, not just spitting a template.
   */
  private async sendWelcomeFlow(
    phone: string,
    session: OnboardingSession,
    providerProfileId: string | undefined,
    options: { skipGreeting?: boolean } = {},
  ): Promise<void> {
    if (!options.skipGreeting) {
      await this.sendAndLog(phone, buildShortGreeting(session.name || ''));
    }

    const hadPending = Boolean(session.pendingInitialRequest?.trim());
    if (hadPending && providerProfileId) {
      await this.processPendingInitialRequest(phone, session, providerProfileId);
    }

    const examples = await this.welcomeExamplesService.generateExamples(
      session.trade || '',
    );
    await this.sendAndLog(phone, buildExamplesBlock(examples));
  }

  private async processPendingInitialRequest(
    phone: string,
    session: OnboardingSession,
    providerProfileId?: string,
  ): Promise<void> {
    const pending = session.pendingInitialRequest?.trim();
    if (!pending || !providerProfileId) return;

    try {
      const responses = await this.aiService.processMessage(
        phone,
        pending,
        session.name,
      );

      for (const response of responses) {
        if (response.intent === AiIntent.REGISTRAR_INGRESO) {
          await this.executePendingIncome(phone, response.data, providerProfileId);
        } else if (response.intent === AiIntent.CREAR_RECORDATORIO) {
          await this.executePendingReminder(phone, response.data, providerProfileId, pending);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Could not process pending onboarding request for ${phone}: ${error.message}`);
      await this.sendAndLog(
        phone,
        'Me quedé con tu primer pedido, pero no lo pude registrar automático. Escríbemelo otra vez y lo hago.',
      );
    }
  }

  private async executePendingIncome(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId: string,
  ): Promise<void> {
    const amount = data?.amount;
    if (!amount || typeof amount !== 'number' || amount <= 0) return;

    const created = await this.incomeService.create({
      providerId: providerProfileId,
      amount,
      description: data?.description,
      clientName: data?.clientName,
      paymentMethod: data?.paymentMethod,
    });
    const msg = this.incomeService.formatIncomeConfirmation(
      amount,
      data?.description,
      data?.clientName,
      data?.paymentMethod,
    );
    await this.sendAndLog(phone, msg, AiIntent.REGISTRAR_INGRESO);
    this.logger.log(`Processed pending onboarding income ${created.id} for ${phone}`);
  }

  private async executePendingReminder(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId: string,
    originalText: string,
  ): Promise<void> {
    const remindAt = this.remindersService.parseScheduledDate(data?.date, data?.time)
      ?? this.parseRelativeReminder(originalText);
    if (!remindAt) return;

    const description = data?.description || 'Recordatorio';
    const reminder = await this.remindersService.create({
      providerId: providerProfileId,
      description,
      remindAt,
    });
    await this.sendAndLog(
      phone,
      this.remindersService.formatReminderConfirmation(description, remindAt),
      AiIntent.CREAR_RECORDATORIO,
    );

    const delay = remindAt.getTime() - Date.now();
    if (delay > 0) {
      const jobData: PersonalReminderJobData = {
        reminderId: reminder.id,
        providerPhone: phone,
        description,
        remindAt: remindAt.toISOString(),
      };
      await this.queueService.addJob(
        QUEUE_NAMES.PERSONAL_REMINDER,
        'personal-reminder',
        jobData,
        { delay, jobId: `personal-reminder-${reminder.id}` },
      );
    }
  }

  private parseRelativeReminder(text: string): Date | null {
    const normalized = text.toLowerCase();
    const hourMatch = normalized.match(/en\s+(?:una|1)\s+hora/);
    if (hourMatch) return new Date(Date.now() + 60 * 60 * 1000);

    const minuteMatch = normalized.match(/en\s+(\d{1,3})\s+min/);
    if (minuteMatch) {
      const minutes = Number(minuteMatch[1]);
      if (Number.isFinite(minutes) && minutes > 0) {
        return new Date(Date.now() + minutes * 60 * 1000);
      }
    }

    return null;
  }

  // Skip phrase + Mexican phone detection moved to timezone.utils.ts so
  // the M4 runtime gate can share the exact same predicates.
  private isSkipPhrase(text: string): boolean {
    return isTimezoneSkipPhrase(text);
  }

  private isMexicanPhone(phone: string): boolean {
    return isMexicanPhone(phone);
  }

  /**
   * Final safety net for the trade field. Even if the LLM returns garbage
   * (e.g. a long Whisper transcription), we never persist more than a short,
   * lowercase, punctuation-free string. Returns null if nothing usable remains.
   */
  private sanitizeTrade(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;

    let cleaned = raw
      .toLowerCase()
      .normalize('NFC')
      .replace(/[.,;:!?"'`()¿¡]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned.replace(
      /^(soy un|soy una|soy|yo soy|me dedico a la|me dedico a el|me dedico a|trabajo de|trabajo como|hago de|el|la|los|las|un|una)\s+/i,
      '',
    );

    if (!cleaned) return null;

    const words = cleaned.split(' ').slice(0, 3).join(' ');

    if (words.length < 3 || words.length > 40) return null;

    const filler = new Set(['ok', 'eh', 'mm', 'pues', 'este', 'lo', 'que', 'sea', 'ah']);
    const meaningful = words
      .split(' ')
      .filter((w) => !filler.has(w));
    if (meaningful.length === 0) return null;

    return meaningful.join(' ');
  }

  /**
   * Raw fallback used after 2 failed LLM extractions. More permissive
   * than sanitizeTrade: accepts up to 5 words, only strips leading
   * "soy/yo soy/me dedico" preambles and obvious punctuation. Goal is to
   * unblock onboarding when the LLM extractor is being too strict — we'd
   * rather record an imperfect trade label than trap the user.
   */
  private sanitizeTradeRawFallback(raw: string): string | null {
    if (typeof raw !== 'string') return null;

    let cleaned = raw
      .toLowerCase()
      .normalize('NFC')
      .replace(/[.,;:!?"'`()¿¡]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned.replace(
      /^(soy un|soy una|soy|yo soy|me dedico a la|me dedico a el|me dedico a|trabajo de|trabajo como|hago de|el|la|los|las|un|una)\s+/i,
      '',
    );

    if (!cleaned) return null;

    const words = cleaned.split(' ').slice(0, 5).join(' ');
    if (words.length < 2 || words.length > 60) return null;

    return words;
  }

  private normalizePhoneForDb(phone: string): string {
    return canonicalizePhoneE164(phone);
  }
}
