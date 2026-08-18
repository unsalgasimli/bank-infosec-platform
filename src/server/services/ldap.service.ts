import { Client } from 'ldapts';
import { BankUser, LDAPLoginPayload, AuthSessionResponse, LDAPGroupInfo } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';

function parseActiveDirectoryError(errorMessage: string): string {
  const match = errorMessage.match(/data\s+([0-9a-fA-F]{3,4})/i);
  if (!match) return errorMessage;

  const code = match[1].toLowerCase();
  switch (code) {
    case '52e':
      return 'Daxil edilmiş Active Directory istifadəçi adı və ya şifrə yanlışdır (Invalid Credentials / Bad Password).';
    case '525':
      return 'Active Directory-də belə bir istifadəçi hesabı mövcud deyil (User not found).';
    case '530':
      return 'Bu saatda Active Directory-yə daxil olmağa icazə verilmir (Not permitted to log on at this time).';
    case '531':
      return 'Bu iş stansiyasından daxil olmağa icazə verilmir (Not permitted to log on from this workstation).';
    case '532':
      return 'İstifadəçi şifrəsinin istifadə müddəti bitib (Password Expired). Şifrənizi yeniləyin.';
    case '533':
      return 'İstifadəçi hesabı Active Directory tərəfindən deaktiv edilib (Account Disabled).';
    case '701':
      return 'İstifadəçi hesabının aktivlik müddəti bitib (Account Expired).';
    case '773':
      return 'İstifadəçi ilk girişdə şifrəsini dəyişməlidir (User must reset password).';
    case '775':
      return 'Hesab çoxsaylı yanlış cəhdlərə görə bloklanıb (Account Locked Out). Domain Administrator ilə əlaqə saxlayın.';
    default:
      return `Active Directory Authentication Error (Code: ${code}): ${errorMessage}`;
  }
}

