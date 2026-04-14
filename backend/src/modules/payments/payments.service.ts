import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { IncomeService } from '../income/income.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  PaymentMethod,
  PaymentLinkStatus,
  StripeOnboardingStatus,
  Prisma,
} from '@prisma/client';

export interface CreatePaymentLinkDto {
  providerId: string;
  amount: number;
  description?: string;
  clientName?: string;
  clientPhone?: string;
}

interface CheckoutSessionData {
  id: string;
  metadata?: Record<string, string>;
}

interface StripeAccountData {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements?: {
    currently_due?: string[];
  };
}

const CHECKOUT_EXPIRY_HOURS = 72;

// 0% during testing — change to 0.02 (2%) when ready to monetize
const APPLICATION_FEE_RATE = 0;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: InstanceType<typeof Stripe> | null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private incomeService: IncomeService,
    private whatsappService: WhatsAppService,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (secretKey && !secretKey.includes('REPLACE_ME')) {
      this.stripe = new Stripe(secretKey);
      this.logger.log('Stripe initialized');
    } else {
      this.stripe = null;
      this.logger.warn(
        'Stripe DISABLED — set STRIPE_SECRET_KEY in .env',
      );
    }
  }

  // ─── Stripe Connect: onboarding ────────────────────────────

  async createConnectedAccount(providerId: string) {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: true },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    if (
      provider.stripeAccountId &&
      provider.stripeOnboardingStatus === StripeOnboardingStatus.ACTIVE
    ) {
      throw new Error('Provider already has an active Stripe account');
    }

    let stripeAccountId = provider.stripeAccountId;

    if (!stripeAccountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'MX',
        ...(provider.user.email && { email: provider.user.email }),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          providerProfileId: providerId,
        },
      });

      stripeAccountId = account.id;

      await this.prisma.providerProfile.update({
        where: { id: providerId },
        data: {
          stripeAccountId: account.id,
          stripeOnboardingStatus: StripeOnboardingStatus.PENDING,
        },
      });

      this.logger.log(
        `Stripe Connect account created: ${account.id} for provider ${providerId}`,
      );
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    const accountLink = await this.stripe.accountLinks.create({
      account: stripeAccountId,
      type: 'account_onboarding',
      return_url: `${frontendUrl}/payment/onboarding/complete`,
      refresh_url: `${frontendUrl}/payment/onboarding/refresh`,
    });

    return { url: accountLink.url, stripeAccountId };
  }

  async handleAccountUpdated(account: StripeAccountData) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { stripeAccountId: account.id },
      include: { user: true },
    });

    if (!provider) {
      this.logger.debug(
        `account.updated for unknown account ${account.id} — ignoring`,
      );
      return;
    }

    let newStatus: StripeOnboardingStatus;

    if (account.charges_enabled && account.payouts_enabled) {
      newStatus = StripeOnboardingStatus.ACTIVE;
    } else if (
      account.requirements?.currently_due &&
      account.requirements.currently_due.length > 0
    ) {
      newStatus = StripeOnboardingStatus.RESTRICTED;
    } else {
      newStatus = StripeOnboardingStatus.PENDING;
    }

    const previousStatus = provider.stripeOnboardingStatus;

    if (newStatus !== previousStatus) {
      await this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: { stripeOnboardingStatus: newStatus },
      });

      this.logger.log(
        `Stripe onboarding ${provider.id}: ${previousStatus} → ${newStatus}`,
      );

      if (
        newStatus === StripeOnboardingStatus.ACTIVE &&
        previousStatus !== StripeOnboardingStatus.ACTIVE &&
        provider.user?.phone
      ) {
        await this.whatsappService
          .sendTextMessage(
            provider.user.phone,
            '✅ *¡Tu cuenta de cobros está activa!*\n\nYa puedes generar links de cobro para tus clientes.\n\nPrueba diciendo: *"Cóbrale 500 al señor García por revisión eléctrica"*',
          )
          .catch((err) =>
            this.logger.error(
              `Failed to notify provider ${provider.user.phone} about Stripe activation: ${err.message}`,
            ),
          );
      }
    }
  }

  // ─── Payment Links ─────────────────────────────────────────

  async createPaymentLink(dto: CreatePaymentLinkDto) {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: dto.providerId },
    });

    if (
      !provider?.stripeAccountId ||
      provider.stripeOnboardingStatus !== StripeOnboardingStatus.ACTIVE
    ) {
      throw new Error('Provider has no active Stripe account');
    }

    const expiresAt = new Date(
      Date.now() + CHECKOUT_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    const paymentLink = await this.prisma.paymentLink.create({
      data: {
        providerId: dto.providerId,
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        expiresAt,
      },
    });

    const amountInCentavos = Math.round(dto.amount * 100);
    const feeAmount =
      APPLICATION_FEE_RATE > 0
        ? Math.round(dto.amount * APPLICATION_FEE_RATE * 100)
        : undefined;

    const sessionParams: Record<string, any> = {
      mode: 'payment',
      locale: 'es',
      currency: 'mxn',
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            unit_amount: amountInCentavos,
            product_data: {
              name: dto.description || 'Servicio profesional',
              ...(dto.clientName && {
                description: `Cobro para ${dto.clientName}`,
              }),
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentLinkId: paymentLink.id,
      },
      success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    };

    if (feeAmount) {
      sessionParams.payment_intent_data = {
        application_fee_amount: feeAmount,
      };
    }

    const session = await this.stripe.checkout.sessions.create(
      sessionParams,
      { stripeAccount: provider.stripeAccountId },
    );

    const updated = await this.prisma.paymentLink.update({
      where: { id: paymentLink.id },
      data: {
        stripeSessionId: session.id,
        stripePaymentUrl: session.url,
      },
    });

    this.logger.log(
      `Payment link created: $${dto.amount} for provider ${dto.providerId} (acct: ${provider.stripeAccountId}) → ${session.url}`,
    );

    return updated;
  }

  // ─── Webhook handlers ──────────────────────────────────────

  async handleCheckoutCompleted(session: CheckoutSessionData) {
    const paymentLinkId = session.metadata?.paymentLinkId;
    if (!paymentLinkId) {
      this.logger.warn(
        `Checkout completed but no paymentLinkId in metadata: ${session.id}`,
      );
      return;
    }

    const paymentLink = await this.prisma.paymentLink.findUnique({
      where: { id: paymentLinkId },
      include: {
        provider: { include: { user: true } },
      },
    });

    if (!paymentLink) {
      this.logger.warn(`PaymentLink not found: ${paymentLinkId}`);
      return;
    }

    if (paymentLink.status === PaymentLinkStatus.PAID) {
      this.logger.debug(`PaymentLink already paid: ${paymentLinkId}`);
      return;
    }

    const income = await this.incomeService.create({
      providerId: paymentLink.providerId,
      amount: Number(paymentLink.amount),
      description: paymentLink.description || undefined,
      paymentMethod: PaymentMethod.PAYMENT_LINK,
      clientName: paymentLink.clientName || undefined,
    });

    await this.prisma.paymentLink.update({
      where: { id: paymentLinkId },
      data: {
        status: PaymentLinkStatus.PAID,
        paidAt: new Date(),
        incomeId: income.id,
      },
    });

    this.logger.log(
      `Payment confirmed: $${paymentLink.amount} from ${paymentLink.clientName || 'cliente'} → Income ${income.id}`,
    );

    const providerPhone = paymentLink.provider?.user?.phone;
    if (providerPhone) {
      const amountFormatted = Number(paymentLink.amount).toLocaleString(
        'es-MX',
      );
      const clientLabel = paymentLink.clientName || 'Tu cliente';
      const descLabel = paymentLink.description
        ? ` por ${paymentLink.description}`
        : '';
      await this.whatsappService
        .sendTextMessage(
          providerPhone,
          `💰 *¡Pago recibido!*\n\n${clientLabel} pagó *$${amountFormatted}*${descLabel}.\n\nYa quedó registrado en tus ingresos.`,
        )
        .catch((err) =>
          this.logger.error(
            `Failed to notify provider ${providerPhone}: ${err.message}`,
          ),
        );
    }
  }

  async handleCheckoutExpired(session: CheckoutSessionData) {
    const paymentLinkId = session.metadata?.paymentLinkId;
    if (!paymentLinkId) return;

    await this.prisma.paymentLink
      .update({
        where: { id: paymentLinkId },
        data: { status: PaymentLinkStatus.EXPIRED },
      })
      .catch(() => {});

    this.logger.log(`Payment link expired: ${paymentLinkId}`);
  }

  // ─── Queries ───────────────────────────────────────────────

  async getPaymentLinks(providerId: string, status?: PaymentLinkStatus) {
    return this.prisma.paymentLink.findMany({
      where: {
        providerId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async cancelPaymentLink(id: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { id },
    });

    if (!link || link.status !== PaymentLinkStatus.PENDING) {
      return null;
    }

    if (this.stripe && link.stripeSessionId) {
      const provider = await this.prisma.providerProfile.findUnique({
        where: { id: link.providerId },
      });

      await this.stripe.checkout.sessions
        .expire(
          link.stripeSessionId,
          undefined,
          provider?.stripeAccountId
            ? { stripeAccount: provider.stripeAccountId }
            : undefined,
        )
        .catch((err: any) =>
          this.logger.warn(
            `Could not expire Stripe session: ${err.message}`,
          ),
        );
    }

    return this.prisma.paymentLink.update({
      where: { id },
      data: { status: PaymentLinkStatus.CANCELLED },
    });
  }

  async getProviderStripeStatus(providerId: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: {
        stripeAccountId: true,
        stripeOnboardingStatus: true,
      },
    });
    return provider;
  }

  // ─── Webhook verification ──────────────────────────────────

  constructWebhookEvent(rawBody: Buffer, signature: string): any {
    if (!this.stripe) return null;

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret || webhookSecret.includes('REPLACE_ME')) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not configured');
      return null;
    }

    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }
}
