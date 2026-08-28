import { BankUser, ABACContext, ConfidentialityTier, type BankRole, type CmdbPermission } from '../../shared/types/auth.js';
import { Ticket } from '../../shared/types/ticket.js';
import { db } from '../db/database.js';

export const CONFIDENTIALITY_LEVELS: Record<ConfidentialityTier, number> = {
  PUBLIC: 1,
  INTERNAL: 2,
  RESTRICTED: 3,
  CONFIDENTIAL_SECURITY_ONLY: 4,
  HIGHLY_RESTRICTED_HR_LEGAL: 5,
};

const cmdbAllPermissions: readonly CmdbPermission[] = [
  'assets.read', 'assets.create', 'assets.update', 'assets.retire', 'assets.delete',
  'asset_sources.read', 'asset_sources.manage', 'asset_discovery.read',
  'asset_discovery.manage', 'asset_discovery.test', 'asset_discovery.enable',
  'asset_discovery.health', 'asset_discovery.runs', 'asset_discovery.run', 'asset_relationships.read',
  'asset_relationships.manage', 'asset_correlation.read',
  'asset_correlation.resolve', 'asset_history.read',
];

const cmdbRolePermissions: Partial<Record<BankRole, readonly CmdbPermission[]>> = {
  PLATFORM_ADMIN: cmdbAllPermissions,
  CISO: cmdbAllPermissions,
  INFOSEC_ADMIN: cmdbAllPermissions,
  IT_ADMIN: cmdbAllPermissions.filter((permission) => permission !== 'assets.delete'),
  CORE_BANK_ADMIN: cmdbAllPermissions.filter((permission) => permission !== 'assets.delete'),
  INFOSEC_MANAGER: [
    'assets.read', 'assets.create', 'assets.update', 'assets.retire',
    'asset_sources.read', 'asset_discovery.read', 'asset_discovery.health', 'asset_discovery.runs', 'asset_discovery.run', 'asset_relationships.read',
    'asset_relationships.manage', 'asset_correlation.read',
    'asset_correlation.resolve', 'asset_history.read',
  ],
  DEPARTMENT_ADMIN: ['assets.read', 'assets.create', 'assets.update', 'assets.retire', 'asset_sources.read', 'asset_relationships.read', 'asset_relationships.manage', 'asset_history.read'],
  DEPARTMENT_MANAGER: ['assets.read', 'assets.create', 'assets.update', 'asset_sources.read', 'asset_relationships.read', 'asset_relationships.manage', 'asset_history.read'],
  TEAM_LEAD: ['assets.read', 'assets.update', 'asset_sources.read', 'asset_relationships.read', 'asset_history.read'],
  ASSET_OWNER: ['assets.read', 'assets.update', 'asset_sources.read', 'asset_relationships.read', 'asset_history.read'],
  APPLICATION_OWNER: ['assets.read', 'assets.update', 'asset_sources.read', 'asset_relationships.read', 'asset_history.read'],
  AUDITOR: ['assets.read', 'asset_sources.read', 'asset_discovery.read', 'asset_discovery.health', 'asset_discovery.runs', 'asset_relationships.read', 'asset_correlation.read', 'asset_history.read'],
  SECURITY_ANALYST: ['assets.read', 'asset_sources.read', 'asset_discovery.read', 'asset_discovery.health', 'asset_discovery.runs', 'asset_relationships.read', 'asset_correlation.read', 'asset_history.read'],
  SOC_ANALYST: ['assets.read', 'asset_sources.read', 'asset_discovery.read', 'asset_discovery.health', 'asset_discovery.runs', 'asset_relationships.read', 'asset_correlation.read', 'asset_history.read'],
  APPSEC_ANALYST: ['assets.read', 'asset_sources.read', 'asset_discovery.read', 'asset_discovery.health', 'asset_discovery.runs', 'asset_relationships.read', 'asset_correlation.read', 'asset_history.read'],
  VULN_ANALYST: ['assets.read', 'asset_sources.read', 'asset_discovery.read', 'asset_discovery.health', 'asset_discovery.runs', 'asset_relationships.read', 'asset_correlation.read', 'asset_history.read'],
  GRC_ANALYST: ['assets.read', 'asset_relationships.read', 'asset_history.read'],
  DLP_ANALYST: ['assets.read', 'asset_relationships.read'],
  REQUESTER: ['assets.read', 'asset_relationships.read'],
  APPROVER: ['assets.read', 'asset_relationships.read'],
  ASSIGNEE: ['assets.read', 'asset_relationships.read'],
  RISK_OWNER: ['assets.read', 'asset_relationships.read', 'asset_history.read'],
  READ_ONLY_USER: ['assets.read', 'asset_relationships.read'],
};

