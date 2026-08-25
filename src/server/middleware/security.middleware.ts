import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: config.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: false,
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
});

/**
 * Bank Compliance & Anti-Tamper Header middleware
 */
export function complianceHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Banking-Security-Standard', 'SOC2-Type2; PCI-DSS-v4.0; ISO27001');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

export function sameOriginMutationMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  const expectedOrigin = host ? `${protocol}://${host}` : undefined;

  if (!origin || !expectedOrigin || origin !== expectedOrigin) {
    res.status(403).json({ success: false, error: 'Cross-origin state-changing request rejected' });
    return;
  }

  next();
}
