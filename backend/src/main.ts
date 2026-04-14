import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnv } from './common/config/env.validation';
import { setupBullBoard } from './common/queues/bull-board.setup';

async function bootstrap() {
  validateEnv();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.use(helmet());

  const isProd = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: isProd
      ? [
          process.env.FRONTEND_URL,
          /https:\/\/.*\.vercel\.app$/,
        ].filter(Boolean)
      : ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API versioning: /api/v1/* aliases to /api/*
  app.getHttpAdapter().getInstance().use((req: any, _res: any, next: any) => {
    if (req.url.startsWith('/api/v1/')) {
      req.url = '/api/' + req.url.slice(8);
    }
    next();
  });

  // Bull Board dashboard (admin-only UI for queue monitoring)
  setupBullBoard(app);

  // Swagger API docs (dev only)
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('Handy API')
      .setDescription('API for the Handy service marketplace')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log('');
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.log(`🚀 Handy API running on port ${port}`);
  if (!isProd) {
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
    logger.log(`📊 Bull Board:   http://localhost:${port}/admin/queues`);
  }
  logger.log(`💚 Health check: /api/health`);
  logger.log(`📱 WA health:    /api/health/whatsapp`);
  logger.log(`🌍 Environment:  ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  logger.log(`🔀 API v1 alias: /api/v1/* → /api/*`);
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.log('');
}

bootstrap();
