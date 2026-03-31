import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../config/redis.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const idempotencyKey = request.headers[IDEMPOTENCY_HEADER];
    if (!idempotencyKey) {
      return next.handle();
    }

    const cacheKey = `idempotency:${idempotencyKey}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      response.status(parsed.statusCode || HttpStatus.OK);
      return of(parsed.body);
    }

    return next.handle().pipe(
      tap(async (body) => {
        const statusCode = response.statusCode;
        await this.redis.set(
          cacheKey,
          JSON.stringify({ statusCode, body }),
          IDEMPOTENCY_TTL,
        );
      }),
    );
  }
}
