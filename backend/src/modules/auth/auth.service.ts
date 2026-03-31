import {
  Injectable,
  Optional,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly OTP_TTL_MINUTES = 5;
  private readonly ACCESS_TOKEN_TTL = '15m';
  private readonly REFRESH_TOKEN_TTL_DAYS = 30;
  private readonly MAX_OTP_ATTEMPTS_PER_HOUR = 5;

  /** Test phone numbers that accept a fixed OTP code (for QA/demo). */
  private readonly TEST_PHONE_CODE = '000000';
  private readonly testPhones: Set<string>;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
    @Optional() private whatsapp?: WhatsAppService,
  ) {
    // Parse TEST_PHONES env var: comma-separated list of phone numbers
    // e.g. "+5215500000001,+5215500000002,+5215512345001"
    const raw = this.config.get<string>('TEST_PHONES') || '';
    this.testPhones = new Set(
      raw.split(',').map(p => p.trim()).filter(Boolean),
    );
    if (this.testPhones.size > 0) {
      this.logger.log(`🧪 ${this.testPhones.size} test phone(s) configured — code: ${this.TEST_PHONE_CODE}`);
    }
  }

  /** Check if a phone is a test number */
  private isTestPhone(phone: string): boolean {
    return this.testPhones.has(phone);
  }

  // ─── Request OTP ────────────────────────────────────────────

  async requestOtp(phone: string) {
    // Rate limiting: max N OTP requests per phone per hour
    const rateLimitKey = `otp_rate:${phone}`;
    const currentCount = await this.redis.get(rateLimitKey);

    if (currentCount && parseInt(currentCount) >= this.MAX_OTP_ATTEMPTS_PER_HOUR) {
      throw new BadRequestException(
        'Too many OTP requests. Please wait before trying again.',
      );
    }

    // ── Test phones: fixed code, no WhatsApp ──
    const isTest = this.isTestPhone(phone);
    const code = isTest ? this.TEST_PHONE_CODE : this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    // Invalidate any previous unused codes for this phone
    await this.prisma.otpCode.updateMany({
      where: { phone, used: false },
      data: { used: true },
    });

    // Find user if exists (to link OTP)
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    // Save OTP to database
    await this.prisma.otpCode.create({
      data: {
        phone,
        code,
        expiresAt,
        userId: existingUser?.id,
      },
    });

    // Increment rate limit counter (expires in 1 hour)
    const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
    await this.redis.set(rateLimitKey, newCount.toString(), 3600);

    // ──── Send OTP ────
    if (isTest) {
      // Test phones: skip WhatsApp, code is always 000000
      this.logger.log(`🧪 Test OTP for ${phone}: ${code}`);
    } else if (this.whatsapp?.isWhatsAppEnabled()) {
      // Production: send via WhatsApp
      const otpMessage =
        `🔑 *Tu código de verificación Handy*\n\n` +
        `${code}\n\n` +
        `Válido por ${this.OTP_TTL_MINUTES} minutos. No compartas este código.`;
      const result = await this.whatsapp.sendTextMessage(phone, otpMessage);
      if (result.success) {
        this.logger.log(`OTP sent via WhatsApp to ${phone}`);
      } else {
        this.logger.warn(`WhatsApp OTP failed for ${phone}, logging to console`);
        this.logOtpToConsole(phone, code, expiresAt);
      }
    } else {
      // Development mode: log to console
      this.logOtpToConsole(phone, code, expiresAt);
    }

    return {
      message: 'OTP sent successfully',
      expiresAt,
      // Include code in dev OR for test phones
      ...((this.config.get('NODE_ENV') !== 'production' || isTest) && { code }),
    };
  }

  // ─── Verify OTP ─────────────────────────────────────────────

  async verifyOtp(phone: string, code: string) {
    // Find matching OTP
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        code,
        used: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    // Check expiry
    if (new Date() > otpRecord.expiresAt) {
      // Mark as used so it can't be retried
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });
      throw new UnauthorizedException('OTP code has expired');
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { phone } });
    let isNewUser = false;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          role: 'CUSTOMER',
        },
      });
      isNewUser = true;
      this.logger.log(`New user created: ${user.id} (${phone})`);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.phone, user.role);

    return {
      ...tokens,
      isNewUser,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    };
  }

  // ─── Refresh Token ──────────────────────────────────────────

  async refreshAccessToken(refreshToken: string) {
    // Find the refresh token in DB
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (tokenRecord.revoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (new Date() > tokenRecord.expiresAt) {
      // Revoke expired token
      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = tokenRecord.user;

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    // Revoke old refresh token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true },
    });

    // Generate new token pair
    const tokens = await this.generateTokens(user.id, user.phone, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    };
  }

  // ─── Logout ─────────────────────────────────────────────────

  async logout(refreshToken: string) {
    // Revoke the refresh token
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (tokenRecord) {
      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true },
      });
    }

    return { message: 'Logged out successfully' };
  }

  // ─── Get Current User ───────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { providerProfile: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount,
      createdAt: user.createdAt,
      providerProfile: user.providerProfile
        ? {
            bio: user.providerProfile.bio,
            serviceTypes: user.providerProfile.serviceTypes,
            totalJobs: user.providerProfile.totalJobs,
            isVerified: user.providerProfile.isVerified,
            isAvailable: user.providerProfile.isAvailable,
          }
        : null,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────

  private logOtpToConsole(phone: string, code: string, expiresAt: Date) {
    this.logger.log(`\n📱 OTP for ${phone}: ${code}\n`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📱 OTP CODE for ${phone}`);
    console.log(`🔑 Code: ${code}`);
    console.log(`⏰ Expires: ${expiresAt.toISOString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  private generateOtpCode(): string {
    // Generate cryptographically secure 6-digit code
    const bytes = randomBytes(3); // 3 bytes = 6 hex chars
    const num = parseInt(bytes.toString('hex'), 16) % 1000000;
    return num.toString().padStart(6, '0');
  }

  private async generateTokens(userId: string, phone: string, role: string) {
    const payload = { sub: userId, phone, role };

    // Access token (short-lived)
    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_TTL,
    });

    // Refresh token (long-lived, stored in DB)
    const refreshToken = randomBytes(40).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}

