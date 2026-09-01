import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { LDAPAuthService } from '../services/ldap.service.js';
import { LDAPSchedulerService } from '../services/ldap-scheduler.service.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { db } from '../db/database.js';
import { config } from '../config/index.js';
import { SessionService } from '../services/session.service.js';
import { isGenuineEmployeeOrIntern } from '../services/ldap-directory.data.js';
import { DepartmentsRepository } from '../db/postgres/departments-repository.js';
import { CmdbApiService } from '../services/cmdb-api.service.js';

const ldapLoginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1).max(256),
  password: z.string().max(1024).optional().default(''),
});

export class AuthController {
  public static async ldapLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
    const parsed = ldapLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });
      return;
    }

    const ipAddress = req.ip || 'unknown';

    try {
      const result = await LDAPAuthService.authenticateLDAP(parsed.data, ipAddress);

      if (!result.success) {
        res.status(401).json({ success: false, message: result.message || 'Authentication failed' });
        return;
      }

      await SessionService.revoke(req.sessionToken);
      const sessionToken = await SessionService.create(result.user.id);
      SessionService.setCookie(res, sessionToken);
      res.json({ success: true, user: result.user });
    } catch {
      res.status(500).json({
        success: false,
        message: 'Autentifikasiya xidməti gözlənilməz xəta ilə dayandı. Yenidən cəhd edin.',
      });
    } finally {
      if (req.body && typeof req.body === 'object' && 'password' in req.body) {
        delete req.body.password;
      }
    }
  }

  public static listGroups(req: AuthenticatedRequest, res: Response): void {
    const groups = LDAPAuthService.getDistributionGroups();
    res.json({ success: true, groups });
  }

  public static getPublicDirectory(req: AuthenticatedRequest, res: Response): void {
    try {
      res.json({
        success: true,
        directoryAvailable: config.LDAP_ENABLED,
        // A pre-auth route must not disclose employee identities, roles,
        // groups, directory topology, or claimed connection health.
        users: [],
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get public directory' });
    }
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
    if (config.DB_TYPE === 'postgres') {
      void DepartmentsRepository.listActiveDirectoryUsers()
        .then((users) => res.json({ success: true, users }))
        .catch((error: any) => res.status(500).json({ success: false, error: error?.message || 'Failed to retrieve Active Directory users' }));
      return;
    }
    db.reload();
    const users = db.data.users
      .filter((user) => user.isActive && user.directorySource === 'ACTIVE_DIRECTORY' && isGenuineEmployeeOrIntern(user, user.distributionGroups || [], user.sAMAccountName || user.username))
      .map(({ distinguishedName, ldapBindStatus, lastLdapLoginAt, ...user }) => user);
    res.json({ success: true, users });
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user;
    if (user) {
      AuditService.log({
        actor: user,
        action: 'USER_LOGOUT',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        correlationId: req.correlationId,
        fieldChanges: [
          {
            field: 'ldapAuthStatus',
            oldValue: 'BOUND',
            newValue: 'UNBOUND',
          },
        ],
      });
    }
    await SessionService.revoke(req.sessionToken);
    SessionService.clearCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  }

  public static async triggerLdapSync(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const job = await LDAPSchedulerService.enqueueSync('MANUAL_TRIGGER', user);
      let inventory: { queued: boolean; runId?: string; error?: string } = { queued: false };
      if (config.DB_TYPE === 'postgres' && user) {
        try {
          const run = await CmdbApiService.triggerActiveDirectoryInventorySync(user, {
            correlationId: req.correlationId,
            ip: req.ip,
            userAgent: req.get('user-agent'),
          });
          inventory = { queued: true, runId: run.runId };
        } catch (error: any) {
          // Keep the user-directory job authoritative: inventory configuration
          // must not make the existing AD user sync fail, but report the exact
          // reason so the operator can correct it from the inventory screen.
          inventory = { queued: false, error: error?.message || 'Inventory sync could not be queued.' };
        }
      }
      res.status(202).json({
        success: true,
        queued: true,
        jobId: job.id,
        inventory,
        message: inventory.queued
          ? 'Active Directory user and inventory synchronization were queued for the dedicated worker.'
          : 'Active Directory / LDAP synchronization was queued for the dedicated worker. Inventory sync was not queued.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to queue LDAP sync' });
    }
  }

  public static getLdapSyncStatus(req: AuthenticatedRequest, res: Response): void {
    try {
      const status = LDAPSchedulerService.getStatus();
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to retrieve LDAP status' });
    }
  }

  public static getUsersByDepartment(req: AuthenticatedRequest, res: Response): void {
    try {
      const departments = db.data.departments || [];
      const users = (db.data.users || []).filter((user) => isGenuineEmployeeOrIntern(user, user.distributionGroups || [], user.sAMAccountName || user.username));

      const result = departments.map((dept) => {
        const deptUsers = users.filter((u) => u.departmentId === dept.id);
        return {
          departmentId: dept.id,
          departmentCode: dept.code,
          departmentName: dept.name,
          totalUsers: deptUsers.length,
          activeUsers: deptUsers.filter((u) => u.isActive).length,
          disabledUsers: deptUsers.filter((u) => !u.isActive).length,
          users: deptUsers,
        };
      });

      res.json({ success: true, departments: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to retrieve department users' });
    }
  }

  public static async testActiveDirectoryConnection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { LDAPSyncService } = await import('../services/ldap-sync.service.js');
      const result = await LDAPSyncService.testActiveDirectoryConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to test Active Directory connection' });
    }
  }
}
