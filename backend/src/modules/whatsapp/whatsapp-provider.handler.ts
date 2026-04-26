import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOnboardingHandler } from './whatsapp-onboarding.handler';
import { BookingsGateway } from '../_marketplace/bookings/bookings.gateway';
import { MessagesService } from '../_marketplace/messages/messages.service';
import { RatingsService } from '../_marketplace/ratings/ratings.service';
import { AiService, RawToolCall } from '../ai/ai.service';
import { AiContextService } from '../ai/ai-context.service';
import { AiIntent, AiResponse, WorkspaceConfigData } from '../ai/ai.types';
import { IncomeService } from '../income/income.service';
import { ExpenseService } from '../expense/expense.service';
import { RecurringExpenseService } from '../expense/recurring-expense.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { TimezoneMigrationService } from '../workspace/timezone-migration.service';
import { ProviderModelService } from '../provider-model/provider-model.service';
import { BookingStatus, PaymentMethod } from '@prisma/client';
import { QueueService } from '../../common/queues/queue.service';
import { QUEUE_NAMES } from '../../common/queues/queue.constants';
import { AppointmentFollowupJobData } from '../../common/queues/processors/appointment-followup.processor';
import { AppointmentReminderJobData } from '../../common/queues/processors/appointment-reminder.processor';
import { PersonalReminderJobData } from '../../common/queues/processors/personal-reminder.processor';
import { RemindersService } from '../reminders/reminders.service';
import { PaymentsService } from '../payments/payments.service';
import {
  formatTime,
  formatDate,
  wallClockToUtc,
  toLocalTime,
  getLocalDayRange,
  DEFAULT_TIMEZONE,
  resolveTimezone,
  getTimezoneLabel,
  isMexicanPhone,
  isTimezoneSkipPhrase,
} from '../../common/utils/timezone.utils';
import { sanitizeForWhatsApp } from '../../common/utils/whatsapp-format.utils';
import {
  FINANCIAL_EVENT,
  emitFinancialEvent,
  buildFinancialMetadata,
  sourceTextHash,
  type FinancialAuditPayload,
} from '../../common/utils/financial-audit';

const JUNK_CLIENT_NAMES = new Set([
  'ninguno', 'ninguna', 'no', 'n/a', 'na', 'nada',
  'sin nombre', 'desconocido', 'nadie',
]);

// ─── Provider session states ────────────────────────────────

export enum ProviderState {
  IDLE = 'IDLE',
  REQUEST_RECEIVED = 'REQUEST_RECEIVED',
  ACCEPTED = 'ACCEPTED',
  ARRIVING = 'ARRIVING',
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_RATING = 'AWAITING_RATING',
  AWAITING_RATING_COMMENT = 'AWAITING_RATING_COMMENT',
  EDITING_NAME = 'EDITING_NAME',
  EDITING_BIO = 'EDITING_BIO',
}

interface ProviderSession {
  state: ProviderState;
  bookingId?: string;
  providerProfileId?: string;
  providerUserId?: string;
  customerName?: string;
  customerId?: string;
  pendingRatingScore?: number; // Temp: holds the score while awaiting comment
}

const SESSION_PREFIX = 'wa_provider_session:';
const SESSION_TTL = 86400; // 24 hours

// Cap. 46 — Timezone Confidence System runtime gate.
const PENDING_TZ_PREFIX = 'wa_pending_timezone:';
const PENDING_TZ_TTL = 600; // 10 minutes
const MAX_PENDING_TZ_ATTEMPTS = 1; // first miss retries; second miss skips

interface PendingTimezoneState {
  rawText: string;
  attempts: number;
  createdAt: number;
}

const TIMEZONE_GATE_INTENTS = new Set<AiIntent>([
  AiIntent.AGENDAR_CITA,
  AiIntent.MODIFICAR_CITA,
  AiIntent.CREAR_RECORDATORIO,
]);

@Injectable()
export class WhatsAppProviderHandler {
  private readonly logger = new Logger(WhatsAppProviderHandler.name);

