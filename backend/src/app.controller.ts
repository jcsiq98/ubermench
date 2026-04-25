import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { WhatsAppService } from './modules/whatsapp/whatsapp.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './config/redis.service';
import { QueueService } from './common/queues/queue.service';

@Controller()
export class AppController {
  constructor(
    private whatsappService: WhatsAppService,
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
    private queueService: QueueService,
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

    const bullmqEnabled = this.queueService.isEnabled();
    const realRedis = this.redis.isRealRedis();

    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'handy-api',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      components: {
        database: dbOk ? '✅ connected' : '❌ disconnected',
        redis: realRedis ? '✅ connected' : '⚠️ in-memory fallback',
        bullmq: bullmqEnabled ? '✅ active' : '❌ disabled (no Redis)',
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

  // ─── Conversation lookup (verify-token protected) ────────

  @Get('api/internal/users/:phone/conversation')
  @Public()
  async getUserConversation(
    @Param('phone') phone: string,
    @Headers('x-verify-token') token: string,
    @Query('limit') limitParam?: string,
  ) {
    const verifyToken = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!token || token !== verifyToken) {
      throw new ForbiddenException('Invalid verify token');
    }

    const limit = Math.min(parseInt(limitParam || '50', 10) || 50, 200);
    const variants = this.phoneVariants(phone);

    const user = await this.prisma.user.findFirst({
      where: { OR: variants.map((p) => ({ phone: p })) },
      include: {
        providerProfile: { select: { id: true, bio: true } },
      },
    });

    const logs = await this.prisma.conversationLog.findMany({
      where: { OR: variants.map((p) => ({ phone: p })) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const providerProfile = (user as any)?.providerProfile;
    const appointments = providerProfile
      ? await this.prisma.appointment.findMany({
          where: { providerId: providerProfile.id },
          orderBy: { scheduledAt: 'desc' },
          take: 10,
        })
      : [];

    return {
      user: user
        ? {
            id: user.id,
            phone: user.phone,
            name: user.name,
            role: user.role,
            trade: (user as any).providerProfile?.bio,
            createdAt: user.createdAt,
          }
        : null,
      conversation: logs.reverse().map((l) => ({
        role: l.role,
        content: l.content,
        intent: l.intent,
        at: l.createdAt,
      })),
      appointments: appointments.map((a) => ({
        id: a.id,
        client: a.clientName,
        scheduled: a.scheduledAt,
        status: a.status,
        description: a.description,
      })),
      meta: { totalMessages: logs.length, limit },
    };
  }

  @Get('api/internal/users')
  @Public()
  async listUsers(
    @Headers('x-verify-token') token: string,
  ) {
    const verifyToken = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!token || token !== verifyToken) {
      throw new ForbiddenException('Invalid verify token');
    }

    const users = await this.prisma.user.findMany({
      include: {
        providerProfile: { select: { id: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const phoneCounts = await this.prisma.conversationLog.groupBy({
      by: ['phone'],
      _count: true,
    });
    const countMap = new Map(phoneCounts.map((p) => [p.phone, p._count]));

    return users.map((u) => {
      const variants = this.phoneVariants(u.phone);
      const msgCount = variants.reduce((sum, v) => sum + (countMap.get(v) || 0), 0);
      return {
        phone: u.phone,
        name: u.name,
        role: u.role,
        trade: (u as any).providerProfile?.bio,
        messages: msgCount,
        createdAt: u.createdAt,
      };
    });
  }

  // ─── Financial integrity (Cap. 45 — M0) ─────────────────
  //
  // Verifies the structural invariant "if Chalán confirmed it, it exists
  // in the DB". For every assistant message tagged
  // financial_confirmation_sent in the window, looks up the recordId in
  // income/expense tables. Anything missing = orphaned confirmation =
  // the user was lied to and we need to know.
  //
  //   GET /api/internal/financial-integrity?phone=+52...&days=7
  //   GET /api/internal/financial-integrity?days=30   (all providers)

  @Get('api/internal/financial-integrity')
  @Public()
  async getFinancialIntegrity(
    @Headers('x-verify-token') token: string,
    @Query('phone') phoneParam?: string,
    @Query('days') daysParam?: string,
  ) {
    const verifyToken = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!token || token !== verifyToken) {
      throw new ForbiddenException('Invalid verify token');
    }

    const days = Math.min(Math.max(parseInt(daysParam || '7', 10) || 7, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const phoneFilter = phoneParam
      ? { phone: { in: this.phoneVariants(phoneParam) } }
      : {};

    const confirmations = await this.prisma.conversationLog.findMany({
      where: {
        ...phoneFilter,
        role: 'assistant',
        createdAt: { gte: since },
        metadata: {
          path: ['audit', 'event'],
          equals: 'financial_confirmation_sent',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const expenseIds = new Set<string>();
    const incomeIds = new Set<string>();

    type AuditMeta = {
      recordId?: unknown;
      kind?: unknown;
      amount?: unknown;
      sourceTextHash?: unknown;
    };
    const extractAudit = (
      metadata: unknown,
    ): { recordId: string; kind: string; audit: AuditMeta } | null => {
      if (!metadata || typeof metadata !== 'object') return null;
      const audit = (metadata as { audit?: unknown }).audit;
      if (!audit || typeof audit !== 'object') return null;
      const a = audit as AuditMeta;
      if (typeof a.recordId !== 'string' || typeof a.kind !== 'string') {
        return null;
      }
      return { recordId: a.recordId, kind: a.kind, audit: a };
    };

    for (const log of confirmations) {
      const a = extractAudit(log.metadata);
      if (!a) continue;
      if (a.kind === 'expense') expenseIds.add(a.recordId);
      else if (a.kind === 'income') incomeIds.add(a.recordId);
    }

    const [foundExpenses, foundIncomes] = await Promise.all([
      expenseIds.size
        ? this.prisma.expense.findMany({
            where: { id: { in: [...expenseIds] } },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
      incomeIds.size
        ? this.prisma.income.findMany({
            where: { id: { in: [...incomeIds] } },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);

    const foundExpenseIds = new Set(foundExpenses.map((e) => e.id));
    const foundIncomeIds = new Set(foundIncomes.map((i) => i.id));

    const orphaned: Array<{
      phone: string;
      kind: string;
      amount?: number;
      recordId: string;
      sourceTextHash?: string;
      content: string;
      at: Date;
    }> = [];
    let totalConfirmations = 0;

    for (const log of confirmations) {
      const a = extractAudit(log.metadata);
      if (!a) continue;
      totalConfirmations += 1;
      const found =
        a.kind === 'expense'
          ? foundExpenseIds.has(a.recordId)
          : a.kind === 'income'
            ? foundIncomeIds.has(a.recordId)
            : false;
      if (!found) {
        orphaned.push({
          phone: log.phone,
          kind: a.kind,
          amount:
            typeof a.audit.amount === 'number' ? a.audit.amount : undefined,
          recordId: a.recordId,
          sourceTextHash:
            typeof a.audit.sourceTextHash === 'string'
              ? a.audit.sourceTextHash
              : undefined,
          content: log.content.slice(0, 120),
          at: log.createdAt,
        });
      }
    }

    return {
      window: { days, since: since.toISOString() },
      ...(phoneParam ? { phone: phoneParam } : { scope: 'all_providers' }),
      totals: {
        confirmationsScanned: totalConfirmations,
        confirmationsWithoutRecord: orphaned.length,
        integrityOk: orphaned.length === 0,
      },
      orphaned: orphaned.slice(0, 100),
    };
  }

  // ─── Private helpers ──────────────────────────────────────

  private phoneVariants(raw: string): string[] {
    const digits = raw.replace(/\D/g, '');
    const variants = new Set<string>();
    variants.add(digits);
    variants.add(`+${digits}`);
    if (digits.startsWith('521')) {
      const without1 = `52${digits.slice(3)}`;
      variants.add(without1);
      variants.add(`+${without1}`);
    } else if (digits.startsWith('52') && !digits.startsWith('521')) {
      const with1 = `521${digits.slice(2)}`;
      variants.add(with1);
      variants.add(`+${with1}`);
    }
    return [...variants];
  }

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
