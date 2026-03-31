import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || exception.message;
        error = resp.error || (HttpStatus[status] as string)
          ?.replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c: string) => c.toUpperCase()) || error;
        details = resp.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const correlationId = request.headers[CORRELATION_ID_HEADER] as string;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(`${request.method} ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message: Array.isArray(message) ? message : [message],
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
      ...(details ? { details } : {}),
    });
  }
}
