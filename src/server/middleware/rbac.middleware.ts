import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.js';
import { BankRole } from '../../shared/types/auth.js';
import { logger } from '../services/logger.service.js';

/**
 * Express middleware to enforce Role-Based Access Control on backend endpoints.
 * Guarantees that unauthorized API requests are blocked at the server layer with 403 Forbidden.
 */
export const requireRoles = (allowedRoles: BankRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Active bank user session not found.',
      });
      return;
    }

    // Authorization is based solely on roles resolved from the verified
    // directory identity; no named account has a permanent bypass.
    if (user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO')) {
      return next();
    }

    const hasAllowedRole = allowedRoles.some((role) => user.roles.includes(role));

    if (!hasAllowedRole) {
      logger.warn(
        {
          userId: user.id,
          userRoles: user.roles,
          path: req.path,
          method: req.method,
          requiredRoles: allowedRoles,
        },
        '⛔ RBAC Access Denied: User lacks required role permissions'
      );

      res.status(403).json({
        success: false,
        error: `Access Denied: Your account roles [${user.roles.join(', ')}] do not have permission to access this administrative endpoint. Required: [${allowedRoles.join(', ')}].`,
      });
      return;
    }

    next();
  };
};

export const requireAdmin = requireRoles([
  'PLATFORM_ADMIN',
  'CISO',
  'INFOSEC_ADMIN',
  'DEPARTMENT_ADMIN',
  'INFOSEC_MANAGER',
  'IT_ADMIN',
  'CORE_BANK_ADMIN',
  'HR_ADMIN',
  'LEGAL_ADMIN',
]);

// Every authenticated employee may build personal workflows. The service
// separately enforces company and department publication scope.
export const requireWorkflowDesigner = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isActive) {
    res.status(401).json({ success: false, error: 'Authentication required. Active bank user session not found.' });
    return;
  }
  next();
};

export const requireSecOps = requireRoles([
  'PLATFORM_ADMIN',
  'CISO',
  'INFOSEC_ADMIN',
  'INFOSEC_MANAGER',
  'TEAM_LEAD',
  'SECURITY_ANALYST',
  'SOC_ANALYST',
  'APPSEC_ANALYST',
  'VULN_ANALYST',
  'GRC_ANALYST',
  'DLP_ANALYST',
  'AUDITOR',
]);
