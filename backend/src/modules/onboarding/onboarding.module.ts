import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'handy-dev-secret-change-in-production',
        signOptions: { expiresIn: '1h' }, // Token temporal de 1 hora para verificación
      }),
    }),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, CloudinaryService],
  exports: [OnboardingService],
})
export class OnboardingModule {}

