import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { ZonesService } from '../zones/zones.service';
import { GeocodingService } from '../zones/geocoding.service';
import { OnboardingService } from '../onboarding/onboarding.service';

// ─── Onboarding steps ─────────────────────────────────────

export enum OnboardingStep {
  WELCOME = 'WELCOME',
  NAME = 'NAME',
  SERVICES = 'SERVICES',
  EXPERIENCE = 'EXPERIENCE',
  CITY = 'CITY',
  ZONES = 'ZONES',
  BIO = 'BIO',
  ACQUISITION_SOURCE = 'ACQUISITION_SOURCE',
  REVIEW = 'REVIEW',
}

interface OnboardingSession {
  step: OnboardingStep;
  applicationId?: string;
  name?: string;
  categories?: string[];
  yearsExperience?: number;
  city?: string;
  state?: string;
  serviceZones?: string[];
  serviceZoneIds?: string[];
  bio?: string;
  acquisitionSource?: string;
}

// Service category catalog (mirrors seed data)
const SERVICE_CATEGORIES = [
  { num: 1, slug: 'plumbing', icon: '🔧', name: 'Plomería' },
  { num: 2, slug: 'electrical', icon: '⚡', name: 'Electricidad' },
  { num: 3, slug: 'cleaning', icon: '🧹', name: 'Limpieza' },
  { num: 4, slug: 'gardening', icon: '🌿', name: 'Jardinería' },
  { num: 5, slug: 'painting', icon: '🎨', name: 'Pintura' },
  { num: 6, slug: 'locksmith', icon: '🔑', name: 'Cerrajería' },
  { num: 7, slug: 'repair', icon: '🔨', name: 'Reparaciones' },
  { num: 8, slug: 'moving', icon: '📦', name: 'Mudanzas' },
];

const SESSION_PREFIX = 'wa_onboarding:';
const SESSION_TTL = 86400; // 24 hours
const TOTAL_STEPS = 7;

@Injectable()
export class WhatsAppOnboardingHandler {
  private readonly logger = new Logger(WhatsAppOnboardingHandler.name);

  constructor(
    private whatsapp: WhatsAppService,
    private prisma: PrismaService,
    private redis: RedisService,
    private zonesService: ZonesService,
    private geocoding: GeocodingService,
    private onboardingService: OnboardingService,
  ) {}

  // ─── Session management ──────────────────────────────────

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

  // ─── Public: handle message from non-provider ─────────────

