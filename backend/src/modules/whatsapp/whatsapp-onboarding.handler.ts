import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { AiService } from '../ai/ai.service';

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
  ) {}

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
      await this.whatsapp.sendTextMessage(
        senderPhone,
        `👋 ¡Hola ${existing.name || ''}! Ya tienes tu cuenta activa.\n\n` +
          `Puedes escribirme lo que necesites. Por ejemplo:\n` +
          `• "Cobré 800 de una fuga"\n` +
          `• "Mañana tengo trabajo a las 10"\n` +
          `• "¿Cuánto llevo esta semana?"`,
      );
      return;
    }

    if (!session) {
      return this.startOnboarding(senderPhone, senderName);
    }

    switch (session.step) {
      case OnboardingStep.NAME:
        return this.handleNameResponse(senderPhone, text, session);
      case OnboardingStep.TRADE:
        return this.handleTradeResponse(senderPhone, text, session);
      case OnboardingStep.DONE:
        await this.whatsapp.sendTextMessage(
          senderPhone,
          `Ya estás registrado. Escríbeme lo que necesites.`,
        );
        return;
      default:
        return this.startOnboarding(senderPhone, senderName);
    }
  }

  private async startOnboarding(
    phone: string,
    name: string,
  ): Promise<void> {
    await this.setSession(phone, { step: OnboardingStep.NAME });

    await this.whatsapp.sendTextMessage(
      phone,
      `👋 ¡Hola${name ? ` ${name}` : ''}! Soy tu asistente de negocios.\n\n` +
        `Te ayudo a llevar el control de tus ingresos, tu agenda y tu negocio — todo por aquí, por WhatsApp.\n\n` +
        `Para empezar, *¿cómo te llamas?*`,
    );
  }

  private async handleNameResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      await this.whatsapp.sendTextMessage(
        phone,
        `Dime tu nombre para que sepa cómo llamarte.`,
      );
      return;
    }

    // Use LLM to extract the actual name from natural language
    const extracted = await this.aiService.extractFromText(
      trimmed,
      `El usuario está respondiendo a la pregunta "¿Cómo te llamas?".
Extrae SOLO el nombre de la persona de lo que dijo. Ignora frases como "me llamo", "mi nombre es", "soy", etc.
Responde con JSON: {"name": "Nombre Extraído"}
Si no puedes identificar un nombre, responde: {"name": null}`,
    );

    const name = extracted?.name || trimmed;

    session.name = typeof name === 'string'
      ? name.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : trimmed;

    session.step = OnboardingStep.TRADE;
    await this.setSession(phone, session);

    await this.whatsapp.sendTextMessage(
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
      await this.whatsapp.sendTextMessage(
        phone,
        `Dime a qué te dedicas. Puede ser cualquier oficio.`,
      );
      return;
    }

    // Use LLM to extract the trade/occupation
    const extracted = await this.aiService.extractFromText(
      trimmed,
      `El usuario está respondiendo a la pregunta "¿A qué te dedicas?".
Extrae el oficio o profesión. Ignora frases como "soy", "me dedico a", "trabajo de", etc.
Responde con JSON: {"trade": "oficio extraído"}
Si no puedes identificar un oficio, usa el texto tal cual: {"trade": "${trimmed}"}`,
    );

    const trade = extracted?.trade || trimmed;
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
              bio: session.trade,
              serviceTypes: [trade.toLowerCase()],
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
          bio: session.trade,
          categories: [trade.toLowerCase()],
          onboardingStep: 'DONE',
          verificationStatus: 'APPROVED',
        },
        create: {
          phone: dbPhone,
          name: session.name,
          bio: trade,
          categories: [trade.toLowerCase()],
          serviceZones: [],
          onboardingStep: 'DONE',
          verificationStatus: 'APPROVED',
        },
      });

      await this.clearSession(phone);

      await this.whatsapp.sendTextMessage(
        phone,
        `¡Listo, *${session.name}*! Ya tienes tu asistente. 🎉\n\n` +
          `Esto es lo que puedo hacer por ti:\n\n` +
          `💰 *Registrar ingresos* — "Cobré 1,200 por un tinaco"\n` +
          `💸 *Registrar gastos* — "Gasté 200 en material"\n` +
          `📅 *Agendar citas* — "Mañana tengo trabajo a las 10"\n` +
          `📊 *Ver tu resumen* — "¿Cuánto llevo esta semana?"\n` +
          `📋 *Ver tu agenda* — "¿Qué tengo hoy?"\n` +
          `⚙️ *Configurar tu negocio* — "Cobro 800 por visita"\n\n` +
          `Háblame como le hablarías a un asistente. Por texto o nota de voz. 🎙️`,
      );

      this.logger.log(
        `✅ Provider registered: ${session.name} (${dbPhone}) — ${session.trade}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error creating provider: ${error.message}`,
        error.stack,
      );
      await this.whatsapp.sendTextMessage(
        phone,
        `Hubo un error. Intenta de nuevo enviando cualquier mensaje.`,
      );
      await this.clearSession(phone);
    }
  }

  private normalizePhoneForDb(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13 && cleaned.startsWith('521')) {
      cleaned = '52' + cleaned.slice(3);
    }
    return `+${cleaned}`;
  }
}
