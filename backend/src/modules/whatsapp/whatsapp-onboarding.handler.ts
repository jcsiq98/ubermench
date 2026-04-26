import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { AiService } from '../ai/ai.service';
import { AiContextService } from '../ai/ai-context.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { sanitizeForWhatsApp } from '../../common/utils/whatsapp-format.utils';
import {
  resolveTimezone,
  getTimezoneLabel,
} from '../../common/utils/timezone.utils';

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
}

const MAX_TIMEZONE_ATTEMPTS = 2;
const SKIP_TIMEZONE_KEYWORDS = [
  'luego', 'despues', 'después', 'mas tarde', 'más tarde',
  'saltar', 'skip', 'no se', 'no sé', 'no lo se', 'no lo sé',
  'paso', 'pasa', 'omitir', 'olvidalo', 'olvídalo', 'ninguna',
];

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
    const session = await this.getSession(senderPhone);
    const dbPhone = this.normalizePhoneForDb(senderPhone);

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
          senderPhone,
          `👋 ¡Hola ${existing.name || ''}! Ya tienes tu cuenta activa.\n\n` +
            `Puedes escribirme lo que necesites. Por ejemplo:\n` +
            `• "Cobré 800 de una fuga"\n` +
            `• "Mañana tengo trabajo a las 10"\n` +
            `• "¿Cuánto llevo esta semana?"`,
        );
        return;
      }
    }

    await this.aiContextService.addMessage(senderPhone, 'user', text, 'onboarding');

    if (!session) {
      return this.startOnboarding(senderPhone, senderName);
    }

    switch (session.step) {
      case OnboardingStep.NAME:
        return this.handleNameResponse(senderPhone, text, session);
      case OnboardingStep.TRADE:
        return this.handleTradeResponse(senderPhone, text, session);
      case OnboardingStep.TIMEZONE:
        return this.handleTimezoneResponse(senderPhone, text, session);
      case OnboardingStep.DONE:
        await this.sendAndLog(senderPhone, `Ya estás registrado. Escríbeme lo que necesites.`);
        return;
      default:
        return this.startOnboarding(senderPhone, senderName);
    }
  }

  private async startOnboarding(
    phone: string,
    name: string,
  ): Promise<void> {
    if (name) {
      const capitalizedName = name
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      await this.setSession(phone, {
        step: OnboardingStep.TRADE,
        name: capitalizedName,
      });

      await this.sendAndLog(
        phone,
        `👋 ¡Hola, *${capitalizedName}*! Soy tu Chalán.\n\n` +
          `Te ayudo a llevar el control de tus ingresos, tu agenda y tu negocio — todo por aquí, por WhatsApp.\n\n` +
          `*¿A qué te dedicas?*\n_(plomero, electricista, albañil, pintor, lo que sea)_`,
      );
    } else {
      await this.setSession(phone, { step: OnboardingStep.NAME });

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

    // Use LLM to extract the trade/occupation. The text may come from a long
    // voice transcription (Whisper), so we instruct the LLM to extract just
    // the trade — and to return null if no clear trade is mentioned.
    const extracted = await this.aiService.extractFromText(
      trimmed,
      `El usuario está respondiendo a la pregunta "¿A qué te dedicas?".
Extrae SOLO el oficio o profesión, en 1-3 palabras máximo, en minúsculas, sin artículos ni muletillas.
Ejemplos:
- "soy plomero" → {"trade": "plomero"}
- "el flomero, lo que sea. ah ok, ok, ok..." → {"trade": "plomero"}
- "yo me dedico a la electricidad residencial" → {"trade": "electricista"}
- "pues hago de todo, albañilería, plomería..." → {"trade": "albañil"}
Si NO puedes identificar un oficio claro, responde: {"trade": null}
Responde con JSON.`,
    );

    const sanitized = this.sanitizeTrade(extracted?.trade);

    if (!sanitized) {
      await this.sendAndLog(
        phone,
        `No te entendí bien el oficio. Dime en pocas palabras a qué te dedicas (plomero, electricista, albañil, etc.).`,
      );
      return;
    }

    const trade = sanitized;
    session.trade = trade;

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
        `✅ Provider registered: ${session.name} (${dbPhone}) — ${session.trade}`,
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

      await this.sendAndLog(
        phone,
        `Listo, *${session.name}*. Ya tienes tu Chalán.\n\nDime qué necesitas — por texto o por audio.`,
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
          `Tus citas y recordatorios usarán esta hora.\n\n` +
          `Dime qué necesitas — por texto o por audio.`,
      );
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

  private isSkipPhrase(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,;:!?"'`()¿¡]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return false;
    return SKIP_TIMEZONE_KEYWORDS.some((kw) => {
      const kwNorm = kw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return normalized === kwNorm || normalized.startsWith(kwNorm + ' ');
    });
  }

  /**
   * +52 covers Mexico exclusively (no overlap with other country codes).
   * The check tolerates whitespace and the Mexican mobile prefix `1`
   * (so both `+52` and `+521` start with digits 52).
   */
  private isMexicanPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('52');
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

  private normalizePhoneForDb(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13 && cleaned.startsWith('521')) {
      cleaned = '52' + cleaned.slice(3);
    }
    return `+${cleaned}`;
  }
}
