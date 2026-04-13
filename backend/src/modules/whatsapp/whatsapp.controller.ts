import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';
import { RedisService } from '../../config/redis.service';

const WEBHOOK_DEDUP_TTL = 24 * 60 * 60; // 24 hours

@ApiTags('WhatsApp Webhook')
@Controller('api/webhook')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private whatsappService: WhatsAppService,
    private providerHandler: WhatsAppProviderHandler,
    private redis: RedisService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'WhatsApp webhook verification (Meta challenge)' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.whatsappService.getVerifyToken();

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verification successful');
      return res.status(200).send(challenge);
    }

    this.logger.warn('Webhook verification failed — invalid token');
    return res.status(403).json({ error: 'Forbidden' });
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async receiveMessage(@Body() body: any, @Res() res: Response) {
    res.status(200).json({ status: 'received' });

    try {
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      if (!value) return;

      if (value.statuses) {
        for (const status of value.statuses) {
          this.logger.debug(
            `Message ${status.id} status: ${status.status}`,
          );
        }
        return;
      }

      if (!value.messages || value.messages.length === 0) return;

      for (const message of value.messages) {
        const senderPhone = message.from;
        const senderName =
          value.contacts?.[0]?.profile?.name || 'Unknown';
        const messageId = message.id;

        // Atomic idempotency: only the first caller wins
        const dedupKey = `wa_dedup:${messageId}`;
        const isFirstProcessing = await this.redis.setNX(dedupKey, '1', WEBHOOK_DEDUP_TTL);
        if (!isFirstProcessing) {
          this.logger.debug(`Duplicate webhook skipped: ${messageId}`);
          continue;
        }

        this.logger.log(
          `Message from ${senderPhone} (${senderName}): type=${message.type}`,
        );

        await this.whatsappService.markAsRead(messageId);

        await this.providerHandler.handleIncomingMessage(
          senderPhone,
          senderName,
          message,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing webhook: ${error.message}`,
        error.stack,
      );
    }
  }
}
