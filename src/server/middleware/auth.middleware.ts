import { Request, Response, NextFunction } from 'express';
import { BankUser } from '../../shared/types/auth.js';
import { AuthService } from '../services/auth.service.js';
import { SessionService } from '../services/session.service.js';
import { config } from '../config/index.js';
import { DepartmentsRepository } from '../db/postgres/departments-repository.js';

export interface AuthenticatedRequest extends Request {
  user?: BankUser;
  correlationId?: string;
  sessionToken?: string;
}

const useFixtureIdentityStore = () =>
  config.DB_TYPE === 'memory' ||
  process.env.NODE_ENV === 'test' ||
  process.argv.some((argument) => argument === '--test' || argument.includes('.test.ts') || argument.includes('test-concurrency'));

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  req.correlationId = correlationId;
  try {
    const sessionToken = SessionService.readToken(req);
    const userId = await SessionService.resolve(sessionToken);
    const user: BankUser | undefined = userId
      ? config.DB_TYPE === 'postgres' && !useFixtureIdentityStore()
        ? await DepartmentsRepository.findActiveDirectoryUserById(userId)
        : AuthService.getUserById(userId)
      : undefined;

    if (user?.isActive) {
      req.sessionToken = sessionToken;
      req.user = user;
    } else if (sessionToken) {
      await SessionService.revoke(sessionToken);
      SessionService.clearCookie(res);
    }
    next();
  } catch (error) {
    next(error);
  }
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