export class AuthService {
  public static hasCmdbPermission(user: BankUser | undefined, permission: CmdbPermission): boolean {
    if (!user?.isActive) return false;
    return user.roles.some((role) => cmdbRolePermissions[role]?.includes(permission));
  }

  public static assertCmdbPermission(user: BankUser | undefined, permission: CmdbPermission): asserts user is BankUser {
    if (!this.hasCmdbPermission(user, permission)) {
      const error = new Error(`CMDB permission required: ${permission}`) as Error & { statusCode?: number; code?: string };
      error.statusCode = user?.isActive ? 403 : 401;
      error.code = 'CMDB_PERMISSION_DENIED';
      throw error;
    }
  }

  public static getAllUsers(): BankUser[] {
    return db.data.users;
  }

  public static getUserById(userId: string): BankUser | undefined {
    return db.data.users.find((u) => u.id === userId);
  }

  public static getUserByUsername(username: string): BankUser | undefined {
    return db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  /**
   * Enterprise hybrid RBAC + ABAC Authorization Policy Evaluator.
   * Evaluates role permissions, user clearance level, ownership of application/asset,
   * security domain match, and explicit restricted access whitelists.
   */
  public static canAccessResource(context: ABACContext): { allowed: boolean; reason?: string } {
    const { user, action, resourceType, resource } = context;

    if (!user || !user.isActive) {
      return { allowed: false, reason: 'User account is inactive or unauthenticated.' };
    }

    // Platform Admin & CISO have global administrative access (audit logged)
    if (user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO')) {
      return { allowed: true };
    }

    // Check specific resource types
    if (resourceType === 'TICKET') {
      const ticket = resource as Ticket;
      if (!ticket) return { allowed: true };

      // 1. Confidentiality clearance check
      const userClearanceScore = CONFIDENTIALITY_LEVELS[user.securityClearance] || 1;
      const ticketConfidentialityScore = CONFIDENTIALITY_LEVELS[ticket.confidentiality] || 1;

      // 2. Restricted Whitelist Check: If ticket has explicit restricted users/teams, user MUST be in whitelist or be CISO
      if (
        (ticket.restrictedUserIds && ticket.restrictedUserIds.length > 0) ||
        (ticket.restrictedTeamIds && ticket.restrictedTeamIds.length > 0)
      ) {
        const inUserList = ticket.restrictedUserIds?.includes(user.id);
        const inTeamList = ticket.restrictedTeamIds?.some((tid) => user.teamIds.includes(tid));

        if (!inUserList && !inTeamList) {
          return {
            allowed: false,
            reason: 'Ticket is restricted to a strictly defined whitelist of investigators.',
          };
        }
      }

      // A ticket creator must retain access to the ticket they submitted, even
      // when routing sends the work to another department or queue. `reporterId`
      // is the canonical creator field; owner/securityOwner are compatibility
      // fallbacks for tickets created by older flows.
      const isCreator = [ticket.reporterId, ticket.ownerId, ticket.securityOwnerId].includes(user.id);

      // If user is direct Assignee, Reporter, Requester, Participant, or Watcher
      const isAssignee = ticket.assigneeId === user.id;
      const isReporter = ticket.reporterId === user.id;
      const isRequester = ticket.requesterId === user.id || ticket.onBehalfOfUserId === user.id;
      const isParticipant = ticket.participantIds?.includes(user.id);
      const isWatcher = ticket.watcherIds?.includes(user.id);
      const isAppOwner = Boolean(ticket.applicationId && user.ownedApplicationIds.includes(ticket.applicationId));
      const isAssetOwner = Boolean(ticket.assetId && user.ownedAssetIds.includes(ticket.assetId));

      // Direct assignees, reporters, requesters, and participants have legitimate task access
      if (isCreator || isAssignee || isReporter || isRequester || isParticipant || isWatcher) {
        return { allowed: true };
      }

      // 3. Confidentiality clearance check for other roles
      if (userClearanceScore < ticketConfidentialityScore) {
        return {
          allowed: false,
          reason: `Insufficient security clearance. User level: ${user.securityClearance}, Required: ${ticket.confidentiality}`,
        };
      }

      // 4. Domain & Ownership ABAC rules:
      // If user is InfoSec Manager / InfoSec Admin -> access all non-restricted tickets
      if (user.roles.includes('INFOSEC_ADMIN') || user.roles.includes('INFOSEC_MANAGER')) {
        return { allowed: true };
      }

      // If user is Auditor -> Read-only access to compliance/audit/vulnerability tickets
      if (user.roles.includes('AUDITOR') && action === 'READ') {
        return { allowed: true };
      }

      // If user is Security Analyst / SOC / AppSec / VM / GRC / DLP
      const isSecurityProfessional = user.roles.some((r) =>
        [
          'SECURITY_ANALYST',
          'SOC_ANALYST',
          'APPSEC_ANALYST',
          'VULN_ANALYST',
          'GRC_ANALYST',
          'DLP_ANALYST',
        ].includes(r)
      );

      if (isSecurityProfessional) {
        // DLP Analyst can view DLP; SOC can view SOC & VM; AppSec can view AppSec & VM; GRC can view GRC & Exceptions
        if (ticket.securityDomain === 'DLP' && !user.roles.includes('DLP_ANALYST')) {
          return { allowed: false, reason: 'DLP investigations require DLP Analyst role.' };
        }
        return { allowed: true };
      }

      if (isWatcher || isAppOwner || isAssetOwner) {
        // Application owner cannot view DLP investigations or Security-Team-Only internal incident forensics
        if (ticket.securityDomain === 'DLP' || ticket.confidentiality === 'HIGHLY_RESTRICTED_HR_LEGAL') {
          return {
            allowed: false,
            reason: 'Confidential security case cannot be viewed by general application owners.',
          };
        }
        return { allowed: true };
      }

      // Department scoping: Users can only access tickets belonging to their own department/şöbə
      const belongsToUserDepartment = Boolean(
        user.departmentId &&
          (ticket.departmentId === user.departmentId ||
            ticket.targetDepartmentId === user.departmentId ||
            ticket.participatingDepartmentIds?.includes(user.departmentId))
      );

      if (belongsToUserDepartment) {
        return { allowed: true };
      }

      return { allowed: false, reason: 'User does not have authorization to view tickets outside their assigned department.' };
    }

    if (resourceType === 'COMMENT') {
      const comment = resource;
      if (comment.visibility === 'SECURITY_TEAM_ONLY') {
        const isSec = user.roles.some((r) =>
          ['CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(r)
        );
        if (!isSec) {
          return { allowed: false, reason: 'Internal security note only visible to security personnel.' };
        }
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  /**
   * Filters an array of tickets based on user ABAC permissions.
   */
  public static filterAuthorizedTickets(tickets: Ticket[], user: BankUser): Ticket[] {
    return tickets.filter((ticket) => {
      const check = AuthService.canAccessResource({
        user,
        action: 'READ',
        resourceType: 'TICKET',
        resource: ticket,
      });
      return check.allowed;
    });
  }
}
