import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { AiService } from '../ai/ai.service';
import { AiContextService } from '../ai/ai-context.service';

export enum OnboardingStep {
  NAME = 'NAME',
  TRADE = 'TRADE',
  DONE = 'DONE',
}

interface OnboardingSession {
  step: OnboardingStep;
  name?: string;
  trade?: string;
}

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
  ) {}

  private async sendAndLog(
    phone: string,
    message: string,
    intent = 'onboarding',
  ): Promise<void> {
    await this.whatsapp.sendTextMessage(phone, message);
    await this.aiContextService.addMessage(phone, 'assistant', message, intent);
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

    await this.aiContextService.addMessage(senderPhone, 'user', text, 'onboarding');

    if (!session) {
      return this.startOnboarding(senderPhone, senderName);
    }

    switch (session.step) {
      case OnboardingStep.NAME:
        return this.handleNameResponse(senderPhone, text, session);
      case OnboardingStep.TRADE:
        return this.handleTradeResponse(senderPhone, text, session);
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

      await this.prisma.user.create({
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

      await this.clearSession(phone);

      await this.sendAndLog(
        phone,
        `Listo, *${session.name}*. Ya tienes tu Chalán.\n\nDime qué necesitas — por texto o por audio.`,
      );

      this.logger.log(
        `✅ Provider registered: ${session.name} (${dbPhone}) — ${session.trade}`,
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
