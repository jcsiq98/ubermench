import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger('EncryptionService');
  private key: Buffer | null = null;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const rawKey = this.config.get<string>('PII_ENCRYPTION_KEY');

    if (!rawKey) {
      this.logger.warn(
        'PII_ENCRYPTION_KEY not set — PII encryption disabled. ' +
          'Set a 32+ char key in production.',
      );
      return;
    }

    this.key = scryptSync(rawKey, 'handy-pii-salt', 32);
    this.enabled = true;
    this.logger.log('PII encryption enabled (AES-256-GCM)');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  encrypt(plaintext: string): string {
    if (!this.enabled || !this.key || !plaintext) return plaintext;
    if (this.isEncrypted(plaintext)) return plaintext;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    if (!this.enabled || !this.key || !ciphertext) return ciphertext;
    if (!this.isEncrypted(ciphertext)) return ciphertext;

    try {
      const withoutPrefix = ciphertext.slice(ENCRYPTED_PREFIX.length);
      const [ivB64, authTagB64, encrypted] = withoutPrefix.split(':');

      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      const decipher = createDecipheriv(ALGORITHM, this.key!, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error: any) {
      this.logger.error(`Decryption failed: ${error.message}`);
      return ciphertext;
    }
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
  }

  maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return '****';
    return '***' + phone.slice(-4);
  }

  maskEmail(email: string): string {
    if (!email) return '****';
    const [local, domain] = email.split('@');
    if (!domain) return '****';
    return `${local[0]}***@${domain}`;
  }
}
