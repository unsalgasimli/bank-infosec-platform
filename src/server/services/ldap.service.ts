import { StrictReadOnlyLdapClient } from '../utils/readonly-ldap-client.js';
import { BankUser, LDAPLoginPayload, AuthSessionResponse, LDAPGroupInfo } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { LDAPSyncService } from './ldap-sync.service.js';
import { isAccountDisabled, isGenuineEmployeeOrIntern, parseMemberOfGroups } from './ldap-directory.data.js';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';
import { PostgresProjectionRepository } from '../db/postgres/projection-repository.js';

function parseActiveDirectoryError(_errorMessage: string): string {
  return 'İstifadəçi adı və ya şifrə yanlışdır, yaxud hesab giriş üçün əlçatan deyil.';
}

function isValidSamAccountName(value: string): boolean {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(value);
}

function escapeLdapFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

function normalizedDirectoryValue(value: unknown): string {
  if (Array.isArray(value)) return normalizedDirectoryValue(value[0]);
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim().toLowerCase();
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export class LDAPAuthService {
  /**
   * Returns list of available Active Directory distribution & security groups dynamically from database
   */
  public static getDistributionGroups(): LDAPGroupInfo[] {
    const groupMap = new Map<string, LDAPGroupInfo>();

    for (const user of db.data.users.filter((item) => item.directorySource === 'ACTIVE_DIRECTORY')) {
      for (const groupName of user.distributionGroups || []) {
        if (!groupMap.has(groupName)) {
          groupMap.set(groupName, {
            name: groupName,
            distinguishedName: `CN=${groupName},OU=Distribution Groups,${config.LDAP_BASE_DN}`,
            description: `${groupName} Corporate Distribution Group`,
            type: 'SECURITY_DISTRIBUTION_GROUP',
            isInfosecGroup:
              groupName.toLowerCase().includes('infosec') ||
              groupName.toLowerCase().includes('security') ||
              groupName.toLowerCase().includes('təhlükəsizliyi'),
            memberCount: 1,
          });
        } else {
          const g = groupMap.get(groupName)!;
          g.memberCount = (g.memberCount || 0) + 1;
        }
      }
    }

    return Array.from(groupMap.values());
  }

  /**
   * Authenticates user against Bank Active Directory / LDAP and checks distribution group membership.
   */
  public static async authenticateLDAP(
    payload: LDAPLoginPayload,
    ipAddress = '10.20.4.15'
  ): Promise<AuthSessionResponse> {
    const rawInput = (payload.usernameOrEmail || '').trim();
    const password = (payload.password || '').trim();

    if (!rawInput) {
      return {
        success: false,
        user: null as any,
        message: 'İstifadəçi adı daxil edilməlidir.',
      };
    }

    // Extract sAMAccountName and prepare candidate bind formats
    let sAMAccountName = rawInput;
    if (rawInput.includes('\\')) {
      sAMAccountName = rawInput.split('\\')[1];
    } else if (rawInput.includes('@')) {
      sAMAccountName = rawInput.split('@')[0];
    }

    if (!isValidSamAccountName(sAMAccountName)) {
      return {
        success: false,
        user: null as any,
        message: 'İstifadəçi adı formatı etibarsızdır.',
      };
    }

    const domainNetbios = config.LDAP_DOMAIN.split('.')[0].toUpperCase();
    const domainDns = config.LDAP_DOMAIN.toLowerCase();

    // A passwordless login is only a deliberately enabled development shortcut.
    // It never creates users and never applies in test, staging, or production.
    if (!password) {
      const allowDevelopmentBypass =
        config.NODE_ENV === 'development' && config.DEV_EMPTY_PASSWORD_LOGIN_ENABLED;
      // sync:ad runs in a separate process; pick up its current directory
      // projection immediately instead of requiring an API restart.
      if (allowDevelopmentBypass) db.reload();
      const usernameKey = sAMAccountName.toLowerCase();
      const rawInputKey = rawInput.toLowerCase();
      const developmentUser = db.data.users.find(
        (user) =>
          user.isActive &&
          (user.directorySource === 'ACTIVE_DIRECTORY' ||
            Boolean(user.sAMAccountName && user.ldapDomain && user.distinguishedName)) &&
          (normalizedDirectoryValue(user.username) === usernameKey ||
            normalizedDirectoryValue(user.sAMAccountName) === usernameKey ||
            normalizedDirectoryValue(user.email) === rawInputKey ||
            normalizedDirectoryValue(user.userPrincipalName) === rawInputKey) &&
          isGenuineEmployeeOrIntern(
            user,
            user.distributionGroups || [],
            user.sAMAccountName || user.username
          )
      );

      if (!allowDevelopmentBypass) {
        return { success: false, user: null as any, message: 'Active Directory password is required.' };
      }

      if (!developmentUser) {
        return {
          success: false,
          user: null as any,
          message: 'Development bypass üçün istifadəçi əvvəlcə aktiv Active Directory directory məlumatında mövcud olmalıdır.',
        };
      }

      developmentUser.ldapBindStatus = 'AUTHENTICATED';
      developmentUser.lastLdapLoginAt = new Date().toISOString();
      const loginAudit = AuditService.log({
        actor: developmentUser,
        action: 'USER_LOGIN',
        entityType: 'USER',
        entityId: developmentUser.id,
        ipAddress,
        userAgent: 'Development empty-password LDAP directory bypass',
        persist: config.DB_TYPE !== 'postgres',
      });
      if (config.DB_TYPE === 'postgres') {
        await PostgresProjectionRepository.persistLogin(developmentUser, loginAudit);
      }

      return {
        success: true,
        user: developmentUser,
        ldapInfo: {
          server: 'Development directory verification',
          bindDn: developmentUser.distinguishedName || developmentUser.username,
          distributionGroup: developmentUser.distributionGroups?.[0] || 'No directory group recorded',
          authenticatedAt: developmentUser.lastLdapLoginAt,
          kerberosTicketIssued: false,
        },
      };
    }

    if (!config.LDAP_ENABLED || !config.LDAP_URL.startsWith('ldaps://') || !config.LDAP_BASE_DN || !config.LDAP_DOMAIN) {
      return {
        success: false,
        user: null as any,
        message: 'Active Directory authentication is unavailable. Complete the server-side LDAPS configuration.',
      };
    }

    // Prepare list of potential bind formats to try with Active Directory
    const bindCandidates: string[] = [];
    if (rawInput.includes('\\') || rawInput.includes('@')) {
      bindCandidates.push(rawInput);
    }
    bindCandidates.push(`${sAMAccountName}@${domainDns}`);
    bindCandidates.push(`${domainNetbios}\\${sAMAccountName}`);
    bindCandidates.push(`${sAMAccountName}@${config.LDAP_DOMAIN.toUpperCase()}`);
    bindCandidates.push(sAMAccountName);

    // Remove duplicates
    const uniqueCandidates = Array.from(new Set(bindCandidates));

    // 1. Attempt Real Active Directory LDAP Bind if LDAP_ENABLED
    if (config.LDAP_ENABLED) {
      let lastLdapError: any = null;
      let authenticatedClient: StrictReadOnlyLdapClient | null = null;
      for (const candidate of uniqueCandidates) {
        const client = new StrictReadOnlyLdapClient({
          url: config.LDAP_URL,
          timeout: 6000,
          connectTimeout: 6000,
          tlsRejectUnauthorized: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false,
          caCertPath: config.LDAP_CA_CERT_PATH,
        });

        try {
          logger.info({ url: config.LDAP_URL }, 'Attempting Active Directory LDAP bind');
          await client.bind(candidate, password);
          authenticatedClient = client;
          logger.info('Active Directory LDAP bind succeeded');
          break;
        } catch (bindErr: any) {
          lastLdapError = bindErr;
          logger.debug({ err: bindErr.message }, 'LDAP bind candidate failed');
          try {
            await client.unbind();
          } catch {}
        }
      }

      if (!authenticatedClient) {
        const rawErrMsg = lastLdapError?.message || 'Invalid domain credentials or Domain Controller unreachable.';
        const userFriendlyMsg = parseActiveDirectoryError(rawErrMsg);
        logger.error({ err: rawErrMsg }, 'All Active Directory LDAP bind candidates failed');

        return {
          success: false,
          user: null as any,
          message: userFriendlyMsg,
        };
      }

      try {
        // Search user in Active Directory for memberOf and profile details
        let adDisplayName = '';
        let adMail = '';
        let adGroups: string[] = [];
        let adTitle = '';
        let adDepartment = '';
        let adManagerDn = '';
        let adDistinguishedName = '';

        try {
          const escapedSamAccountName = escapeLdapFilterValue(sAMAccountName);
          const escapedUpn = escapeLdapFilterValue(`${sAMAccountName}@${domainDns}`);
          const escapedMail = escapeLdapFilterValue(
            rawInput.includes('@') ? rawInput.toLowerCase() : `${sAMAccountName}@${domainDns}`
          );
          const searchRes = await authenticatedClient.search(config.LDAP_BASE_DN, {
            scope: 'sub',
            filter: `(|(sAMAccountName=${escapedSamAccountName})(mail=${escapedMail})(userPrincipalName=${escapedUpn}))`,
            paged: { pageSize: 100 },
            attributes: [
              'sAMAccountName',
              'userPrincipalName',
              'displayName',
              'mail',
              'memberOf',
              'title',
              'department',
              'distinguishedName',
              'manager',
              'description',
              'employeeType',
              'objectClass',
              'servicePrincipalName',
              'userAccountControl',
              'accountExpires',
            ],
          });

          if (searchRes.searchEntries.length === 1) {
            const entry: any = searchRes.searchEntries[0];

            // Check if disabled or expired
            if (isAccountDisabled(entry)) {
              return {
                success: false,
                user: null as any,
                message: 'İstifadəçi hesabı Active Directory tərəfindən deaktiv edilib və ya müddəti bitib (Account Disabled / Expired).',
              };
            }

            const resolvedSamAccountName = normalizedDirectoryValue(entry.sAMAccountName) || sAMAccountName;
            const parsedGroups = parseMemberOfGroups(entry.memberOf);
            if (!isGenuineEmployeeOrIntern(entry, parsedGroups, resolvedSamAccountName)) {
              return {
                success: false,
                user: null as any,
                message: 'Yalnız real əməkdaş və ya intern hesabı ilə girişə icazə verilir; texniki/service hesabları istifadəçi kataloquna daxil edilmir.',
              };
            }

            adDisplayName = (entry.displayName as string) || adDisplayName;
            adMail = (entry.mail as string) || adMail;
            adTitle = (entry.title as string) || adTitle;
            adDepartment = (entry.department as string) || adDepartment;
            adManagerDn = (entry.manager as string) || adManagerDn;
            adDistinguishedName = (entry.distinguishedName as string) || adDistinguishedName;

            if (parsedGroups.length > 0) {
              adGroups = parsedGroups;
            }
          } else {
            return { success: false, user: null as any, message: 'Authenticated account could not be uniquely resolved in Active Directory.' };
          }
        } catch (searchErr) {
          logger.warn({ err: searchErr }, 'Active Directory user search failed after successful bind');
          return { success: false, user: null as any, message: 'Active Directory profile lookup failed.' };
        }

        if (!adDisplayName || !adMail) {
          return { success: false, user: null as any, message: 'Active Directory profile is missing required display name or email attributes.' };
        }

        // Just-in-time provisioning in local database with intelligent department & group mapping
        let user = db.data.users.find(
          (u) =>
            u.username.toLowerCase() === sAMAccountName.toLowerCase() ||
            (u.sAMAccountName && u.sAMAccountName.toLowerCase() === sAMAccountName.toLowerCase()) ||
            u.email.toLowerCase() === adMail.toLowerCase()
        );

        const deptMapping = LDAPSyncService.mapDepartment(adDepartment, adTitle, adGroups, adDistinguishedName);
        if (!db.data.departmentSections) db.data.departmentSections = [];
        const section = deptMapping.sectionId && deptMapping.sectionName && deptMapping.sectionCode
          ? (() => {
              const existing = db.data.departmentSections.find((item) => item.id === deptMapping.sectionId);
              if (existing) {
                existing.departmentId = deptMapping.departmentId;
                existing.name = deptMapping.sectionName!;
                existing.code = deptMapping.sectionCode!;
                existing.isActive = true;
                existing.directorySource = 'ACTIVE_DIRECTORY';
                return existing;
              }
              const created = {
                id: deptMapping.sectionId!,
                departmentId: deptMapping.departmentId,
                name: deptMapping.sectionName!,
                code: deptMapping.sectionCode!,
                isActive: true,
                directorySource: 'ACTIVE_DIRECTORY' as const,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              db.data.departmentSections.push(created);
              return created;
            })()
          : undefined;
        const manager = adManagerDn
          ? db.data.users.find((candidate) => candidate.isActive && candidate.distinguishedName?.toLowerCase() === adManagerDn.toLowerCase())
          : undefined;

        if (!user) {
          const id = `usr-${sAMAccountName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          user = {
            id,
            username: sAMAccountName.toLowerCase(),
            sAMAccountName: sAMAccountName.toLowerCase(),
            email: adMail,
            fullName: adDisplayName,
            title: adTitle,
            divisionId: deptMapping.divisionId,
            departmentId: deptMapping.departmentId,
            sectionId: section?.id,
            teamIds: deptMapping.teamIds,
            roles: deptMapping.roles,
            securityClearance: deptMapping.securityClearance,
            ownedApplicationIds: [],
            ownedAssetIds: [],
            ownedRiskIds: [],
            isActive: true,
            userPrincipalName: `${sAMAccountName}@${domainDns}`,
            distinguishedName: adDistinguishedName || `CN=${adDisplayName},${config.LDAP_BASE_DN}`,
            managerId: manager?.id,
            ldapDomain: config.LDAP_DOMAIN,
            distributionGroups: adGroups,
            ldapBindStatus: 'AUTHENTICATED',
            lastLdapLoginAt: new Date().toISOString(),
            directorySource: 'ACTIVE_DIRECTORY',
          };
          db.data.users.push(user);
        } else {
          user.fullName = adDisplayName;
          user.email = adMail;
          user.title = adTitle;
          user.departmentId = deptMapping.departmentId;
          user.sectionId = section?.id;
          user.divisionId = deptMapping.divisionId;
          user.teamIds = deptMapping.teamIds;
          user.roles = deptMapping.roles;
          user.securityClearance = deptMapping.securityClearance;
          user.distinguishedName = adDistinguishedName || user.distinguishedName;
          user.managerId = manager?.id;
          user.distributionGroups = adGroups;
          user.isActive = true;
          user.ldapBindStatus = 'AUTHENTICATED';
          user.lastLdapLoginAt = new Date().toISOString();
          user.directorySource = 'ACTIVE_DIRECTORY';
        }

        db.persist();

        AuditService.log({
          actor: user,
          action: 'USER_LOGIN',
          entityType: 'USER',
          entityId: user.id,
          ipAddress,
          userAgent: 'Active Directory LDAPS Live Authentication',
        });

        return {
          success: true,
          user,
          ldapInfo: {
            server: `${config.LDAP_URL} (Active Directory Domain Controller)`,
            bindDn: user.distinguishedName || `CN=${user.fullName},${config.LDAP_BASE_DN}`,
            distributionGroup: user.distributionGroups?.[0] || 'No Active Directory group returned',
            authenticatedAt: new Date().toISOString(),
            kerberosTicketIssued: true,
          },
        };
      } finally {
        try {
          await authenticatedClient.unbind();
        } catch {}
      }
    }

    // Never accept a password against the local directory when AD is unavailable.
    return {
      success: false,
      user: null as any,
      message: 'Active Directory authentication is unavailable. LDAP must be enabled; local password fallback is prohibited.',
    };
  }
}
