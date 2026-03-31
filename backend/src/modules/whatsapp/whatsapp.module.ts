import { Module, Global, forwardRef } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';
import { WhatsAppOnboardingHandler } from './whatsapp-onboarding.handler';
import { WhatsAppBookingListener } from './whatsapp-booking.listener';
import { WhatsAppAdminListener } from './whatsapp-admin.listener';
import { WhatsAppNotificationQueueService } from './whatsapp-notification-queue.service';
import { WhatsAppWeeklySummaryService } from './whatsapp-weekly-summary.service';
import { BookingsModule } from '../_marketplace/bookings/bookings.module';
import { MessagesModule } from '../_marketplace/messages/messages.module';
import { RatingsModule } from '../_marketplace/ratings/ratings.module';

/**
 * WhatsApp integration module.
 * @Global() makes WhatsAppService available to AuthModule for OTP delivery
 * without creating circular dependencies.
 */
@Global()
@Module({
  imports: [
    BookingsModule, // To access BookingsGateway
    forwardRef(() => MessagesModule), // To save bridged messages
    RatingsModule, // For WA rating flow
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppOnboardingHandler,
    WhatsAppProviderHandler,
    WhatsAppBookingListener,
    WhatsAppAdminListener,
    WhatsAppNotificationQueueService,
    WhatsAppWeeklySummaryService,
  ],
  exports: [WhatsAppService, WhatsAppProviderHandler],
})
export class WhatsAppModule {}
