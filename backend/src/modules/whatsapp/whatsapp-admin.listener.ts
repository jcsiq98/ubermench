import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from './whatsapp.service';

const TIER_NAMES: Record<number, string> = {
  1: 'Basic',
  2: 'Verified ✅',
  3: 'Pro ⭐',
  4: 'Elite 🏆',
};

const TIER_BENEFITS: Record<number, string> = {
  1: 'Trabajos pequeños, apareces en cola',
  2: 'Trabajos medianos, visible en búsqueda, ratings activos',
  3: 'Badge Pro, dispatch prioritario, acceso a financiamiento',
  4: 'Cuentas corporativas, contratos recurrentes, límites de crédito altos',
};

@Injectable()
export class WhatsAppAdminListener {
  private readonly logger = new Logger(WhatsAppAdminListener.name);

  constructor(private whatsapp: WhatsAppService) {}

  @OnEvent('application.approved')
  async handleApplicationApproved(payload: {
    phone: string;
    name: string | null;
    tier: number;
  }) {
    try {
      const tierName = TIER_NAMES[payload.tier] || `Tier ${payload.tier}`;
      const benefits = TIER_BENEFITS[payload.tier] || '';

      await this.whatsapp.sendTextMessage(
        payload.phone,
        `🎉 *¡Felicidades ${payload.name || ''}!*\n\n` +
          `Tu solicitud como proveedor en *Handy* ha sido *aprobada*. ✅\n\n` +
          `📊 Tu nivel: *${tierName}*\n` +
          `${benefits ? `💼 Beneficios: ${benefits}\n` : ''}\n` +
          `Ya puedes recibir solicitudes de clientes por aquí.\n\n` +
          `📋 Escribe *"menu"* para ver tus opciones\n` +
          `❓ Escribe *"ayuda"* para ver los comandos disponibles\n\n` +
          `¡Bienvenido al equipo! 💪`,
      );
      this.logger.log(`Notified ${payload.phone} of approval (tier ${payload.tier})`);
    } catch (error: any) {
      this.logger.error(`Failed to notify approval: ${error.message}`);
    }
  }

  @OnEvent('application.rejected')
  async handleApplicationRejected(payload: {
    phone: string;
    name: string | null;
    reason: string;
  }) {
    try {
      await this.whatsapp.sendTextMessage(
        payload.phone,
        `😔 *Hola ${payload.name || ''}*\n\n` +
          `Lamentamos informarte que tu solicitud como proveedor en *Handy* no fue aprobada en esta ocasión.\n\n` +
          `📋 *Motivo:* ${payload.reason}\n\n` +
          `Puedes volver a enviar tu solicitud corrigiendo los puntos mencionados. ` +
          `Envía cualquier mensaje a este número para comenzar de nuevo.\n\n` +
          `Si tienes dudas, escribe *"ayuda"*.`,
      );
      this.logger.log(`Notified ${payload.phone} of rejection`);
    } catch (error: any) {
      this.logger.error(`Failed to notify rejection: ${error.message}`);
    }
  }

  @OnEvent('provider.tier.upgraded')
  async handleTierUpgraded(payload: {
    phone: string;
    name: string | null;
    oldTier: number;
    newTier: number;
  }) {
    try {
      const newTierName = TIER_NAMES[payload.newTier] || `Tier ${payload.newTier}`;
      const benefits = TIER_BENEFITS[payload.newTier] || '';

      await this.whatsapp.sendTextMessage(
        payload.phone,
        `🎊 *¡Felicidades ${payload.name || ''}!*\n\n` +
          `¡Has subido de nivel en Handy! 🚀\n\n` +
          `📊 Tier ${payload.oldTier} → *${newTierName}*\n\n` +
          `${benefits ? `🔓 *Nuevos beneficios:*\n${benefits}\n\n` : ''}` +
          `¡Sigue así! 💪`,
      );
      this.logger.log(
        `Notified ${payload.phone} of tier upgrade ${payload.oldTier} → ${payload.newTier}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to notify tier upgrade: ${error.message}`);
    }
  }

  @OnEvent('provider.suspended')
  async handleProviderSuspended(payload: {
    providerId: string;
    phone: string;
    name: string | null;
    reason: string;
  }) {
    try {
      await this.whatsapp.sendTextMessage(
        payload.phone,
        `⚠️ *Cuenta suspendida*\n\n` +
          `Hola ${payload.name || ''}, tu cuenta de proveedor en *Handy* ha sido temporalmente suspendida.\n\n` +
          `📋 *Motivo:* ${payload.reason}\n\n` +
          `Para resolver esta situación, por favor contacta a nuestro equipo de soporte.\n\n` +
          `Escribe *"ayuda"* para más información.`,
      );
      this.logger.log(`Notified ${payload.phone} of suspension`);
    } catch (error: any) {
      this.logger.error(`Failed to notify suspension: ${error.message}`);
    }
  }

  @OnEvent('sos.triggered')
  async handleSosTriggered(payload: {
    alertId: string;
    bookingId: string;
    triggeredBy: string;
    triggerUserName: string | null;
    triggerUserPhone: string | null;
    lat: number | null;
    lng: number | null;
    emergencyContacts: { name: string; phone: string }[];
    booking: {
      address: string | null;
      description: string;
      customerName: string | null;
      providerName: string | null;
    };
  }) {
    try {
      const locationLink = payload.lat && payload.lng
        ? `\n📍 Ubicación: https://maps.google.com/?q=${payload.lat},${payload.lng}`
        : '';

      for (const contact of payload.emergencyContacts) {
        await this.whatsapp.sendTextMessage(
          contact.phone,
          `🚨 *ALERTA DE EMERGENCIA*\n\n` +
            `${payload.triggerUserName || 'Un usuario'} ha activado una alerta de emergencia en *Handy*.\n\n` +
            `📋 Servicio: ${payload.booking.description}\n` +
            `📍 Dirección: ${payload.booking.address || 'No disponible'}` +
            `${locationLink}\n\n` +
            `Por favor contacta a ${payload.triggerUserName || 'esta persona'} inmediatamente.`,
        );
      }

      this.logger.log(
        `SOS alert sent to ${payload.emergencyContacts.length} emergency contacts for booking ${payload.bookingId}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to send SOS notifications: ${error.message}`);
    }
  }

  @OnEvent('report.safety')
  async handleSafetyReport(payload: {
    reportId: string;
    reportedId: string;
    reportedName: string | null;
    reportedPhone: string | null;
    category: string;
  }) {
    try {
      if (payload.reportedPhone) {
        await this.whatsapp.sendTextMessage(
          payload.reportedPhone,
          `⚠️ *Reporte de seguridad recibido*\n\n` +
            `Se ha recibido un reporte de seguridad sobre tu cuenta.\n\n` +
            `Nuestro equipo revisará el caso de manera prioritaria. ` +
            `Tu cuenta puede ser temporalmente restringida mientras se investiga.\n\n` +
            `Si tienes preguntas, escribe *"ayuda"*.`,
        );
      }
      this.logger.log(
        `Safety report notification sent for report ${payload.reportId}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to notify safety report: ${error.message}`);
    }
  }
}
