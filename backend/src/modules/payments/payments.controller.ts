import {
  Controller,
  Post,
  RawBody,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiExcludeController()
@Controller('api/stripe')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private paymentsService: PaymentsService) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      this.logger.warn('Stripe webhook received without signature');
      return { received: false };
    }

    let event;
    try {
      event = this.paymentsService.constructWebhookEvent(rawBody, signature);
    } catch (err: any) {
      this.logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      return { received: false };
    }

    if (!event) {
      this.logger.warn('Stripe webhook event could not be constructed (Stripe not configured)');
      return { received: false };
    }

    this.logger.log(`Stripe event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.paymentsService
          .handleCheckoutCompleted(event.data.object as any)
          .catch((err) =>
            this.logger.error(`Error handling checkout.session.completed: ${err.message}`),
          );
        break;

      case 'checkout.session.expired':
        await this.paymentsService
          .handleCheckoutExpired(event.data.object as any)
          .catch((err) =>
            this.logger.error(`Error handling checkout.session.expired: ${err.message}`),
          );
        break;

      case 'account.updated':
        await this.paymentsService
          .handleAccountUpdated(event.data.object as any)
          .catch((err) =>
            this.logger.error(`Error handling account.updated: ${err.message}`),
          );
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }
}
