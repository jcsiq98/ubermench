import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrismaService');

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    const databaseUrl = process.env.DATABASE_URL || '';

    // Connection pooling for Neon in production
    const url =
      isProd && databaseUrl.includes('neon.tech') && !databaseUrl.includes('pgbouncer=true')
        ? `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}pgbouncer=true&connect_timeout=15&pool_timeout=15`
        : databaseUrl;

    super({
      datasources: url !== databaseUrl ? { db: { url } } : undefined,
      log: isProd
        ? [{ emit: 'event', level: 'error' }]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ],
    });
  }

  async onModuleInit() {
    // Log slow queries in development
    if (process.env.NODE_ENV !== 'production') {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 500) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query?.slice(0, 200)}`);
        }
      });
    }

    (this as any).$on('error', (e: any) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });

    try {
      await this.$connect();
      this.logger.log('Connected to database');
    } catch (error) {
      this.logger.warn(
        'Could not connect to database. Some features will not work. ' +
        'Set DATABASE_URL in .env to connect.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
