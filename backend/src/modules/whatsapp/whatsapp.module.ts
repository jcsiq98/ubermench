import { Module, Global } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';
import { WhatsAppOnboardingHandler } from './whatsapp-onboarding.handler';
import { WhatsAppAdminListener } from './whatsapp-admin.listener';
import { WhatsAppNotificationQueueService } from './whatsapp-notification-queue.service';
import { WhatsAppWeeklySummaryService } from './whatsapp-weekly-summary.service';
import { WelcomeExamplesService } from './welcome-examples.service';
import { AttributionQueue } from './attribution-queue';

/**
 * WhatsApp integration module.
 * @Global() makes WhatsAppService available to AuthModule for OTP delivery
 * without creating circular dependencies.
 */
@Global()
@Module({
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppOnboardingHandler,
    WhatsAppProviderHandler,
    WhatsAppAdminListener,
    WhatsAppNotificationQueueService,
    WhatsAppWeeklySummaryService,
    WelcomeExamplesService,
    AttributionQueue,
  ],
  exports: [WhatsAppService, WhatsAppProviderHandler, AttributionQueue],
})
export class WhatsAppModule {}
