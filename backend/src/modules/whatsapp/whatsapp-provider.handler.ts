import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOnboardingHandler } from './whatsapp-onboarding.handler';
import { BookingsGateway } from '../_marketplace/bookings/bookings.gateway';
import { MessagesService } from '../_marketplace/messages/messages.service';
import { RatingsService } from '../_marketplace/ratings/ratings.service';
import { AiService } from '../ai/ai.service';
import { AiContextService } from '../ai/ai-context.service';
import { AiIntent, WorkspaceConfigData } from '../ai/ai.types';
import { IncomeService } from '../income/income.service';
import { ExpenseService } from '../expense/expense.service';
import { RecurringExpenseService } from '../expense/recurring-expense.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { BookingStatus, PaymentMethod } from '@prisma/client';

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

  // ─── Public: Handle incoming WhatsApp message ────────────

  async handleIncomingMessage(
    senderPhone: string,
    senderName: string,
    message: any,
  ): Promise<void> {
    // Check if this phone belongs to a provider
    const provider = await this.findProviderByPhone(senderPhone);
    if (!provider) {
      // Not a registered provider — route to onboarding flow
      this.logger.log(`Message from non-provider ${senderPhone}, routing to onboarding`);
      const text = await this.extractContent(message, senderPhone);
      await this.onboardingHandler.handleMessage(senderPhone, senderName, text);
      return;
    }

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

    // Extract text (or transcribe audio) and interactive content
    const text = await this.extractContent(message, senderPhone);
    const buttonReply = this.extractButtonReply(message);

    // ── Workspace profile keywords ──
    if (
      text === 'mis servicios' ||
      text === 'mi negocio' ||
      text === 'mi workspace' ||
      text === 'configuracion'
    ) {
      if (provider.providerProfile) {
        const summary = await this.workspaceService.getWorkspaceSummary(
          provider.providerProfile.id,
        );
        await this.whatsapp.sendTextMessage(senderPhone, summary);
        return;
      }
    }

    // ── Global keywords ──
    if (text === 'help' || text === 'ayuda') {
      return this.sendHelpMenu(senderPhone);
    }
    if (text === 'menu' || text === 'inicio') {
      return this.sendProviderDashboard(senderPhone, provider.name || senderName);
    }
    if (text === 'reset' || text === 'limpiar historial' || text === 'limpiar') {
      await this.aiContextService.clearHistory(senderPhone);
      await this.whatsapp.sendTextMessage(
        senderPhone,
        '🔄 Historial de conversación limpiado. Puedes empezar de nuevo.',
      );
      return;
    }
    if (text === 'dashboard' || text === 'estadisticas' || text === 'stats') {
      return this.sendDashboardStats(senderPhone, provider.providerProfile!.id);
    }
    if (text === 'trabajos' || text === 'jobs' || text === 'mis trabajos') {
      return this.sendJobsList(senderPhone, provider.providerProfile!.id);
    }
    if (text === 'cuenta' || text === 'mi cuenta' || text === 'perfil') {
      return this.sendAccountInfo(senderPhone, provider.providerProfile!.id);
    }

    // ── Handle menu button presses ──
    if (buttonReply) {
      if (buttonReply.id === 'menu_dashboard' && provider.providerProfile) {
        return this.sendDashboardStats(senderPhone, provider.providerProfile.id);
      }
      if (buttonReply.id === 'menu_jobs' && provider.providerProfile) {
        return this.sendJobsList(senderPhone, provider.providerProfile.id);
      }
      if (buttonReply.id === 'menu_account' && provider.providerProfile) {
        return this.sendAccountInfo(senderPhone, provider.providerProfile.id);
      }
      if (buttonReply.id === 'edit_name') {
        await this.setSession(senderPhone, { ...session, state: ProviderState.EDITING_NAME });
        await this.whatsapp.sendTextMessage(senderPhone, '✏️ Escribe tu nuevo nombre:');
        return;
      }
      if (buttonReply.id === 'edit_bio') {
        await this.setSession(senderPhone, { ...session, state: ProviderState.EDITING_BIO });
        await this.whatsapp.sendTextMessage(senderPhone, '📝 Escribe tu nueva bio profesional:');
        return;
      }
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
        return this.sendProviderDashboard(senderPhone, senderName);
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

    return this.sendProviderDashboard(phone, name);
  }

  // ─── AI Conversational Handler ──────────────────────────

  private async handleAiConversation(
    phone: string,
    text: string,
    providerName: string,
  ): Promise<void> {
    const provider = await this.findProviderByPhone(phone);
    const providerProfileId = provider?.providerProfile?.id;

    // Load workspace context + financial data for personalized AI responses
    let workspaceContext;
    if (providerProfileId) {
      try {
        const [wsCtx, recentExpenses, activeRecurring] = await Promise.all([
          this.workspaceService.getWorkspaceContext(providerProfileId),
          this.expenseService.getRecent(providerProfileId, 5),
          this.recurringExpenseService.listActive(providerProfileId),
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
        };
      } catch (err: any) {
        this.logger.warn(`Failed to load workspace context: ${err.message}`);
      }
    }

    try {
      const aiResponse = await this.aiService.processMessage(
        phone,
        text,
        providerName,
        workspaceContext,
      );

      // Fire-and-forget: check if it's time to extract learned facts
      if (providerProfileId) {
        this.maybeExtractLearnedFacts(phone, providerProfileId, workspaceContext)
          .catch((err) =>
            this.logger.warn(`Learned facts extraction failed: ${err.message}`),
          );
      }

      switch (aiResponse.intent) {
        case AiIntent.REGISTRAR_INGRESO:
          return this.handleRegistrarIngreso(phone, aiResponse.data, providerProfileId);

        case AiIntent.REGISTRAR_GASTO:
          return this.handleRegistrarGasto(phone, aiResponse.data, providerProfileId);

        case AiIntent.GESTIONAR_GASTO_RECURRENTE:
          return this.handleGastoRecurrente(phone, aiResponse.data, providerProfileId);

        case AiIntent.VER_RESUMEN:
          return this.handleVerResumen(phone, aiResponse.data, providerProfileId);

        case AiIntent.AGENDAR_CITA:
          return this.handleAgendarCita(phone, aiResponse.data, providerProfileId);

        case AiIntent.VER_AGENDA:
          return this.handleVerAgenda(phone, providerProfileId);

        case AiIntent.CONFIRMAR_CLIENTE:
          // Phase 0.5
          this.logger.log('Intent: confirmar_cliente');
          await this.whatsapp.sendTextMessage(phone, aiResponse.message);
          return;

        case AiIntent.CONFIGURAR_PERFIL:
          return this.handleConfigurarPerfil(phone, aiResponse, providerProfileId);

        default:
          await this.whatsapp.sendTextMessage(phone, aiResponse.message);
          return;
      }
    } catch (error: any) {
      this.logger.error(`AI conversation error: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '🤔 Hubo un problema procesando tu mensaje. Intenta de nuevo o escribe *"menu"* para ver opciones.',
      );
    }
  }

  // ─── Workspace: configurar perfil ───────────────────────

  private async handleConfigurarPerfil(
    phone: string,
    aiResponse: { message: string; data?: Record<string, any> },
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const configData = aiResponse.data as WorkspaceConfigData | undefined;
    if (!configData?.action) {
      await this.whatsapp.sendTextMessage(phone, aiResponse.message);
      return;
    }

    const result = await this.workspaceService.applyConfig(
      providerProfileId,
      configData,
    );
    await this.whatsapp.sendTextMessage(phone, result.confirmationMessage);
  }

  // ─── Income: registrar ingreso ──────────────────────────

  private async handleRegistrarIngreso(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const amount = data?.amount;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      await this.whatsapp.sendTextMessage(
        phone,
        '🤔 No pude detectar el monto. ¿Podrías decirme cuánto cobraste?\n\nEjemplo: *"Cobré 1,200 pesos en efectivo"*',
      );
      return;
    }

    const validMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'OTHER'];
    const paymentMethod = validMethods.includes(data?.paymentMethod)
      ? (data.paymentMethod as PaymentMethod)
      : PaymentMethod.CASH;

    try {
      await this.incomeService.create({
        providerId: providerProfileId,
        amount,
        description: data?.description,
        paymentMethod,
        clientName: data?.clientName,
      });

      const confirmation = this.incomeService.formatIncomeConfirmation(
        amount,
        data?.description,
        data?.clientName,
        paymentMethod,
      );

      await this.whatsapp.sendTextMessage(phone, confirmation);
    } catch (error: any) {
      this.logger.error(`Error creating income: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se pudo registrar el ingreso. Intenta de nuevo.',
      );
    }
  }

  // ─── Expense: registrar gasto ───────────────────────────

  private async handleRegistrarGasto(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const amount = data?.amount;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      await this.whatsapp.sendTextMessage(
        phone,
        '🤔 No pude detectar el monto. ¿Podrías decirme cuánto gastaste?\n\nEjemplo: *"Gasté 200 en material"*',
      );
      return;
    }

    try {
      await this.expenseService.create({
        providerId: providerProfileId,
        amount,
        category: data?.category,
        description: data?.description,
      });

      const confirmation = this.expenseService.formatExpenseConfirmation(
        amount,
        data?.category,
        data?.description,
      );

      await this.whatsapp.sendTextMessage(phone, confirmation);
    } catch (error: any) {
      this.logger.error(`Error creating expense: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se pudo registrar el gasto. Intenta de nuevo.',
      );
    }
  }

  // ─── Recurring Expense: gestionar gasto recurrente ──────

  private async handleGastoRecurrente(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const action = data?.action;

    if (action === 'list') {
      const expenses = await this.recurringExpenseService.listActive(providerProfileId);
      const msg = this.recurringExpenseService.formatRecurringList(expenses);
      await this.whatsapp.sendTextMessage(phone, msg);
      return;
    }

    if (action === 'cancel') {
      const description = data?.description;
      if (!description) {
        await this.whatsapp.sendTextMessage(
          phone,
          '🤔 ¿Cuál gasto recurrente quieres cancelar? Dime el nombre.',
        );
        return;
      }

      const cancelled = await this.recurringExpenseService.cancel(
        providerProfileId,
        description,
      );

      if (cancelled) {
        await this.whatsapp.sendTextMessage(
          phone,
          `✅ Cancelé el gasto recurrente de *${description}*.`,
        );
      } else {
        await this.whatsapp.sendTextMessage(
          phone,
          `🤔 No encontré un gasto recurrente activo con "${description}". Escribe *"mis gastos fijos"* para ver los que tienes.`,
        );
      }
      return;
    }

    if (action === 'create') {
      const amount = data?.amount;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        await this.whatsapp.sendTextMessage(
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

        await this.whatsapp.sendTextMessage(
          phone,
          `✅ *¡Gasto recurrente creado!*\n\n💸 *$${amount.toLocaleString('es-MX')}* — ${description}\n🔄 ${freq}${day}\n\nSe registrará automáticamente cada ${freq === 'mensual' ? 'mes' : 'semana'}. Para cancelarlo, dime *"cancela el gasto de ${description}"*.`,
        );
      } catch (error: any) {
        this.logger.error(`Error creating recurring expense: ${error.message}`);
        await this.whatsapp.sendTextMessage(
          phone,
          '❌ No se pudo crear el gasto recurrente. Intenta de nuevo.',
        );
      }
      return;
    }

    await this.whatsapp.sendTextMessage(
      phone,
      '🤔 No entendí qué quieres hacer con gastos recurrentes. Puedes:\n\n• *Crear*: "Gasto fijo de 500 de renta"\n• *Ver*: "Mis gastos fijos"\n• *Cancelar*: "Cancela el gasto de Netflix"',
    );
  }

  // ─── Income: ver resumen ────────────────────────────────

  private async handleVerResumen(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    try {
      const [weekIncome, monthIncome, weekExpense, monthExpense] =
        await Promise.all([
          this.incomeService.getWeekSummary(providerProfileId),
          this.incomeService.getMonthSummary(providerProfileId),
          this.expenseService.getWeekSummary(providerProfileId),
          this.expenseService.getMonthSummary(providerProfileId),
        ]);

      const weekIncomeMsg = this.incomeService.formatSummaryMessage(weekIncome);
      const weekExpenseMsg = this.expenseService.formatExpenseSummaryMessage(weekExpense);
      const weekNet = weekIncome.total - weekExpense.total;

      const monthIncomeMsg = this.incomeService.formatSummaryMessage(monthIncome);
      const monthExpenseMsg = this.expenseService.formatExpenseSummaryMessage(monthExpense);
      const monthNet = monthIncome.total - monthExpense.total;

      let msg = weekIncomeMsg;
      if (weekExpense.count > 0) {
        msg += `\n${weekExpenseMsg}`;
        msg += `\n💰 *Balance semana: $${weekNet.toLocaleString('es-MX')}*`;
      }

      msg += `\n\n${monthIncomeMsg}`;
      if (monthExpense.count > 0) {
        msg += `\n${monthExpenseMsg}`;
        msg += `\n💰 *Balance mes: $${monthNet.toLocaleString('es-MX')}*`;
      }

      await this.whatsapp.sendTextMessage(phone, msg);
    } catch (error: any) {
      this.logger.error(`Error getting summary: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se pudo obtener el resumen. Intenta de nuevo.',
      );
    }
  }

  // ─── Appointments: agendar cita ─────────────────────────

  private async handleAgendarCita(
    phone: string,
    data: Record<string, any> | undefined,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    const scheduledAt = this.appointmentsService.parseScheduledDate(
      data?.date,
      data?.time,
    );

    if (!scheduledAt) {
      await this.whatsapp.sendTextMessage(
        phone,
        '🤔 No pude detectar la fecha u hora de la cita. ¿Podrías ser más específico?\n\nEjemplo: *"Mañana a las 10 con la señora García en Condesa"*',
      );
      return;
    }

    try {
      await this.appointmentsService.create({
        providerId: providerProfileId,
        clientName: data?.clientName,
        clientPhone: data?.clientPhone,
        description: data?.description,
        address: data?.address,
        scheduledAt,
      });

      const confirmation = this.appointmentsService.formatAppointmentConfirmation(
        scheduledAt,
        data?.clientName,
        data?.description,
        data?.address,
      );

      await this.whatsapp.sendTextMessage(phone, confirmation);
    } catch (error: any) {
      this.logger.error(`Error creating appointment: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se pudo agendar la cita. Intenta de nuevo.',
      );
    }
  }

  // ─── Appointments: ver agenda ───────────────────────────

  private async handleVerAgenda(
    phone: string,
    providerProfileId?: string,
  ): Promise<void> {
    if (!providerProfileId) {
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se encontró tu perfil de proveedor.',
      );
      return;
    }

    try {
      const todayAppts = await this.appointmentsService.getTodayAgenda(providerProfileId);
      const tomorrowAppts = await this.appointmentsService.getTomorrowAgenda(providerProfileId);

      const todayMsg = this.appointmentsService.formatAgendaMessage(todayAppts, 'de hoy');
      const tomorrowMsg = this.appointmentsService.formatAgendaMessage(tomorrowAppts, 'de mañana');

      await this.whatsapp.sendTextMessage(
        phone,
        `${todayMsg}\n\n${tomorrowMsg}`,
      );
    } catch (error: any) {
      this.logger.error(`Error getting agenda: ${error.message}`);
      await this.whatsapp.sendTextMessage(
        phone,
        '❌ No se pudo obtener la agenda. Intenta de nuevo.',
      );
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

  // ─── Dashboard / Help ───────────────────────────────────

  private async sendProviderDashboard(phone: string, name: string) {
    await this.whatsapp.sendInteractiveButtons(
      phone,
      `👋 Hola *${name}*! Bienvenido a *Handy*.\n\n` +
        `Recibirás notificaciones aquí cuando un cliente solicite tus servicios.\n\n` +
        `¿Qué deseas hacer?`,
      [
        { id: 'menu_dashboard', title: '📊 Mi Dashboard' },
        { id: 'menu_jobs', title: '📝 Mis Trabajos' },
        { id: 'menu_account', title: '⚙️ Mi Cuenta' },
      ],
    );
  }

  private async sendHelpMenu(phone: string) {
    await this.whatsapp.sendTextMessage(
      phone,
      `❓ *Ayuda — Handy Proveedor*\n\n` +
        `Cuando recibas una solicitud:\n` +
        `✅ Toca *Aceptar* o escribe "aceptar"\n` +
        `❌ Toca *Rechazar* o escribe "rechazar"\n\n` +
        `Durante un trabajo:\n` +
        `📍 *"en camino"* — Indicar que vas en camino\n` +
        `🔧 *"empezar"* — Iniciar el trabajo\n` +
        `✅ *"completar"* — Marcar como terminado\n\n` +
        `General:\n` +
        `📋 *"menu"* — Ver menú principal\n` +
        `📊 *"dashboard"* — Ver tus estadísticas\n` +
        `📝 *"trabajos"* — Ver tus trabajos recientes\n` +
        `❓ *"ayuda"* — Ver este mensaje`,
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

    if (
      JSON.stringify(newFacts) !== JSON.stringify(currentFacts) &&
      newFacts.length > 0
    ) {
      await this.workspaceService.updateLearnedFacts(
        providerProfileId,
        newFacts,
      );
    }
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
}

