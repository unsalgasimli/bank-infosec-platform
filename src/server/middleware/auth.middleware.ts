import { Request, Response, NextFunction } from 'express';
import { BankUser } from '../../shared/types/auth.js';
import { AuthService } from '../services/auth.service.js';
import { db } from '../db/database.js';

export interface AuthenticatedRequest extends Request {
  user?: BankUser;
  correlationId?: string;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // Extract user ID from header or default to CISO Dr. Elena Vance
  const userId = (req.headers['x-user-id'] as string) || 'usr-ciso';
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;

  const user = AuthService.getUserById(userId) || db.data.users[0];

  req.user = user;
  req.correlationId = correlationId;
  next();
};
