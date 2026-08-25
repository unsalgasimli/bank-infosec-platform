import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service.js';
import { config } from '../config/index.js';
import { TraceableRequest } from './logging.middleware.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandlerMiddleware(
  err: AppError,
  req: TraceableRequest,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId || 'unknown';

  logger.error(
    {
      requestId,
      err: {
        message: err.message,
        stack: config.NODE_ENV === 'development' ? err.stack : undefined,
        code: err.code,
      },
      method: req.method,
      url: req.originalUrl,
    },
    `Unhandled Exception: ${err.message}`
  );

  const safeDetail = config.NODE_ENV === 'production' && statusCode === 500
    ? 'An unexpected error occurred while processing your banking operation. Please contact InfoSec Engineering with the Request ID.'
    : err.message;

  // RFC 7807 Problem Details for HTTP APIs. `error` is retained as a
  // compatibility field for existing clients that predate RFC 7807.
  res.status(statusCode).json({
    type: `urn:aegissec:error:${err.code || 'internal-error'}`,
    title: statusCode === 500 ? 'Internal Server Error' : err.name || 'API Error',
    status: statusCode,
    detail: safeDetail,
    error: safeDetail,
    instance: req.originalUrl,
    requestId,
    timestamp: new Date().toISOString(),
    details: err.details,
  });
}
