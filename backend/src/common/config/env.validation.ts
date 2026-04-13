import { Logger } from '@nestjs/common';

interface EnvVar {
  key: string;
  required: boolean | 'production';
  fallback?: string;
  sensitive?: boolean;
}

const INSECURE_DEFAULTS = [
  'handy-dev-secret-change-in-production',
  'handy-dev-jwt-secret-change-in-prod',
  'handy-dev-refresh-secret-change-in-prod',
  'secret',
  'changeme',
];

const ENV_SCHEMA: EnvVar[] = [
  { key: 'DATABASE_URL', required: true },
  { key: 'JWT_SECRET', required: true, sensitive: true },
  { key: 'JWT_REFRESH_SECRET', required: 'production', sensitive: true },
  { key: 'REDIS_URL', required: 'production' },
  { key: 'PII_ENCRYPTION_KEY', required: false, sensitive: true },
  { key: 'WHATSAPP_TOKEN', required: false, sensitive: true },
  { key: 'WHATSAPP_PHONE_NUMBER_ID', required: false },
  { key: 'WHATSAPP_VERIFY_TOKEN', required: false, fallback: 'handy-verify-token' },
  { key: 'FRONTEND_URL', required: false, fallback: 'http://localhost:3001' },
  { key: 'CLOUDINARY_CLOUD_NAME', required: false },
  { key: 'CLOUDINARY_API_KEY', required: false, sensitive: true },
  { key: 'CLOUDINARY_API_SECRET', required: false, sensitive: true },
  { key: 'OPENAI_API_KEY', required: false, sensitive: true },
  { key: 'OPENAI_MODEL', required: false, fallback: 'gpt-4o-mini' },
  { key: 'PORT', required: false, fallback: '3000' },
];

export function validateEnv(): void {
  const logger = new Logger('EnvValidation');
  const missing: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === 'production';

  for (const envVar of ENV_SCHEMA) {
    const value = process.env[envVar.key];
    const isRequired =
      envVar.required === true || (envVar.required === 'production' && isProd);

    if (!value && isRequired) {
      missing.push(envVar.key);
    } else if (!value && envVar.fallback) {
      warnings.push(`${envVar.key} not set — using fallback "${envVar.fallback}"`);
    }
  }

  // Reject insecure secrets in production
  if (isProd) {
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      const val = process.env[key];
      if (val && INSECURE_DEFAULTS.some((d) => val.includes(d))) {
        missing.push(`${key} (using insecure default in production!)`);
      }
    }
  }

  if (warnings.length > 0) {
    warnings.forEach((w) => logger.warn(`⚠️  ${w}`));
  }

  if (missing.length > 0) {
    const msg = `Missing required env vars: ${missing.join(', ')}`;
    logger.error(`🔴 ${msg}`);

    if (isProd) {
      throw new Error(msg);
    }
  }

  logger.log('✅ Environment variables validated');
}
