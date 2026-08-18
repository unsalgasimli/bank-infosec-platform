import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../services/logger.service.js';
import { MetricsService } from '../services/metrics.service.js';

export interface TraceableRequest extends Request {
  requestId?: string;
  startTime?: number;
}

export function requestTracingMiddleware(req: TraceableRequest, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id') || req.header('x-correlation-id');
  const requestId = incomingId || `req-${crypto.randomUUID()}`;

  req.requestId = requestId;
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', requestId);

  MetricsService.incrementRequests();

  // Log on response completion
  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime || Date.now());
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      MetricsService.incrementErrors();
    }

    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    if (statusCode >= 500) {
      logger.error(logData, `HTTP ${req.method} ${req.originalUrl} - ${statusCode} (${durationMs}ms)`);
    } else if (statusCode >= 400) {
      logger.warn(logData, `HTTP ${req.method} ${req.originalUrl} - ${statusCode} (${durationMs}ms)`);
    } else {
      logger.info(logData, `HTTP ${req.method} ${req.originalUrl} - ${statusCode} (${durationMs}ms)`);
    }
  });

  next();
}
