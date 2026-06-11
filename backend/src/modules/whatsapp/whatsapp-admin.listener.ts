import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from './whatsapp.service';

/**
 * Notifies providers via WhatsApp when an admin resolves their application.
 * Marketplace-era handlers (tiers, SOS, safety reports, suspension) were
 * retired with Handy — their emitters no longer exist (Cap. 54, Cap. 59).
 */
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
      const name = payload.name ? ` ${payload.name}` : '';
      await this.whatsapp.sendTextMessage(
        payload.phone,
        `Listo${name}, tu cuenta quedó activa.\n\n` +
          `Soy tu Chalán. Mándame lo que vayas teniendo — un cobro, un gasto, una cita — y yo lo llevo.`,
      );
      this.logger.log(`Notified ${payload.phone} of approval`);
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
      const name = payload.name ? ` ${payload.name}` : '';
      await this.whatsapp.sendTextMessage(
        payload.phone,
        `Hola${name}. Tu solicitud no pasó esta vez.\n\n` +
          `Motivo: ${payload.reason}\n\n` +
          `Puedes volver a intentar — mándame cualquier mensaje y empezamos de nuevo.`,
      );
      this.logger.log(`Notified ${payload.phone} of rejection`);
    } catch (error: any) {
      this.logger.error(`Failed to notify rejection: ${error.message}`);
    }
  }
}
