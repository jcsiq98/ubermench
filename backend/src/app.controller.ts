import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { WhatsAppService } from './modules/whatsapp/whatsapp.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './config/redis.service';

@Controller()
export class AppController {
  constructor(
    private whatsappService: WhatsAppService,
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  /**
   * General health check — shows overall system status.
   */
  @Get('api/health')
  @Public()
  async getHealth() {
    const dbOk = await this.checkDb();
    const redisOk = await this.checkRedis();
    const wa = this.whatsappService.getHealthStatus();

    const allOk = dbOk && redisOk && (wa.enabled ? wa.tokenValid !== false : true);

    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'handy-api',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      components: {
        database: dbOk ? '✅ connected' : '❌ disconnected',
        redis: redisOk ? '✅ connected' : '❌ disconnected',
        whatsapp: wa.enabled
          ? wa.tokenValid === true
            ? '✅ active'
            : wa.tokenValid === false
              ? '❌ token expired'
              : '⏳ checking...'
          : '⚠️ disabled',
      },
      whatsapp: {
        enabled: wa.enabled,
        tokenValid: wa.tokenValid,
        lastTokenCheck: wa.lastTokenCheck,
        lastError: wa.lastError,
        stats: {
          sent: wa.messagesSent,
          failed: wa.messagesFailed,
          consecutiveFailures: wa.consecutiveFailures,
        },
      },
    };
  }

  /**
   * WhatsApp-specific health check — re-validates the token.
   */
  @Get('api/health/whatsapp')
  @Public()
  async getWhatsAppHealth() {
    const wa = this.whatsappService.getHealthStatus();

    if (!wa.enabled) {
      return {
        status: 'disabled',
        message:
          'WhatsApp is not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env',
      };
    }

    // Force a fresh token validation
    const valid = await this.whatsappService.validateToken();

    const health = this.whatsappService.getHealthStatus();

    return {
      status: valid ? 'ok' : 'error',
      tokenValid: valid,
      lastTokenCheck: health.lastTokenCheck,
      lastError: health.lastError,
      stats: {
        sent: health.messagesSent,
        failed: health.messagesFailed,
        consecutiveFailures: health.consecutiveFailures,
      },
      ...(valid
        ? {}
        : {
            fix: 'Ve a developers.facebook.com → Tu App → WhatsApp → API Setup → Genera un nuevo token → Actualiza WHATSAPP_TOKEN en .env → Reinicia el backend',
          }),
    };
  }

  // ─── Admin utility (verify-token protected) ─────────────

  @Patch('api/internal/users/by-phone/:phone')
  @Public()
  async fixUserByPhone(
    @Param('phone') phone: string,
    @Body() body: { name?: string },
    @Headers('x-verify-token') token: string,
  ) {
    const verifyToken = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!token || token !== verifyToken) {
      throw new ForbiddenException('Invalid verify token');
    }

    let normalized = phone.replace(/\D/g, '');
    if (!normalized.startsWith('+')) normalized = `+${normalized}`;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: normalized }, { phone: `+${phone}` }],
      },
      include: { providerProfile: { select: { id: true, bio: true } } },
    });

    if (!user) return { error: `User not found: ${phone}` };

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { name: body.name },
      select: { id: true, phone: true, name: true },
    });

    return { success: true, user: updated };
  }

  // ─── Private helpers ──────────────────────────────────────

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.set('__health_check__', 'ok', 10);
      return true;
    } catch {
      return false;
    }
  }
}
