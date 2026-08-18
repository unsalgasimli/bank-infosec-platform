import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { LDAPAuthService } from '../services/ldap.service.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { db } from '../db/database.js';

export class AuthController {
  public static async ldapLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
    const payload = req.body;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '10.20.4.15';

    const result = await LDAPAuthService.authenticateLDAP(payload, ipAddress);

    if (!result.success) {
      res.status(401).json(result);
      return;
    }

    res.json(result);
  }

  public static listGroups(req: AuthenticatedRequest, res: Response): void {
    const groups = LDAPAuthService.getDistributionGroups();
    res.json({ success: true, groups });
  }

  public static getCurrentUser(req: AuthenticatedRequest, res: Response): void {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    res.json({ success: true, user });
  }

  public static listUsers(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, users: db.data.users });
  }

  public static logout(req: AuthenticatedRequest, res: Response): void {
    const user = req.user;
    if (user) {
      AuditService.log({
        actor: user,
        action: 'USER_LOGOUT',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip || '10.20.4.15',
        fieldChanges: [
          {
            field: 'ldapAuthStatus',
            oldValue: 'BOUND',
            newValue: 'UNBOUND',
          },
        ],
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  }
}

