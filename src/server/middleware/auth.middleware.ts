import { Request, Response, NextFunction } from 'express';
import { BankUser } from '../../shared/types/auth.js';
import { AuthService } from '../services/auth.service.js';
import { SessionService } from '../services/session.service.js';

export interface AuthenticatedRequest extends Request {
  user?: BankUser;
  correlationId?: string;
  sessionToken?: string;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  req.correlationId = correlationId;

  const sessionToken = SessionService.readToken(req);
  const userId = SessionService.resolve(sessionToken);
  const user: BankUser | undefined = userId ? AuthService.getUserById(userId) : undefined;

  if (user?.isActive) {
    req.sessionToken = sessionToken;
    req.user = user;
  } else if (sessionToken) {
    SessionService.revoke(sessionToken);
    SessionService.clearCookie(res);
  }

  next();
};

export const requireAuthentication = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  next();
};
