import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsGateway } from './bookings.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ||
          'handy-dev-secret-change-in-production',
      }),
    }),
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsGateway],
  exports: [BookingsService, BookingsGateway],
})
export class BookingsModule {}


