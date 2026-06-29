import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from './whatsapp.service';
import { AiContextService } from '../ai/ai-context.service';

/**
 * Notifies providers via WhatsApp when an admin resolves their application.
 * Marketplace-era handlers (tiers, SOS, safety reports, suspension) were
 * retired with Handy — their emitters no longer exist (Cap. 54, Cap. 59).
 */
@Injectable()
export class WhatsAppAdminListener {
  private readonly logger = new Logger(WhatsAppAdminListener.name);

  constructor(
    private whatsapp: WhatsAppService,
    private aiContextService: AiContextService,
  ) {}

  // Admin resolution timing is decoupled from the applicant's last inbound,
  // so these can fall outside WhatsApp's 24h window where Meta only allows
  // approved templates. Suppress + log rather than violate (fail-safe).
  // NOTE: the approval message is onboarding-critical — it should become an
  // approved template ASAP so a slow approval still reaches the user.
  private async suppressedOutOfWindow(
    phone: string,
    kind: string,
  ): Promise<boolean> {
    if (await this.aiContextService.isWithinServiceWindow(phone)) return false;
    this.logger.warn(
      JSON.stringify({
        event: 'proactive_send_suppressed_out_of_window',
        kind,
        providerPhone: phone,
      }),
    );
    return true;
  }

  @OnEvent('application.approved')
  async handleApplicationApproved(payload: {
    phone: string;
    name: string | null;
    tier: number;
  }) {
    try {
      if (
        await this.suppressedOutOfWindow(payload.phone, 'application_approved')
      ) {
        return;
      }
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
      if (
        await this.suppressedOutOfWindow(payload.phone, 'application_rejected')
      ) {
        return;
      }
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