  async handleMessage(
    senderPhone: string,
    senderName: string,
    text: string,
  ): Promise<void> {
    let session = await this.getSession(senderPhone);

    const existing = await this.prisma.providerApplication.findUnique({
      where: { phone: this.normalizePhoneForDb(senderPhone) },
    });

    if (existing) {
      if (existing.verificationStatus === 'APPROVED') {
        await this.whatsapp.sendTextMessage(
          senderPhone,
          `✅ ¡Tu cuenta está *activa*! Ya puedes recibir solicitudes de servicio a través de la app.\n\n📱 Descarga la app o ingresa en: ${process.env.FRONTEND_URL || 'https://handy-nine.vercel.app'}\n\nSi tienes problemas, escribe *"ayuda"*.`,
        );
        return;
      }
      if (existing.verificationStatus === 'DOCS_SUBMITTED') {
        await this.whatsapp.sendTextMessage(
          senderPhone,
          `📄 Ya recibimos tus documentos. Tu solicitud está *en revisión*.\n\nTe notificaremos cuando sea aprobada (24-48 horas).\n\n¡Gracias por tu paciencia!`,
        );
        return;
      }
      if (
        existing.verificationStatus === 'PENDING' &&
        existing.onboardingStep === 'REVIEW'
      ) {
        // Pending verification — resend link
        try {
          const verificationToken =
            await this.onboardingService.generateVerificationToken(existing.id);
          const verificationUrl =
            this.onboardingService.getVerificationUrl(verificationToken);
          await this.whatsapp.sendTextMessage(
            senderPhone,
            `⏳ Tu registro está casi completo. Solo falta la *verificación de identidad*.\n\n` +
              `👉 Haz clic aquí para verificarte:\n${verificationUrl}\n\n` +
              `⏰ El enlace expira en 1 hora.`,
          );
        } catch {
          await this.whatsapp.sendTextMessage(
            senderPhone,
            `⏳ Tu solicitud está pendiente de verificación.\n\nTe notificaremos cuando sea aprobada (24-48 horas).`,
          );
        }
        return;
      }
      if (existing.verificationStatus === 'REJECTED') {
        await this.prisma.providerApplication.delete({
          where: { id: existing.id },
        });
        await this.clearSession(senderPhone);
        session = null;
      }
    }

    // Global commands
    if (text === 'cancelar' || text === 'cancel') {
      await this.clearSession(senderPhone);
      const partial = await this.prisma.providerApplication.findUnique({
        where: { phone: this.normalizePhoneForDb(senderPhone) },
      });
      if (partial && partial.onboardingStep !== 'REVIEW') {
        await this.prisma.providerApplication.delete({
          where: { id: partial.id },
        });
      }
      await this.whatsapp.sendTextMessage(
        senderPhone,
        `❌ Registro cancelado.\n\nSi cambias de opinión, envía cualquier mensaje para comenzar de nuevo.`,
      );
      return;
    }

    if (!session) {
      return this.handleWelcome(senderPhone, senderName, text);
    }

    switch (session.step) {
      case OnboardingStep.WELCOME:
        return this.handleWelcomeResponse(senderPhone, text, session);
      case OnboardingStep.NAME:
        return this.handleNameResponse(senderPhone, text, session);
      case OnboardingStep.SERVICES:
        return this.handleServicesResponse(senderPhone, text, session);
      case OnboardingStep.EXPERIENCE:
        return this.handleExperienceResponse(senderPhone, text, session);
      case OnboardingStep.CITY:
        return this.handleCityResponse(senderPhone, text, session);
      case OnboardingStep.ZONES:
        return this.handleZonesResponse(senderPhone, text, session);
      case OnboardingStep.BIO:
        return this.handleBioResponse(senderPhone, text, session);
      case OnboardingStep.ACQUISITION_SOURCE:
        return this.handleAcquisitionSourceResponse(senderPhone, text, session);
      case OnboardingStep.REVIEW:
        await this.whatsapp.sendTextMessage(
          senderPhone,
          `⏳ Tu solicitud ya está *en revisión*.\n\nTe notificaremos cuando sea aprobada (24-48 horas).`,
        );
        return;
      default:
        return this.handleWelcome(senderPhone, senderName, text);
    }
  }

  // ─── Step: WELCOME ────────────────────────────────────────

  private async handleWelcome(
    phone: string,
    name: string,
    _text: string,
  ): Promise<void> {
    await this.setSession(phone, { step: OnboardingStep.WELCOME });

    await this.whatsapp.sendTextMessage(
      phone,
      `👋 ¡Hola${name ? ` ${name}` : ''}! Bienvenido a *Handy*.\n\n` +
        `Somos una plataforma que conecta clientes con proveedores de servicios del hogar en *todo México* 🇲🇽.\n\n` +
        `🛠 ¿Te gustaría ofrecer tus servicios en Handy?\n\n` +
        `✅ Escribe *"si"* para comenzar tu registro\n` +
        `❌ Escribe *"no"* si solo estás explorando`,
    );
  }

  private async handleWelcomeResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    if (['si', 'sí', 'yes', 'quiero', 'dale'].includes(text)) {
      session.step = OnboardingStep.NAME;
      await this.setSession(phone, session);

      await this.whatsapp.sendTextMessage(
        phone,
        `¡Genial! 🎉 Vamos a registrarte. Son solo unas preguntas rápidas.\n\n` +
          `📝 *Paso 1 de ${TOTAL_STEPS}*\n\n` +
          `¿Cuál es tu *nombre completo*?\n` +
          `_(Ejemplo: Juan Pérez López)_`,
      );
      return;
    }

