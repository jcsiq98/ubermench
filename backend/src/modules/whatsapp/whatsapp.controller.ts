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
import { AiService } from '../ai/ai.service';
import { QueueService } from '../../common/queues/queue.service';
import { QUEUE_NAMES } from '../../common/queues/queue.constants';

const WEBHOOK_DEDUP_TTL = 24 * 60 * 60; // 24 hours
const DEBOUNCE_DELAY_MS = 3_000;
const BUFFER_PREFIX = 'wa_buf:';
const BUFFER_TTL = 30; // seconds — safety net if debounce job is lost

@ApiTags('WhatsApp Webhook')
@Controller('api/webhook')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private whatsappService: WhatsAppService,
    private providerHandler: WhatsAppProviderHandler,
    private redis: RedisService,
    private aiService: AiService,
    private queueService: QueueService,
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

        // Interactive messages (buttons, list replies) — always immediate, never debounce
        if (message.type === 'interactive') {
          await this.providerHandler.handleIncomingMessage(
            senderPhone,
            senderName,
            message,
          );
          continue;
        }

        // Non-IDLE session states need immediate response (booking flow, rating, etc.)
        const idle = await this.providerHandler.isSessionIdle(senderPhone);
        if (!idle) {
          await this.providerHandler.handleIncomingMessage(
            senderPhone,
            senderName,
            message,
          );
          continue;
        }

        // Extract text content before buffering (audio → Whisper transcription)
        const text = await this.extractTextContent(message, senderPhone);
        if (!text) continue;

        // Push to Redis buffer (RPUSH is atomic — safe against concurrent webhooks)
        const bufKey = `${BUFFER_PREFIX}${senderPhone}`;
        await this.redis.rpush(bufKey, text);
        await this.redis.expire(bufKey, BUFFER_TTL);

        // Schedule/reschedule debounce — resets timer with each new message
        const scheduled = await this.scheduleDebounce(senderPhone, senderName);

        if (!scheduled) {
          // BullMQ unavailable — fall back to immediate processing
          const items = await this.redis.lrange(bufKey, 0, -1);
          await this.redis.del(bufKey);
          if (items.length > 0) {
            await this.providerHandler.handleBufferedMessage(
              senderPhone,
              senderName,
              items.join('\n'),
            );
          }
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing webhook: ${error.message}`,
        error.stack,
      );
    }
  }

  // ─── Debounce helpers ──────────────────────────────────────

  /**
   * Extract text from a WhatsApp message (text or audio).
   * Audio is transcribed via Whisper before buffering so the media URL
   * doesn't expire while sitting in the debounce queue.
   */
  private async extractTextContent(
    message: any,
    senderPhone: string,
  ): Promise<string> {
    if (message.type === 'text') {
      return message.text?.body?.trim().toLowerCase() || '';
    }

    if (message.type === 'audio' && message.audio?.id) {
      const mediaUrl = await this.whatsappService.getMediaUrl(message.audio.id);
      if (!mediaUrl) {
        this.logger.warn(`Could not resolve media URL for audio ${message.audio.id}`);
        return '';
      }

      const audioBuffer = await this.whatsappService.downloadMedia(mediaUrl);
      if (!audioBuffer) {
        this.logger.warn(`Could not download audio ${message.audio.id}`);
        return '';
      }

      const mimeType = message.audio.mime_type || 'audio/ogg';
      const transcript = await this.aiService.transcribeAudio(audioBuffer, mimeType);

      if (!transcript) {
        await this.whatsappService.sendTextMessage(
          senderPhone,
          '🤔 No pude entender tu nota de voz. ¿Podrías intentar de nuevo o escribir tu mensaje?',
        );
        return '';
      }

      return transcript.trim().toLowerCase();
    }

    return '';
  }

  /**
   * Cancel any pending debounce job for this phone and schedule a new one.
   * Returns false if BullMQ is unavailable (caller should fall back to immediate processing).
   */
  private async scheduleDebounce(
    phone: string,
    senderName: string,
  ): Promise<boolean> {
    const jobId = `debounce-${phone}`;

    await this.queueService.removeJob(QUEUE_NAMES.WHATSAPP_DEBOUNCE, jobId);

    const id = await this.queueService.addJob(
      QUEUE_NAMES.WHATSAPP_DEBOUNCE,
      'debounce',
      { phone, senderName },
      {
        delay: DEBOUNCE_DELAY_MS,
        jobId,
        attempts: 1,
        removeOnComplete: true,
      },
    );

    return id !== null;
  }
}