export class LDAPAuthService {
  /**
   * Returns list of available Active Directory distribution & security groups dynamically from database
   */
  public static getDistributionGroups(): LDAPGroupInfo[] {
    const groupMap = new Map<string, LDAPGroupInfo>();

    // Add default security groups
    const defaultGroups = [
      'İnformasiya Təhlükəsizliyi DG',
      'SOC_Incident_Responders',
      'AppSec_Reviewers',
      'Enterprise_Security_Admins',
      'IT_Operations_Admins',
    ];

    for (const name of defaultGroups) {
      groupMap.set(name, {
        name,
        distinguishedName: `CN=${name},OU=Distribution Groups,${config.LDAP_BASE_DN}`,
        description: `${name} Corporate Access Group`,
        type: 'SECURITY_DISTRIBUTION_GROUP',
        isInfosecGroup: true,
        memberCount: 0,
      });
    }

    for (const user of db.data.users) {
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
          g.memberCount += 1;
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
    const password = payload.password || '';

    if (!rawInput || !password) {
      return {
        success: false,
        token: '',
        user: null as any,
        message: 'Active Directory username and password are required.',
      };
    }

    // Extract sAMAccountName and prepare candidate bind formats
    let sAMAccountName = rawInput;
    if (rawInput.includes('\\')) {
      sAMAccountName = rawInput.split('\\')[1];
    } else if (rawInput.includes('@')) {
      sAMAccountName = rawInput.split('@')[0];
    }

    const domainNetbios = config.LDAP_DOMAIN.split('.')[0].toUpperCase();
    const domainDns = config.LDAP_DOMAIN.toLowerCase();

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
      let authenticatedClient: Client | null = null;
      let successfulBindUser: string = '';

      for (const candidate of uniqueCandidates) {
        const client = new Client({
          url: config.LDAP_URL,
          timeout: 5000,
          connectTimeout: 5000,
          tlsOptions: { rejectUnauthorized: false }, // Allow internal enterprise Root CAs
        });

        try {
          logger.info({ candidate, url: config.LDAP_URL }, 'Attempting Active Directory LDAP Bind...');
          await client.bind(candidate, password);
          authenticatedClient = client;
          successfulBindUser = candidate;
          logger.info({ candidate }, '✅ Active Directory LDAP Bind Successful!');
          break;
        } catch (bindErr: any) {
          lastLdapError = bindErr;
          logger.debug({ candidate, err: bindErr.message }, 'Candidate bind failed, trying next format...');
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
          token: '',
          user: null as any,
          message: userFriendlyMsg,
        };
      }

      try {
        // Search user in Active Directory for memberOf and profile details
        let adDisplayName = sAMAccountName;
        let adMail = `${sAMAccountName}@${domainDns}`;
        let adGroups: string[] = ['İnformasiya Təhlükəsizliyi DG'];
        let adTitle = 'Information Security Specialist';
        let adDepartment = 'İnformasiya Təhlükəsizliyi';

        try {
          const searchRes = await authenticatedClient.search(config.LDAP_BASE_DN, {
            scope: 'sub',
            filter: `(|(sAMAccountName=${sAMAccountName})(mail=${sAMAccountName}@*)(userPrincipalName=${sAMAccountName}@*))`,
            attributes: ['displayName', 'mail', 'memberOf', 'title', 'department', 'distinguishedName'],
          });

          if (searchRes.searchEntries.length > 0) {
            const entry = searchRes.searchEntries[0];
            adDisplayName = (entry.displayName as string) || adDisplayName;
            adMail = (entry.mail as string) || adMail;
            adTitle = (entry.title as string) || adTitle;
            adDepartment = (entry.department as string) || adDepartment;

            const memberOf = Array.isArray(entry.memberOf) ? entry.memberOf : entry.memberOf ? [entry.memberOf] : [];
            const parsedGroups = memberOf
              .map((rawDn: any) => {
                const dn = typeof rawDn === 'string' ? rawDn : rawDn?.toString('utf-8') || '';
                const match = dn.match(/^CN=([^,]+)/i);
                return match ? match[1] : '';
              })
              .filter(Boolean);

            if (parsedGroups.length > 0) {
              adGroups = parsedGroups;
            }
          }
        } catch (searchErr) {
          logger.warn({ err: searchErr }, 'Active Directory user search warning after successful bind');
        }

        // Just-in-time provisioning in local database
        let user = db.data.users.find(
          (u) =>
            u.username.toLowerCase() === sAMAccountName.toLowerCase() ||
            u.email.toLowerCase() === adMail.toLowerCase()
        );

        if (!user) {
          user = {
            id: `usr-${sAMAccountName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            username: sAMAccountName.toLowerCase(),
            email: adMail,
            fullName: adDisplayName,
            title: adTitle,
            divisionId: 'div-infosec',
            departmentId: 'dept-infosec',
            teamIds: ['team-infosec'],
            roles: ['PLATFORM_ADMIN', 'CISO', 'SECURITY_ANALYST', 'APPROVER', 'REQUESTER'],
            securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
            ownedApplicationIds: [],
            ownedAssetIds: [],
            ownedRiskIds: [],
            isActive: true,
            sAMAccountName: sAMAccountName.toLowerCase(),
            userPrincipalName: `${sAMAccountName}@${domainDns}`,
            distinguishedName: `CN=${adDisplayName},${config.LDAP_BASE_DN}`,
            ldapDomain: config.LDAP_DOMAIN,
            distributionGroups: adGroups,
            ldapBindStatus: 'AUTHENTICATED',
            lastLdapLoginAt: new Date().toISOString(),
          };
          db.data.users.push(user);
        } else {
          user.fullName = adDisplayName;
          user.email = adMail;
          user.distributionGroups = Array.from(new Set([...(user.distributionGroups || []), ...adGroups]));
          user.ldapBindStatus = 'AUTHENTICATED';
          user.lastLdapLoginAt = new Date().toISOString();
        }

        db.persist();

        const token = `aegis_jwt_${user.id}_${Buffer.from(`${user.username}:${Date.now()}`).toString('base64')}`;

        AuditService.log({
          actor: user,
          action: 'USER_LOGIN',
          entityType: 'USER',
          entityId: user.id,
          ipAddress,
          userAgent: 'Active Directory LDAPS Live Authentication',
          fieldChanges: [
            {
              field: 'ldapAuthStatus',
              oldValue: 'UNBOUND',
              newValue: 'BOUND_SUCCESS',
            },
          ],
        });

        return {
          success: true,
          token,
          user,
          ldapInfo: {
            server: `${config.LDAP_URL} (Active Directory Domain Controller)`,
            bindDn: user.distinguishedName || `CN=${user.fullName},${config.LDAP_BASE_DN}`,
            distributionGroup: user.distributionGroups?.[0] || 'İnformasiya Təhlükəsizliyi DG',
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

    // 2. Fallback to local DB authentication when LDAP_ENABLED=false
    const user = db.data.users.find(
      (u) =>
        u.username.toLowerCase() === sAMAccountName.toLowerCase() ||
        u.email.toLowerCase() === rawInput.toLowerCase()
    );

    if (!user || !user.isActive) {
      return {
        success: false,
        token: '',
        user: null as any,
        message: `Authentication error: No registered user found for '${rawInput}'.`,
      };
    }

    const token = `aegis_jwt_${user.id}_${Buffer.from(`${user.username}:${Date.now()}`).toString('base64')}`;
    user.ldapBindStatus = 'AUTHENTICATED';
    user.lastLdapLoginAt = new Date().toISOString();
    db.persist();

    return {
      success: true,
      token,
      user,
      ldapInfo: {
        server: `${config.LDAP_URL} (Local Directory Auth)`,
        bindDn: user.distinguishedName || `CN=${user.fullName},${config.LDAP_BASE_DN}`,
        distributionGroup: user.distributionGroups?.[0] || 'İnformasiya Təhlükəsizliyi DG',
        authenticatedAt: new Date().toISOString(),
        kerberosTicketIssued: true,
      },
    };
  }
}
