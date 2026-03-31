import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './config/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ServicesModule } from './modules/_marketplace/services/services.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { BookingsModule } from './modules/_marketplace/bookings/bookings.module';
import { MessagesModule } from './modules/_marketplace/messages/messages.module';
import { RatingsModule } from './modules/_marketplace/ratings/ratings.module';
import { ZonesModule } from './modules/zones/zones.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { AiModule } from './modules/ai/ai.module';
import { IncomeModule } from './modules/income/income.module';
import { ExpenseModule } from './modules/expense/expense.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { ProviderDashboardModule } from './modules/provider-dashboard/provider-dashboard.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AdminModule } from './modules/admin/admin.module';
import { TrustScoreModule } from './modules/_marketplace/trust-score/trust-score.module';
import { ReportsModule } from './modules/_marketplace/reports/reports.module';
import { VerificationModule } from './modules/verification/verification.module';
import { SafetyModule } from './modules/_marketplace/safety/safety.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QueueModule } from './common/queues/queue.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Structured logging with Pino (JSON in prod, pretty in dev)
    LoggerModule.forRoot({
      pinoHttp: {
        level: isProd ? 'info' : 'debug',
        transport: isProd
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
        autoLogging: {
          ignore: (req: any) =>
            req.url === '/api/health' || req.url === '/api/health/whatsapp',
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        customProps: (req: any) => ({
          correlationId: req.headers['x-correlation-id'],
        }),
      },
    }),

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),

    // Infrastructure
    PrismaModule,
    RedisModule,
    QueueModule.register(),
    CryptoModule,

    // AI (global)
    AiModule,

    // Income tracking (global)
    IncomeModule,

    // Expense tracking (global)
    ExpenseModule,

    // Appointments (global)
    AppointmentsModule,

    // Workspace (global)
    WorkspaceModule,

    // WhatsApp (global)
    WhatsAppModule,

    // Auth
    AuthModule,

    // Feature modules
    UsersModule,
    ServicesModule,
    ProvidersModule,
    BookingsModule,
    MessagesModule,
    RatingsModule,
    ZonesModule,
    OnboardingModule,
    AddressesModule,
    ProviderDashboardModule,
    AdminModule,
    TrustScoreModule,
    ReportsModule,
    VerificationModule,
    SafetyModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