    if (text === 'no') {
      await this.clearSession(phone);
      await this.whatsapp.sendTextMessage(
        phone,
        `👌 ¡Sin problema! Si cambias de opinión, envía cualquier mensaje a este número.\n\n` +
          `Si eres *cliente*, descarga nuestra app para solicitar servicios. 📱`,
      );
      return;
    }

    await this.whatsapp.sendTextMessage(
      phone,
      `🤔 No entendí tu respuesta.\n\n` +
        `✅ Escribe *"si"* para registrarte como proveedor\n` +
        `❌ Escribe *"no"* si no estás interesado`,
    );
  }

  // ─── Step: NAME ───────────────────────────────────────────

  private async handleNameResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      await this.whatsapp.sendTextMessage(
        phone,
        `❌ El nombre parece muy corto. Escribe tu *nombre completo*.\n_(Ejemplo: Juan Pérez López)_`,
      );
      return;
    }

    session.name = trimmed
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    session.step = OnboardingStep.SERVICES;
    await this.setSession(phone, session);

    const categoryList = SERVICE_CATEGORIES.map(
      (c) => `${c.num}. ${c.icon} ${c.name}`,
    ).join('\n');

    await this.whatsapp.sendTextMessage(
      phone,
      `Perfecto, *${session.name}* 👋\n\n` +
        `📝 *Paso 2 de ${TOTAL_STEPS}*\n\n` +
        `¿Qué servicios ofreces? Elige uno o varios:\n\n` +
        `${categoryList}\n\n` +
        `Escribe los *números separados por coma*\n` +
        `_(Ejemplo: 1,3,5)_`,
    );
  }

  // ─── Step: SERVICES ───────────────────────────────────────

  private async handleServicesResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const numbers = text
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    const validNums = numbers.filter(
      (n) => n >= 1 && n <= SERVICE_CATEGORIES.length,
    );

    if (validNums.length === 0) {
      const categoryList = SERVICE_CATEGORIES.map(
        (c) => `${c.num}. ${c.icon} ${c.name}`,
      ).join('\n');

      await this.whatsapp.sendTextMessage(
        phone,
        `❌ No reconocí ningún servicio válido.\n\nEscribe los números de los servicios que ofreces:\n\n${categoryList}\n\n_(Ejemplo: 1,3,5)_`,
      );
      return;
    }

    const uniqueNums = [...new Set(validNums)];
    const selected = uniqueNums.map(
      (n) => SERVICE_CATEGORIES.find((c) => c.num === n)!,
    );
    session.categories = selected.map((c) => c.slug);

    session.step = OnboardingStep.EXPERIENCE;
    await this.setSession(phone, session);

    const selectedNames = selected
      .map((c) => `${c.icon} ${c.name}`)
      .join(', ');

    await this.whatsapp.sendTextMessage(
      phone,
      `✅ Servicios seleccionados: ${selectedNames}\n\n` +
        `📝 *Paso 3 de ${TOTAL_STEPS}*\n\n` +
        `¿Cuántos *años de experiencia* tienes en estos servicios?\n` +
        `_(Escribe solo el número, ejemplo: 5)_`,
    );
  }

  // ─── Step: EXPERIENCE ─────────────────────────────────────

  private async handleExperienceResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const years = parseInt(text.trim(), 10);
    if (isNaN(years) || years < 0 || years > 60) {
      await this.whatsapp.sendTextMessage(
        phone,
        `❌ Escribe un número válido de años de experiencia (0-60).\n_(Ejemplo: 5)_`,
      );
      return;
    }

    session.yearsExperience = years;
    session.step = OnboardingStep.CITY;
    await this.setSession(phone, session);

    await this.whatsapp.sendTextMessage(
      phone,
      `✅ ${years} años de experiencia 💪\n\n` +
        `📝 *Paso 4 de ${TOTAL_STEPS}*\n\n` +
        `🏙 ¿En qué *ciudad* ofreces tus servicios?\n\n` +
        `Escribe el nombre de tu ciudad.\n` +
        `_(Ejemplo: Juárez, Monterrey, CDMX, Guadalajara, Mérida, Puebla, etc.)_`,
    );
  }

  // ─── Step: CITY — uses Nominatim API via GeocodingService ──

  private async handleCityResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const input = text.trim();
    if (input.length < 2) {
      await this.whatsapp.sendTextMessage(
        phone,
        `❌ Escribe el nombre de tu ciudad.\n_(Ejemplo: Juárez, Monterrey, CDMX, Guadalajara)_`,
      );
      return;
    }

    // Look up the city using Nominatim (with caching)
    const geocoded = await this.geocoding.lookupCity(input);

    if (geocoded) {
      session.city = geocoded.city;
      session.state = geocoded.state;
    } else {
      // API couldn't find it — accept as-is (capitalize)
      this.logger.warn(
        `Nominatim couldn't resolve "${input}" — accepting as-is`,
      );
      session.city = input
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      session.state = '';
    }

    session.step = OnboardingStep.ZONES;
    await this.setSession(phone, session);

    const stateLabel = session.state ? `, ${session.state}` : '';
    await this.whatsapp.sendTextMessage(
      phone,
      `✅ Ciudad: *${session.city}*${stateLabel}\n\n` +
        `📝 *Paso 5 de ${TOTAL_STEPS}*\n\n` +
        `¿En qué *zonas, colonias o fraccionamientos* de ${session.city} ofreces tus servicios?\n\n` +
        `Escríbelas separadas por coma.\n` +
        `_(Ejemplo: Centro, Zona Pronaf, Las Misiones)_`,
    );
  }

  // ─── Step: ZONES ──────────────────────────────────────────

  private async handleZonesResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    const zoneNames = text
      .split(',')
      .map((z) => z.trim())
      .filter((z) => z.length > 0);

    if (zoneNames.length === 0) {
      await this.whatsapp.sendTextMessage(
        phone,
        `❌ Escribe al menos una zona o colonia.\n_(Ejemplo: Centro, Zona Pronaf, Las Misiones)_`,
      );
      return;
    }

    const city = session.city || 'Ciudad de México';
    const state = session.state || '';
    try {
      const zoneIds = await this.zonesService.findZonesByNames(
        zoneNames,
        city,
        state,
      );
      session.serviceZoneIds = zoneIds;
      session.serviceZones = zoneNames.map(
        (z) => z.charAt(0).toUpperCase() + z.slice(1),
      );
    } catch (err) {
      this.logger.error(`Error finding/creating zones: ${err}`);
      session.serviceZones = zoneNames.map(
        (z) => z.charAt(0).toUpperCase() + z.slice(1),
      );
      session.serviceZoneIds = [];
    }

    session.step = OnboardingStep.BIO;
    await this.setSession(phone, session);

    await this.whatsapp.sendTextMessage(
      phone,
      `✅ Zonas en ${city}: ${(session.serviceZones || []).join(', ')}\n\n` +
        `📝 *Paso 6 de ${TOTAL_STEPS} (opcional)*\n\n` +
        `Escribe una *descripción corta* sobre ti y tu trabajo. Esto lo verán los clientes.\n\n` +
        `_(Ejemplo: "Plomero con 10 años de experiencia, especialista en fugas y drenaje. Puntual y garantía en mi trabajo.")_\n\n` +
        `Escribe *"skip"* para omitir este paso.`,
    );
  }

  // ─── Step: BIO ────────────────────────────────────────────

  private async handleBioResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    if (text !== 'skip' && text !== 'omitir') {
      session.bio = text.trim();
    }

    session.step = OnboardingStep.ACQUISITION_SOURCE;
    await this.setSession(phone, session);

    await this.whatsapp.sendTextMessage(
      phone,
      `✅ ${session.bio ? 'Bio guardada' : 'Bio omitida'}\n\n` +
        `📝 *Paso 7 de ${TOTAL_STEPS}*\n\n` +
        `📣 *¿Cómo nos conociste?*\n\n` +
        `1. Recomendación de un amigo/colega\n` +
        `2. Redes sociales (Facebook, Instagram, TikTok)\n` +
        `3. Búsqueda en Google\n` +
        `4. Publicidad\n` +
        `5. Otro\n\n` +
        `Escribe el *número* o tu respuesta.\n` +
        `Escribe *"skip"* para omitir.`,
    );
  }

  // ─── Step: ACQUISITION_SOURCE ──────────────────────────────

  private async handleAcquisitionSourceResponse(
    phone: string,
    text: string,
    session: OnboardingSession,
  ): Promise<void> {
    if (text !== 'skip' && text !== 'omitir') {
      const sourceMap: Record<string, string> = {
        '1': 'Recomendación',
        '2': 'Redes sociales',
        '3': 'Google',
        '4': 'Publicidad',
        '5': 'Otro',
      };
      session.acquisitionSource = sourceMap[text] || text.trim();
    }

    try {
      const dbPhone = this.normalizePhoneForDb(phone);

      const application = await this.prisma.providerApplication.upsert({
        where: { phone: dbPhone },
        update: {
          name: session.name,
          bio: session.bio || null,
          yearsExperience: session.yearsExperience || 0,
          categories: session.categories || [],
          serviceZones: session.serviceZones || [],
          acquisitionSource: session.acquisitionSource || null,
          onboardingStep: OnboardingStep.REVIEW,
          verificationStatus: 'PENDING',
        },
        create: {
          phone: dbPhone,
          name: session.name,
          bio: session.bio || null,
          yearsExperience: session.yearsExperience || 0,
          categories: session.categories || [],
          serviceZones: session.serviceZones || [],
          acquisitionSource: session.acquisitionSource || null,
          onboardingStep: OnboardingStep.REVIEW,
          verificationStatus: 'PENDING',
        },
      });

      session.applicationId = application.id;

      const verificationToken =
        await this.onboardingService.generateVerificationToken(application.id);
      const verificationUrl =
        this.onboardingService.getVerificationUrl(verificationToken);

      await this.clearSession(phone);

      const categorySlugs = session.categories || [];
      const categoryNames = categorySlugs
        .map((slug) => {
          const cat = SERVICE_CATEGORIES.find((c) => c.slug === slug);
          return cat ? `${cat.icon} ${cat.name}` : slug;
        })
        .join(', ');

      await this.whatsapp.sendTextMessage(
        phone,
        `📋 *Resumen de tu solicitud:*\n\n` +
          `👤 Nombre: ${session.name}\n` +
          `🔧 Servicios: ${categoryNames}\n` +
          `📅 Experiencia: ${session.yearsExperience || 0} años\n` +
          `🏙 Ciudad: ${session.city || 'No especificada'}${session.state ? `, ${session.state}` : ''}\n` +
          `📍 Zonas: ${(session.serviceZones || []).join(', ')}\n` +
          `📝 Bio: ${session.bio || '(sin descripción)'}\n\n` +
          `─────────────────────\n\n` +
          `🔐 *Último paso: Verificación de identidad*\n\n` +
          `Para completar tu registro, necesitamos verificar tu identidad con tu INE y una selfie.\n\n` +
          `👉 Haz clic en este enlace para continuar:\n${verificationUrl}\n\n` +
          `⏰ El enlace expira en 1 hora.\n\n` +
          `Una vez que subas tus documentos, revisaremos tu solicitud y te notificaremos cuando sea aprobada (24-48 horas).\n\n` +
          `¡Gracias por unirte a Handy! 🙌`,
      );

      this.logger.log(
        `✅ Onboarding completed for ${session.name} (${dbPhone}) — verification link sent`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error creating provider: ${error.message}`,
        error.stack,
      );
      await this.whatsapp.sendTextMessage(
        phone,
        `❌ Ocurrió un error guardando tu registro. Intenta de nuevo enviando cualquier mensaje.`,
      );
      await this.clearSession(phone);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private normalizePhoneForDb(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13 && cleaned.startsWith('521')) {
      cleaned = '52' + cleaned.slice(3);
    }
    return `+${cleaned}`;
  }
}