  constructor(
    private whatsapp: WhatsAppService,
    private prisma: PrismaService,
    private redis: RedisService,
    private bookingsGateway: BookingsGateway,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => MessagesService))
    private messagesService: MessagesService,
    private ratingsService: RatingsService,
    private onboardingHandler: WhatsAppOnboardingHandler,
    private aiService: AiService,
    private aiContextService: AiContextService,
    private incomeService: IncomeService,
    private expenseService: ExpenseService,
    private recurringExpenseService: RecurringExpenseService,
    private appointmentsService: AppointmentsService,
    private workspaceService: WorkspaceService,
    private timezoneMigrationService: TimezoneMigrationService,
    private providerModelService: ProviderModelService,
    private queueService: QueueService,
    private remindersService: RemindersService,
    private paymentsService: PaymentsService,
  ) {}

  // ─── Session management ──────────────────────────────────

  private async getSession(phone: string): Promise<ProviderSession | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${phone}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async setSession(
    phone: string,
    session: ProviderSession,
  ): Promise<void> {
    await this.redis.set(
      `${SESSION_PREFIX}${phone}`,
      JSON.stringify(session),
      SESSION_TTL,
    );
  }

  private async clearSession(phone: string): Promise<void> {
    await this.redis.del(`${SESSION_PREFIX}${phone}`);
  }

  // ─── Cap. 46 — pending timezone (runtime gate state) ─────

  private async getPendingTimezone(
    phone: string,
  ): Promise<PendingTimezoneState | null> {
    const raw = await this.redis.get(`${PENDING_TZ_PREFIX}${phone}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingTimezoneState;
    } catch {
      return null;
    }
  }

  private async setPendingTimezone(
    phone: string,
    state: PendingTimezoneState,
  ): Promise<void> {
    await this.redis.set(
      `${PENDING_TZ_PREFIX}${phone}`,
      JSON.stringify(state),
      PENDING_TZ_TTL,
    );
  }

  private async clearPendingTimezone(phone: string): Promise<void> {
    await this.redis.del(`${PENDING_TZ_PREFIX}${phone}`);
  }

  // ─── Find provider by phone ──────────────────────────────

  private async findProviderByPhone(phone: string) {
    // WA phone may or may not have +, normalize
    const normalized = this.whatsapp.normalizePhone(phone);
    // Try to match: the DB stores "+52XXXXXXXXXX" format
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: `+${normalized}` },
          { phone: normalized },
          { phone },
        ],
        role: 'PROVIDER',
      },
      include: {
        providerProfile: true,
      },
    });
    return user;
  }

  // ─── Public: Notify provider of new booking ──────────────

  /**
   * Called by BookingsService when a new booking is created.
   * Sends a WhatsApp message to the provider with Accept / Reject buttons.
   */
  async notifyProviderOfNewBooking(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true, phone: true, ratingAverage: true } },
        provider: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        category: true,
      },
    });

    if (!booking || !booking.provider?.user?.phone) {
      this.logger.warn(`Cannot notify: booking ${bookingId} missing provider phone`);
      return;
    }

    const providerPhone = booking.provider.user.phone;
    const customerName = booking.customer?.name || 'Cliente';
    const customerRating = booking.customer?.ratingAverage
      ? `⭐ ${booking.customer.ratingAverage.toFixed(1)}`
      : 'Sin calificación';
    const categoryName = booking.category?.name || 'Servicio';
    const categoryIcon = booking.category?.icon || '🛠';

    // Calculate distance if both provider and booking have coords
    let distanceText = '';
    if (
      booking.locationLat && booking.locationLng &&
      booking.provider.locationLat && booking.provider.locationLng
    ) {
      const dist = this.haversineDistance(
        booking.provider.locationLat, booking.provider.locationLng,
        booking.locationLat, booking.locationLng,
      );
      distanceText = ` (a ${dist.toFixed(1)} km)`;
    }

    // Build notification message
    const msg =
      `🔔 *¡Nuevo trabajo!*\n\n` +
      `${categoryIcon} Servicio: ${categoryName}\n` +
      `📝 "${booking.description}"\n` +
      `📍 ${booking.address || 'Sin dirección'}${distanceText}\n` +
      `📅 ${booking.scheduledAt ? new Date(booking.scheduledAt).toLocaleDateString('es-MX') : 'Lo antes posible'}\n` +
      `👤 Cliente: ${customerName} (${customerRating})\n\n` +
      `⏱ Responde en los próximos 10 minutos`;

    // Send interactive buttons for accept/reject
    await this.whatsapp.sendInteractiveButtons(
      providerPhone,
      msg,
      [
        { id: `accept_${bookingId}`, title: '✅ Aceptar' },
        { id: `reject_${bookingId}`, title: '❌ Rechazar' },
      ],
    );

    // Set provider session to REQUEST_RECEIVED
    await this.setSession(providerPhone, {
      state: ProviderState.REQUEST_RECEIVED,
      bookingId,
      providerProfileId: booking.provider.id,
      providerUserId: booking.provider.user.id,
      customerName,
      customerId: booking.customer?.id,
    });

    this.logger.log(
      `Notified provider ${providerPhone} about booking ${bookingId}`,
    );
  }

  // ─── Public: Check session state ─────────────────────────

  async isSessionIdle(phone: string): Promise<boolean> {
    const session = await this.getSession(phone);
    return !session || session.state === ProviderState.IDLE;
  }

  // ─── Public: Handle incoming WhatsApp message ────────────

  async handleIncomingMessage(
    senderPhone: string,
    senderName: string,
    message: any,
  ): Promise<void> {
    const provider = await this.findProviderByPhone(senderPhone);
    if (!provider) {
      this.logger.log(`Message from non-provider ${senderPhone}, routing to onboarding`);
      const text = await this.extractContent(message, senderPhone);
      await this.onboardingHandler.handleMessage(senderPhone, senderName, text);
      return;
    }

    const text = await this.extractContent(message, senderPhone);
    const buttonReply = this.extractButtonReply(message);

    await this.processProviderMessage(senderPhone, senderName, text, buttonReply, provider);
  }

  /**
   * Handle pre-extracted text from the debounce buffer.
   * Called by WhatsAppDebounceProcessor after accumulating rapid-fire messages.
   */
  async handleBufferedMessage(
    senderPhone: string,
    senderName: string,
    text: string,
  ): Promise<void> {
    const provider = await this.findProviderByPhone(senderPhone);
    if (!provider) {
      this.logger.log(`Buffered message from non-provider ${senderPhone}, routing to onboarding`);
      await this.onboardingHandler.handleMessage(senderPhone, senderName, text);
      return;
    }

    await this.processProviderMessage(senderPhone, senderName, text, null, provider);
  }

  // ─── Core message processing (shared by direct + buffered paths) ──

  private async processProviderMessage(
    senderPhone: string,
    senderName: string,
    text: string,
    buttonReply: { id: string; title: string } | null,
    provider: NonNullable<Awaited<ReturnType<WhatsAppProviderHandler['findProviderByPhone']>>>,
  ): Promise<void> {
    // Track activity and engagement for unit economics
    const updatePromises: Promise<any>[] = [
      this.prisma.user.update({
        where: { id: provider.id },
        data: { lastActivityAt: new Date() },
      }),
    ];
    if (provider.providerProfile?.id) {
      updatePromises.push(
        this.prisma.providerProfile.update({
          where: { id: provider.providerProfile.id },
          data: { totalMessages: { increment: 1 } },
        }),
      );
    }
    await Promise.all(updatePromises).catch((err) =>
      this.logger.warn(`Failed to update tracking fields: ${err.message}`),
    );

    // Get or init session
    let session = await this.getSession(senderPhone);
    if (!session) {
      session = {
        state: ProviderState.IDLE,
        providerProfileId: provider.providerProfile?.id,
        providerUserId: provider.id,
      };
    }

    // Normalize once for all keyword checks (strips accents + punctuation)
    const normalized = this.normalizeForKeywords(text);

    // ── Workspace profile keywords ──
    if (
      normalized === 'mis servicios' ||
      normalized === 'mi negocio' ||
      normalized === 'mi workspace' ||
      normalized === 'configuracion'
    ) {
      if (provider.providerProfile) {
        const summary = await this.workspaceService.getWorkspaceSummary(
          provider.providerProfile.id,
        );
        await this.whatsapp.sendTextMessage(senderPhone, summary);
        return;
      }
    }

    // ── Keyword-set bypasses (read-only queries, no LLM needed) ──
    // Each detector checks for signal words and excludes action verbs/numbers.
    // Order matters: recurring check runs first to win over summary
    // (e.g. "resumen de gastos fijos" → recurring, not summary).
    if (this.isRecurringListQuery(normalized)) {
      if (provider.providerProfile) {
        const expenses = await this.recurringExpenseService.listActive(
          provider.providerProfile.id,
        );
        const msg = this.recurringExpenseService.formatRecurringList(expenses);
        await this.whatsapp.sendTextMessage(senderPhone, msg);
        return;
      }
    }

    if (this.isSummaryQuery(normalized)) {
      if (provider.providerProfile) {
        return this.handleVerResumen(senderPhone, {}, provider.providerProfile.id);
      }
    }

    if (this.isAgendaQuery(normalized)) {
      if (provider.providerProfile) {
        return this.handleVerAgenda(senderPhone, provider.providerProfile.id);
      }
    }

    // ── Global keywords ──
    if (normalized === 'help' || normalized === 'ayuda') {
      return this.sendHelpMenu(senderPhone);
    }
    if (normalized === 'menu' || normalized === 'inicio') {
      return this.sendProviderDashboard(senderPhone, provider.name || senderName);
    }
    if (normalized === 'reset' || normalized === 'limpiar historial' || normalized === 'limpiar') {
      await this.aiContextService.clearHistory(senderPhone);
      await this.whatsapp.sendTextMessage(
        senderPhone,
        '🔄 Historial de conversación limpiado. Puedes empezar de nuevo.',
      );
      return;
    }
    // ── Handle legacy button presses (marketplace) ──
    if (buttonReply) {
      const toggleMatch = buttonReply.id.match(/^toggle_avail_(.+)$/);
      if (toggleMatch) {
        const profileId = toggleMatch[1];
        const profile = await this.prisma.providerProfile.findUnique({ where: { id: profileId } });
        if (profile) {
          const newVal = !profile.isAvailable;
          await this.prisma.providerProfile.update({ where: { id: profileId }, data: { isAvailable: newVal } });
          await this.whatsapp.sendTextMessage(
            senderPhone,
            newVal
              ? '🟢 *Ahora estás disponible.* Recibirás nuevas solicitudes.'
              : '🔴 *Ya no estás disponible.* No recibirás solicitudes hasta que lo actives.',
          );
        }
        return;
      }
    }

    // ── Check for accept/reject button presses (handle regardless of state) ──
    if (buttonReply) {
      const acceptMatch = buttonReply.id.match(/^accept_(.+)$/);
      const rejectMatch = buttonReply.id.match(/^reject_(.+)$/);
      if (acceptMatch || rejectMatch) {
        const bookingId = (acceptMatch || rejectMatch)![1];
        // Override session with the booking info
        session.bookingId = bookingId;
        session.state = ProviderState.REQUEST_RECEIVED;
        session.providerProfileId = provider.providerProfile?.id;
        session.providerUserId = provider.id;
        if (acceptMatch) {
          return this.acceptBooking(senderPhone, session);
        } else {
          return this.rejectBooking(senderPhone, session);
        }
      }

      // Check for rating button presses
      const rateLowMatch = buttonReply.id.match(/^rate_low_(.+)$/);
      const rateMidMatch = buttonReply.id.match(/^rate_mid_(.+)$/);
      const rateHighMatch = buttonReply.id.match(/^rate_high_(.+)$/);
      if (rateLowMatch || rateMidMatch || rateHighMatch) {
        const ratingBookingId = (rateLowMatch || rateMidMatch || rateHighMatch)![1];
        let score: number;
        if (rateLowMatch) score = 2;
        else if (rateMidMatch) score = 3;
        else score = 5;

        session.bookingId = ratingBookingId;
        session.pendingRatingScore = score;
        session.state = ProviderState.AWAITING_RATING_COMMENT;
        session.providerProfileId = provider.providerProfile?.id;
        session.providerUserId = provider.id;
        await this.setSession(senderPhone, session);

        await this.whatsapp.sendTextMessage(
          senderPhone,
          `Has seleccionado ${score} estrella${score > 1 ? 's' : ''}.\n\n💬 ¿Quieres dejar un comentario? Escríbelo ahora, o escribe *"skip"* para omitir.`,
        );
        return;
      }
    }

    // ── State machine ──
    switch (session.state) {
      case ProviderState.IDLE:
        return this.handleIdle(senderPhone, senderName, text, session);

      case ProviderState.REQUEST_RECEIVED:
        return this.handleRequestReceived(
          senderPhone,
          text,
          buttonReply,
          session,
        );

      case ProviderState.ACCEPTED:
        return this.handleAccepted(senderPhone, text, buttonReply, session);

      case ProviderState.ARRIVING:
        return this.handleArriving(senderPhone, text, session, buttonReply);

      case ProviderState.IN_PROGRESS:
        return this.handleInProgress(senderPhone, text, session, buttonReply);

      case ProviderState.AWAITING_RATING:
        return this.handleAwaitingRating(senderPhone, text, buttonReply, session);

      case ProviderState.AWAITING_RATING_COMMENT:
        return this.handleAwaitingRatingComment(senderPhone, text, session);

      case ProviderState.EDITING_NAME:
        return this.handleEditingName(senderPhone, text, session);

      case ProviderState.EDITING_BIO:
        return this.handleEditingBio(senderPhone, text, session);

      default:
        return this.sendFallbackPrompt(senderPhone);
    }
  }

  // ─── State: IDLE ─────────────────────────────────────────

  private async handleIdle(
    phone: string,
    name: string,
    text: string,
    session: ProviderSession,
  ) {
    // Check for any pending bookings the provider might have
    if (session.providerProfileId) {
      const pendingBooking = await this.prisma.booking.findFirst({
        where: {
          providerId: session.providerProfileId,
          status: BookingStatus.PENDING,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, ratingAverage: true } },
          category: true,
        },
      });

      if (pendingBooking) {
        const customerName = pendingBooking.customer?.name || 'Cliente';
        const customerRating = pendingBooking.customer?.ratingAverage
          ? `⭐ ${pendingBooking.customer.ratingAverage.toFixed(1)}`
          : 'Sin calificación';
        const categoryIcon = pendingBooking.category?.icon || '🛠';
        const categoryName = pendingBooking.category?.name || 'Servicio';

        const updatedSession: ProviderSession = {
          ...session,
          state: ProviderState.REQUEST_RECEIVED,
          bookingId: pendingBooking.id,
          customerName,
          customerId: pendingBooking.customer?.id,
        };
        await this.setSession(phone, updatedSession);

        if (text === 'aceptar' || text === 'accept' || text === 'si' || text === 'sí') {
          return this.acceptBooking(phone, updatedSession);
        }
        if (text === 'rechazar' || text === 'reject' || text === 'no') {
          return this.rejectBooking(phone, updatedSession);
        }

        await this.whatsapp.sendTextMessage(
          phone,
          `🔔 *¡Tienes un trabajo pendiente!*\n\n` +
            `${categoryIcon} Servicio: ${categoryName}\n` +
            `📝 "${pendingBooking.description}"\n` +
            `📍 ${pendingBooking.address || 'Sin dirección'}\n` +
            `📅 ${pendingBooking.scheduledAt ? new Date(pendingBooking.scheduledAt).toLocaleDateString('es-MX') : 'Lo antes posible'}\n` +
            `👤 Cliente: ${customerName} (${customerRating})\n\n` +
            `✅ Escribe *"aceptar"* para tomar el trabajo\n` +
            `❌ Escribe *"rechazar"* para pasar`,
        );
        return;
      }
    }

    // Route to AI conversational handler
    if (text) {
      return this.handleAiConversation(phone, text, name);
    }

    return this.sendFallbackPrompt(phone);
  }

  // ─── AI Conversational Handler ──────────────────────────

  private async handleAiConversation(
    phone: string,
    text: string,
    providerName: string,
  ): Promise<void> {
    const provider = await this.findProviderByPhone(phone);
    const providerProfileId = provider?.providerProfile?.id;

    // Cap. 46 — pre-AI: if we asked the user for their timezone in a
    // previous turn and have a pending raw text in Redis, this incoming
    // message is the answer. Resolve / retry / skip and bail before the
    // LLM sees the city name out of context.
    if (providerProfileId) {
      const handled = await this.tryHandlePendingTimezone(
        phone,
        text,
        providerProfileId,
        providerName,
      );
      if (handled) return;
    }

    // Load workspace context + financial data for personalized AI responses
    let workspaceContext;
    let tz = DEFAULT_TIMEZONE;
    if (providerProfileId) {
      try {
        const wsCtx = await this.workspaceService.getWorkspaceContext(providerProfileId);
        tz = wsCtx.timezone || DEFAULT_TIMEZONE;
        const [recentExpenses, activeRecurring, providerModel, todayAppts] =
          await Promise.all([
            this.expenseService.getRecent(providerProfileId, 5),
            this.recurringExpenseService.listActive(providerProfileId),
            this.providerModelService.getProviderModel(providerProfileId),
            this.appointmentsService.getTodayAgenda(providerProfileId, tz),
          ]);

        workspaceContext = {
          ...wsCtx,
          recentExpenses: recentExpenses.map((e) => ({
            amount: Number(e.amount),
            category: e.category ?? undefined,
            description: e.description ?? undefined,
            date: e.date.toISOString().split('T')[0],
          })),
          activeRecurringExpenses: activeRecurring.map((e) => ({
            amount: Number(e.amount),
            description: e.description,
            frequency: e.frequency,
            dayOfMonth: e.dayOfMonth,
          })),
          providerModel,
          todayAppointments: todayAppts.map((a: any) => ({
            time: formatTime(new Date(a.scheduledAt), tz),
            clientName: a.clientName || undefined,
            description: a.description || undefined,
            address: a.address || undefined,
          })),
        };
      } catch (err: any) {
        this.logger.warn(`Failed to load workspace context: ${err.message}`);
      }
    }

    // Audit join key (Cap. 45 — M0): every financial event triggered by
    // this turn (write_attempted/committed/confirmation_sent) carries the
    // same hash so the integrity endpoint can reconstruct the chain.
    const srcHash = sourceTextHash(text);

    try {
      const aiResponses = await this.aiService.processMessage(
        phone,
        text,
        providerName,
        workspaceContext,
      );

      // ─── Financial firewall (Cap. 44 v3) ──────────────────────
      // Intercepts fake confirmations and invented financial figures
      // BEFORE the normal intent switch sends the LLM text to the user.
      const firewalled = await this.applyFinancialFirewall(
        phone,
        text,
        aiResponses,
        providerProfileId,
        tz,
        srcHash,
      );
      if (firewalled === null) {
        if (providerProfileId) {
          this.providerModelService
            .invalidate(providerProfileId)
            .catch(() => {});
          this.maybeExtractLearnedFacts(
            phone,
            providerProfileId,
            workspaceContext,
          ).catch((err: unknown) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Learned facts extraction failed: ${errMsg}`);
          });
        }
        return;
      }

      // Cap. 46 — post-AI gate: if any tool call is a date/time intent
      // and the workspace is sitting on the unconfirmed default with a
      // non-Mexican phone, ask for the timezone before executing the
      // intent. The original raw text is parked in Redis and replayed
      // once the user answers.
      if (
        providerProfileId &&
        this.shouldGateForRiskyDefault(phone, workspaceContext, firewalled)
      ) {
        await this.openTimezoneGate(phone, text);
        return;
      }

      for (const aiResponse of firewalled) {
        switch (aiResponse.intent) {
          case AiIntent.REGISTRAR_INGRESO:
            await this.handleRegistrarIngreso(phone, aiResponse.data, providerProfileId, tz, srcHash);
            break;

          case AiIntent.REGISTRAR_GASTO:
            await this.handleRegistrarGasto(phone, aiResponse.data, providerProfileId, tz, srcHash);
            break;

          case AiIntent.GESTIONAR_GASTO:
            await this.handleGestionarGasto(phone, aiResponse.data, providerProfileId);
            break;

          case AiIntent.GESTIONAR_GASTO_RECURRENTE:
            await this.handleGastoRecurrente(phone, aiResponse.data, providerProfileId);
            break;

          case AiIntent.VER_RESUMEN:
            await this.handleVerResumen(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.AGENDAR_CITA:
            await this.handleAgendarCita(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.MODIFICAR_CITA:
            await this.handleModificarCita(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.CANCELAR_CITA:
            await this.handleCancelarCita(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.CONFIRMAR_RESULTADO_CITA:
            await this.handleConfirmarResultadoCita(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.VER_AGENDA:
            await this.handleVerAgenda(phone, providerProfileId, tz);
            break;

          case AiIntent.VER_INGRESOS_PROYECTADOS:
            await this.handleVerIngresosProyectados(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.CONFIRMAR_CLIENTE:
            this.logger.log('Intent: confirmar_cliente');
            await this.sendAndRecord(phone, aiResponse.message, aiResponse.intent);
            break;

          case AiIntent.CREAR_RECORDATORIO:
            await this.handleCrearRecordatorio(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.VER_RECORDATORIOS:
            await this.handleVerRecordatorios(phone, providerProfileId, tz);
            break;

          case AiIntent.MODIFICAR_RECORDATORIO:
            await this.handleModificarRecordatorio(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.CANCELAR_RECORDATORIO:
            await this.handleCancelarRecordatorio(phone, aiResponse.data, providerProfileId, tz);
            break;

          case AiIntent.COMPLETAR_RECORDATORIO:
            await this.handleCompletarRecordatorio(phone, aiResponse.data, providerProfileId);
            break;

          case AiIntent.CONFIGURAR_PERFIL:
            await this.handleConfigurarPerfil(phone, aiResponse, providerProfileId);
            break;

          case AiIntent.CREAR_LINK_COBRO:
            await this.handleCrearLinkCobro(phone, aiResponse.data, providerProfileId);
            break;

          case AiIntent.ACTIVAR_COBROS:
            await this.handleActivarCobros(phone, providerProfileId);
            break;

          case AiIntent.CONFIGURAR_ZONA_HORARIA:
            tz = await this.handleConfigurarZonaHoraria(
              phone,
              aiResponse.data,
              providerProfileId,
              tz,
              workspaceContext?.timezoneConfirmed ?? false,
            );
            break;

          default:
            await this.sendAndRecord(phone, aiResponse.message, aiResponse.intent);
            break;
        }
      }

      if (providerProfileId) {
        const dataMutatingIntents = [
          AiIntent.REGISTRAR_INGRESO,
          AiIntent.REGISTRAR_GASTO,
          AiIntent.GESTIONAR_GASTO,
          AiIntent.GESTIONAR_GASTO_RECURRENTE,
          AiIntent.AGENDAR_CITA,
          AiIntent.MODIFICAR_CITA,
          AiIntent.CANCELAR_CITA,
          AiIntent.CONFIRMAR_RESULTADO_CITA,
          AiIntent.CREAR_RECORDATORIO,
          AiIntent.MODIFICAR_RECORDATORIO,
          AiIntent.CANCELAR_RECORDATORIO,
          AiIntent.COMPLETAR_RECORDATORIO,
          AiIntent.CREAR_LINK_COBRO,
          AiIntent.ACTIVAR_COBROS,
        ];
        const hasMutation = firewalled.some((r) =>
          dataMutatingIntents.includes(r.intent),
        );
        if (hasMutation) {
          this.providerModelService.invalidate(providerProfileId).catch(() => {});
        }

        this.maybeExtractLearnedFacts(phone, providerProfileId, workspaceContext)
          .catch((err) =>
            this.logger.warn(`Learned facts extraction failed: ${err.message}`),
          );
      }
    } catch (error: any) {
      this.logger.error(`AI conversation error: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '🤔 Hubo un problema procesando tu mensaje. Intenta de nuevo o escribe *"menu"* para ver opciones.',
      );
    }
  }

  /**
   * Send a WhatsApp message AND record it in the AI conversation history,
   * so the LLM knows what response the user actually received.
   */
  private async sendAndRecord(
    phone: string,
    message: string,
    intent?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const clean = sanitizeForWhatsApp(message);
    await this.whatsapp.sendTextMessage(phone, clean);
    await this.aiContextService.addMessage(
      phone,
      'assistant',
      clean,
      intent,
      metadata,
    );
  }

  /**
   * Send a financial confirmation and emit the `financial_confirmation_sent`
   * audit event (Cap. 45 — M0). The same payload is persisted in
   * ConversationLog.metadata so the integrity endpoint can join the chain.
   */
  private async sendFinancialConfirmation(
    phone: string,
    message: string,
    intent: string,
    audit: FinancialAuditPayload,
  ): Promise<void> {
    emitFinancialEvent(this.logger, audit);
    await this.sendAndRecord(
      phone,
      message,
      intent,
      buildFinancialMetadata(audit),
    );
  }

  // ─── Workspace: configurar perfil ───────────────────────

  private async handleConfigurarPerfil(
    phone: string,
    aiResponse: { message: string; data?: Record<string, any> },
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const configData = aiResponse.data as WorkspaceConfigData | undefined;
    if (!configData?.action) {
      await this.sendAndRecord(phone, aiResponse.message);
      return;
    }

    const result = await this.workspaceService.applyConfig(
      providerProfileId,
      configData,
    );
    await this.sendAndRecord(phone, result.confirmationMessage);
  }

  // ─── Income: registrar ingreso ──────────────────────────

  private async handleRegistrarIngreso(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
    srcHash?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const amount = data?.amount;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      await this.sendAndRecord(
        phone,
        '🤔 No pude detectar el monto. ¿Podrías decirme cuánto cobraste?\n\nEjemplo: *"Cobré 1,200 pesos en efectivo"*',
      );
      return;
    }

    const validMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'OTHER'];
    const paymentMethod = validMethods.includes(data?.paymentMethod)
      ? (data.paymentMethod as PaymentMethod)
      : PaymentMethod.CASH;

    const parsedDate = data?.date
      ? this.appointmentsService.parseScheduledDate(data.date, undefined, tz)
      : null;

    try {
      const created = await this.incomeService.create({
        providerId: providerProfileId,
        amount,
        description: data?.description,
        paymentMethod,
        clientName: data?.clientName,
        date: parsedDate ?? undefined,
        sourceTextHash: srcHash,
      });

      let confirmation = this.incomeService.formatIncomeConfirmation(
        amount,
        data?.description,
        data?.clientName,
        paymentMethod,
      );

      try {
        const weekSummary = await this.incomeService.getWeekSummary(providerProfileId);
        if (weekSummary.count > 1 && weekSummary.total > 0) {
          confirmation += `\nLlevas *$${weekSummary.total.toLocaleString('es-MX')}* esta semana.`;
        }
      } catch {
        // non-critical enrichment
      }

      await this.sendFinancialConfirmation(
        phone,
        confirmation,
        AiIntent.REGISTRAR_INGRESO,
        {
          event: FINANCIAL_EVENT.CONFIRMATION_SENT,
          kind: 'income',
          providerId: providerProfileId,
          providerPhone: phone,
          amount,
          recordId: created.id,
          sourceTextHash: srcHash,
        },
      );
    } catch (error: any) {
      this.logger.error(`Error creating income: ${error.message}`);
      await this.sendAndRecord(
        phone,
        '❌ No se pudo registrar el ingreso. Intenta de nuevo.',
      );
    }
  }

  // ─── Stripe Connect: activar cobros ─────────────────────

  private async handleActivarCobros(
    phone: string,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    try {
      const status = await this.paymentsService.getProviderStripeStatus(providerProfileId);

      if (status?.stripeOnboardingStatus === 'ACTIVE') {
        await this.sendAndRecord(
          phone,
          '✅ Tu cuenta de cobros ya está activa. Puedes generar links diciendo por ejemplo: *"Cóbrale 1,200 al señor Ramírez"*',
          AiIntent.ACTIVAR_COBROS,
        );
        return;
      }

      const result = await this.paymentsService.createConnectedAccount(providerProfileId);

      await this.sendAndRecord(
        phone,
        `🏦 *Activa tus cobros con link*\n\n` +
        `Registra tu cuenta bancaria en este formulario seguro de Stripe (~5 min):\n\n` +
        `🔗 ${result.url}\n\n` +
        `Una vez que lo completes, podrás cobrarle a tus clientes con tarjeta, OXXO o SPEI.`,
        AiIntent.ACTIVAR_COBROS,
      );
    } catch (error: any) {
      this.logger.error(`Error creating connected account: ${error.message}`);

      if (error.message === 'Stripe is not configured') {
        await this.sendAndRecord(
          phone,
          '⚠️ Los cobros con link aún no están habilitados. Estamos configurando el sistema.',
        );
      } else if (error.message === 'Provider already has an active Stripe account') {
        await this.sendAndRecord(
          phone,
          '✅ Tu cuenta de cobros ya está activa. Puedes generar links diciendo por ejemplo: *"Cóbrale 1,200 al señor Ramírez"*',
          AiIntent.ACTIVAR_COBROS,
        );
      } else {
        await this.sendAndRecord(
          phone,
          '❌ No se pudo configurar tu cuenta de cobros. Intenta de nuevo.',
        );
      }
    }
  }

  // ─── Timezone configuration ──────────────────────────────

  private async handleConfigurarZonaHoraria(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    oldTz: string = DEFAULT_TIMEZONE,
    oldConfirmed: boolean = false,
  ): Promise<string> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return DEFAULT_TIMEZONE;
    }

    const input = data?.timezone;
    if (!input) {
      await this.sendAndRecord(
        phone,
        '🤔 ¿En qué ciudad o zona horaria estás?\n\nEjemplo: *"Estoy en Miami"* o *"Mi zona es Tijuana"*',
      );
      return oldTz;
    }

    const resolved = resolveTimezone(input);
    if (!resolved) {
      await this.sendAndRecord(
        phone,
        `🤔 No reconozco "${input}" como zona horaria. Prueba con el nombre de tu ciudad.\n\nEjemplos: *Miami*, *Tijuana*, *CDMX*, *Chihuahua*`,
      );
      return oldTz;
    }

    try {
      const result = await this.workspaceService.setTimezone(
        providerProfileId,
        resolved,
        'user_mention',
      );
      if (!result.success) {
        await this.sendAndRecord(phone, `❌ ${result.message}`);
        return oldTz;
      }

      // Cap. 46 — wall-clock migration only on the safe path:
      // workspace was on the seed default and never confirmed, and the
      // timezone actually changes. Confirmed→confirmed swaps are
      // intentionally NOT migrated automatically (V0).
      const migrationSummary = await this.migrateFutureIfFromDefault(
        providerProfileId,
        oldTz,
        resolved,
        oldConfirmed,
        phone,
      );

      const label = getTimezoneLabel(resolved);
      const baseMsg = `🕐 *Zona horaria configurada:* ${label}\n\nTodas tus citas, recordatorios y briefings ahora usan esta hora.`;
      await this.sendAndRecord(
        phone,
        migrationSummary ? `${baseMsg}\n\n${migrationSummary}` : baseMsg,
        AiIntent.CONFIGURAR_ZONA_HORARIA,
      );
      return resolved;
    } catch (error: any) {
      this.logger.error(`Error setting timezone: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo configurar la zona horaria. Intenta de nuevo.');
      return oldTz;
    }
  }

  // ─── Cap. 46 — Timezone Confidence System gate ──────────

  /**
   * Returns true when the post-AI gate should fire: workspace is sitting
   * on the seed default, never confirmed, the phone is not Mexican, and
   * at least one of the LLM's tool calls is a date/time intent that
   * would create or move a scheduled item.
   */
  private shouldGateForRiskyDefault(
    phone: string,
    workspaceContext:
      | { timezone?: string; timezoneConfirmed?: boolean }
      | undefined,
    responses: AiResponse[],
  ): boolean {
    if (!workspaceContext) return false;
    if (isMexicanPhone(phone)) return false;
    if (workspaceContext.timezone && workspaceContext.timezone !== DEFAULT_TIMEZONE) {
      return false;
    }
    if (workspaceContext.timezoneConfirmed) return false;
    return responses.some((r) => TIMEZONE_GATE_INTENTS.has(r.intent));
  }

  private async openTimezoneGate(phone: string, rawText: string): Promise<void> {
    await this.setPendingTimezone(phone, {
      rawText,
      attempts: 0,
      createdAt: Date.now(),
    });
    await this.sendAndRecord(
      phone,
      `🤔 Antes de agendar, dime: ¿en qué *ciudad o país* trabajas normalmente? ` +
        `Es para que la hora quede correcta.\n\n` +
        `_(O escribe *luego* y seguimos con hora de México por ahora.)_`,
    );
  }

  /**
   * Pre-AI handler — runs before the LLM on every turn. If a pending
   * timezone question is open, this incoming message is treated as the
   * answer. Resolves, retries once, or marks the prompt as skipped.
   * Returns true when it took ownership of the turn (caller bails).
   */
  private async tryHandlePendingTimezone(
    phone: string,
    text: string,
    providerProfileId: string,
    providerName: string,
  ): Promise<boolean> {
    const pending = await this.getPendingTimezone(phone);
    if (!pending) return false;

    const trimmed = text.trim();

    if (isTimezoneSkipPhrase(trimmed) || pending.attempts >= MAX_PENDING_TZ_ATTEMPTS) {
      await this.workspaceService.markTimezonePromptSkipped(providerProfileId);
      await this.clearPendingTimezone(phone);
      await this.sendAndRecord(
        phone,
        `Va. Por ahora dejo *Ciudad de México* como referencia. ` +
          `Cuando quieras cambiarla, dime *"estoy en X"*.`,
      );
      return true;
    }

    const resolved = resolveTimezone(trimmed);
    if (!resolved) {
      pending.attempts += 1;
      await this.setPendingTimezone(phone, pending);
      await this.sendAndRecord(
        phone,
        `Esa no la conozco. Dime tu ciudad — *Amsterdam*, *Miami*, *Madrid*, *Bogotá*, lo que sea.\n\n` +
          `_(O escribe *luego* si prefieres dejarlo para después.)_`,
      );
      return true;
    }

    // Read old state BEFORE setting, so we know whether to migrate.
    const wsCtx = await this.workspaceService
      .getWorkspaceContext(providerProfileId)
      .catch(() => null);
    const oldTz = wsCtx?.timezone ?? DEFAULT_TIMEZONE;
    const oldConfirmed = wsCtx?.timezoneConfirmed ?? false;

    const result = await this.workspaceService.setTimezone(
      providerProfileId,
      resolved,
      'phone_risk_prompt',
    );
    if (!result.success) {
      pending.attempts += 1;
      await this.setPendingTimezone(phone, pending);
      await this.sendAndRecord(phone, `${result.message}\n\nIntenta con otra ciudad.`);
      return true;
    }

    await this.clearPendingTimezone(phone);

    const migrationSummary = await this.migrateFutureIfFromDefault(
      providerProfileId,
      oldTz,
      resolved,
      oldConfirmed,
      phone,
    );

    const label = getTimezoneLabel(resolved);
    const baseMsg = `🕐 Listo. Tu zona quedó como *${label}*.`;
    await this.sendAndRecord(
      phone,
      migrationSummary ? `${baseMsg}\n\n${migrationSummary}` : baseMsg,
    );

    // Replay the original raw text exactly once. The pending key is
    // already cleared and timezoneConfirmed is now true, so neither the
    // pre-AI handler nor the post-AI gate will fire on this re-call —
    // there is no infinite loop.
    await this.handleAiConversation(phone, pending.rawText, providerName);
    return true;
  }

  /**
   * Run wall-clock migration if and only if the previous workspace
   * state was the seed default and never confirmed (Cap. 46 V0). Returns
   * a short user-facing summary, or null when no migration ran.
   */
  private async migrateFutureIfFromDefault(
    providerProfileId: string,
    oldTz: string,
    newTz: string,
    oldConfirmed: boolean,
    providerPhone: string,
  ): Promise<string | null> {
    if (oldConfirmed) return null;
    if (oldTz !== DEFAULT_TIMEZONE) return null;
    if (oldTz === newTz) return null;

    try {
      const result = await this.timezoneMigrationService.migrateFutureWallClock(
        providerProfileId,
        oldTz,
        newTz,
        providerPhone,
      );
      if (result.appointmentsMigrated === 0 && result.remindersMigrated === 0) {
        return null;
      }
      const parts: string[] = [];
      if (result.appointmentsMigrated > 0) {
        parts.push(`${result.appointmentsMigrated} cita${result.appointmentsMigrated === 1 ? '' : 's'}`);
      }
      if (result.remindersMigrated > 0) {
        parts.push(`${result.remindersMigrated} recordatorio${result.remindersMigrated === 1 ? '' : 's'}`);
      }
      return `Reajusté ${parts.join(' y ')} para que mantengan la hora local.`;
    } catch (err: any) {
      this.logger.error(
        `Wall-clock migration failed for ${providerProfileId}: ${err.message}`,
      );
      return null;
    }
  }

  // ─── Payment Links: crear link de cobro ─────────────────

  private async handleCrearLinkCobro(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const stripeStatus = await this.paymentsService.getProviderStripeStatus(providerProfileId);
    if (stripeStatus?.stripeOnboardingStatus !== 'ACTIVE') {
      await this.sendAndRecord(
        phone,
        'Para cobrar con link necesitas activar tu cuenta primero.\n\nDime *"activar cobros"* y te mando el link para configurarla (~5 min).',
        AiIntent.CREAR_LINK_COBRO,
      );
      return;
    }

    const amount = data?.amount;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      await this.sendAndRecord(
        phone,
        '🤔 No pude detectar el monto. ¿Cuánto quieres cobrar?\n\nEjemplo: *"Cóbrale 1,200 al señor Ramírez por instalación eléctrica"*',
      );
      return;
    }

    const sanitize = (val: any): string | undefined => {
      if (!val || typeof val !== 'string') return undefined;
      const trimmed = val.trim();
      return JUNK_CLIENT_NAMES.has(trimmed.toLowerCase()) ? undefined : trimmed;
    };

    const description = sanitize(data?.description);
    const clientName = sanitize(data?.clientName);
    const clientPhone = sanitize(data?.clientPhone);

    try {
      const paymentLink = await this.paymentsService.createPaymentLink({
        providerId: providerProfileId,
        amount,
        description,
        clientName,
        clientPhone,
      });

      const amountFormatted = amount.toLocaleString('es-MX');
      const url = paymentLink.stripePaymentUrl;

      if (clientPhone) {
        const clientMsg =
          `Hola${clientName ? ` ${clientName}` : ''}, te envío el link para pagar *$${amountFormatted}*` +
          `${description ? ` por ${description}` : ''}.\n\n` +
          `💳 Paga aquí: ${url}\n\n` +
          `Puedes pagar con tarjeta, OXXO o transferencia SPEI.`;

        await this.whatsapp
          .sendTextMessage(clientPhone, clientMsg)
          .catch((err) =>
            this.logger.error(
              `Failed to send payment link to client ${clientPhone}: ${err.message}`,
            ),
          );
      }

      let confirmation =
        `✅ *Link de cobro generado*\n\n` +
        `💰 *$${amountFormatted}*`;
      if (description) confirmation += `\n📝 ${description}`;
      if (clientName) confirmation += `\n👤 ${clientName}`;
      confirmation += `\n\n🔗 ${url}`;

      if (clientPhone) {
        confirmation += `\n\n📲 Ya se lo envié a ${clientName || clientPhone} por WhatsApp.`;
      } else {
        confirmation += `\n\nEnvíale este link a tu cliente para que pueda pagar con tarjeta, OXXO o SPEI.`;
      }

      await this.sendAndRecord(phone, confirmation, AiIntent.CREAR_LINK_COBRO);
    } catch (error: any) {
      this.logger.error(`Error creating payment link: ${error.message}`);

      if (error.message === 'Stripe is not configured') {
        await this.sendAndRecord(
          phone,
          '⚠️ Los links de cobro aún no están habilitados. Estamos configurando el sistema de pagos.',
        );
      } else {
        await this.sendAndRecord(
          phone,
          '❌ No se pudo generar el link de cobro. Intenta de nuevo.',
        );
      }
    }
  }

  // ─── Expense: registrar gasto ───────────────────────────

  private async handleRegistrarGasto(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
    srcHash?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const amount = data?.amount;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      await this.sendAndRecord(
        phone,
        '🤔 No pude detectar el monto. ¿Podrías decirme cuánto gastaste?\n\nEjemplo: *"Gasté 200 en material"*',
      );
      return;
    }

    const parsedDate = data?.date
      ? this.appointmentsService.parseScheduledDate(data.date, undefined, tz)
      : null;

    try {
      const created = await this.expenseService.create({
        providerId: providerProfileId,
        amount,
        category: data?.category,
        description: data?.description,
        date: parsedDate ?? undefined,
        sourceTextHash: srcHash,
      });

      const confirmation = this.expenseService.formatExpenseConfirmation(
        amount,
        data?.category,
        data?.description,
      );

      await this.sendFinancialConfirmation(
        phone,
        confirmation,
        AiIntent.REGISTRAR_GASTO,
        {
          event: FINANCIAL_EVENT.CONFIRMATION_SENT,
          kind: 'expense',
          providerId: providerProfileId,
          providerPhone: phone,
          amount,
          recordId: created.id,
          sourceTextHash: srcHash,
        },
      );
    } catch (error: any) {
      this.logger.error(`Error creating expense: ${error.message}`);
      await this.sendAndRecord(
        phone,
        '❌ No se pudo registrar el gasto. Intenta de nuevo.',
      );
    }
  }

  // ─── Expense: gestionar gasto (borrar/editar) ──────────

  private async handleGestionarGasto(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const action = data?.action;

    if (action === 'delete_last') {
      try {
        const deleted = await this.expenseService.deleteLast(providerProfileId);
        if (deleted) {
          const desc = deleted.description || deleted.category || 'Sin descripción';
          await this.sendAndRecord(
            phone,
            `🗑️ *Gasto eliminado:*\n\n💸 $${Number(deleted.amount).toLocaleString('es-MX')} — ${desc}`,
          );
        } else {
          await this.sendAndRecord(
            phone,
            '🤔 No tienes gastos registrados para borrar.',
          );
        }
      } catch (error: any) {
        this.logger.error(`Error deleting last expense: ${error.message}`);
        await this.sendAndRecord(phone, '❌ No se pudo borrar el gasto. Intenta de nuevo.');
      }
      return;
    }

    if (action === 'delete_by_description') {
      const description = data?.description;
      if (!description) {
        await this.sendAndRecord(
          phone,
          '🤔 ¿Cuál gasto quieres borrar? Dime la descripción.\n\nEjemplo: *"Borra el gasto de material"*',
        );
        return;
      }

      try {
        let deleted = await this.expenseService.deleteByDescription(providerProfileId, description);

        if (!deleted) {
          const recent = await this.expenseService.getRecent(providerProfileId, 10);
          const options = recent
            .map((e) => e.description || e.category)
            .filter((d): d is string => !!d);

          if (options.length > 0) {
            const matched = await this.aiService.matchToList(description, options);
            if (matched) {
              deleted = await this.expenseService.deleteByDescription(providerProfileId, matched);
            }
          }
        }

        if (deleted) {
          const desc = deleted.description || deleted.category || 'Sin descripción';
          await this.sendAndRecord(
            phone,
            `🗑️ *Gasto eliminado:*\n\n💸 $${Number(deleted.amount).toLocaleString('es-MX')} — ${desc}`,
          );
        } else {
          await this.sendAndRecord(
            phone,
            `🤔 No encontré un gasto con "${description}". Escribe *"¿cómo voy?"* para ver tus gastos recientes.`,
          );
        }
      } catch (error: any) {
        this.logger.error(`Error deleting expense by description: ${error.message}`);
        await this.sendAndRecord(phone, '❌ No se pudo borrar el gasto. Intenta de nuevo.');
      }
      return;
    }

    if (action === 'edit_last') {
      const amount = data?.amount;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        await this.sendAndRecord(
          phone,
          '🤔 ¿A cuánto quieres corregir el último gasto?\n\nEjemplo: *"El último gasto era 300, no 200"*',
        );
        return;
      }

      try {
        const result = await this.expenseService.editLast(providerProfileId, { amount });
        if (result) {
          const desc = result.previous.description || result.previous.category || 'Sin descripción';
          await this.sendAndRecord(
            phone,
            `✏️ *Gasto corregido:*\n\n` +
            `💸 $${Number(result.previous.amount).toLocaleString('es-MX')} → *$${amount.toLocaleString('es-MX')}*\n` +
            `📝 ${desc}`,
          );
        } else {
          await this.sendAndRecord(
            phone,
            '🤔 No tienes gastos registrados para editar.',
          );
        }
      } catch (error: any) {
        this.logger.error(`Error editing last expense: ${error.message}`);
        await this.sendAndRecord(phone, '❌ No se pudo editar el gasto. Intenta de nuevo.');
      }
      return;
    }

    await this.sendAndRecord(
      phone,
      '🤔 No entendí qué quieres hacer con el gasto. Puedes:\n\n' +
      '• *"Borra el último gasto"*\n' +
      '• *"Borra el gasto de material"*\n' +
      '• *"El último gasto era 300, no 200"*',
    );
  }

  // ─── Recurring Expense: gestionar gasto recurrente ──────

  private async handleGastoRecurrente(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const action = data?.action;

    if (action === 'list') {
      const expenses = await this.recurringExpenseService.listActive(providerProfileId);
      const msg = this.recurringExpenseService.formatRecurringList(expenses);
      await this.sendAndRecord(phone, msg);
      return;
    }

    if (action === 'cancel') {
      const description = data?.description;
      const cancelDay = data?.dayOfMonth as number | undefined;

      if (!description) {
        await this.sendAndRecord(
          phone,
          '🤔 ¿Cuál gasto recurrente quieres cancelar? Dime el nombre.',
        );
        return;
      }

      let cancelled = await this.recurringExpenseService.cancel(
        providerProfileId,
        description,
        cancelDay,
      );

      if (!cancelled) {
        // Check if failure is due to ambiguity (multiple expenses with same name)
        const ambiguousMatches = await this.recurringExpenseService.findMatchesByDescription(
          providerProfileId,
          description,
        );

        if (ambiguousMatches.length > 1) {
          const lines = ambiguousMatches.map((e) => {
            const freq = e.frequency === 'monthly' ? 'mensual' : 'semanal';
            const day = e.dayOfMonth ? `día ${e.dayOfMonth}` : '';
            return `  💸 *$${Number(e.amount).toLocaleString('es-MX')}* — ${e.description} (${freq}, ${day})`;
          });
          await this.sendAndRecord(
            phone,
            `🤔 Tienes *${ambiguousMatches.length}* gastos con "${description}". ¿Cuál quieres cancelar?\n\n${lines.join('\n')}\n\nDime el día, por ejemplo: *"Cancela ${description} del día ${ambiguousMatches[0].dayOfMonth}"*`,
          );
          return;
        }

        // Not ambiguous — try LLM fuzzy match against all active expenses
        const active = await this.recurringExpenseService.listActive(providerProfileId);
        const options = active.map((e) => e.description);
        if (options.length > 0) {
          const matched = await this.aiService.matchToList(description, options);
          if (matched) {
            cancelled = await this.recurringExpenseService.cancel(providerProfileId, matched, cancelDay);
          }
        }
      }

      if (cancelled) {
        const dayInfo = cancelled.dayOfMonth ? ` (día ${cancelled.dayOfMonth})` : '';
        await this.sendAndRecord(
          phone,
          `✅ Cancelé el gasto recurrente de *${cancelled.description}*${dayInfo}.`,
        );
      } else {
        await this.sendAndRecord(
          phone,
          `🤔 No encontré un gasto recurrente activo con "${description}". Escribe *"mis gastos fijos"* para ver los que tienes.`,
        );
      }
      return;
    }

    if (action === 'update' || action === 'modify' || action === 'change' || action === 'edit') {
      const description = data?.description;
      if (!description) {
        await this.sendAndRecord(
          phone,
          '🤔 ¿Cuál gasto recurrente quieres modificar? Dime el nombre.',
        );
        return;
      }

      const updates: { amount?: number; frequency?: string; dayOfMonth?: number } = {};
      if (data?.amount && typeof data.amount === 'number' && data.amount > 0) updates.amount = data.amount;
      if (data?.frequency) updates.frequency = data.frequency;
      if (data?.dayOfMonth && typeof data.dayOfMonth === 'number') updates.dayOfMonth = data.dayOfMonth;

      if (Object.keys(updates).length === 0) {
        await this.sendAndRecord(
          phone,
          '🤔 ¿Qué quieres cambiar? Puedes modificar el monto, la frecuencia o el día.\n\nEjemplo: *"Cambia el gasto de Railway al día 15"*',
        );
        return;
      }

      let updated = await this.recurringExpenseService.update(
        providerProfileId,
        description,
        updates,
      );

      if (!updated) {
        // Check if failure is due to ambiguity (multiple expenses with same name)
        const ambiguousMatches = await this.recurringExpenseService.findMatchesByDescription(
          providerProfileId,
          description,
        );

        if (ambiguousMatches.length > 1) {
          const lines = ambiguousMatches.map((e) => {
            const freq = e.frequency === 'monthly' ? 'mensual' : 'semanal';
            const day = e.dayOfMonth ? `día ${e.dayOfMonth}` : '';
            return `  💸 *$${Number(e.amount).toLocaleString('es-MX')}* — ${e.description} (${freq}, ${day})`;
          });
          await this.sendAndRecord(
            phone,
            `🤔 Tienes *${ambiguousMatches.length}* gastos con "${description}". ¿Cuál quieres modificar?\n\n${lines.join('\n')}\n\nDime el día, por ejemplo: *"Modifica ${description} del día ${ambiguousMatches[0].dayOfMonth}"*`,
          );
          return;
        }

        // Not ambiguous — try LLM fuzzy match against all active expenses
        const active = await this.recurringExpenseService.listActive(providerProfileId);
        const options = active.map((e) => e.description);
        if (options.length > 0) {
          const matched = await this.aiService.matchToList(description, options);
          if (matched) {
            updated = await this.recurringExpenseService.update(providerProfileId, matched, updates);
          }
        }
      }

      if (updated) {
        const changes: string[] = [];
        if (updates.amount) changes.push(`monto: *$${updates.amount.toLocaleString('es-MX')}*`);
        if (updates.frequency) changes.push(`frecuencia: *${updates.frequency === 'monthly' ? 'mensual' : 'semanal'}*`);
        if (updates.dayOfMonth) changes.push(`día: *${updates.dayOfMonth}*`);

        await this.sendAndRecord(
          phone,
          `✅ Actualicé el gasto de *${description}*:\n${changes.join('\n')}`,
        );
      } else {
        await this.sendAndRecord(
          phone,
          `🤔 No encontré un gasto recurrente activo con "${description}". Escribe *"mis gastos fijos"* para ver los que tienes.`,
        );
      }
      return;
    }

    if (action === 'create') {
      const amount = data?.amount;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        await this.sendAndRecord(
          phone,
          '🤔 No pude detectar el monto. ¿Cuánto es el gasto recurrente?\n\nEjemplo: *"Gasto fijo de 500 de Railway cada mes"*',
        );
        return;
      }

      const description = data?.description || 'Gasto recurrente';

      try {
        const recurring = await this.recurringExpenseService.create({
          providerId: providerProfileId,
          amount,
          category: data?.category,
          description,
          frequency: data?.frequency || 'monthly',
          dayOfMonth: data?.dayOfMonth,
        });

        const freq = recurring.frequency === 'monthly' ? 'mensual' : 'semanal';
        const day = recurring.frequency === 'monthly' && recurring.dayOfMonth
          ? ` (día ${recurring.dayOfMonth})`
          : '';

        await this.sendAndRecord(
          phone,
          `✅ *¡Gasto recurrente creado!*\n\n💸 *$${amount.toLocaleString('es-MX')}* — ${description}\n🔄 ${freq}${day}\n\nSe registrará automáticamente cada ${freq === 'mensual' ? 'mes' : 'semana'}. Para cancelarlo, dime *"cancela el gasto de ${description}"*.`,
        );
      } catch (error: any) {
        this.logger.error(`Error creating recurring expense: ${error.message}`);
        await this.sendAndRecord(
          phone,
          '❌ No se pudo crear el gasto recurrente. Intenta de nuevo.',
        );
      }
      return;
    }

    await this.sendAndRecord(
      phone,
      '🤔 No entendí qué quieres hacer con gastos recurrentes. Puedes:\n\n• *Crear*: "Gasto fijo de 500 de renta"\n• *Ver*: "Mis gastos fijos"\n• *Modificar*: "Cambia el gasto de Railway al día 15"\n• *Cancelar*: "Cancela el gasto de Netflix"',
    );
  }

  // ─── Income: ver resumen ────────────────────────────────

  private async handleVerResumen(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const period = data?.period?.toLowerCase().trim();
    const dateRange = period ? this.parsePeriodToDateRange(period, tz) : null;

    if (dateRange) {
      // Custom period: single query for the specified range
      const [incomeR, expenseR] = await Promise.allSettled([
        this.incomeService.getCustomSummary(providerProfileId, dateRange.from, dateRange.to, dateRange.label),
        this.expenseService.getCustomSummary(providerProfileId, dateRange.from, dateRange.to, dateRange.label),
      ]);

      if (incomeR.status === 'rejected' && expenseR.status === 'rejected') {
        this.logger.error(`Custom summary failed for ${providerProfileId}: ${(incomeR as PromiseRejectedResult).reason?.message}`);
        await this.sendAndRecord(phone, 'No pude leer tus números en este momento. Intenta en un minuto.');
        return;
      }

      let msg = '';
      if (incomeR.status === 'fulfilled') {
        msg += this.incomeService.formatSummaryMessage(incomeR.value);
      }
      if (expenseR.status === 'fulfilled' && expenseR.value.count > 0) {
        msg += `\n${this.expenseService.formatExpenseSummaryMessage(expenseR.value)}`;
        if (incomeR.status === 'fulfilled') {
          const net = incomeR.value.total - expenseR.value.total;
          msg += `\n💰 *Balance ${dateRange.label}: $${net.toLocaleString('es-MX')}*`;
        }
      }

      await this.sendAndRecord(phone, msg || `No hay datos ${dateRange.label}.`);
      return;
    }

    // Default: week + month (original behavior)
    const [weekIncomeR, monthIncomeR, weekExpenseR, monthExpenseR] = await Promise.allSettled([
      this.incomeService.getWeekSummary(providerProfileId, tz),
      this.incomeService.getMonthSummary(providerProfileId, tz),
      this.expenseService.getWeekSummary(providerProfileId, tz),
      this.expenseService.getMonthSummary(providerProfileId, tz),
    ]);

    const logIfRejected = (label: string, r: PromiseSettledResult<any>) => {
      if (r.status === 'rejected') {
        this.logger.error(
          `${label} failed (provider=${providerProfileId}, tz=${tz}): ${r.reason?.message}\n${r.reason?.stack}`,
        );
      }
    };
    logIfRejected('getWeekSummary(income)', weekIncomeR);
    logIfRejected('getMonthSummary(income)', monthIncomeR);
    logIfRejected('getWeekSummary(expense)', weekExpenseR);
    logIfRejected('getMonthSummary(expense)', monthExpenseR);

    const allFailed =
      weekIncomeR.status === 'rejected' &&
      monthIncomeR.status === 'rejected' &&
      weekExpenseR.status === 'rejected' &&
      monthExpenseR.status === 'rejected';

    if (allFailed) {
      await this.sendAndRecord(
        phone,
        'No pude leer tus números en este momento. Ya quedó registrado el error — intenta en un minuto.',
      );
      return;
    }

    const parts: string[] = [];

    if (weekIncomeR.status === 'fulfilled') {
      let weekBlock = this.incomeService.formatSummaryMessage(weekIncomeR.value);
      if (weekExpenseR.status === 'fulfilled' && weekExpenseR.value.count > 0) {
        weekBlock += `\n${this.expenseService.formatExpenseSummaryMessage(weekExpenseR.value)}`;
        const weekNet = weekIncomeR.value.total - weekExpenseR.value.total;
        weekBlock += `\n💰 *Balance semana: $${weekNet.toLocaleString('es-MX')}*`;
      }
      parts.push(weekBlock);
    }

    if (monthIncomeR.status === 'fulfilled') {
      let monthBlock = this.incomeService.formatSummaryMessage(monthIncomeR.value);
      if (monthExpenseR.status === 'fulfilled' && monthExpenseR.value.count > 0) {
        monthBlock += `\n${this.expenseService.formatExpenseSummaryMessage(monthExpenseR.value)}`;
        const monthNet = monthIncomeR.value.total - monthExpenseR.value.total;
        monthBlock += `\n💰 *Balance mes: $${monthNet.toLocaleString('es-MX')}*`;
      }
      parts.push(monthBlock);
    }

    try {
      await this.sendAndRecord(phone, parts.join('\n\n'));
    } catch (error: any) {
      this.logger.error(
        `Failed to send summary to ${phone}: ${error.message}\n${error.stack}`,
      );
    }
  }

  /**
   * Parse a human-readable period string into a { from, to, label } date range.
   * Returns null if the period can't be parsed (falls back to default week+month).
   */
  private parsePeriodToDateRange(
    period: string,
    tz: string,
  ): { from: Date; to: Date; label: string } | null {
    const now = toLocalTime(new Date(), tz);

    if (period === 'hoy') {
      const range = getLocalDayRange(tz);
      return { from: range.start, to: range.end, label: 'hoy' };
    }

    if (period === 'ayer') {
      const yesterday = new Date(now.getTime() - 86400000);
      const range = getLocalDayRange(tz, yesterday);
      return { from: range.start, to: range.end, label: 'ayer' };
    }

    if (period === 'antier') {
      const dayBeforeYesterday = new Date(now.getTime() - 2 * 86400000);
      const range = getLocalDayRange(tz, dayBeforeYesterday);
      return { from: range.start, to: range.end, label: 'antier' };
    }

    if (period.includes('semana pasada') || period.includes('semana anterior')) {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + mondayOffset);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      lastSunday.setHours(23, 59, 59, 999);
      lastMonday.setHours(0, 0, 0, 0);
      return { from: lastMonday, to: lastSunday, label: 'la semana pasada' };
    }

    if (period.includes('mes pasado') || period.includes('mes anterior')) {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to, label: 'el mes pasado' };
    }

    // Named months: "marzo", "enero 2026"
    const monthNames: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    };
    const monthMatch = period.match(/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(\d{4}))?$/);
    if (monthMatch) {
      const month = monthNames[monthMatch[1]];
      const year = monthMatch[2] ? parseInt(monthMatch[2]) : now.getFullYear();
      const from = new Date(year, month, 1);
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return { from, to, label: `${monthMatch[1]}${monthMatch[2] ? ' ' + monthMatch[2] : ''}` };
    }

    return null;
  }

  // ─── Appointments: agendar cita ─────────────────────────

  private async handleAgendarCita(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const scheduledAt = this.appointmentsService.parseScheduledDate(
      data?.date,
      data?.time,
      tz,
    );

    if (!scheduledAt) {
      await this.sendAndRecord(
        phone,
        '🤔 No pude detectar la fecha u hora de la cita. ¿Podrías ser más específico?\n\nEjemplo: *"Mañana a las 10 con la señora García en Condesa"*',
      );
      return;
    }

    const reminderMinutes = data?.reminderMinutes ? Number(data.reminderMinutes) : undefined;

    // Guard: if there's already an active appointment with the same client on the same day,
    // the LLM likely misclassified a modify request as a new appointment.
    // Auto-redirect to update instead of creating a duplicate.
    if (data?.clientName && !JUNK_CLIENT_NAMES.has(data.clientName.trim().toLowerCase())) {
      try {
        const existing = await this.appointmentsService.findByContext(
          providerProfileId, data.clientName, scheduledAt, tz,
        );
        if (existing.length > 0) {
          const target = existing[0];
          const oldTime = formatTime(target.scheduledAt, tz);
          const updates: import('../appointments/appointments.service').UpdateAppointmentDto = {
            scheduledAt,
          };
          if (data.address) updates.address = data.address;
          if (data.description) updates.description = data.description;
          if (reminderMinutes !== undefined) updates.reminderMinutes = reminderMinutes;

          const updated = await this.appointmentsService.update(target.id, updates);
          const newTime = formatTime(updated.scheduledAt, tz);
          let confirmation = `♻️ Ya tenías una cita con *${target.clientName}* a las *${oldTime}* — la moví a las *${newTime}*.`;

          if (updates.scheduledAt) {
            await this.cancelAppointmentFollowup(updated.id);
            this.scheduleAppointmentFollowup(
              updated.id, phone, updated.scheduledAt, updated.clientName ?? undefined, tz,
            );
          }
          if (reminderMinutes) {
            await this.cancelAppointmentReminder(updated.id);
            const scheduled = await this.scheduleAppointmentReminder(
              updated.id, phone, updated.scheduledAt, reminderMinutes, updated.clientName ?? undefined, tz,
            );
            if (scheduled) {
              confirmation += `\n\n🔔 Recordatorio reprogramado: *${reminderMinutes} minutos* antes.`;
            }
          }

          await this.sendAndRecord(phone, confirmation);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`Duplicate check failed, proceeding with create: ${err.message}`);
      }
    }

    try {
      const appointment = await this.appointmentsService.create({
        providerId: providerProfileId,
        clientName: data?.clientName,
        clientPhone: data?.clientPhone,
        description: data?.description,
        address: data?.address,
        scheduledAt,
        reminderMinutes,
        estimatedPrice: data?.estimatedPrice ? Number(data.estimatedPrice) : undefined,
      });

      let confirmation = this.appointmentsService.formatAppointmentConfirmation(
        scheduledAt,
        data?.clientName,
        data?.description,
        data?.address,
        tz,
        data?.estimatedPrice ? Number(data.estimatedPrice) : undefined,
      );

      if (data?.clientName && !JUNK_CLIENT_NAMES.has(data.clientName.trim().toLowerCase())) {
        try {
          const pastVisits = await this.prisma.appointment.count({
            where: {
              providerId: providerProfileId,
              clientName: { contains: data.clientName.trim(), mode: 'insensitive' },
              id: { not: appointment.id },
              status: { in: ['CONFIRMED', 'COMPLETED'] },
            },
          });

          if (pastVisits >= 2) {
            confirmation += `\nYa van *${pastVisits + 1} veces* con ${data.clientName}.`;
          }
        } catch {
          // non-critical enrichment
        }
      }

      if (reminderMinutes) {
        const scheduled = await this.scheduleAppointmentReminder(
          appointment.id, phone, scheduledAt, reminderMinutes, data?.clientName, tz,
        );
        if (scheduled) {
          confirmation += `\n\n🔔 Te recordaré *${reminderMinutes} minutos* antes.`;
        } else {
          confirmation += `\n\n⚠️ No pude programar el recordatorio de ${reminderMinutes} min — ya pasó ese momento.`;
        }
      }

      await this.sendAndRecord(phone, confirmation);

      this.scheduleAppointmentFollowup(
        appointment.id, phone, scheduledAt, data?.clientName, tz,
      );
    } catch (error: any) {
      this.logger.error(`Error creating appointment: ${error.message}`);
      await this.sendAndRecord(
        phone,
        '❌ No se pudo agendar la cita. Intenta de nuevo.',
      );
    }
  }

  // ─── Appointments: ver agenda ───────────────────────────

  private async handleVerAgenda(
    phone: string,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    // Resolve each half independently — if one query fails, still show the other.
    // Previously a single Promise.all + bare catch caused the entire response to
    // collapse into a generic canned error (Cap. 38, bug Oscar 16-abr).
    const today = await this.appointmentsService
      .getTodayAgenda(providerProfileId, tz)
      .then((appts) => ({ ok: true as const, appts }))
      .catch((err: any) => {
        this.logger.error(
          `getTodayAgenda failed (provider=${providerProfileId}, tz=${tz}): ${err.message}\n${err.stack}`,
        );
        return { ok: false as const, err };
      });

    const tomorrow = await this.appointmentsService
      .getTomorrowAgenda(providerProfileId, tz)
      .then((appts) => ({ ok: true as const, appts }))
      .catch((err: any) => {
        this.logger.error(
          `getTomorrowAgenda failed (provider=${providerProfileId}, tz=${tz}): ${err.message}\n${err.stack}`,
        );
        return { ok: false as const, err };
      });

    if (!today.ok && !tomorrow.ok) {
      await this.sendAndRecord(
        phone,
        'No pude leer la agenda en este momento. Ya quedó registrado el error — intenta en un minuto.',
      );
      return;
    }

    const parts: string[] = [];
    if (today.ok) {
      parts.push(this.appointmentsService.formatAgendaMessage(today.appts, 'de hoy', tz));
    } else {
      parts.push('No pude leer la agenda de hoy.');
    }
    if (tomorrow.ok) {
      parts.push(this.appointmentsService.formatAgendaMessage(tomorrow.appts, 'de mañana', tz));
    } else {
      parts.push('No pude leer la agenda de mañana.');
    }

    try {
      await this.sendAndRecord(phone, parts.join('\n\n'));
    } catch (error: any) {
      this.logger.error(
        `Failed to send agenda to ${phone}: ${error.message}\n${error.stack}`,
      );
    }
  }

  // ─── Appointments: ingresos proyectados ────────────────

  private async handleVerIngresosProyectados(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const now = toLocalTime(new Date(), tz);
    let from: Date;
    let to: Date;
    let label: string;

    const period = (data?.period || 'esta semana').toLowerCase().trim();

    if (period === 'hoy') {
      const range = getLocalDayRange(tz);
      from = range.start;
      to = range.end;
      label = 'de hoy';
    } else if (period === 'mañana') {
      const tomorrow = new Date(now.getTime() + 86400000);
      const range = getLocalDayRange(tz, tomorrow);
      from = range.start;
      to = range.end;
      label = 'de mañana';
    } else if (period.includes('mes')) {
      from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      to = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));
      label = 'del mes';
    } else {
      // Default: this week (Monday to Sunday)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      from = monday;
      to = sunday;
      label = 'de la semana';
    }

    try {
      const result = await this.appointmentsService.getProjectedIncome(providerProfileId, from, to);

      if (result.count === 0) {
        await this.sendAndRecord(
          phone,
          `No tienes ingresos proyectados ${label}. Las citas que agendes con monto estimado aparecerán aquí.`,
        );
        return;
      }

      let msg = `💰 *Ingresos proyectados ${label}:* *$${result.total.toLocaleString('es-MX')}*\n`;
      msg += `(${result.count} cita${result.count > 1 ? 's' : ''} con precio estimado)\n`;

      if (result.appointments.length <= 5) {
        for (const apt of result.appointments) {
          const dateStr = formatDate(apt.scheduledAt, tz);
          const timeStr = formatTime(apt.scheduledAt, tz);
          msg += `\n• *${dateStr}* ${timeStr}`;
          if (apt.clientName) msg += ` — ${apt.clientName}`;
          msg += `: *$${apt.estimatedPrice.toLocaleString('es-MX')}*`;
        }
      } else {
        const top3 = result.appointments.slice(0, 3);
        for (const apt of top3) {
          const dateStr = formatDate(apt.scheduledAt, tz);
          msg += `\n• *${dateStr}*`;
          if (apt.clientName) msg += ` — ${apt.clientName}`;
          msg += `: *$${apt.estimatedPrice.toLocaleString('es-MX')}*`;
        }
        msg += `\n... y ${result.appointments.length - 3} más.`;
      }

      await this.sendAndRecord(phone, msg);
    } catch (error: any) {
      this.logger.error(`Failed to get projected income: ${error.message}`);
      await this.sendAndRecord(phone, 'No pude consultar los ingresos proyectados. Intenta de nuevo.');
    }
  }

  // ─── Appointments: modificar cita ──────────────────────

  private async handleModificarCita(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const dateHint = this.appointmentsService.parseScheduledDate(data?.date, data?.time, tz);
    const matches = await this.appointmentsService.findByContext(
      providerProfileId,
      data?.clientName,
      dateHint ?? undefined,
      tz,
    );

    if (matches.length === 0) {
      await this.sendAndRecord(
        phone,
        '🤔 No encontré una cita que coincida. ¿Podrías decirme el nombre del cliente o la fecha?\n\nEscribe *"mi agenda"* para ver tus citas.',
      );
      return;
    }

    if (matches.length > 1 && !data?.time && !data?.clientName) {
      const lines = matches.map((a) => {
        return `  ⏰ *${formatTime(a.scheduledAt, tz)}* — ${a.clientName || 'Sin nombre'}`;
      });
      await this.sendAndRecord(
        phone,
        `🤔 Tienes *${matches.length} citas* que coinciden. ¿Cuál quieres modificar?\n\n${lines.join('\n')}\n\nDime el nombre del cliente o la hora.`,
      );
      return;
    }

    const target = matches[0];
    const updates: import('../appointments/appointments.service').UpdateAppointmentDto = {};

    const newScheduledAt = this.appointmentsService.parseScheduledDate(data?.newDate, data?.newTime, tz);
    if (newScheduledAt) {
      updates.scheduledAt = newScheduledAt;
    } else if (data?.newTime) {
      const [h, m] = data.newTime.split(':').map(Number);
      if (!isNaN(h)) {
        const local = toLocalTime(target.scheduledAt, tz);
        updates.scheduledAt = wallClockToUtc(
          local.getFullYear(), local.getMonth(), local.getDate(),
          h, m || 0, tz,
        );
      }
    }

    if (data?.newAddress) updates.address = data.newAddress;
    if (data?.newDescription) updates.description = data.newDescription;
    if (data?.reminderMinutes !== undefined) {
      updates.reminderMinutes = data.reminderMinutes ? Number(data.reminderMinutes) : null;
    }
    if (data?.newEstimatedPrice !== undefined) {
      updates.estimatedPrice = data.newEstimatedPrice ? Number(data.newEstimatedPrice) : null;
    }

    if (Object.keys(updates).length === 0) {
      await this.sendAndRecord(
        phone,
        '🤔 ¿Qué quieres cambiar de la cita? Puedes modificar la hora, fecha, dirección o descripción.\n\nEjemplo: *"Cambia la cita a las 4pm"*',
      );
      return;
    }

    try {
      const updated = await this.appointmentsService.update(target.id, updates);
      let confirmation = this.appointmentsService.formatAppointmentModified(
        updated.scheduledAt,
        updated.clientName ?? undefined,
        updated.description ?? undefined,
        updated.address ?? undefined,
        tz,
      );

      if (updates.scheduledAt) {
        await this.cancelAppointmentFollowup(updated.id);
        this.scheduleAppointmentFollowup(
          updated.id, phone, updated.scheduledAt, updated.clientName ?? undefined, tz,
        );
      }

      const activeReminder = updated.reminderMinutes ?? (target as any).reminderMinutes;
      if (activeReminder && (updates.scheduledAt || updates.reminderMinutes !== undefined)) {
        await this.cancelAppointmentReminder(updated.id);
        const scheduled = await this.scheduleAppointmentReminder(
          updated.id, phone, updated.scheduledAt, activeReminder, updated.clientName ?? undefined, tz,
        );
        if (scheduled) {
          confirmation += `\n\n🔔 Recordatorio reprogramado: *${activeReminder} minutos* antes.`;
        }
      }

      await this.sendAndRecord(phone, confirmation);
    } catch (error: any) {
      this.logger.error(`Error modifying appointment: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo modificar la cita. Intenta de nuevo.');
    }
  }

  // ─── Appointments: cancelar cita ──────────────────────

  private async handleCancelarCita(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const dateHint = this.appointmentsService.parseScheduledDate(data?.date, data?.time, tz);
    const matches = await this.appointmentsService.findByContext(
      providerProfileId,
      data?.clientName,
      dateHint ?? undefined,
      tz,
    );

    if (matches.length === 0) {
      await this.sendAndRecord(
        phone,
        '🤔 No encontré una cita que coincida para cancelar.\n\nEscribe *"mi agenda"* para ver tus citas.',
      );
      return;
    }

    if (matches.length > 1 && !data?.time && !data?.clientName) {
      const lines = matches.map((a) => {
        return `  ⏰ *${formatTime(a.scheduledAt, tz)}* — ${a.clientName || 'Sin nombre'}`;
      });
      await this.sendAndRecord(
        phone,
        `🤔 Tienes *${matches.length} citas*. ¿Cuál quieres cancelar?\n\n${lines.join('\n')}\n\nDime el nombre del cliente o la hora.`,
      );
      return;
    }

    const target = matches[0];

    try {
      await this.appointmentsService.cancel(target.id);
      await this.cancelAppointmentReminder(target.id);
      await this.cancelAppointmentFollowup(target.id);
      const confirmation = this.appointmentsService.formatAppointmentCancelled(
        target.clientName ?? undefined,
        target.scheduledAt,
        tz,
      );
      await this.sendAndRecord(phone, confirmation);
    } catch (error: any) {
      this.logger.error(`Error cancelling appointment: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo cancelar la cita. Intenta de nuevo.');
    }
  }

  // ─── Appointments: confirmar resultado ────────────────

  private async handleConfirmarResultadoCita(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const status = data?.status as 'completed' | 'no_show' | 'cancelled' | undefined;
    if (!status) {
      await this.sendAndRecord(
        phone,
        '🤔 ¿Se hizo la cita o no? Dime:\n• *"Sí se hizo"*\n• *"No llegó"*\n• *"Se canceló"*',
      );
      return;
    }

    let appointment: Awaited<ReturnType<typeof this.appointmentsService.findByContext>>[number] | null = null;

    const dateHint = this.appointmentsService.parseScheduledDate(data?.date, data?.time, tz);
    if (dateHint || data?.clientName) {
      const matches = await this.appointmentsService.findByContext(
        providerProfileId,
        data?.clientName,
        dateHint ?? undefined,
        tz,
      );
      if (matches.length > 0) appointment = matches[0];
    }

    if (!appointment) {
      appointment = await this.appointmentsService.findRecentPastAppointment(
        providerProfileId,
        data?.clientName,
      );
    }

    if (!appointment) {
      await this.sendAndRecord(
        phone,
        '🤔 No encontré una cita que coincida. ¿Podrías decirme el nombre del cliente o la hora?\n\nEscribe *"mi agenda"* para ver tus citas.',
      );
      return;
    }

    try {
      await this.appointmentsService.markResult(appointment.id, status);
      await this.cancelAppointmentFollowup(appointment.id);
      await this.cancelAppointmentReminder(appointment.id);

      const statusLabels: Record<string, string> = {
        completed: '✅ *Cita completada.* ¡Buen trabajo!',
        no_show: '😕 *No-show registrado.* La cita quedó marcada.',
        cancelled: '🗑️ *Cita cancelada.* Registrado.',
      };

      let msg = statusLabels[status];
      if (appointment.clientName) msg += `\n👤 ${appointment.clientName}`;

      await this.sendAndRecord(phone, msg);
    } catch (error: any) {
      this.logger.error(`Error confirming appointment result: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo registrar el resultado. Intenta de nuevo.');
    }
  }

  // ─── State: REQUEST_RECEIVED ────────────────────────────

  private async handleRequestReceived(
    phone: string,
    text: string,
    buttonReply: { id: string; title: string } | null,
    session: ProviderSession,
  ) {
    const bookingId = session.bookingId;
    if (!bookingId) {
      await this.clearSession(phone);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró la solicitud. Escribe "menu" para volver al inicio.',
      );
      return;
    }

    // Check button reply
    if (buttonReply) {
      if (buttonReply.id === `accept_${bookingId}` || buttonReply.id.startsWith('accept_')) {
        return this.acceptBooking(phone, session);
      }
      if (buttonReply.id === `reject_${bookingId}` || buttonReply.id.startsWith('reject_')) {
        return this.rejectBooking(phone, session);
      }
    }

    // Check text commands
    if (text === 'aceptar' || text === 'accept' || text === 'si' || text === 'sí') {
      return this.acceptBooking(phone, session);
    }
    if (text === 'rechazar' || text === 'reject' || text === 'no') {
      return this.rejectBooking(phone, session);
    }

    // Unknown input during request
    await this.whatsapp.sendTextMessage(
      phone,
      `🤔 Toca *Aceptar* o *Rechazar* en la notificación, o escribe "aceptar" o "rechazar".`,
    );
  }

  // ─── Accept booking ──────────────────────────────────────

  private async acceptBooking(
    phone: string,
    session: ProviderSession,
  ) {
    const bookingId = session.bookingId!;

    try {
      // Verify booking is still PENDING
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true, name: true } },
          category: true,
        },
      });

      if (!booking) {
        await this.whatsapp.sendTextMessage(phone, '❌ La solicitud ya no existe.');
        await this.setSession(phone, { ...session, state: ProviderState.IDLE, bookingId: undefined });
        return;
      }

      if (booking.status !== BookingStatus.PENDING) {
        await this.whatsapp.sendTextMessage(
          phone,
          `❌ Esta solicitud ya fue ${booking.status === BookingStatus.CANCELLED ? 'cancelada' : 'procesada'}.`,
        );
        await this.setSession(phone, { ...session, state: ProviderState.IDLE, bookingId: undefined });
        return;
      }

      // Update booking status to ACCEPTED
      const updated = await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.ACCEPTED },
        include: {
          provider: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
          category: true,
          customer: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

      // Notify customer via WebSocket
      this.bookingsGateway.sendBookingUpdate(booking.customer!.id, {
        id: updated.id,
        status: updated.status,
        providerId: updated.providerId,
        providerName: updated.provider?.user?.name,
      });

      // Send confirmation to provider
      await this.whatsapp.sendTextMessage(
        phone,
        `✅ *¡Trabajo aceptado!*\n\n` +
          `El cliente ${booking.customer?.name || ''} será notificado.\n\n` +
          `📍 Dirección: ${booking.address || 'Sin dirección'}\n` +
          `📝 ${booking.description}`,
      );

      // Send location message if coordinates are available
      if (booking.locationLat && booking.locationLng) {
        await this.whatsapp.sendLocationMessage(
          phone,
          booking.locationLat,
          booking.locationLng,
          booking.customer?.name || 'Cliente',
          booking.address || 'Ubicación del cliente',
        );

        const mapsUrl = `https://maps.google.com/?q=${booking.locationLat},${booking.locationLng}`;
        const wazeUrl = `https://waze.com/ul?ll=${booking.locationLat},${booking.locationLng}&navigate=yes`;
        await this.whatsapp.sendTextMessage(
          phone,
          `🗺 *Navegación:*\n\n` +
            `📍 Google Maps: ${mapsUrl}\n` +
            `🟣 Waze: ${wazeUrl}\n\n` +
            `Escribe *"en camino"* cuando vayas para allá`,
        );
      } else {
        await this.whatsapp.sendTextMessage(
          phone,
          `Escribe *"en camino"* cuando vayas para allá\n💬 Escribe cualquier mensaje para chatear con el cliente`,
        );
      }

      // Update session
      await this.setSession(phone, {
        ...session,
        state: ProviderState.ACCEPTED,
      });

      // Clear the auto-reject timeout
      this.eventEmitter.emit('booking.responded', { bookingId });

      this.logger.log(`Provider accepted booking ${bookingId}`);
    } catch (error: any) {
      this.logger.error(`Error accepting booking: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ Ocurrió un error. Intenta de nuevo.',
      );
    }
  }

  // ─── Reject booking ──────────────────────────────────────

  private async rejectBooking(
    phone: string,
    session: ProviderSession,
  ) {
    const bookingId = session.bookingId!;

    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      if (!booking || booking.status !== BookingStatus.PENDING) {
        await this.whatsapp.sendTextMessage(
          phone,
          '❌ Esta solicitud ya no está disponible.',
        );
        await this.setSession(phone, { ...session, state: ProviderState.IDLE, bookingId: undefined });
        return;
      }

      // Update booking status to REJECTED
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.REJECTED },
      });

      // Notify customer via WebSocket
      this.bookingsGateway.sendBookingUpdate(booking.customer!.id, {
        id: booking.id,
        status: 'REJECTED',
      });

      await this.whatsapp.sendTextMessage(
        phone,
        `❌ Has rechazado la solicitud de ${session.customerName || 'el cliente'}.\n\nSeguirás recibiendo nuevas solicitudes.`,
      );

      // Return to IDLE
      await this.setSession(phone, {
        ...session,
        state: ProviderState.IDLE,
        bookingId: undefined,
      });

      // Clear the auto-reject timeout
      this.eventEmitter.emit('booking.responded', { bookingId });

      this.logger.log(`Provider rejected booking ${bookingId}`);
    } catch (error: any) {
      this.logger.error(`Error rejecting booking: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ Ocurrió un error. Intenta de nuevo.',
      );
    }
  }

  // ─── State: ACCEPTED (waiting for "on my way") ──────────

  private async handleAccepted(
    phone: string,
    text: string,
    buttonReply: { id: string; title: string } | null,
    session: ProviderSession,
  ) {
    // Button replies
    if (buttonReply?.id === 'btn_on_my_way') {
      return this.markArriving(phone, session);
    }
    if (buttonReply?.id === 'btn_start_work') {
      return this.markInProgress(phone, session);
    }
    if (buttonReply?.id === 'btn_complete') {
      return this.markCompleted(phone, session);
    }
    if (buttonReply?.id === 'btn_chat') {
      await this.whatsapp.sendTextMessage(
        phone,
        `💬 Escribe tu mensaje y se lo enviaré al cliente.\n\n_Recuerda: para comandos usa *"en camino"*, *"empezar"* o *"completar"*_`,
      );
      return;
    }
    // "On my way" via text
    if (
      text === 'en camino' ||
      text === 'on my way' ||
      text === 'voy en camino' ||
      text === 'ya voy'
    ) {
      return this.markArriving(phone, session);
    }
    // "Start" via text
    if (text === 'empezar' || text === 'start' || text === 'iniciar') {
      return this.markInProgress(phone, session);
    }

    // If there's text and a booking, treat it as a chat message
    if (text && session.bookingId && session.providerUserId) {
      return this.bridgeChatToApp(phone, text, session);
    }

    await this.whatsapp.sendTextMessage(
      phone,
      `👋 ¡Ya aceptaste este trabajo!\n\nEscribe:\n📍 *"en camino"* — cuando vayas saliendo\n🔧 *"empezar"* — cuando inicies el trabajo\n💬 Cualquier otro texto se enviará como mensaje al cliente`,
    );
  }

  // ─── Mark as ARRIVING ────────────────────────────────────

  private async markArriving(phone: string, session: ProviderSession) {
    const bookingId = session.bookingId!;

    try {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.PROVIDER_ARRIVING },
      });

      // Notify customer
      if (session.customerId) {
        this.bookingsGateway.sendBookingUpdate(session.customerId, {
          id: bookingId,
          status: 'PROVIDER_ARRIVING',
        });
      }

      await this.whatsapp.sendInteractiveButtons(
        phone,
        `📍 *¡En camino!* El cliente ha sido notificado.\n\nCuando llegues y empieces el trabajo:`,
        [
          { id: 'btn_start_work', title: '🔧 Empezar trabajo' },
          { id: 'btn_chat', title: '💬 Chatear' },
        ],
      );

      await this.setSession(phone, {
        ...session,
        state: ProviderState.ARRIVING,
      });

      this.logger.log(`Provider arriving for booking ${bookingId}`);
    } catch (error: any) {
      this.logger.error(`Error marking arriving: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ Ocurrió un error. Intenta de nuevo.',
      );
    }
  }

  // ─── State: ARRIVING ────────────────────────────────────

  private async handleArriving(
    phone: string,
    text: string,
    session: ProviderSession,
    buttonReply?: { id: string; title: string } | null,
  ) {
    if (buttonReply?.id === 'btn_start_work') {
      return this.markInProgress(phone, session);
    }
    if (text === 'empezar' || text === 'start' || text === 'iniciar') {
      return this.markInProgress(phone, session);
    }

    // If there's text and a booking, treat it as a chat message
    if (text && session.bookingId && session.providerUserId) {
      return this.bridgeChatToApp(phone, text, session);
    }

    await this.whatsapp.sendTextMessage(
      phone,
      `📍 Estás en camino...\n\nEscribe *"empezar"* cuando inicies el trabajo.\n💬 Cualquier otro texto se enviará como mensaje al cliente.`,
    );
  }

  // ─── Mark as IN_PROGRESS ────────────────────────────────

  private async markInProgress(phone: string, session: ProviderSession) {
    const bookingId = session.bookingId!;

    try {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.IN_PROGRESS },
      });

      if (session.customerId) {
        this.bookingsGateway.sendBookingUpdate(session.customerId, {
          id: bookingId,
          status: 'IN_PROGRESS',
        });
      }

      await this.whatsapp.sendInteractiveButtons(
        phone,
        `🔧 *¡Trabajo iniciado!* El cliente ha sido notificado.\n\nCuando termines:`,
        [
          { id: 'btn_complete', title: '✅ Completar' },
          { id: 'btn_chat', title: '💬 Chatear' },
        ],
      );

      await this.setSession(phone, {
        ...session,
        state: ProviderState.IN_PROGRESS,
      });

      this.logger.log(`Provider started work on booking ${bookingId}`);
    } catch (error: any) {
      this.logger.error(`Error marking in progress: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ Ocurrió un error. Intenta de nuevo.',
      );
    }
  }

  // ─── State: IN_PROGRESS ─────────────────────────────────

  private async handleInProgress(
    phone: string,
    text: string,
    session: ProviderSession,
    buttonReply?: { id: string; title: string } | null,
  ) {
    if (buttonReply?.id === 'btn_complete') {
      return this.markCompleted(phone, session);
    }
    if (text === 'completar' || text === 'complete' || text === 'terminar' || text === 'listo') {
      return this.markCompleted(phone, session);
    }

    // If there's text and a booking, treat it as a chat message
    if (text && session.bookingId && session.providerUserId) {
      return this.bridgeChatToApp(phone, text, session);
    }

    await this.whatsapp.sendTextMessage(
      phone,
      `🔧 Trabajo en progreso...\n\nEscribe *"completar"* cuando termines.\n💬 Cualquier otro texto se enviará como mensaje al cliente.`,
    );
  }

  // ─── Mark as COMPLETED ──────────────────────────────────

  private async markCompleted(phone: string, session: ProviderSession) {
    const bookingId = session.bookingId!;

    try {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // Update provider's total_jobs count
      if (session.providerProfileId) {
        await this.prisma.providerProfile.update({
          where: { id: session.providerProfileId },
          data: { totalJobs: { increment: 1 } },
        });
      }

      // Notify customer
      if (session.customerId) {
        this.bookingsGateway.sendBookingUpdate(session.customerId, {
          id: bookingId,
          status: 'COMPLETED',
        });
      }

      await this.whatsapp.sendTextMessage(
        phone,
        `✅ *¡Trabajo completado!* 🎉\n\nEl cliente ha sido notificado y podrá calificarte.\n\n¡Ahora te toca a ti! ¿Cómo fue tu experiencia con ${session.customerName || 'el cliente'}?`,
      );

      // Send rating with interactive buttons
      await this.whatsapp.sendInteractiveButtons(
        phone,
        `⭐ ¿Cómo calificarías a ${session.customerName || 'el cliente'}?\n\nO responde con un número del *1* al *5*`,
        [
          { id: `rate_high_${bookingId}`, title: '⭐⭐⭐⭐⭐ (5)' },
          { id: `rate_mid_${bookingId}`, title: '⭐⭐⭐ (3)' },
          { id: `rate_low_${bookingId}`, title: '⭐⭐ (2)' },
        ],
      );

      // Transition to AWAITING_RATING
      await this.setSession(phone, {
        ...session,
        state: ProviderState.AWAITING_RATING,
      });

      this.logger.log(`Provider completed booking ${bookingId}, awaiting rating`);
    } catch (error: any) {
      this.logger.error(`Error marking completed: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ Ocurrió un error. Intenta de nuevo.',
      );
    }
  }

  // ─── State: AWAITING_RATING ─────────────────────────────

  private async handleAwaitingRating(
    phone: string,
    text: string,
    buttonReply: { id: string; title: string } | null,
    session: ProviderSession,
  ) {
    const bookingId = session.bookingId;
    if (!bookingId) {
      await this.setSession(phone, { ...session, state: ProviderState.IDLE, bookingId: undefined });
      await this.whatsapp.sendTextMessage(phone, 'No se encontró la reserva para calificar. Escribe "menu" para continuar.');
      return;
    }

    // If they type skip
    if (text === 'skip' || text === 'omitir' || text === 'no') {
      return this.skipRating(phone, session);
    }

    // If they type a number 1-5 directly
    const numScore = parseInt(text, 10);
    if (!isNaN(numScore) && numScore >= 1 && numScore <= 5) {
      session.pendingRatingScore = numScore;
      session.state = ProviderState.AWAITING_RATING_COMMENT;
      await this.setSession(phone, session);
      await this.whatsapp.sendTextMessage(
        phone,
        `Has seleccionado ${numScore} estrella${numScore > 1 ? 's' : ''}.\n\n💬 ¿Quieres dejar un comentario? Escríbelo ahora, o escribe *"skip"* para omitir.`,
      );
      return;
    }

    // Remind them about the rating options
    await this.whatsapp.sendTextMessage(
      phone,
      `⭐ ¿Cómo calificarías a ${session.customerName || 'el cliente'}?\n\nResponde con un número del *1* al *5*\nO escribe *"skip"* para omitir`,
    );
  }

  // ─── State: AWAITING_RATING_COMMENT ────────────────────

  private async handleAwaitingRatingComment(
    phone: string,
    text: string,
    session: ProviderSession,
  ) {
    const bookingId = session.bookingId;
    const score = session.pendingRatingScore;

    if (!bookingId || !score || !session.providerUserId) {
      await this.setSession(phone, { ...session, state: ProviderState.IDLE, bookingId: undefined });
      await this.whatsapp.sendTextMessage(phone, 'Error en la calificación. Escribe "menu" para continuar.');
      return;
    }

    const comment = (text === 'skip' || text === 'omitir') ? undefined : text || undefined;

    try {
      await this.ratingsService.rateFromWhatsApp(bookingId, session.providerUserId, score, comment);

      await this.whatsapp.sendTextMessage(
        phone,
        `⭐ *¡Gracias por tu calificación!*\n\n` +
          `Calificaste a ${session.customerName || 'el cliente'} con ${score} estrella${score > 1 ? 's' : ''}` +
          (comment ? `. Comentario: "${comment}"` : '') +
          `\n\n¡Sigue recibiendo solicitudes! 🔔`,
      );

      this.logger.log(`Provider rated customer via WA: booking ${bookingId}, score ${score}`);
    } catch (error: any) {
      if (error.status === 409) {
        await this.whatsapp.sendTextMessage(phone, '⚠️ Ya calificaste esta reserva anteriormente.');
      } else {
        this.logger.error(`Error rating via WA: ${error.message}`);
        await this.whatsapp.sendTextMessage(phone, '❌ Error al guardar la calificación. Intenta de nuevo.');
      }
    }

    // Return to IDLE
    await this.setSession(phone, {
      ...session,
      state: ProviderState.IDLE,
      bookingId: undefined,
      customerName: undefined,
      customerId: undefined,
      pendingRatingScore: undefined,
    });
  }

  // ─── Skip rating ───────────────────────────────────────

  private async skipRating(phone: string, session: ProviderSession) {
    await this.whatsapp.sendTextMessage(
      phone,
      '👌 Sin problema, se omitió la calificación.\n\n¡Sigue recibiendo solicitudes! 🔔',
    );

    await this.setSession(phone, {
      ...session,
      state: ProviderState.IDLE,
      bookingId: undefined,
      customerName: undefined,
      customerId: undefined,
      pendingRatingScore: undefined,
    });
  }

  // ─── Chat bridge: WhatsApp → App ────────────────────────

  /**
   * When a provider sends a free-text message during an active booking,
   * save it in the DB and push it to the customer via WebSocket.
   */
  private async bridgeChatToApp(
    phone: string,
    text: string,
    session: ProviderSession,
  ) {
    try {
      await this.messagesService.saveFromWhatsApp(
        session.bookingId!,
        session.providerUserId!,
        text,
      );
      await this.whatsapp.sendTextMessage(
        phone,
        `✅ Mensaje enviado al cliente.`,
      );
      this.logger.log(
        `Bridged WA→App: provider ${phone} → booking ${session.bookingId}`,
      );
    } catch (error: any) {
      this.logger.error(`Error bridging WA→App: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        `❌ No se pudo enviar el mensaje. Intenta de nuevo.`,
      );
    }
  }

  // ─── Personal Reminders: CRUD ──────────────────────────

  private async handleCrearRecordatorio(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const remindAt = this.remindersService.parseScheduledDate(data?.date, data?.time, tz);

    if (!remindAt) {
      await this.sendAndRecord(
        phone,
        '🤔 No pude detectar la fecha u hora del recordatorio. ¿Podrías ser más específico?\n\nEjemplo: *"Recuérdame ir al gym mañana a las 10"*',
      );
      return;
    }

    const description = data?.description || 'Recordatorio';

    try {
      const reminder = await this.remindersService.create({
        providerId: providerProfileId,
        description,
        remindAt,
      });

      const confirmation = this.remindersService.formatReminderConfirmation(description, remindAt, tz);
      await this.sendAndRecord(phone, confirmation, AiIntent.CREAR_RECORDATORIO);

      this.schedulePersonalReminder(reminder.id, phone, description, remindAt);
    } catch (error: any) {
      this.logger.error(`Error creating reminder: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo crear el recordatorio. Intenta de nuevo.');
    }
  }

  private async handleVerRecordatorios(
    phone: string,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    try {
      const reminders = await this.remindersService.findActive(providerProfileId);
      const msg = this.remindersService.formatRemindersList(reminders, tz);
      await this.sendAndRecord(phone, msg, AiIntent.VER_RECORDATORIOS);
    } catch (error: any) {
      this.logger.error(`Error listing reminders: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudieron cargar los recordatorios. Intenta de nuevo.');
    }
  }

  private async handleModificarRecordatorio(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const description = data?.description;
    if (!description) {
      await this.sendAndRecord(phone, '🤔 ¿Cuál recordatorio quieres modificar?');
      return;
    }

    try {
      const matches = await this.remindersService.findByDescription(providerProfileId, description);

      if (matches.length === 0) {
        await this.sendAndRecord(
          phone,
          `🤔 No encontré un recordatorio que coincida con "${description}". Usa *ver recordatorios* para ver los pendientes.`,
        );
        return;
      }

      const reminder = matches[0];
      const updateData: any = {};

      if (data?.newDescription) {
        updateData.description = data.newDescription;
      }

      const newRemindAt = this.remindersService.parseScheduledDate(data?.newDate, data?.newTime, tz);
      if (newRemindAt) {
        updateData.remindAt = newRemindAt;
      }

      if (Object.keys(updateData).length === 0) {
        await this.sendAndRecord(phone, '🤔 ¿Qué quieres cambiar del recordatorio? (hora, fecha, descripción)');
        return;
      }

      const updated = await this.remindersService.update(reminder.id, updateData);

      await this.cancelPersonalReminder(reminder.id);
      this.schedulePersonalReminder(
        updated.id,
        phone,
        updated.description,
        updated.remindAt,
      );

      const msg = this.remindersService.formatReminderModified(updated.description, updated.remindAt, tz);
      await this.sendAndRecord(phone, msg, AiIntent.MODIFICAR_RECORDATORIO);
    } catch (error: any) {
      this.logger.error(`Error modifying reminder: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo modificar el recordatorio. Intenta de nuevo.');
    }
  }

  private async handleCancelarRecordatorio(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
    _tz: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const description = data?.description;
    if (!description) {
      await this.sendAndRecord(phone, '🤔 ¿Cuál recordatorio quieres cancelar?');
      return;
    }

    try {
      const matches = await this.remindersService.findByDescription(providerProfileId, description);

      if (matches.length === 0) {
        await this.sendAndRecord(
          phone,
          `🤔 No encontré un recordatorio que coincida con "${description}". Usa *ver recordatorios* para ver los pendientes.`,
        );
        return;
      }

      const reminder = matches[0];
      await this.remindersService.cancel(reminder.id);
      await this.cancelPersonalReminder(reminder.id);

      const msg = this.remindersService.formatReminderCancelled(reminder.description);
      await this.sendAndRecord(phone, msg, AiIntent.CANCELAR_RECORDATORIO);
    } catch (error: any) {
      this.logger.error(`Error cancelling reminder: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo cancelar el recordatorio. Intenta de nuevo.');
    }
  }

  private async handleCompletarRecordatorio(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.sendAndRecord(phone, '❌ No se encontró tu perfil de proveedor.');
      return;
    }

    const description = data?.description;
    if (!description) {
      await this.sendAndRecord(phone, '🤔 ¿Cuál recordatorio completaste?');
      return;
    }

    try {
      const matches = await this.remindersService.findCompletableByDescription(providerProfileId, description);

      if (matches.length === 0) {
        await this.sendAndRecord(
          phone,
          `🤔 No encontré un recordatorio pendiente que coincida con "${description}".`,
        );
        return;
      }

      const reminder = matches[0];
      await this.remindersService.markCompleted(reminder.id);
      await this.cancelPersonalReminder(reminder.id);

      const msg = this.remindersService.formatReminderCompleted(reminder.description);
      await this.sendAndRecord(phone, msg, AiIntent.COMPLETAR_RECORDATORIO);
    } catch (error: any) {
      this.logger.error(`Error completing reminder: ${error.message}`);
      await this.sendAndRecord(phone, '❌ No se pudo completar el recordatorio. Intenta de nuevo.');
    }
  }

  // ─── Personal Reminder BullMQ scheduling ──────────────

  private schedulePersonalReminder(
    reminderId: string,
    providerPhone: string,
    description: string,
    remindAt: Date,
  ): boolean {
    const delay = remindAt.getTime() - Date.now();

    if (delay <= 0) return false;

    const jobData: PersonalReminderJobData = {
      reminderId,
      providerPhone,
      description,
      remindAt: remindAt.toISOString(),
    };

    this.queueService
      .addJob(
        QUEUE_NAMES.PERSONAL_REMINDER,
        'personal-reminder',
        jobData,
        { delay, jobId: `personal-reminder-${reminderId}` },
      )
      .catch((err) =>
        this.logger.warn(`Failed to schedule personal reminder: ${err.message}`),
      );

    return true;
  }

  private async cancelPersonalReminder(reminderId: string): Promise<void> {
    await this.queueService.removeJob(
      QUEUE_NAMES.PERSONAL_REMINDER,
      `personal-reminder-${reminderId}`,
    );
  }

  // ─── Appointment followup scheduling ────────────────────

  private scheduleAppointmentFollowup(
    appointmentId: string,
    providerPhone: string,
    scheduledAt: Date,
    clientName?: string,
    timezone?: string,
  ): void {
    const FOLLOWUP_DELAY_MS = 30 * 60 * 1000; // 30 minutes after appointment time
    const delay = scheduledAt.getTime() - Date.now() + FOLLOWUP_DELAY_MS;

    if (delay <= 0) return; // appointment is in the past

    const jobData: AppointmentFollowupJobData = {
      appointmentId,
      providerPhone,
      clientName,
      scheduledAt: scheduledAt.toISOString(),
      timezone,
    };

    this.queueService
      .addJob(
        QUEUE_NAMES.APPOINTMENT_FOLLOWUP,
        'followup',
        jobData,
        { delay, jobId: `followup-${appointmentId}` },
      )
      .catch((err) =>
        this.logger.warn(`Failed to schedule appointment followup: ${err.message}`),
      );
  }

  private async scheduleAppointmentReminder(
    appointmentId: string,
    providerPhone: string,
    scheduledAt: Date,
    reminderMinutes: number,
    clientName?: string,
    timezone?: string,
  ): Promise<boolean> {
    const delay = scheduledAt.getTime() - Date.now() - reminderMinutes * 60 * 1000;

    if (delay <= 0) return false;

    const jobData: AppointmentReminderJobData = {
      appointmentId,
      providerPhone,
      clientName,
      scheduledAt: scheduledAt.toISOString(),
      reminderMinutes,
      timezone,
    };

    const jobId = await this.queueService
      .addJob(
        QUEUE_NAMES.APPOINTMENT_REMINDER,
        'reminder',
        jobData,
        { delay, jobId: `reminder-${appointmentId}` },
      )
      .catch((err) => {
        this.logger.warn(`Failed to schedule appointment reminder: ${err.message}`);
        return null;
      });

    return jobId !== null;
  }

  private async cancelAppointmentReminder(appointmentId: string): Promise<void> {
    await this.queueService.removeJob(
      QUEUE_NAMES.APPOINTMENT_REMINDER,
      `reminder-${appointmentId}`,
    );
  }

  /**
   * Cancel a pending appointment followup ("¿Se hizo?" 30min after).
   * Must be called whenever the appointment is rescheduled, cancelled, or
   * marked completed/no-show — otherwise the old followup fires with stale
   * data and confuses the user (Cap. 38, bug Oscar 16-abr).
   */
  private async cancelAppointmentFollowup(appointmentId: string): Promise<void> {
    await this.queueService.removeJob(
      QUEUE_NAMES.APPOINTMENT_FOLLOWUP,
      `followup-${appointmentId}`,
    );
  }

  // ─── Dashboard / Help ───────────────────────────────────

  private async sendProviderDashboard(phone: string, name: string) {
    const greeting = name ? `Soy tu Chalán, *${name}*. ` : `Soy tu Chalán. `;
    await this.whatsapp.sendTextMessage(
      phone,
      `${greeting}Te llevo lo administrativo del negocio — ingresos, gastos, agenda, cobros, lo que se ofrezca. ` +
        `Tú concéntrate en el oficio; del papeleo me encargo yo.\n\n` +
        `Dime qué necesitas — por texto o por audio, como te acomode.`,
    );
  }

  private async sendFallbackPrompt(phone: string) {
    await this.whatsapp.sendTextMessage(
      phone,
      `No te cacé esa, maestro. Dime qué necesitas — por texto o audio.`,
    );
  }

  private async sendHelpMenu(phone: string) {
    await this.whatsapp.sendTextMessage(
      phone,
      `❓ *Ayuda — Tu Chalán*\n\n` +
        `💰 *Finanzas:*\n` +
        `  "Cobré 1,200 en efectivo" — registrar ingreso\n` +
        `  "Gasté 200 en material" — registrar gasto\n` +
        `  "Borra el último gasto" — eliminar\n` +
        `  "El último gasto era 300" — corregir monto\n` +
        `  "Borra el gasto de material" — eliminar por nombre\n` +
        `  "Gasto fijo de 500 de renta" — gasto recurrente\n` +
        `  "¿Cómo voy esta semana?" — ver resumen\n\n` +
        `📅 *Agenda:*\n` +
        `  "Mañana a las 10 con la señora García" — agendar\n` +
        `  "Cambia la cita a las 2pm" — modificar cita\n` +
        `  "Cancela la cita con García" — cancelar\n` +
        `  "¿Qué tengo hoy?" — ver agenda\n\n` +
        `⚙️ *Perfil:*\n` +
        `  "Cobro 800 por visita" — configurar servicios\n` +
        `  "Trabajo lunes a viernes de 8 a 6" — horarios\n` +
        `  "Mis servicios" — ver tu perfil\n\n` +
        `🔄 *"reset"* — limpiar historial de conversación`,
    );
  }

  // ─── Dashboard stats ──────────────────────────────────

  private async sendDashboardStats(phone: string, providerProfileId: string) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [weekJobs, monthJobs, totalJobs, profile, ratings] = await Promise.all([
      this.prisma.booking.count({
        where: { providerId: providerProfileId, status: 'COMPLETED', completedAt: { gte: startOfWeek } },
      }),
      this.prisma.booking.count({
        where: { providerId: providerProfileId, status: 'COMPLETED', completedAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.count({
        where: { providerId: providerProfileId, status: 'COMPLETED' },
      }),
      this.prisma.providerProfile.findUnique({
        where: { id: providerProfileId },
        include: { user: { select: { ratingAverage: true, ratingCount: true } } },
      }),
      this.prisma.booking.count({
        where: {
          providerId: providerProfileId,
          status: { in: ['PENDING', 'ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'] },
        },
      }),
    ]);

    const rating = profile?.user?.ratingAverage?.toFixed(1) || '0.0';
    const ratingCount = profile?.user?.ratingCount || 0;

    await this.whatsapp.sendTextMessage(
      phone,
      `📊 *Mi Dashboard*\n\n` +
        `🔧 Trabajos completados:\n` +
        `  • Esta semana: ${weekJobs}\n` +
        `  • Este mes: ${monthJobs}\n` +
        `  • Total: ${totalJobs}\n\n` +
        `⭐ Rating: ${rating} (${ratingCount} reseñas)\n` +
        `📋 Trabajos activos: ${ratings}\n\n` +
        `_Escribe "menu" para volver al menú principal_`,
    );
  }

  // ─── Jobs list ─────────────────────────────────────────

  private async sendJobsList(phone: string, providerProfileId: string) {
    const recentJobs = await this.prisma.booking.findMany({
      where: { providerId: providerProfileId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        category: { select: { name: true, icon: true } },
        customer: { select: { name: true } },
      },
    });

    if (recentJobs.length === 0) {
      await this.whatsapp.sendTextMessage(
        phone,
        '📝 *Mis Trabajos*\n\nAún no tienes trabajos registrados.\n\n_Escribe "menu" para volver al menú principal_',
      );
      return;
    }

    const statusEmoji: Record<string, string> = {
      PENDING: '🟡',
      ACCEPTED: '🟢',
      PROVIDER_ARRIVING: '🚗',
      IN_PROGRESS: '🔧',
      COMPLETED: '✅',
      RATED: '⭐',
      CANCELLED: '🚫',
      REJECTED: '❌',
    };

    const rows = recentJobs.map((job) => ({
      id: `job_detail_${job.id}`,
      title: `${statusEmoji[job.status] || '📋'} ${job.category?.name || 'Servicio'}`,
      description: `${job.customer?.name || 'Cliente'} · ${new Date(job.createdAt).toLocaleDateString('es-MX')}`,
    }));

    await this.whatsapp.sendInteractiveList(
      phone,
      '📝 Mis Trabajos',
      `Últimos ${recentJobs.length} trabajos:`,
      'Selecciona uno para ver detalles',
      'Ver trabajos',
      [{ title: 'Trabajos recientes', rows }],
    );
  }

  // ─── Account info ─────────────────────────────────────

  private async sendAccountInfo(phone: string, providerProfileId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      include: {
        user: { select: { name: true, phone: true, ratingAverage: true, ratingCount: true } },
        serviceZones: { include: { zone: { select: { name: true, city: true } } } },
      },
    });

    if (!profile) {
      await this.whatsapp.sendTextMessage(phone, '❌ No se encontró tu perfil.');
      return;
    }

    const serviceTypes = Array.isArray(profile.serviceTypes) ? (profile.serviceTypes as string[]).join(', ') : '';
    const zones = profile.serviceZones.map((z) => `${z.zone.name}, ${z.zone.city}`).join('\n  • ') || 'Sin zonas';

    await this.whatsapp.sendTextMessage(
      phone,
      `⚙️ *Mi Cuenta*\n\n` +
        `👤 Nombre: ${profile.user.name || 'Sin nombre'}\n` +
        `📱 Teléfono: ${profile.user.phone}\n` +
        `📝 Bio: ${profile.bio || 'Sin bio'}\n` +
        `🔧 Servicios: ${serviceTypes}\n` +
        `📍 Zonas:\n  • ${zones}\n` +
        `✅ Verificado: ${profile.isVerified ? 'Sí' : 'No'}\n` +
        `🟢 Disponible: ${profile.isAvailable ? 'Sí' : 'No'}`,
    );

    await this.whatsapp.sendInteractiveButtons(
      phone,
      '¿Qué deseas editar?',
      [
        { id: 'edit_name', title: '✏️ Cambiar nombre' },
        { id: 'edit_bio', title: '📝 Cambiar bio' },
        { id: `toggle_avail_${providerProfileId}`, title: profile.isAvailable ? '🔴 No disponible' : '🟢 Disponible' },
      ],
    );
  }

  // ─── Profile editing via WhatsApp ────────────────────────

  private async handleEditingName(phone: string, text: string, session: ProviderSession) {
    if (!text || !session.providerUserId) {
      await this.whatsapp.sendTextMessage(phone, 'Escribe tu nuevo nombre o *"cancelar"* para salir.');
      return;
    }
    if (text === 'cancelar' || text === 'cancel') {
      await this.setSession(phone, { ...session, state: ProviderState.IDLE });
      await this.whatsapp.sendTextMessage(phone, '❌ Edición cancelada. Escribe *"menu"* para continuar.');
      return;
    }
    await this.prisma.user.update({ where: { id: session.providerUserId }, data: { name: text } });
    await this.setSession(phone, { ...session, state: ProviderState.IDLE });
    await this.whatsapp.sendTextMessage(phone, `✅ Nombre actualizado a *${text}*.\n\nEscribe *"menu"* para continuar.`);
  }

  private async handleEditingBio(phone: string, text: string, session: ProviderSession) {
    if (!text || !session.providerProfileId) {
      await this.whatsapp.sendTextMessage(phone, 'Escribe tu nueva bio o *"cancelar"* para salir.');
      return;
    }
    if (text === 'cancelar' || text === 'cancel') {
      await this.setSession(phone, { ...session, state: ProviderState.IDLE });
      await this.whatsapp.sendTextMessage(phone, '❌ Edición cancelada. Escribe *"menu"* para continuar.');
      return;
    }
    await this.prisma.providerProfile.update({ where: { id: session.providerProfileId }, data: { bio: text } });
    await this.setSession(phone, { ...session, state: ProviderState.IDLE });
    await this.whatsapp.sendTextMessage(phone, `✅ Bio actualizada.\n\nEscribe *"menu"* para continuar.`);
  }

  // ─── Learned Memory extraction ─────────────────────────

  private async maybeExtractLearnedFacts(
    phone: string,
    providerProfileId: string,
    workspaceContext?: import('../ai/ai.types').WorkspaceContextDto,
  ): Promise<void> {
    const shouldExtract =
      await this.aiContextService.incrementAndCheckMemoryCounter(phone);
    if (!shouldExtract) return;

    const history = await this.aiContextService.getHistory(phone);
    if (history.length < 4) return;

    const currentFacts = workspaceContext?.learnedFacts || [];
    const newFacts = await this.aiService.extractLearnedFacts(
      history,
      currentFacts,
    );

    if (JSON.stringify(newFacts) !== JSON.stringify(currentFacts)) {
      await this.workspaceService.updateLearnedFacts(
        providerProfileId,
        newFacts,
      );
    }
  }

  // ─── Keyword Intent Detection ──────────────────────────

  /**
   * Strips accents and punctuation for resilient keyword matching.
   * "¿Cuáles son mis gastos fijos?" → "cuales son mis gastos fijos"
   */
  private normalizeForKeywords(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:()]/g, '')
      .trim();
  }

  // Verb stems for detecting action intent. Stem matching catches all
  // Spanish conjugations (agendar/agenda/agendes/agendame/agenden/etc.)
  // False positives are harmless — they just route to the LLM instead of
  // the keyword bypass, which is always correct.
  private static readonly ACTION_STEMS = [
    'cancel', 'elimin', 'borr', 'quit',
    'crea', 'crear', 'agreg', 'registr',
    'nuev', 'cambi', 'modific', 'actualiz',
    'agend', 'program', 'configur',
  ];

  private hasActionWord(words: string[]): boolean {
    return words.some((w) =>
      WhatsAppProviderHandler.ACTION_STEMS.some((stem) => w.startsWith(stem)),
    );
  }

  /**
   * "cuáles son mis gastos fijos?", "dime los recurrentes", "mis periódicos"
   * Signal: recurring-type word. Exclude: action verbs, numbers (amounts).
   */
  private isRecurringListQuery(normalizedText: string): boolean {
    const words = normalizedText.split(/\s+/);

    const RECURRING_SIGNALS = [
      'fijo', 'fijos', 'fija', 'fijas',
      'recurrente', 'recurrentes',
      'periodico', 'periodicos', 'periodica', 'periodicas',
    ];

    if (!words.some((w) => RECURRING_SIGNALS.includes(w))) return false;
    if (this.hasActionWord(words)) return false;
    if (/\d+/.test(normalizedText)) return false;

    return true;
  }

  /**
   * "cómo voy?", "mi resumen", "cuánto llevo", "balance de la semana"
   * Signal: finance summary words. Exclude: action verbs, recurring-type words
   * (to avoid collision with isRecurringListQuery).
   */
  private isSummaryQuery(normalizedText: string): boolean {
    const words = normalizedText.split(/\s+/);

    const SUMMARY_SIGNALS = [
      'resumen', 'balance', 'estado',
    ];
    const SUMMARY_PHRASES = [
      'como voy', 'cuanto llevo', 'cuanto he ganado', 'cuanto he gastado',
      'cuanto gane', 'cuanto gaste',
    ];
    const RECURRING_SIGNALS = [
      'fijo', 'fijos', 'fija', 'fijas',
      'recurrente', 'recurrentes',
      'periodico', 'periodicos',
    ];

    const hasSummaryWord = words.some((w) => SUMMARY_SIGNALS.includes(w));
    const hasSummaryPhrase = SUMMARY_PHRASES.some((p) => normalizedText.includes(p));
    if (!hasSummaryWord && !hasSummaryPhrase) return false;

    // "resumen de gastos fijos" → should go to recurring list, not summary
    if (words.some((w) => RECURRING_SIGNALS.includes(w))) return false;
    if (this.hasActionWord(words)) return false;

    return true;
  }

  /**
   * "mi agenda", "qué tengo hoy", "mis citas", "tengo citas mañana?"
   * Signal: schedule/agenda words. Exclude: action verbs like "agenda una cita".
   */
  private isAgendaQuery(normalizedText: string): boolean {
    const words = normalizedText.split(/\s+/);

    const AGENDA_SIGNALS = ['agenda', 'citas'];
    const AGENDA_PHRASES = [
      'que tengo hoy', 'que tengo manana',
      'tengo citas', 'tengo algo',
      'mi agenda', 'mis citas',
    ];

    const hasAgendaWord = words.some((w) => AGENDA_SIGNALS.includes(w));
    const hasAgendaPhrase = AGENDA_PHRASES.some((p) => normalizedText.includes(p));
    if (!hasAgendaWord && !hasAgendaPhrase) return false;

    // "agenda una cita" or "agendar para mañana" → action, not query
    if (this.hasActionWord(words)) return false;
    // "cita a las 3" → scheduling with time, not viewing
    if (/\d+/.test(normalizedText)) return false;

    return true;
  }

  // ─── Helpers ─────────────────────────────────────────────

  /**
   * Extract text content from a WhatsApp message.
   * For text messages: returns the text directly.
   * For audio/voice notes: downloads media → transcribes via Whisper → returns transcript.
   * For other types: returns empty string.
   */
  private async extractContent(
    message: any,
    senderPhone?: string,
  ): Promise<string> {
    if (message.type === 'text') {
      return message.text?.body?.trim().toLowerCase() || '';
    }

    if (message.type === 'audio' && message.audio?.id) {
      const mediaUrl = await this.whatsapp.getMediaUrl(message.audio.id);
      if (!mediaUrl) {
        this.logger.warn(`Could not resolve media URL for audio ${message.audio.id}`);
        return '';
      }

      const audioBuffer = await this.whatsapp.downloadMedia(mediaUrl);
      if (!audioBuffer) {
        this.logger.warn(`Could not download audio ${message.audio.id}`);
        return '';
      }

      const mimeType = message.audio.mime_type || 'audio/ogg';
      const transcript = await this.aiService.transcribeAudio(audioBuffer, mimeType);

      if (!transcript) {
        if (senderPhone) {
          await this.whatsapp.sendTextMessage(
            senderPhone,
            '🤔 No pude entender tu nota de voz. ¿Podrías intentar de nuevo o escribir tu mensaje?',
          );
        }
        return '';
      }

      return transcript.trim().toLowerCase();
    }

    return '';
  }

  private extractButtonReply(
    message: any,
  ): { id: string; title: string } | null {
    if (message.type !== 'interactive') return null;
    if (message.interactive?.type === 'button_reply') {
      return {
        id: message.interactive.button_reply.id,
        title: message.interactive.button_reply.title,
      };
    }
    if (message.interactive?.type === 'list_reply') {
      return {
        id: message.interactive.list_reply.id,
        title: message.interactive.list_reply.title,
      };
    }
    return null;
  }

  private haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Timeout handling ────────────────────────────────────

  /**
   * Called by the scheduler to auto-reject bookings that providers
   * haven't responded to within 10 minutes.
   */
  async handleBookingTimeout(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true } },
          provider: {
            include: {
              user: { select: { phone: true } },
            },
          },
        },
      });

      if (!booking || booking.status !== BookingStatus.PENDING) {
        // Already handled (accepted, rejected, or cancelled)
        return;
      }

      // Auto-reject
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.REJECTED },
      });

      // Notify customer via WebSocket
      this.bookingsGateway.sendBookingUpdate(booking.customer.id, {
        id: bookingId,
        status: 'REJECTED',
        reason: 'timeout',
      });

      // Notify provider via WhatsApp
      if (booking.provider?.user?.phone) {
        const providerPhone = booking.provider.user.phone;
        await this.whatsapp.sendTextMessage(
          providerPhone,
          `⏱ La solicitud expiró. No respondiste a tiempo.\n\nEscribe "menu" para ver tus opciones.`,
        );
        // Clear their session
        await this.setSession(providerPhone, {
          state: ProviderState.IDLE,
          providerProfileId: booking.provider.id,
          providerUserId: booking.provider.user?.phone ? undefined : undefined,
        });
      }

      this.logger.log(`Booking ${bookingId} auto-rejected (timeout)`);
    } catch (error: any) {
      this.logger.error(
        `Error handling booking timeout: ${error.message}`,
      );
    }
  }

  // ─── Financial firewall helpers (Cap. 44 v3) ──────────────────────
  // These guard against two LLM failure modes that have hit production:
  //  (a) fake confirmations: the LLM says "gasto registrado" but never
  //      called registrar_gasto, so nothing is in the DB.
  //  (b) invented financial figures: the LLM answers "totalízame" with
  //      a number from its memory of the conversation instead of calling
  //      ver_resumen against the DB.
  // The firewall is post-LLM and runs BEFORE the intent switch.

  /**
   * Detects LLM text that looks like a financial action confirmation.
   * Uses a two-signal design (verb participle + financial noun OR money
   * amount nearby) to avoid false positives like a generic "Anotado!"
   * confirming an appointment instead of a financial mutation.
   */
  private looksLikeFinancialConfirmation(text: string): boolean {
    if (!text) return false;
    const normalized = text.toLowerCase();
    const finNoun = '(gasto|ingreso|cobro|pago)';
    const verb = '(registrad[oa]s?|anotad[oa]s?|guardad[oa]s?)';
    const patterns: RegExp[] = [
      new RegExp(`${verb}\\s+(tu|el|un|los?)\\s+${finNoun}`),
      new RegExp(`${finNoun}s?\\s+${verb}`),
      /✅\s*\$\s*\d/,
      new RegExp(`✅[^\\n]{0,40}${finNoun}`),
      new RegExp(`\\$\\s*\\d[\\d,\\.]*[^\\n]{0,30}${verb}`),
      new RegExp(`${verb}[^\\n]{0,30}\\$\\s*\\d`),
    ];
    return patterns.some((p) => p.test(normalized));
  }

  /**
   * Detects whether the user's original message describes a financial
   * action. Used together with looksLikeFinancialConfirmation so we
   * only retry recovery when both signals agree — avoids triggering
   * the firewall on a benign "ok, anotado" exchange.
   */
  private userMessageHasFinancialVerb(userMessage: string): boolean {
    if (!userMessage) return false;
    const normalized = this.normalizeForKeywords(userMessage);
    const verbs = [
      'gaste',
      'gasto en',
      'pague',
      'compre',
      'invertir',
      'cobre',
      'me cobraron',
      'me pagaron',
      'recibi',
      'me dieron',
      'me deposit',
    ];
    return verbs.some((v) => normalized.includes(v));
  }

  /**
   * Detects a monetary value (e.g. "$3,200", "5000 pesos", "3 mil")
   * inside an LLM response. Used to flag suspect "invented figure"
   * answers to read queries.
   */
  private looksLikeMonetaryAnswer(text: string): boolean {
    if (!text) return false;
    const patterns: RegExp[] = [
      /\$\s*\d[\d,.]*/,
      /\b\d[\d,.]*\s*(pesos?|mxn|usd)\b/i,
      /\b\d+\s*mil\b/i,
    ];
    return patterns.some((p) => p.test(text));
  }

  /**
   * Classifies a financial *read* query. Uses an extensible enum (not
   * a boolean) so future read shapes — by category, by client, by date
   * range — can slot in without a second refactor. Unsupported is
   * checked before summary so "cuál fue mi gasto mayor" doesn't get
   * tangentially answered with a generic resumen.
   */
  private classifyFinancialRead(
    userMessage: string,
  ): 'summary' | 'unsupportedAggregate' | 'notFinancialRead' {
    if (!userMessage) return 'notFinancialRead';
    const normalized = this.normalizeForKeywords(userMessage);

    const unsupportedHints = [
      'gasto mayor',
      'mayor gasto',
      'gasto mas grande',
      'mas grande gasto',
      'gasto mas alto',
      'gasto minimo',
      'gasto menor',
      'menor gasto',
      'ingreso mayor',
      'mayor ingreso',
      'ingreso mas grande',
      'ingreso mas alto',
      'ingreso minimo',
      'ingreso menor',
      'cobro mayor',
      'mayor cobro',
      'cobro mas grande',
      'promedio de gasto',
      'gasto promedio',
      'promedio de ingreso',
      'ingreso promedio',
      'cuantos gastos',
      'cuantos ingresos',
      'cuantos cobros',
      'cuantas veces',
      'gastos por categoria',
      'gastos por cliente',
      'ingresos por categoria',
      'ingresos por cliente',
    ];
    if (unsupportedHints.some((h) => normalized.includes(h))) {
      return 'unsupportedAggregate';
    }
    if (/\btop\s+\d+\s+(gasto|ingreso|cobro)s?\b/.test(normalized)) {
      return 'unsupportedAggregate';
    }

    const summaryHints = [
      'totaliza',
      'totalizame',
      'total hasta',
      'total de',
      'el acumulado',
      'acumulado',
      'cuanto llevo',
      'cuanto he gastado',
      'cuanto he ganado',
      'cuanto he cobrado',
      'cuanto he generado',
      'como voy',
      'resumen',
      'balance',
      'estado de cuenta',
      'estado financiero',
      'cuanto va',
      'sumame',
      'suma los',
      'sumalos',
    ];
    if (summaryHints.some((h) => normalized.includes(h))) {
      return 'summary';
    }

    return 'notFinancialRead';
  }

  /**
   * Honest "feature gap" answer. Better to admit it than to reroute
   * to ver_resumen, which would tangentially answer the wrong question
   * and erode trust.
   */
  private featureGapMessage(): string {
    return (
      'Ese detalle todavía no lo puedo sacar, maestro. Por ahora puedo ' +
      'darte el resumen general si me dices "resumen". Estamos trabajando ' +
      'para soportar consultas más específicas.'
    );
  }

  /**
   * Maps the recovery tool's `razon` enum to a clarifying question.
   * Centralized so the copy stays consistent and easy to tweak.
   */
  private clarifyMessageForReason(
    razon: 'falta_monto' | 'falta_tipo' | 'mensaje_ambiguo',
  ): string {
    switch (razon) {
      case 'falta_monto':
        return '¿De cuánto fue, maestro?';
      case 'falta_tipo':
        return '¿Eso fue un gasto o un cobro?';
      case 'mensaje_ambiguo':
      default:
        return 'No me quedó claro, ¿me lo repites?';
    }
  }

  /**
   * Dedicated parser for the recovery turn. Intentionally separate from
   * parseAllToolCalls because that helper relies on TOOL_TO_INTENT,
   * which does not (and must not) include `necesita_aclaracion`.
   */
  private parseRecoveryToolCall(toolCalls: RawToolCall[]):
    | { kind: 'expense'; data: Record<string, any> }
    | { kind: 'income'; data: Record<string, any> }
    | {
        kind: 'clarify';
        razon: 'falta_monto' | 'falta_tipo' | 'mensaje_ambiguo';
      }
    | { kind: 'no_tool_called' } {
    if (!toolCalls || toolCalls.length === 0) {
      return { kind: 'no_tool_called' };
    }

    const call = toolCalls[0];
    let args: Record<string, unknown> = {};
    try {
      args = call.arguments
        ? (JSON.parse(call.arguments) as Record<string, unknown>)
        : {};
    } catch {
      args = {};
    }

    if (call.name === 'registrar_gasto') {
      return { kind: 'expense', data: args as Record<string, any> };
    }
    if (call.name === 'registrar_ingreso') {
      return { kind: 'income', data: args as Record<string, any> };
    }
    if (call.name === 'necesita_aclaracion') {
      const razon = args.razon;
      if (
        razon === 'falta_monto' ||
        razon === 'falta_tipo' ||
        razon === 'mensaje_ambiguo'
      ) {
        return { kind: 'clarify', razon };
      }
      return { kind: 'clarify', razon: 'mensaje_ambiguo' };
    }
    return { kind: 'no_tool_called' };
  }

  /**
   * Returns the (possibly modified) AiResponse list to continue with,
   * or `null` if the firewall handled the message itself and the caller
   * should stop processing.
   *
   * Two checks, in order:
   *   1. Fake confirmation: single CONVERSACION_GENERAL whose text
   *      claims a financial mutation while the user message clearly
   *      described one. We retry against a tiny safe tool subset.
   *   2. Invented financial figure: single CONVERSACION_GENERAL with
   *      a $ amount in response to a financial read query. Reroute to
   *      ver_resumen for "summary" intent, or send the honest
   *      feature-gap message for "unsupportedAggregate".
   */
  private async applyFinancialFirewall(
    phone: string,
    userMessage: string,
    aiResponses: AiResponse[],
    providerProfileId: string | undefined,
    tz: string,
    srcHash?: string,
  ): Promise<AiResponse[] | null> {
    if (!aiResponses || aiResponses.length !== 1) return aiResponses;
    const sole = aiResponses[0];
    if (sole.intent !== AiIntent.CONVERSACION_GENERAL) return aiResponses;

    const llmText = sole.message || '';

    // ── (1) Fake-confirmation check ────────────────────────────
    if (
      this.looksLikeFinancialConfirmation(llmText) &&
      this.userMessageHasFinancialVerb(userMessage)
    ) {
      this.logger.warn(
        `[firewall] fake_confirmation_detected phone=${phone} text=${llmText.slice(0, 80)}`,
      );
      const recovery = await this.aiService.recoverFromFakeConfirmation(
        phone,
        userMessage,
      );
      const parsed = this.parseRecoveryToolCall(recovery.toolCalls);

      if (parsed.kind === 'expense') {
        this.logger.log(
          `[firewall] fake_confirmation_recovered_as_expense phone=${phone}`,
        );
        await this.handleRegistrarGasto(
          phone,
          parsed.data,
          providerProfileId,
          tz,
          srcHash,
        );
        return null;
      }
      if (parsed.kind === 'income') {
        this.logger.log(
          `[firewall] fake_confirmation_recovered_as_income phone=${phone}`,
        );
        await this.handleRegistrarIngreso(
          phone,
          parsed.data,
          providerProfileId,
          tz,
          srcHash,
        );
        return null;
      }
      if (parsed.kind === 'clarify') {
        this.logger.log(
          `[firewall] fake_confirmation_unrecovered_needs_clarification phone=${phone} razon=${parsed.razon}`,
        );
        await this.sendAndRecord(
          phone,
          this.clarifyMessageForReason(parsed.razon),
          AiIntent.CONVERSACION_GENERAL,
        );
        return null;
      }

      this.logger.warn(
        `[firewall] fake_confirmation_unrecovered_no_tool_called phone=${phone}`,
      );
      await this.sendAndRecord(
        phone,
        this.clarifyMessageForReason('mensaje_ambiguo'),
        AiIntent.CONVERSACION_GENERAL,
      );
      return null;
    }

    // ── (2) Invented-figure check ──────────────────────────────
    if (this.looksLikeMonetaryAnswer(llmText)) {
      const klass = this.classifyFinancialRead(userMessage);
      if (klass === 'summary') {
        this.logger.warn(
          `[firewall] summary_rerouted phone=${phone} suspect=${llmText.slice(0, 80)}`,
        );
        if (providerProfileId) {
          await this.handleVerResumen(phone, {}, providerProfileId, tz);
        } else {
          await this.sendAndRecord(
            phone,
            'Para ver tu resumen necesito tu perfil configurado. Escribe "menu".',
            AiIntent.CONVERSACION_GENERAL,
          );
        }
        return null;
      }
      if (klass === 'unsupportedAggregate') {
        this.logger.warn(
          `[firewall] feature_gap phone=${phone} query=${userMessage.slice(0, 80)}`,
        );
        await this.sendAndRecord(
          phone,
          this.featureGapMessage(),
          AiIntent.CONVERSACION_GENERAL,
        );
        return null;
      }
    }

    return aiResponses;
  }
}
