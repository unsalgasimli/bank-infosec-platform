import { StrictReadOnlyLdapClient } from '../utils/readonly-ldap-client.js';
import { BankUser, BankRole, SecurityClearanceLevel, BankDepartment } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';
import { AuditService } from './audit.service.js';
import { resolveSecret } from '../utils/crypto.js';
import type { LDAPRawEntry, DepartmentMappingResult } from './ldap-directory.data.js';
import {
  mapDepartment,
  isAccountDisabled,
  isGenuineEmployeeOrIntern,
  parseMemberOfGroups,
  toSafeString,
  getDepartmentColor,
  getDepartmentIcon,
} from './ldap-directory.data.js';

export type { LDAPRawEntry, DepartmentMappingResult };

export interface LDAPSyncReport {
  timestamp: string;
  executionDurationMs: number;
  trigger: 'SCHEDULED_DAILY_CHECK' | 'MANUAL_TRIGGER' | 'STARTUP_CHECK';
  totalLdapUsers: number;
  activeUsersCount: number;
  disabledUsersCount: number;
  addedCount: number;
  updatedCount: number;
  disabledCount: number;
  reEnabledCount: number;
  duplicatesRemovedCount: number;
  departmentCounts: Record<string, { total: number; active: number; disabled: number; departmentName: string }>;
  addedUsers: Array<{ id: string; username: string; fullName: string; departmentId: string; departmentName: string }>;
  updatedUsers: Array<{ id: string; username: string; changes: string[] }>;
  disabledUsers: Array<{ id: string; username: string; reason: string }>;
  reEnabledUsers: Array<{ id: string; username: string }>;
  duplicateUsernames: string[];
  errors: string[];
}

export class LDAPSyncService {
  private static lastSyncReport: LDAPSyncReport | null = null;

  public static getLastSyncReport(): LDAPSyncReport | null {
    return this.lastSyncReport;
  }

  public static mapDepartment(
    adDepartment = '',
    adTitle = '',
    groups: string[] = [],
    distinguishedName = ''
  ): DepartmentMappingResult {
    return mapDepartment(adDepartment, adTitle, groups, distinguishedName);
  }

  public static isAccountDisabled(entry: LDAPRawEntry): boolean {
    return isAccountDisabled(entry);
  }

  public static parseMemberOfGroups(rawMemberOf?: string[] | string): string[] {
    return parseMemberOfGroups(rawMemberOf);
  }

  public static isGenuineEmployeeOrIntern(
    entry: LDAPRawEntry,
    parsedGroups: string[] = [],
    sAMAccountName = ''
  ): boolean {
    return isGenuineEmployeeOrIntern(entry, parsedGroups, sAMAccountName);
  }

