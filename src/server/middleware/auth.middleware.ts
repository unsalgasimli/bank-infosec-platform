import { Request, Response, NextFunction } from 'express';
import { BankUser } from '../../shared/types/auth.js';
import { AuthService } from '../services/auth.service.js';
import { db } from '../db/database.js';

export interface AuthenticatedRequest extends Request {
  user?: BankUser;
  correlationId?: string;
  authToken?: string;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  req.correlationId = correlationId;

  // Extract from Authorization header (Bearer aegis_jwt_usr-id_...)
  const authHeader = req.headers['authorization'];
  let userId: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    req.authToken = token;
    // Extract userId from token: aegis_jwt_<userId>_<hash>
    if (token.startsWith('aegis_jwt_')) {
      const parts = token.split('_');
      if (parts.length >= 3) {
        userId = parts[2];
      }
    }
  }

  // Check x-user-id header if token wasn't provided
  if (!userId && req.headers['x-user-id']) {
    userId = req.headers['x-user-id'] as string;
  }

  const user = userId ? AuthService.getUserById(userId) : db.data.users[0];

  req.user = user;
  next();
};