  /**
   * Queries real Active Directory Domain Controller for live, non-disabled domain users.
   * Enforces LDAPS protocol, strict read-only execution, and paged results.
   */
  public static async queryLdapDirectory(options?: {
    bindUser?: string;
    bindPassword?: string;
    url?: string;
    baseDn?: string;
    searchFilter?: string;
  }): Promise<{ users: LDAPRawEntry[]; isLiveLdap: boolean; error?: string; searchedBaseDn?: string }> {
    const ldapUrl = (options?.url || config.LDAP_URL || '').trim();
    const baseDn = options?.baseDn || config.LDAP_BASE_DN;
    const bindUser = options?.bindUser || config.LDAP_BIND_USER;
    const bindPassword = resolveSecret(options?.bindPassword || config.LDAP_BIND_PASSWORD || '');
    // Standard Active Directory filter that strictly excludes disabled accounts (UAC bit 2) and machine accounts
    const searchFilter =
      options?.searchFilter ||
      '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(!(sAMAccountName=*$)))';

    if (!config.LDAP_ENABLED && !options?.url) {
      return {
        isLiveLdap: false,
        searchedBaseDn: baseDn,
        users: [],
        error: 'Active Directory synchronization is disabled.',
      };
    }

    if (!ldapUrl.startsWith('ldaps://') || !baseDn || !bindUser || !bindPassword) {
      return {
        isLiveLdap: false,
        searchedBaseDn: baseDn,
        users: [],
        error: 'LDAPS URL, base DN, and service-account credentials must be configured on the server.',
      };
    }

    let client: StrictReadOnlyLdapClient | null = null;
    try {
      logger.info({ url: ldapUrl, baseDn, bindUser: bindUser ? bindUser : 'Anonymous' }, 'Connecting to Active Directory for Daily LDAP Sync via LDAPS...');
      
      client = new StrictReadOnlyLdapClient({
        url: ldapUrl,
        timeout: 6000,
        connectTimeout: 6000,
        tlsRejectUnauthorized: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false,
      });

      await client.bind(bindUser, bindPassword);

      const searchRes = await client.search(baseDn, {
        scope: 'sub',
        filter: searchFilter,
        paged: { pageSize: 500 },
        attributes: [
          'sAMAccountName',
          'userPrincipalName',
          'mail',
          'displayName',
          'givenName',
          'sn',
          'title',
          'department',
          'company',
          'distinguishedName',
          'memberOf',
          'userAccountControl',
          'accountExpires',
          'whenCreated',
          'whenChanged',
        ],
      });

      if (searchRes && searchRes.searchEntries && searchRes.searchEntries.length > 0) {
        // Filter to valid human users only (not disabled or expired)
        const validUsers = (searchRes.searchEntries as LDAPRawEntry[]).filter((entry) => {
          if (!entry.sAMAccountName && !entry.userPrincipalName) return false;
          if (this.isAccountDisabled(entry)) return false;
          return true;
        });

        logger.info({ count: validUsers.length }, 'Successfully queried Active Directory live domain users!');
        return {
          isLiveLdap: true,
          searchedBaseDn: baseDn,
          users: validUsers,
        };
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Live Active Directory query failed; no directory data will be substituted');
      return {
        isLiveLdap: false,
        error: err.message,
        searchedBaseDn: baseDn,
        users: [],
      };
    } finally {
      if (client) {
        try {
          await client.unbind();
        } catch {
          // ignore unbind error on failed connection
        }
      }
    }

    return {
      isLiveLdap: false,
      searchedBaseDn: baseDn,
      users: [],
      error: 'Active Directory returned no eligible user records.',
    };
  }

  /**
   * Tests connection and bind against Active Directory strictly read-only
   */
  public static async testActiveDirectoryConnection(options?: {
    url?: string;
    baseDn?: string;
    bindUser?: string;
    bindPassword?: string;
  }): Promise<{
    success: boolean;
    serverUrl: string;
    baseDn: string;
    userCount: number;
    sampleUsers: Array<{ sAMAccountName: string; displayName: string; department: string; email: string }>;
    filterUsed: string;
    error?: string;
  }> {
    const url = (options?.url || config.LDAP_URL || '').trim();
    const baseDn = options?.baseDn || config.LDAP_BASE_DN;
    const bindUser = options?.bindUser || config.LDAP_BIND_USER;
    const bindPassword = resolveSecret(options?.bindPassword || config.LDAP_BIND_PASSWORD || '');
    const searchFilter = '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(!(sAMAccountName=*$)))';

    if (!url.startsWith('ldaps://') || !baseDn || !bindUser || !bindPassword) {
      return {
        success: false,
        serverUrl: url,
        baseDn,
        userCount: 0,
        sampleUsers: [],
        filterUsed: searchFilter,
        error: 'LDAPS URL, base DN, and service-account credentials must be configured on the server.',
      };
    }

    let client: StrictReadOnlyLdapClient | null = null;
    try {
      client = new StrictReadOnlyLdapClient({
        url,
        timeout: 6000,
        connectTimeout: 6000,
        tlsRejectUnauthorized: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false,
      });

      await client.bind(bindUser, bindPassword);

      const searchRes = await client.search(baseDn, {
        scope: 'sub',
        filter: searchFilter,
        paged: { pageSize: 500 },
        attributes: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName', 'department', 'title'],
      });

      const entries = (searchRes.searchEntries as LDAPRawEntry[]).filter((e) => Boolean(e.sAMAccountName));

      return {
        success: true,
        serverUrl: url,
        baseDn,
        userCount: entries.length,
        filterUsed: searchFilter,
        sampleUsers: entries.slice(0, 10).map((e) => ({
          sAMAccountName: e.sAMAccountName || '',
          displayName: e.displayName || e.sAMAccountName || '',
          department: e.department || 'General',
          email: e.mail || `${e.sAMAccountName}@${config.LDAP_DOMAIN.toLowerCase()}`,
        })),
      };
    } catch (err: any) {
      return {
        success: false,
        serverUrl: url,
        baseDn,
        userCount: 0,
        filterUsed: searchFilter,
        sampleUsers: [],
        error: err.message || 'Active Directory connection or bind failed',
      };
    } finally {
      if (client) {
        try {
          await client.unbind();
        } catch {}
      }
    }
  }

  /**
   * Scans and removes duplicate user entries across database and fixes all relational keys
   */
  public static deduplicateUsers(): { removedCount: number; duplicateUsernames: string[] } {
    const users = db.data.users || [];
    const seenByUsername = new Map<string, BankUser>();
    const duplicateUsernames: string[] = [];
    const uniqueUsers: BankUser[] = [];
    const idRemap = new Map<string, string>(); // oldId -> canonicalId

    for (const u of users) {
      const usernameKey = (u.username || u.sAMAccountName || '').toLowerCase().trim();
      const emailKey = (u.email || '').toLowerCase().trim();
      const lookupKey = usernameKey || emailKey;

      if (!lookupKey) {
        uniqueUsers.push(u);
        continue;
      }

      if (seenByUsername.has(lookupKey)) {
        const canonical = seenByUsername.get(lookupKey)!;
        duplicateUsernames.push(lookupKey);
        idRemap.set(u.id, canonical.id);

        // Merge roles and permissions
        canonical.roles = Array.from(new Set([...(canonical.roles || []), ...(u.roles || [])]));
        canonical.distributionGroups = Array.from(
          new Set([...(canonical.distributionGroups || []), ...(u.distributionGroups || [])])
        );
        canonical.teamIds = Array.from(new Set([...(canonical.teamIds || []), ...(u.teamIds || [])]));
        canonical.ownedApplicationIds = Array.from(
          new Set([...(canonical.ownedApplicationIds || []), ...(u.ownedApplicationIds || [])])
        );
        canonical.ownedAssetIds = Array.from(
          new Set([...(canonical.ownedAssetIds || []), ...(u.ownedAssetIds || [])])
        );
        canonical.ownedRiskIds = Array.from(
          new Set([...(canonical.ownedRiskIds || []), ...(u.ownedRiskIds || [])])
        );
      } else {
        seenByUsername.set(lookupKey, u);
        uniqueUsers.push(u);
      }
    }

    const removedCount = users.length - uniqueUsers.length;

    if (removedCount > 0) {
      db.data.users = uniqueUsers;

      // Fix foreign keys in tickets
      for (const ticket of db.data.tickets || []) {
        if (ticket.assigneeId && idRemap.has(ticket.assigneeId)) {
          ticket.assigneeId = idRemap.get(ticket.assigneeId)!;
        }
        if (ticket.reporterId && idRemap.has(ticket.reporterId)) {
          ticket.reporterId = idRemap.get(ticket.reporterId)!;
        }
        if (ticket.securityOwnerId && idRemap.has(ticket.securityOwnerId)) {
          ticket.securityOwnerId = idRemap.get(ticket.securityOwnerId)!;
        }
        if (ticket.watcherIds && ticket.watcherIds.length > 0) {
          ticket.watcherIds = Array.from(new Set(ticket.watcherIds.map((id) => idRemap.get(id) || id)));
        }
      }

      // Fix foreign keys in departments
      for (const dept of db.data.departments || []) {
        if (dept.managerId && idRemap.has(dept.managerId)) {
          dept.managerId = idRemap.get(dept.managerId)!;
        }
        if (dept.adminUserIds && dept.adminUserIds.length > 0) {
          dept.adminUserIds = Array.from(new Set(dept.adminUserIds.map((id) => idRemap.get(id) || id)));
        }
      }

      db.persist();
      logger.info({ removedCount, duplicateUsernames }, 'Deduplication completed: purged duplicate users and fixed foreign key references');
    }

    return { removedCount, duplicateUsernames };
  }

  /**
   * Core Daily LDAP Synchronization Pipeline
   * Takes all LDAP users according to department/şöbə, fixes added/disabled users, removes duplicates, and syncs DB.
   */
  public static async syncAllUsers(options: {
    trigger?: 'SCHEDULED_DAILY_CHECK' | 'MANUAL_TRIGGER' | 'STARTUP_CHECK';
    actor?: BankUser;
    ldapOptions?: { bindUser: string; bindPassword: string };
  } = {}): Promise<LDAPSyncReport> {
    const startTime = Date.now();
    const trigger = options.trigger || 'SCHEDULED_DAILY_CHECK';
    logger.info({ trigger, time: new Date().toISOString() }, '🚀 Starting Daily Active Directory / LDAP User Synchronization Check...');

    // 1. Query LDAP Directory. A failed query is never allowed to overwrite
    // real records with a built-in demo directory or to deactivate employees.
    const queryResult = await this.queryLdapDirectory(options.ldapOptions);
    const ldapEntries = queryResult.users;

    const dedupPre = queryResult.isLiveLdap
      ? this.deduplicateUsers()
      : { removedCount: 0, duplicateUsernames: [] };

    const domain = config.LDAP_DOMAIN.toLowerCase();
    const baseDn = config.LDAP_BASE_DN;

    const report: LDAPSyncReport = {
      timestamp: new Date().toISOString(),
      executionDurationMs: 0,
      trigger,
      totalLdapUsers: ldapEntries.length,
      activeUsersCount: 0,
      disabledUsersCount: 0,
      addedCount: 0,
      updatedCount: 0,
      disabledCount: 0,
      reEnabledCount: 0,
      duplicatesRemovedCount: dedupPre.removedCount,
      departmentCounts: {},
      addedUsers: [],
      updatedUsers: [],
      disabledUsers: [],
      reEnabledUsers: [],
      duplicateUsernames: dedupPre.duplicateUsernames,
      errors: queryResult.error ? [queryResult.error] : [],
    };

    if (!queryResult.isLiveLdap) {
      report.executionDurationMs = Date.now() - startTime;
      this.lastSyncReport = report;
      logger.warn(
        { trigger, reason: queryResult.error || 'No live directory result' },
        'Active Directory sync skipped; existing directory data was left unchanged'
      );
      return report;
    }

    // Keep only genuine human accounts returned by the configured live AD query.
    const validLdapEntries = ldapEntries.filter((e) => {
      const groups = this.parseMemberOfGroups(e.memberOf);
      const rawUser = toSafeString(e.sAMAccountName || e.userPrincipalName);
      let sAM = rawUser;
      if (rawUser.includes('\\')) sAM = rawUser.split('\\')[1];
      else if (rawUser.includes('@')) sAM = rawUser.split('@')[0];
      return this.isGenuineEmployeeOrIntern(e, groups, sAM);
    });

    report.totalLdapUsers = validLdapEntries.length;

    const existingUsers = db.data.users || [];
    const ldapUsernamesSeen = new Set<string>();
    const syncedDepartmentIds = new Set<string>();

    // 3. Process each genuine LDAP User
    for (const entry of validLdapEntries) {
      const rawUsername = toSafeString(entry.sAMAccountName || entry.userPrincipalName);
      if (!rawUsername) continue;

      let sAMAccountName = rawUsername;
      if (rawUsername.includes('\\')) sAMAccountName = rawUsername.split('\\')[1];
      else if (rawUsername.includes('@')) sAMAccountName = rawUsername.split('@')[0];
      sAMAccountName = sAMAccountName.toLowerCase();

      ldapUsernamesSeen.add(sAMAccountName);

      const email = (toSafeString(entry.mail) || toSafeString(entry.userPrincipalName) || `${sAMAccountName}@${domain}`).toLowerCase();
      const givenName = toSafeString(entry.givenName);
      const sn = toSafeString(entry.sn);
      const displayName = toSafeString(entry.displayName) || `${givenName} ${sn}`.trim() || sAMAccountName;
      const title = toSafeString(entry.title) || 'Bank Specialist';
      const rawDept = toSafeString(entry.department);
      const groups = this.parseMemberOfGroups(entry.memberOf);
      const isDisabledInLdap = this.isAccountDisabled(entry);
      const targetIsActive = !isDisabledInLdap;

      if (targetIsActive) report.activeUsersCount++;
      else report.disabledUsersCount++;

      // Department & Şöbə Mapping
      const deptMapping = this.mapDepartment(rawDept, title, groups, toSafeString(entry.distinguishedName));
      const targetDeptId = deptMapping.departmentId;
      const targetDeptName = deptMapping.departmentName;
      syncedDepartmentIds.add(targetDeptId);

      // Auto-register department in db.data.departments if newly discovered from Active Directory
      let deptRecord = (db.data.departments || []).find((d) => d.id === targetDeptId);
      if (!deptRecord) {
        deptRecord = {
          id: targetDeptId,
          divisionId: deptMapping.divisionId,
          name: targetDeptName,
          code: deptMapping.departmentCode,
          description: `${targetDeptName} - Expressbank Active Directory Şöbəsi`,
          color: getDepartmentColor(targetDeptName),
          icon: getDepartmentIcon(targetDeptName),
          isActive: true,
          memberCount: 0,
          connectionCount: 0,
          templateCount: 0,
          activeTaskCount: 0,
          settings: {
            defaultSlaHours: 24,
            criticalSlaHours: 4,
            autoAssignEnabled: true,
            requireDualApproval: false,
            allowedTicketCategories: ['GENERAL_REQUEST', 'ACCESS_REQUEST'],
            workingHours: { start: '09:00', end: '18:00', timezone: 'Asia/Baku' },
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          directorySource: 'ACTIVE_DIRECTORY',
        };
        db.data.departments.push(deptRecord);
      }
      deptRecord.directorySource = 'ACTIVE_DIRECTORY';
      deptRecord.isActive = true;

      // Update Department metrics
      if (!report.departmentCounts[targetDeptId]) {
        report.departmentCounts[targetDeptId] = {
          total: 0,
          active: 0,
          disabled: 0,
          departmentName: targetDeptName,
        };
      }
      report.departmentCounts[targetDeptId].total++;
      if (targetIsActive) report.departmentCounts[targetDeptId].active++;
      else report.departmentCounts[targetDeptId].disabled++;

      // Check if user exists in local database
      const existingUser = existingUsers.find(
        (u) =>
          u.username.toLowerCase() === sAMAccountName ||
          (u.sAMAccountName && u.sAMAccountName.toLowerCase() === sAMAccountName) ||
          u.email.toLowerCase() === email
      );

      const userRoles: BankRole[] = deptMapping.roles;
      const userClearance = deptMapping.securityClearance;
      const userDeptId = targetDeptId;
      const userDivId = deptMapping.divisionId;
      const userTeams = deptMapping.teamIds;

      if (!existingUser) {
        // === ADDED NEW USER ===
        const newId = `usr-${sAMAccountName.replace(/[^a-z0-9]/g, '-')}`;
        const newUser: BankUser = {
          id: newId,
          username: sAMAccountName,
          sAMAccountName,
          email,
          fullName: displayName,
          title,
          departmentId: userDeptId,
          divisionId: userDivId,
          teamIds: userTeams,
          roles: userRoles,
          securityClearance: userClearance,
          ownedApplicationIds: [],
          ownedAssetIds: [],
          ownedRiskIds: [],
          distributionGroups: groups,
          isActive: targetIsActive,
          userPrincipalName: entry.userPrincipalName || `${sAMAccountName}@${domain}`,
          distinguishedName: entry.distinguishedName || `CN=${displayName},OU=${rawDept || 'Users'},${baseDn}`,
          ldapDomain: config.LDAP_DOMAIN,
          ldapBindStatus: 'BOUND',
          lastLdapLoginAt: new Date().toISOString(),
          directorySource: 'ACTIVE_DIRECTORY',
        };

        db.data.users.push(newUser);
        report.addedCount++;
        report.addedUsers.push({
          id: newUser.id,
          username: sAMAccountName,
          fullName: displayName,
          departmentId: userDeptId,
          departmentName: targetDeptName,
        });
      } else {
        // === EXISTING USER: CHECK UPDATES / DISABLED STATUS ===
        const changes: string[] = [];

        if (existingUser.fullName !== displayName) {
          changes.push(`fullName: ${existingUser.fullName} -> ${displayName}`);
          existingUser.fullName = displayName;
        }

        if (existingUser.email.toLowerCase() !== email) {
          changes.push(`email: ${existingUser.email} -> ${email}`);
          existingUser.email = email;
        }

        if (existingUser.title !== title) {
          changes.push(`title: ${existingUser.title} -> ${title}`);
          existingUser.title = title;
        }

        if (existingUser.departmentId !== userDeptId && rawDept) {
          changes.push(`departmentId: ${existingUser.departmentId} -> ${userDeptId}`);
          existingUser.departmentId = userDeptId;
          existingUser.divisionId = userDivId;
        }

        existingUser.teamIds = userTeams;
        existingUser.roles = userRoles;
        existingUser.securityClearance = userClearance;

        // Account status synchronization (Added / Disabled users fix)
        if (existingUser.isActive && !targetIsActive) {
          // Account was active, but is now DISABLED in Active Directory
          existingUser.isActive = false;
          changes.push('status: ACTIVE -> DISABLED (Active Directory userAccountControl disable flag)');
          report.disabledCount++;
          report.disabledUsers.push({
            id: existingUser.id,
            username: sAMAccountName,
            reason: 'Account disabled in Active Directory (UAC 0x0002 / expired)',
          });
        } else if (!existingUser.isActive && targetIsActive) {
          // Account was disabled, but is now RE-ENABLED in Active Directory
          existingUser.isActive = true;
          changes.push('status: DISABLED -> ACTIVE (Active Directory account re-enabled)');
          report.reEnabledCount++;
          report.reEnabledUsers.push({
            id: existingUser.id,
            username: sAMAccountName,
          });
        }

        // Synchronize distribution groups and dynamic roles
        existingUser.distributionGroups = groups;
        existingUser.roles = userRoles;
        existingUser.securityClearance = userClearance;
        existingUser.teamIds = userTeams;

        existingUser.ldapDomain = config.LDAP_DOMAIN;
        existingUser.ldapBindStatus = 'BOUND';
        existingUser.directorySource = 'ACTIVE_DIRECTORY';

        if (changes.length > 0) {
          report.updatedCount++;
          report.updatedUsers.push({
            id: existingUser.id,
            username: sAMAccountName,
            changes,
          });
        }
      }
    }

    // 4. Safe Account Lifecycle Synchronization with Circuit-Breaker Protection
    // Instead of destructive deletion which causes data loss on partial LDAP returns,
    // accounts no longer present in Active Directory are safely marked isActive = false.
    const isSuspiciousPartialResult =
      queryResult.isLiveLdap &&
      existingUsers.length >= 10 &&
      ldapEntries.length < Math.floor(existingUsers.length * 0.5);

    if (isSuspiciousPartialResult) {
      logger.warn(
        { ldapCount: ldapEntries.length, existingCount: existingUsers.length },
        '⚠️ SAFETY CIRCUIT BREAKER TRIPPED: AD query returned less than 50% of known accounts. Skipping bulk deactivations to prevent accidental lockout.'
      );
      report.errors.push('Safety circuit breaker tripped: Suspiciously low AD account count returned.');
    } else {
      for (const u of db.data.users) {
        const key = (u.username || u.sAMAccountName || '').toLowerCase();
        if (u.directorySource === 'ACTIVE_DIRECTORY' && !ldapUsernamesSeen.has(key) && u.isActive) {
          u.isActive = false;
          report.disabledCount++;
          report.disabledUsers.push({
            id: u.id,
            username: u.username,
            reason: 'User account not present or active in Active Directory',
          });
        }
      }
    }

    // 5. Post-Sync Deduplication verification
    const dedupPost = this.deduplicateUsers();
    report.duplicatesRemovedCount += dedupPost.removedCount;

    // 6. Keep only departments confirmed by the current live directory result
    // active for assignment. Historical records remain retained for audit/ticket
    // foreign keys, but are no longer selectable as live queues.
    for (const dept of db.data.departments || []) {
      if (dept.directorySource === 'ACTIVE_DIRECTORY' && !syncedDepartmentIds.has(dept.id)) {
        dept.isActive = false;
      }
    }

    // 7. Update Department member counts in db.data.departments
    for (const dept of db.data.departments || []) {
      const activeCount = db.data.users.filter((u) => u.departmentId === dept.id && u.isActive).length;
      dept.memberCount = activeCount || dept.memberCount || 0;
    }

    // 8. Persist changes to disk / PostgreSQL
    db.persist();

    report.executionDurationMs = Date.now() - startTime;
    this.lastSyncReport = report;

    // 9. Log Audit Event
    AuditService.log({
      actor: options.actor || db.data.users.find((u) => u.roles.includes('CISO')) || db.data.users[0],
      action: 'LDAP_AUTH_SUCCESS',
      entityType: 'USER',
      entityId: 'ldap-sync-engine',
      userAgent: `LDAP Daily Synchronization Engine (${trigger})`,
      metadata: {
        trigger,
        totalLdapUsers: report.totalLdapUsers,
        added: report.addedCount,
        updated: report.updatedCount,
        disabled: report.disabledCount,
        reEnabled: report.reEnabledCount,
        duplicatesCleaned: report.duplicatesRemovedCount,
        durationMs: report.executionDurationMs,
      },
    });

    logger.info(
      {
        trigger,
        totalLdapUsers: report.totalLdapUsers,
        active: report.activeUsersCount,
        disabled: report.disabledUsersCount,
        added: report.addedCount,
        updated: report.updatedCount,
        disabledNow: report.disabledCount,
        duplicatesRemoved: report.duplicatesRemovedCount,
        durationMs: report.executionDurationMs,
      },
      '✅ Active Directory / LDAP Daily User Synchronization Check Complete!'
    );

    return report;
  }
}
