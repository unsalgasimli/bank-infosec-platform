import { createHash, randomUUID } from 'node:crypto';
import { StrictReadOnlyLdapClient } from '../utils/readonly-ldap-client.js';
import {
  BankUser,
  BankRole,
  SecurityClearanceLevel,
  BankDepartment,
  BankDepartmentSection,
  ApprovalChainNode,
  UserApprovalHierarchy,
} from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { pgClient } from '../db/postgres/client.js';
import type pg from 'pg';
import { PostgresProjectionRepository } from '../db/postgres/projection-repository.js';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';
import { AuditService } from './audit.service.js';
import { resolveSecret } from '../utils/crypto.js';
import { DirectoryBaselineService, mapBaselineRecord, type DirectoryBaselineRecord } from './directory-baseline.service.js';
import type { LDAPRawEntry, DepartmentMappingResult, ParsedHierarchy } from './ldap-directory.data.js';
import {
  mapDepartment,
  parseJobTitleAndHierarchy,
  isAccountDisabled,
  isGenuineEmployeeOrIntern,
  parseMemberOfGroups,
  toSafeString,
  normalizeDirectoryObjectGuid,
  normalizeDirectoryEmployeeId,
  makeDirectoryNameMatchKey,
  normalizeDirectoryText,
  normalizeDirectoryKey,
  normalizeAzerbaijani,
  extractDirectoryBranchName,
  makeDirectoryBranchMatchKey,
  extractOrganizationalUnits,
  LDAP_NON_HUMAN_ACCOUNT_FILTERS,
  isServiceAccount,
  classifyDirectoryAccount,
  hasHumanDirectoryName,
  isExcludedPrivilegedAccount,
  getBaseUsername,
  calculateCanonicalScore,
  getDepartmentColor,
  getDepartmentIcon,
} from './ldap-directory.data.js';

export type { LDAPRawEntry, DepartmentMappingResult, ParsedHierarchy, UserApprovalHierarchy, ApprovalChainNode };

export const LDAP_HUMAN_ACCOUNT_FILTER = [
  '(&(objectCategory=person)(objectClass=user)',
  '(!(sAMAccountName=*$))',
  ...LDAP_NON_HUMAN_ACCOUNT_FILTERS,
  '(!(sAMAccountName=*.si))',
  '(!(sAMAccountName=*.sec))',
  '(!(sAMAccountName=*.abs))',
  '(!(sAMAccountName=*.sh))',
  '(!(sAMAccountName=*.adm))',
  '(!(sAMAccountName=*.rdp))',
  '(!(sAMAccountName=*.admin))',
  ')',
].join('');

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
  dryRun?: boolean;
  snapshotHash?: string;
  snapshotAccepted?: boolean;
  identityCoverage?: { objectGuid: number; employeeId: number; username: number; total: number };
  snapshotRejectedReason?: string;
}

interface DirectorySnapshotQuality {
  ok: boolean;
  reason?: string;
  snapshotHash: string;
  identityCoverage: { objectGuid: number; employeeId: number; username: number; total: number };
}

export class LDAPSyncService {
  private static lastSyncReport: LDAPSyncReport | null = null;
  private static syncInFlight: Promise<LDAPSyncReport> | null = null;

  private static async persistSyncRun(report: LDAPSyncReport, client?: pg.PoolClient): Promise<void> {
    if (config.DB_TYPE !== 'postgres') return;
    const status = report.snapshotAccepted === false
      ? 'REJECTED'
      : report.errors.length > 0
        ? 'FAILED'
        : 'SUCCEEDED';
    try {
      const query = (sql: string, values: unknown[]) => client ? client.query(sql, values) : pgClient.query(sql, values);
      await query(
        `INSERT INTO directory_sync_runs(
         id, started_at, completed_at, status, trigger, snapshot_hash,
         total_ldap_users, active_users, disabled_users, added_users,
         updated_users, disabled_now, reenabled_users, duplicates_removed,
         dry_run, error_message, metadata
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
      [
        `ldap-sync-${Date.now()}-${randomUUID().slice(0, 8)}`,
        report.timestamp,
        new Date().toISOString(),
        status,
        report.trigger,
        report.snapshotHash || null,
        report.totalLdapUsers,
        report.activeUsersCount,
        report.disabledUsersCount,
        report.addedCount,
        report.updatedCount,
        report.disabledCount,
        report.reEnabledCount,
        report.duplicatesRemovedCount,
        report.dryRun === true,
        report.errors.length > 0 ? report.errors.join(' | ').slice(0, 4000) : null,
        JSON.stringify({
          snapshotAccepted: report.snapshotAccepted === true,
          snapshotRejectedReason: report.snapshotRejectedReason || null,
          identityCoverage: report.identityCoverage || null,
        }),
        ],
      );
    } catch (error: any) {
      if (client) throw error;
      logger.warn({ err: error?.message || String(error), trigger: report.trigger }, 'Directory sync report could not be persisted; sync result remains authoritative');
    }
  }

  private static async withDatabaseSyncLock<T>(operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const lockKey = 'aegissec:active-directory-sync';
    return pgClient.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      const lockResult = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
        [lockKey],
      );
      if (!lockResult.rows[0]?.locked) {
        throw Object.assign(new Error('Another Active Directory synchronization is already committing.'), { code: 'LDAP_SYNC_LOCKED', retryable: true });
      }
      return operation(client);
    });
  }

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

  public static isServiceAccount(entry: LDAPRawEntry): boolean {
    return isServiceAccount(entry);
  }

  /** A title/group cannot turn a technical identity into an organisation member. */
  private static isOrganizationEligible(user: BankUser): boolean {
    return user.organizationEligible !== false &&
      classifyDirectoryAccount(user) === 'HUMAN' &&
      hasHumanDirectoryName(user);
  }

  /**
   * Queries real Active Directory Domain Controller for live human domain
   * users, retaining disabled-account flags for lifecycle reconciliation.
   * Enforces LDAPS protocol, strict read-only execution, and paged results.
   */
  public static async queryLdapDirectory(options?: {
    bindUser?: string;
    bindPassword?: string;
    url?: string;
    baseDn?: string;
    searchFilter?: string;
  }): Promise<{ users: LDAPRawEntry[]; isLiveLdap: boolean; error?: string; searchedBaseDn?: string; requiresStableIdentity?: boolean }> {
    const ldapUrl = (options?.url || config.LDAP_URL || '').trim();
    const baseDn = options?.baseDn || config.LDAP_BASE_DN;
    const bindUser = options?.bindUser || config.LDAP_BIND_USER;
    const bindPassword = resolveSecret(options?.bindPassword || config.LDAP_BIND_PASSWORD || '');
    // Server-side filter excludes disabled, machine, and known non-human
    // service-account families before any records enter the sync pipeline.
    const searchFilter = options?.searchFilter || LDAP_HUMAN_ACCOUNT_FILTER;

    if (!config.LDAP_ENABLED && !options?.url) {
      return {
        isLiveLdap: false,
        searchedBaseDn: baseDn,
        users: [],
        error: 'Active Directory synchronization is disabled.',
        requiresStableIdentity: true,
      };
    }

    if (!ldapUrl.startsWith('ldaps://') || !baseDn || !bindUser || !bindPassword) {
      return {
        isLiveLdap: false,
        searchedBaseDn: baseDn,
        users: [],
        error: 'LDAPS URL, base DN, and service-account credentials must be configured on the server.',
        requiresStableIdentity: true,
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
          'objectGUID',
          'employeeID',
          'userPrincipalName',
          'mail',
          'displayName',
          'givenName',
          'sn',
          'title',
          'department',
          'company',
          'distinguishedName',
          'manager',
          'memberOf',
          'description',
          'employeeType',
          'objectClass',
          'servicePrincipalName',
          'userAccountControl',
          'accountExpires',
          'whenCreated',
          'whenChanged',
        ],
      });

      if (searchRes && searchRes.searchEntries && searchRes.searchEntries.length > 0) {
        // Filter to valid human users only. Disabled/expired state is retained
        // so the reconciliation layer can deactivate the existing projection
        // with an explicit reason instead of treating it as an incomplete read.
        const validUsers = (searchRes.searchEntries as LDAPRawEntry[]).filter((entry) => {
          if (!entry.sAMAccountName && !entry.userPrincipalName) return false;
          const rawUsername = toSafeString(entry.sAMAccountName || entry.userPrincipalName);
          const sAMAccountName = rawUsername.includes('\\')
            ? rawUsername.split('\\')[1]
            : rawUsername.includes('@')
              ? rawUsername.split('@')[0]
              : rawUsername;
          return this.isGenuineEmployeeOrIntern(entry, this.parseMemberOfGroups(entry.memberOf), sAMAccountName);
        });

        logger.info({ count: validUsers.length }, 'Successfully queried Active Directory live domain users!');
        return {
          isLiveLdap: true,
          searchedBaseDn: baseDn,
          users: validUsers,
          requiresStableIdentity: true,
        };
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Live Active Directory query failed; no directory data will be substituted');
      return {
        isLiveLdap: false,
        error: err.message,
        searchedBaseDn: baseDn,
        requiresStableIdentity: true,
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
      requiresStableIdentity: true,
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
    const searchFilter = LDAP_HUMAN_ACCOUNT_FILTER;

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
   * Scans and removes duplicate user entries across database and fixes all relational keys.
   * Leverages canonical scoring and Azerbaijan-name phonetic/identity keys.
   */
  public static deduplicateUsers(options: { persist?: boolean } = {}): { removedCount: number; duplicateUsernames: string[] } {
    const users = db.data.users || [];
    const seenByIdentityKey = new Map<string, BankUser>();
    const duplicateUsernames: string[] = [];
    const uniqueUsers: BankUser[] = [];
    const idRemap = new Map<string, string>(); // oldId -> canonicalId

    // Current AD identities win over stale local variants irrespective of
    // storage order, e.g. a legacy `firstname` versus `f.surname` account.
    const orderedUsers = [...users].sort((left, right) => calculateCanonicalScore(right) - calculateCanonicalScore(left));

    for (const u of orderedUsers) {
      // Canonicalize persisted identity columns before uniqueness checks.
      if (u.username) u.username = normalizeDirectoryKey(u.username);
      if (u.sAMAccountName) u.sAMAccountName = normalizeDirectoryKey(u.sAMAccountName);
      if (u.email) u.email = normalizeDirectoryKey(u.email);

      const identityKeys = Array.from(
        new Set(
          [u.username, u.sAMAccountName, u.email]
            .map((value) => normalizeDirectoryKey(value))
            .filter(Boolean)
        )
      );

      // Base username key for secondary suffix accounts (.si, .sec, .abs, .adm)
      const baseKey = getBaseUsername(u.username || u.sAMAccountName || '');
      if (baseKey && baseKey !== u.username) {
        identityKeys.push(`base:${baseKey}`);
      }

      // A verified full name is a stable reconciliation key across legacy
      // username formats (e.g. `unsal` vs `u.gasimli`). Technical identities never receive this key.
      const nameKey = hasHumanDirectoryName(u)
        ? normalizeDirectoryText(u.fullName || '').split(/[\s,]+/).map(normalizeDirectoryKey).filter(Boolean).join(' ')
        : '';
      if (nameKey) identityKeys.push(`person:${nameKey}`);
      const lookupKey = identityKeys[0] || '';

      if (!lookupKey) {
        uniqueUsers.push(u);
        continue;
      }

      const canonical = identityKeys.map((key) => seenByIdentityKey.get(key)).find(Boolean);
      if (canonical && canonical.id !== u.id) {
        duplicateUsernames.push(lookupKey);
        idRemap.set(u.id, canonical.id);

        // If u is a secondary suffix account, mark link to canonical
        if (isExcludedPrivilegedAccount(u.username || '')) {
          u.primaryUsername = canonical.username;
          u.organizationEligible = false;
          u.isActive = false;
        }

        // Merge roles and permissions into canonical
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
        for (const key of identityKeys) seenByIdentityKey.set(key, u);
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

      for (const section of db.data.departmentSections || []) {
        if (section.managerId && idRemap.has(section.managerId)) section.managerId = idRemap.get(section.managerId)!;
      }

      // Preserve every existing workflow, evidence, project, and ticket link
      // when two directory identities collapse into one canonical employee.
      // Only known user-reference fields are rewritten; ordinary string data
      // and business record IDs are left untouched.
      const scalarUserReferences = new Set([
        'managerId', 'leadId', 'ownerId', 'assigneeId', 'reporterId',
        'requesterId', 'securityOwnerId', 'userId', 'authorId', 'createdBy',
        'updatedBy', 'createdByUserId', 'assignedTo', 'assignedToUserId',
        'approverId', 'assignedUserId', 'sponsorId',
      ]);
      const arrayUserReferences = new Set([
        'watcherIds', 'adminUserIds', 'approverIds', 'userIds', 'memberIds',
        'assigneeIds', 'ownerIds', 'participantIds', 'recipientIds',
      ]);
      const remapUserReferences = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
          for (const item of value) remapUserReferences(item);
          return;
        }
        for (const [field, current] of Object.entries(value as Record<string, unknown>)) {
          if (scalarUserReferences.has(field) && typeof current === 'string' && idRemap.has(current)) {
            (value as Record<string, unknown>)[field] = idRemap.get(current)!;
          } else if (arrayUserReferences.has(field) && Array.isArray(current)) {
            (value as Record<string, unknown>)[field] = Array.from(new Set(current.map((item) => typeof item === 'string' ? idRemap.get(item) || item : item)));
          } else {
            remapUserReferences(current);
          }
        }
      };
      for (const collection of Object.values(db.data)) remapUserReferences(collection);

      if (options.persist !== false) db.persist();
      logger.info({ removedCount, duplicateUsernames }, 'Deduplication completed: purged duplicate users and fixed foreign key references');
    }

    return { removedCount, duplicateUsernames };
  }

  private static validateDirectorySnapshot(entries: LDAPRawEntry[], requiresStableIdentity: boolean): DirectorySnapshotQuality {
    const identityCoverage = {
      objectGuid: entries.filter((entry) => Boolean(normalizeDirectoryObjectGuid(entry.objectGUID))).length,
      employeeId: entries.filter((entry) => Boolean(normalizeDirectoryEmployeeId(entry.employeeID ?? entry.employeeId ?? entry.employeeNumber))).length,
      username: entries.filter((entry) => Boolean(toSafeString(entry.sAMAccountName || entry.userPrincipalName))).length,
      total: entries.length,
    };
    const fingerprintRows = entries.map((entry) => ({
      objectGuid: normalizeDirectoryObjectGuid(entry.objectGUID),
      employeeId: normalizeDirectoryEmployeeId(entry.employeeID ?? entry.employeeId ?? entry.employeeNumber),
      username: normalizeDirectoryKey(entry.sAMAccountName || entry.userPrincipalName),
      displayName: normalizeDirectoryText(entry.displayName || entry.fullName),
      department: normalizeDirectoryText(entry.department),
      title: normalizeDirectoryText(entry.title || (entry as any).jobTitle),
      disabled: isAccountDisabled(entry),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const snapshotHash = createHash('sha256').update(JSON.stringify(fingerprintRows)).digest('hex');

    const duplicateValues = (values: string[]): string[] => {
      const counts = new Map<string, number>();
      for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
      return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
    };
    const duplicateObjectGuids = duplicateValues(fingerprintRows.map((row) => row.objectGuid));
    const duplicateEmployeeIds = duplicateValues(fingerprintRows.map((row) => row.employeeId));
    const duplicateUsernames = duplicateValues(fingerprintRows.map((row) => row.username));
    const reasons: string[] = [];
    if (entries.length === 0) reasons.push('LDAP returned zero eligible directory records.');
    if (requiresStableIdentity && identityCoverage.username < identityCoverage.total) reasons.push('One or more live LDAP records have no username.');
    if (requiresStableIdentity && identityCoverage.objectGuid + identityCoverage.employeeId < identityCoverage.total) reasons.push('One or more live LDAP records have neither objectGUID nor employeeID.');
    if (duplicateObjectGuids.length > 0) reasons.push(`Duplicate objectGUID values detected (${duplicateObjectGuids.length}).`);
    if (duplicateEmployeeIds.length > 0) reasons.push(`Duplicate employeeID values detected (${duplicateEmployeeIds.length}).`);
    if (duplicateUsernames.length > 0) reasons.push(`Duplicate username values detected (${duplicateUsernames.length}).`);
    return { ok: reasons.length === 0, reason: reasons.join(' '), snapshotHash, identityCoverage };
  }

  public static async syncAllUsers(options: {
    trigger?: 'SCHEDULED_DAILY_CHECK' | 'MANUAL_TRIGGER' | 'STARTUP_CHECK';
    actor?: BankUser;
    ldapOptions?: { bindUser: string; bindPassword: string };
    mockEntries?: LDAPRawEntry[];
    dryRun?: boolean;
  } = {}): Promise<LDAPSyncReport> {
    if (this.syncInFlight) return this.syncInFlight;
    const operation = this.performSync(options).then((report) => {
      this.lastSyncReport = report;
      logger.info({ trigger: report.trigger, snapshotAccepted: report.snapshotAccepted, dryRun: report.dryRun, totalLdapUsers: report.totalLdapUsers }, 'Directory synchronization result committed');
      return report;
    });
    this.syncInFlight = operation.finally(() => {
      this.syncInFlight = null;
    });
    // Return the tracked promise, not its parent: otherwise finally() creates
    // an orphan rejection when the caller handles a failed lock/sync attempt.
    return this.syncInFlight;
  }

  /**
   * Core Daily LDAP Synchronization Pipeline
   * Takes all LDAP users according to department/şöbə, fixes added/disabled users, removes duplicates, and syncs DB.
   */
  private static async performSync(options: {
    trigger?: 'SCHEDULED_DAILY_CHECK' | 'MANUAL_TRIGGER' | 'STARTUP_CHECK';
    actor?: BankUser;
    ldapOptions?: { bindUser: string; bindPassword: string };
    mockEntries?: LDAPRawEntry[];
    dryRun?: boolean;
  } = {}): Promise<LDAPSyncReport> {
    const startTime = Date.now();
    if (config.DB_TYPE === 'postgres' && !pgClient.getPool()) {
      throw new Error('PostgreSQL is unavailable; Active Directory synchronization cannot acquire its database lock.');
    }
    const trigger = options.trigger || 'SCHEDULED_DAILY_CHECK';
    logger.info({ trigger, time: new Date().toISOString() }, '🚀 Starting Daily Active Directory / LDAP User Synchronization Check...');

    // 1. Query LDAP Directory. A failed query is never allowed to overwrite
    // real records with a built-in demo directory or to deactivate employees.
    const queryResult = options.mockEntries
      ? { users: options.mockEntries, isLiveLdap: true }
      : await this.queryLdapDirectory(options.ldapOptions);
    if (config.DB_TYPE !== 'postgres') return this.applySnapshot(options, queryResult, startTime);
    await db.flush();
    const before = structuredClone(db.data);
    const staged = await this.withDatabaseSyncLock(async (client) => {
      const newer = await client.query(`SELECT 1 FROM directory_sync_runs
        WHERE started_at >= $1 AND dry_run=FALSE AND metadata->>'snapshotAccepted'='true' LIMIT 1`, [new Date(startTime).toISOString()]);
      if (newer.rowCount && !options.dryRun) throw Object.assign(new Error('A newer directory snapshot has already committed; fetch a fresh snapshot.'), { code: 'STALE_DIRECTORY_SNAPSHOT', retryable: true });
      const baseline = await PostgresProjectionRepository.hydrate({ client, trackHashes: false });
      const prepared = await db.stageProjection(baseline, () => this.applySnapshot(options, queryResult, startTime, client));
      if (!options.dryRun && prepared.value.snapshotAccepted) {
        await PostgresProjectionRepository.persist(prepared.data, [], { client, baseline });
      }
      prepared.value.executionDurationMs = Date.now() - startTime;
      await this.persistSyncRun(prepared.value, client);
      return prepared;
    });
    if (!options.dryRun && staged.value.snapshotAccepted) db.publishCommittedProjection(before, staged.data);
    return staged.value;
  }

  private static async applySnapshot(
    options: Parameters<typeof LDAPSyncService.syncAllUsers>[0],
    queryResult: Awaited<ReturnType<typeof LDAPSyncService.queryLdapDirectory>>,
    startTime: number,
    client?: pg.PoolClient,
  ): Promise<LDAPSyncReport> {
    options ??= {};
    const trigger = options.trigger || 'SCHEDULED_DAILY_CHECK';
    const ldapEntries = queryResult.users;

    const domain = config.LDAP_DOMAIN.toLowerCase();
    const baseDn = config.LDAP_BASE_DN;

    const report: LDAPSyncReport = {
      timestamp: new Date(startTime).toISOString(),
      executionDurationMs: 0,
      trigger,
      totalLdapUsers: ldapEntries.length,
      activeUsersCount: 0,
      disabledUsersCount: 0,
      addedCount: 0,
      updatedCount: 0,
      disabledCount: 0,
      reEnabledCount: 0,
      duplicatesRemovedCount: 0,
      departmentCounts: {},
      addedUsers: [],
      updatedUsers: [],
      disabledUsers: [],
      reEnabledUsers: [],
      duplicateUsernames: [],
      errors: queryResult.error ? [queryResult.error] : [],
      dryRun: options.dryRun === true,
      snapshotAccepted: false,
    };

    if (!queryResult.isLiveLdap) {
      report.executionDurationMs = Date.now() - startTime;
      if (!client) await this.persistSyncRun(report);
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

    const snapshotQuality = this.validateDirectorySnapshot(validLdapEntries, queryResult.requiresStableIdentity === true);
    report.snapshotHash = snapshotQuality.snapshotHash;
    report.identityCoverage = snapshotQuality.identityCoverage;
    const knownActiveHumanUsers = db.data.users.filter((user) =>
      user.directorySource === 'ACTIVE_DIRECTORY' &&
      user.isActive &&
      this.isOrganizationEligible(user)
    ).length;
    const minimumExpectedCount = knownActiveHumanUsers > 0 ? Math.max(1, Math.floor(knownActiveHumanUsers * config.LDAP_SYNC_MIN_COVERAGE)) : 0;
    if (queryResult.requiresStableIdentity === true && validLdapEntries.length < minimumExpectedCount) {
      snapshotQuality.ok = false;
      snapshotQuality.reason = `${snapshotQuality.reason ? `${snapshotQuality.reason} ` : ''}Live LDAP coverage ${validLdapEntries.length} is below the safe minimum ${minimumExpectedCount} for ${knownActiveHumanUsers} known active directory users.`;
    }
    report.snapshotAccepted = snapshotQuality.ok;
    if (!snapshotQuality.ok) {
      report.snapshotRejectedReason = snapshotQuality.reason;
      report.errors.push(snapshotQuality.reason || 'LDAP snapshot quality validation failed.');
      report.executionDurationMs = Date.now() - startTime;
      if (!client) await this.persistSyncRun(report);
      logger.warn({ trigger, reason: snapshotQuality.reason, snapshotHash: snapshotQuality.snapshotHash }, 'Active Directory sync skipped; snapshot quality gate rejected the result');
      return report;
    }

    // The imported HR workbook is a reference baseline for known people and
    // hierarchy names. AD remains authoritative for current status and any
    // changed title/department; the baseline is only used when AD omits those
    // fields. It never creates an operational/login user by itself.
    let baselineByName = new Map<string, DirectoryBaselineRecord>();
    let baselineByEmployeeId = new Map<string, DirectoryBaselineRecord>();
    let baselineByBranch = new Map<string, DirectoryBaselineRecord>();
    if (config.DB_TYPE === 'postgres') {
      try {
        const baseline = await DirectoryBaselineService.loadCurrent(client);
        const baselineNameCandidates = new Map<string, DirectoryBaselineRecord[]>();
        for (const record of baseline) {
          const nameKey = makeDirectoryNameMatchKey(record.fullName);
          if (!nameKey) continue;
          const candidates = baselineNameCandidates.get(nameKey) || [];
          candidates.push(record);
          baselineNameCandidates.set(nameKey, candidates);
        }
        baselineByName = new Map(
          [...baselineNameCandidates.entries()]
            .filter(([, candidates]) => candidates.length === 1)
            .map(([nameKey, candidates]) => [nameKey, candidates[0]])
        );
        baselineByEmployeeId = new Map(baseline.map((record) => [normalizeDirectoryEmployeeId(record.employeeId), record]));
        for (const record of baseline) {
          const branchName = extractDirectoryBranchName([record.structureName]);
          const branchKey = makeDirectoryBranchMatchKey(branchName);
          if (branchKey && !baselineByBranch.has(branchKey)) baselineByBranch.set(branchKey, record);
        }
      } catch (error: any) {
        if (client) throw error;
        logger.warn({ err: error?.message || String(error) }, 'Directory baseline unavailable; continuing with live AD attributes');
      }
    }

    const preSyncData = options.dryRun ? structuredClone(db.data) : undefined;

    // All projection, relationship repair, de-duplication, and lifecycle
    // changes commit together. A failed sync therefore leaves the previous
    // durable directory projection untouched.
    db.transaction(() => {
      // Historical technical/service entries remain available for audit, but
      // can never stay active in the employee hierarchy or assignment queues.
      for (const user of db.data.users || []) {
        if (user.directorySource !== 'ACTIVE_DIRECTORY') continue;
        const accountType = classifyDirectoryAccount(user);
        user.directoryAccountType = accountType;
        user.organizationEligible = accountType === 'HUMAN';
        if (accountType !== 'HUMAN') {
          user.isActive = false;
          user.managerId = undefined;
          user.sectionId = undefined;
        }
      }
      const dedupPre = this.deduplicateUsers({ persist: false });
      report.duplicatesRemovedCount += dedupPre.removedCount;
      report.duplicateUsernames.push(...dedupPre.duplicateUsernames);

      const existingUsers = db.data.users || [];
      const ldapUsernamesSeen = new Set<string>();
      const syncedDepartmentIds = new Set<string>();
      const syncedSectionIds = new Set<string>();

      const ensureDivision = (divisionId: string): void => {
        if (db.data.divisions.some((division) => division.id === divisionId)) return;
        const divisionNames: Record<string, { name: string; code: string }> = {
          'div-sec': { name: 'İnformasiya Təhlükəsizliyi', code: 'INFOSEC' },
          'div-it': { name: 'İnformasiya Texnologiyaları', code: 'IT' },
          'div-hr': { name: 'İnsan Resursları', code: 'HR' },
          'div-banking': { name: 'Bank əməliyyatları və biznes', code: 'BANKING' },
        };
        const division = divisionNames[divisionId] || { name: divisionId, code: divisionId.replace(/^div-/, '').toUpperCase() };
        db.data.divisions.push({ id: divisionId, ...division });
      };

    // 3. Process each genuine LDAP User
    for (const entry of validLdapEntries) {
      const rawUsername = toSafeString(entry.sAMAccountName || entry.userPrincipalName);
      if (!rawUsername) continue;

      let sAMAccountName = rawUsername;
      if (rawUsername.includes('\\')) sAMAccountName = rawUsername.split('\\')[1];
      else if (rawUsername.includes('@')) sAMAccountName = rawUsername.split('@')[0];
      sAMAccountName = normalizeDirectoryKey(sAMAccountName);

      ldapUsernamesSeen.add(sAMAccountName);

      const email = normalizeDirectoryKey(toSafeString(entry.mail) || toSafeString(entry.userPrincipalName) || `${sAMAccountName}@${domain}`);
      const givenName = normalizeDirectoryText(entry.givenName);
      const sn = normalizeDirectoryText(entry.sn);
      const displayName = normalizeDirectoryText(entry.displayName) || `${givenName} ${sn}`.trim() || sAMAccountName;
      const employeeId = normalizeDirectoryEmployeeId(entry.employeeID ?? entry.employeeId ?? entry.employeeNumber);
      const baseline = baselineByEmployeeId.get(employeeId) || baselineByName.get(makeDirectoryNameMatchKey(displayName));
      const title = normalizeDirectoryText(entry.title || (entry as any).jobTitle) || baseline?.title || 'Bank Specialist';
      const rawDept = normalizeDirectoryText(entry.department) || baseline?.structureName || '';
      const groups = this.parseMemberOfGroups(entry.memberOf);
      const branchSignal = extractDirectoryBranchName([
        rawDept,
        title,
        ...groups,
        ...extractOrganizationalUnits(entry.distinguishedName),
      ]);
      const branchBaseline = branchSignal
        ? baselineByBranch.get(makeDirectoryBranchMatchKey(branchSignal))
        : undefined;
      const isDisabledInLdap = this.isAccountDisabled(entry);
      const targetIsActive = !isDisabledInLdap;

      if (targetIsActive) report.activeUsersCount++;
      else report.disabledUsersCount++;

      // Department & Şöbə Mapping
      const adMapping = this.mapDepartment(rawDept, title, groups, toSafeString(entry.distinguishedName));
      // For a person present in the supplied HR snapshot, an equal structure
      // label means the workbook root is authoritative (especially branches
      // and top-level şöbələr that the old function classified by job title).
      // A changed AD department intentionally wins, so moves and renames are
      // reflected on the next daily sync.
      // A branch marker in AD department/title/OU/memberOf is stronger than
      // the legacy functional title rules: branch users must stay under their
      // branch root even when their job is cashier, credit, or operations.
      // Known branches use the exact Excel root; a new branch is provisioned
      // with a stable root from the AD signal and will be reconciled later.
      const branchStructureName = branchBaseline?.structureName || (branchSignal ? `${branchSignal} filialı` : undefined);
      const branchMapping = branchStructureName
        ? mapBaselineRecord({ structureName: branchStructureName, title })
        : undefined;
      const deptMapping = branchMapping || (baseline && normalizeDirectoryKey(rawDept) === normalizeDirectoryKey(baseline.structureName)
        ? mapBaselineRecord(baseline)
        : adMapping);
      const targetDeptId = deptMapping.departmentId;
      const targetDeptName = deptMapping.departmentName;
      syncedDepartmentIds.add(targetDeptId);
      ensureDivision(deptMapping.divisionId);

      // Auto-register or refresh department in db.data.departments
      let deptRecord = (db.data.departments || []).find((d) => d.id === targetDeptId);
      if (!db.data.departmentSections) db.data.departmentSections = [];
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
      } else {
        // AD title/OU routing is the source of truth for its organisational
        // records, including records created by an older generic mapping.
        deptRecord.name = targetDeptName;
        deptRecord.code = deptMapping.departmentCode;
        deptRecord.color = getDepartmentColor(targetDeptName);
        deptRecord.icon = getDepartmentIcon(targetDeptName);
        deptRecord.divisionId = deptMapping.divisionId;
        deptRecord.updatedAt = new Date().toISOString();
      }
      deptRecord.directorySource = 'ACTIVE_DIRECTORY';
      deptRecord.isActive = true;

      // Auto-register or refresh Section (Şöbə) in db.data.departmentSections
      let sectionRecord: BankDepartmentSection | undefined;
      if (deptMapping.sectionId && deptMapping.sectionName && deptMapping.sectionCode) {
        syncedSectionIds.add(deptMapping.sectionId);
        sectionRecord = (db.data.departmentSections || []).find((section) => section.id === deptMapping.sectionId);
        if (!sectionRecord) {
          sectionRecord = {
            id: deptMapping.sectionId,
            departmentId: targetDeptId,
            name: deptMapping.sectionName,
            code: deptMapping.sectionCode,
            sectionType: 'SOBE',
            hasOwnManager: true,
            isActive: true,
            memberCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            directorySource: 'ACTIVE_DIRECTORY',
          };
          db.data.departmentSections.push(sectionRecord);
        } else {
          sectionRecord.departmentId = targetDeptId;
          sectionRecord.name = deptMapping.sectionName;
          sectionRecord.code = deptMapping.sectionCode;
          sectionRecord.sectionType = 'SOBE';
          sectionRecord.hasOwnManager = true;
          sectionRecord.isActive = true;
          sectionRecord.directorySource = 'ACTIVE_DIRECTORY';
          sectionRecord.updatedAt = new Date().toISOString();
        }
      }

      // Auto-register or refresh Sub-unit (Bölmə / Sektor) in db.data.departmentSections
      let unitRecord: BankDepartmentSection | undefined;
      if (deptMapping.unitId && deptMapping.unitName && deptMapping.unitCode) {
        syncedSectionIds.add(deptMapping.unitId);
        unitRecord = (db.data.departmentSections || []).find((section) => section.id === deptMapping.unitId);
        if (!unitRecord) {
          unitRecord = {
            id: deptMapping.unitId,
            departmentId: targetDeptId,
            name: deptMapping.unitName,
            code: deptMapping.unitCode,
            sectionType: 'BOLME',
            parentSectionId: deptMapping.sectionId,
            hasOwnManager: false, // Bölmə has NO separate manager
            managerId: undefined,
            isActive: true,
            memberCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            directorySource: 'ACTIVE_DIRECTORY',
          };
          db.data.departmentSections.push(unitRecord);
        } else {
          unitRecord.departmentId = targetDeptId;
          unitRecord.name = deptMapping.unitName;
          unitRecord.code = deptMapping.unitCode;
          unitRecord.sectionType = 'BOLME';
          unitRecord.parentSectionId = deptMapping.sectionId;
          unitRecord.hasOwnManager = false;
          unitRecord.managerId = undefined;
          unitRecord.isActive = true;
          unitRecord.directorySource = 'ACTIVE_DIRECTORY';
          unitRecord.updatedAt = new Date().toISOString();
        }
      }

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
      const objectGuid = normalizeDirectoryObjectGuid(entry.objectGUID);
      const existingByObjectGuid = objectGuid
        ? existingUsers.find((u) => normalizeDirectoryObjectGuid((u as any).directoryObjectGuid) === objectGuid)
        : undefined;
      const existingByEmployeeId = existingUsers.find(
        (u) => employeeId && normalizeDirectoryEmployeeId((u as any).baselineEmployeeId) === employeeId
      );
      const sameNameCandidates = existingUsers.filter(
        (u) => makeDirectoryNameMatchKey(u.fullName) === makeDirectoryNameMatchKey(displayName) && u.directorySource === 'ACTIVE_DIRECTORY'
      );
      const existingUser = existingByObjectGuid
        || existingByEmployeeId
        || existingUsers.find((u) => normalizeDirectoryKey(u.username) === sAMAccountName || normalizeDirectoryKey(u.sAMAccountName) === sAMAccountName)
        || existingUsers.find((u) => normalizeDirectoryKey(u.email) === email)
        || (sameNameCandidates.length === 1 ? sameNameCandidates[0] : undefined);

      const isSuperAdminAccount =
        sAMAccountName === 'u.gasimli' ||
        sAMAccountName === 'unsal' ||
        sAMAccountName === 'u.gasimli.sec' ||
        sAMAccountName === 'unsal.gasimli';

      const superAdminRoles: BankRole[] = [
        'PLATFORM_ADMIN',
        'CISO',
        'INFOSEC_ADMIN',
        'DEPARTMENT_ADMIN',
        'SECURITY_ANALYST',
        'SOC_ANALYST',
        'APPSEC_ANALYST',
        'APPROVER',
        'REQUESTER',
      ];

      const userRoles: BankRole[] = isSuperAdminAccount ? superAdminRoles : deptMapping.roles;
      const userClearance = isSuperAdminAccount ? 'HIGHLY_RESTRICTED_HR_LEGAL' : deptMapping.securityClearance;
      const userDeptId = targetDeptId;
      const userSectionId = sectionRecord?.id;
      const userSectionName = sectionRecord?.name;
      const userUnitId = unitRecord?.id;
      const userUnitName = unitRecord?.name;
      const userDivId = deptMapping.divisionId;
      const userTeams = deptMapping.teamIds;
      const userPositionTitle = deptMapping.positionTitle || title;

      if (!existingUser) {
        // === ADDED NEW USER ===
        const newId = `usr-${sAMAccountName.replace(/[^a-z0-9]/g, '-')}`;
        const newUser: BankUser = {
          id: newId,
          username: sAMAccountName,
          sAMAccountName,
          directoryObjectGuid: objectGuid || undefined,
          baselineEmployeeId: baseline?.employeeId || employeeId || undefined,
          email,
          fullName: displayName,
          title: userPositionTitle,
          departmentId: userDeptId,
          sectionId: userSectionId,
          sectionName: userSectionName,
          unitId: userUnitId,
          unitName: userUnitName,
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
          directoryAccountType: 'HUMAN',
          organizationEligible: true,
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

        if (normalizeDirectoryKey(existingUser.username) !== sAMAccountName) {
          changes.push(`username: ${existingUser.username} -> ${sAMAccountName}`);
          existingUser.username = sAMAccountName;
          existingUser.sAMAccountName = sAMAccountName;
        }

        if (existingUser.fullName !== displayName) {
          changes.push(`fullName: ${existingUser.fullName} -> ${displayName}`);
          existingUser.fullName = displayName;
        }

        if (existingUser.email.toLowerCase() !== email) {
          changes.push(`email: ${existingUser.email} -> ${email}`);
          existingUser.email = email;
        }

        if (existingUser.title !== userPositionTitle) {
          changes.push(`title: ${existingUser.title} -> ${userPositionTitle}`);
          existingUser.title = userPositionTitle;
        }

        if (existingUser.departmentId !== userDeptId) {
          changes.push(`departmentId: ${existingUser.departmentId} -> ${userDeptId}`);
          existingUser.departmentId = userDeptId;
          existingUser.divisionId = userDivId;
        }

        if (existingUser.sectionId !== userSectionId) {
          changes.push(`sectionId: ${existingUser.sectionId || '(none)'} -> ${userSectionId || '(none)'}`);
          existingUser.sectionId = userSectionId;
          existingUser.sectionName = userSectionName;
        }

        if (existingUser.unitId !== userUnitId) {
          changes.push(`unitId: ${existingUser.unitId || '(none)'} -> ${userUnitId || '(none)'}`);
          existingUser.unitId = userUnitId;
          existingUser.unitName = userUnitName;
        }

        // Platform entitlement is deliberately retained from the server-side
        // directory projection. A normal profile refresh must never silently
        // downgrade an explicitly authorized platform administrator.
        const preservedRoles: BankRole[] = isSuperAdminAccount ? superAdminRoles : [];
        if (existingUser.roles?.includes('PLATFORM_ADMIN')) preservedRoles.push('PLATFORM_ADMIN');
        if (existingUser.roles?.includes('CISO')) preservedRoles.push('CISO');
        if (existingUser.roles?.includes('INFOSEC_ADMIN')) preservedRoles.push('INFOSEC_ADMIN');
        existingUser.roles = Array.from(new Set([...userRoles, ...preservedRoles]));

        existingUser.teamIds = userTeams;
        existingUser.securityClearance = (isSuperAdminAccount || preservedRoles.length > 0)
          ? 'HIGHLY_RESTRICTED_HR_LEGAL'
          : userClearance;

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

        // Synchronize distribution groups
        existingUser.distributionGroups = groups;
        existingUser.directoryObjectGuid = objectGuid || existingUser.directoryObjectGuid;
        existingUser.baselineEmployeeId = baseline?.employeeId || employeeId || existingUser.baselineEmployeeId;
        existingUser.ldapDomain = config.LDAP_DOMAIN;
        existingUser.ldapBindStatus = 'BOUND';
        existingUser.directorySource = 'ACTIVE_DIRECTORY';
        existingUser.directoryAccountType = 'HUMAN';
        existingUser.organizationEligible = true;

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

    // Resolve the AD `manager` DN / SAMAccount / Name only after every human user has been upserted.
    // Clear first so a manager removal or unresolved manager reference cannot
    // leave a stale reporting line in the next projection.
    for (const entry of validLdapEntries) {
      const rawUsername = toSafeString(entry.sAMAccountName || entry.userPrincipalName);
      const username = normalizeDirectoryKey(
        rawUsername.includes('\\') ? rawUsername.split('\\')[1] : rawUsername.includes('@') ? rawUsername.split('@')[0] : rawUsername
      );
      const employee = db.data.users.find(
        (user) =>
          (normalizeDirectoryObjectGuid(entry.objectGUID) &&
            normalizeDirectoryObjectGuid((user as any).directoryObjectGuid) === normalizeDirectoryObjectGuid(entry.objectGUID)) ||
          normalizeDirectoryKey(user.username) === username ||
          normalizeDirectoryKey(user.sAMAccountName) === username
      );
      if (employee) employee.managerId = undefined;
    }

    const userByDn = new Map(
      db.data.users
        .filter((user) => user.distinguishedName)
        .map((user) => [normalizeDirectoryKey(user.distinguishedName), user] as const)
    );
    const userByUsername = new Map(
      db.data.users.map((user) => [normalizeDirectoryKey(user.username), user] as const)
    );
    const userByName = new Map(
      db.data.users.map((user) => [normalizeDirectoryKey(user.fullName), user] as const)
    );

    for (const entry of validLdapEntries) {
      const rawUsername = toSafeString(entry.sAMAccountName || entry.userPrincipalName);
      const username = normalizeDirectoryKey(rawUsername.includes('\\') ? rawUsername.split('\\')[1] : rawUsername.includes('@') ? rawUsername.split('@')[0] : rawUsername);
      const employee = userByUsername.get(username) || db.data.users.find((user) => normalizeDirectoryKey(user.username) === username || normalizeDirectoryKey(user.sAMAccountName) === username);
      if (!employee) continue;
      const managerRef = normalizeDirectoryKey(
        entry.manager ||
        (entry as any).managerDistinguishedName ||
        (entry as any).managerSamAccount ||
        (entry as any).managerName
      );
      if (!managerRef) continue;
      const manager = userByDn.get(managerRef) || userByUsername.get(managerRef) || userByName.get(managerRef);
      if (manager && this.isOrganizationEligible(manager) && manager.id !== employee.id) {
        employee.managerId = manager.id;
      }
    }

    // Derive department and section leadership from AD manager relations and titles.
    for (const dept of db.data.departments || []) {
      const deptMembers = db.data.users.filter((u) => u.departmentId === dept.id && u.isActive && this.isOrganizationEligible(u));
      if (deptMembers.length === 0 && dept.directorySource === 'ACTIVE_DIRECTORY') {
        dept.isActive = false;
        dept.managerId = undefined;
        dept.managerName = undefined;
        dept.managerEmail = undefined;
        continue;
      }
      dept.isActive = true;
      const directManager = deptMembers.find((candidate) => deptMembers.some((member) => member.managerId === candidate.id));

      const getLeaderPriority = (u: BankUser): number => {
        const title = normalizeAzerbaijani(u.title || '');
        const isDeputy = title.includes('muavin') || title.includes('müavin') || title.includes('deputy') || title.includes('assistant');
        if (u.roles.includes('CISO') || title.includes('ciso')) return 100;
        if (!isDeputy && (title.includes('departament direktoru') || title.includes('direktor') || title.includes('director'))) return 95;
        if (!isDeputy && (title.includes('departament mudiri') || title.includes('departament müdiri') || title.includes('departament reisi') || title.includes('departament rəisi'))) return 90;
        if (!isDeputy && (title.includes('sedr') || title.includes('sədr'))) return 85;
        if (isDeputy && (title.includes('direktor') || title.includes('director') || title.includes('departament'))) return 75;
        if (u.roles.includes('DEPARTMENT_MANAGER') && !isDeputy) return 65;
        if (!isDeputy && (title.includes('sobe mudiri') || title.includes('şöbə müdiri') || title.includes('mudir') || title.includes('müdir'))) return 50;
        if (!isDeputy && (title.includes('reis') || title.includes('rəis') || title.includes('head') || title.includes('rehber'))) return 40;
        if (isDeputy) return 35;
        return 10;
      };

      const sortedDeptLeaders = [...deptMembers].sort((a, b) => getLeaderPriority(b) - getLeaderPriority(a));
      const headUser = sortedDeptLeaders.find((u) => getLeaderPriority(u) >= 30);
      const resolvedDepartmentManager = headUser || directManager;
      if (dept.directorySource === 'ACTIVE_DIRECTORY') {
        dept.managerId = resolvedDepartmentManager?.id;
        dept.managerName = resolvedDepartmentManager?.fullName;
        dept.managerEmail = resolvedDepartmentManager?.email;
      }
      if (resolvedDepartmentManager) {
        dept.adminUserIds = Array.from(new Set([...(dept.adminUserIds || []), resolvedDepartmentManager.id]));
      }
    }

    for (const section of db.data.departmentSections || []) {
      if (section.directorySource === 'ACTIVE_DIRECTORY' && !syncedSectionIds.has(section.id)) {
        section.isActive = false;
        section.updatedAt = new Date().toISOString();
      }

      // Rule: Bölmə has NO separate manager. Its approval routes to parent Şöbə manager.
      if (section.sectionType === 'BOLME' || section.hasOwnManager === false) {
        section.managerId = undefined;
        section.managerName = undefined;
        section.managerEmail = undefined;
        const unitMembers = db.data.users.filter((user) => user.unitId === section.id && user.isActive && this.isOrganizationEligible(user));
        section.memberCount = unitMembers.length;
        continue;
      }

      // Şöbə (Section) Leadership Resolution
      const sectionMembers = db.data.users.filter((user) => user.sectionId === section.id && user.isActive && this.isOrganizationEligible(user));
      const directManager = sectionMembers.find((candidate) => sectionMembers.some((member) => member.managerId === candidate.id));
      const titleManager = sectionMembers.find((candidate) =>
        /şöbə müdiri|sobe mudiri|şöbə rəisi|sobe reisi|head of section|section head/i.test(candidate.title || '') ||
        (/müdir|mudir|direktor|director|rəis|reis|sədr|head|manager/i.test(candidate.title || '') && !/departament/i.test(candidate.title || ''))
      );
      const resolvedSectionManager = titleManager || directManager;
      section.managerId = resolvedSectionManager?.id;
      section.managerName = resolvedSectionManager?.fullName;
      section.managerEmail = resolvedSectionManager?.email;
      section.memberCount = sectionMembers.length;
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
        const key = normalizeDirectoryKey(u.username || u.sAMAccountName);
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
    const dedupPost = this.deduplicateUsers({ persist: false });
    report.duplicatesRemovedCount += dedupPost.removedCount;
    report.duplicateUsernames.push(...dedupPost.duplicateUsernames);

    // 6. Keep only departments confirmed by the current live directory result
    // active for assignment. Historical records remain retained for audit/ticket
    // foreign keys, but are no longer selectable as live queues.
    for (const dept of db.data.departments || []) {
      if (dept.directorySource === 'ACTIVE_DIRECTORY' && !syncedDepartmentIds.has(dept.id)) {
        dept.isActive = false;
      }
    }

    // 7. Repair orphaned historical identities before recalculating counts.
    // A user without a department cannot be safely queued, assigned, or
    // authorized by department scope. Keep the account for audit, but place it
    // in the live general-banking fallback until the next AD projection maps it.
    const fallbackDepartmentId = db.data.departments.find((dept) => dept.id === 'dept-general-banking')?.id || db.data.departments[0]?.id;
    if (fallbackDepartmentId) {
      for (const user of db.data.users) {
        if (!user.departmentId) user.departmentId = fallbackDepartmentId;
      }
    }

    // 8. Update Department member counts in db.data.departments
    for (const dept of db.data.departments || []) {
      const activeCount = db.data.users.filter((u) => u.departmentId === dept.id && u.isActive && this.isOrganizationEligible(u)).length;
      dept.memberCount = activeCount;
    }

    // 9. Commit the complete directory projection atomically.
    }, { persist: options.dryRun !== true });

    // The compatibility transaction queues PostgreSQL persistence because the
    // HTTP runtime flushes that queue at its request boundary. This standalone
    // sync command exits immediately after returning the report, so explicitly
    // await the queued projection write before allowing the process to exit.
    if (options.dryRun) {
      db.data = preSyncData!;
    } else {
      await db.persistAsync();
    }

    report.executionDurationMs = Date.now() - startTime;
    if (!client) await this.persistSyncRun(report);

    // 10. Log Audit Event
    if (!options.dryRun) AuditService.log({
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
      'Active Directory snapshot processing finished; durable commit still required in PostgreSQL mode'
    );

    return report;
  }

  /**
   * Resolves the 3-tier Approval and Escalation Hierarchy for any employee:
   * Level 1: Direct Manager (AD manager)
   * Level 2: Section Head (Şöbə Müdiri) - If employee is in a Bölmə, routes to parent Şöbə Müdiri.
   * Level 3: Department Head (Departament Müdiri / CISO)
   */
  public static getApprovalChain(userId: string): UserApprovalHierarchy | null {
    const normKey = normalizeDirectoryKey(userId);
    const user = (db.data.users || []).find(
      (u) => u.id === userId || normalizeDirectoryKey(u.username) === normKey || normalizeDirectoryKey(u.sAMAccountName) === normKey
    );
    if (!user) return null;

    const department = (db.data.departments || []).find((d) => d.id === user.departmentId);
    
    // Find Section (Şöbə) and Unit (Bölmə)
    const section = user.sectionId ? (db.data.departmentSections || []).find((s) => s.id === user.sectionId) : undefined;
    const unit = user.unitId ? (db.data.departmentSections || []).find((u) => u.id === user.unitId) : undefined;

    // Resolve Manager objects
    const directManager = user.managerId ? (db.data.users || []).find((u) => u.id === user.managerId) : undefined;
    
    // For Section Manager: if user is in a Bölmə, it routes to parent Section's manager!
    let sectionManagerUser: BankUser | undefined;
    if (section?.managerId) {
      sectionManagerUser = (db.data.users || []).find((u) => u.id === section.managerId);
    } else if (unit?.parentSectionId) {
      const parentSec = (db.data.departmentSections || []).find((s) => s.id === unit.parentSectionId);
      if (parentSec?.managerId) {
        sectionManagerUser = (db.data.users || []).find((u) => u.id === parentSec.managerId);
      }
    }

    const deptManagerUser = department?.managerId ? (db.data.users || []).find((u) => u.id === department.managerId) : undefined;

    const chain: ApprovalChainNode[] = [];
    const seenUserIds = new Set<string>([user.id]);

    // Level 1: Direct Manager (if exists, active, and not self)
    if (directManager && !seenUserIds.has(directManager.id) && directManager.isActive) {
      seenUserIds.add(directManager.id);
      chain.push({
        level: 'DIRECT_MANAGER',
        userId: directManager.id,
        userName: directManager.username,
        fullName: directManager.fullName,
        title: directManager.title,
        email: directManager.email,
        entityType: 'DIRECT_REPORT',
        entityName: directManager.fullName,
      });
    }

    // Level 2: Section Head (Şöbə Müdiri) (if exists, active, and not self)
    if (sectionManagerUser && !seenUserIds.has(sectionManagerUser.id) && sectionManagerUser.isActive) {
      seenUserIds.add(sectionManagerUser.id);
      chain.push({
        level: 'SECTION_MANAGER',
        userId: sectionManagerUser.id,
        userName: sectionManagerUser.username,
        fullName: sectionManagerUser.fullName,
        title: sectionManagerUser.title,
        email: sectionManagerUser.email,
        entityType: 'SECTION',
        entityName: section?.name || 'Şöbə Rəhbərliyi',
      });
    }

    // Level 3: Department Head / CISO (if exists, active, and not self)
    if (deptManagerUser && !seenUserIds.has(deptManagerUser.id) && deptManagerUser.isActive) {
      seenUserIds.add(deptManagerUser.id);
      chain.push({
        level: deptManagerUser.roles.includes('CISO') ? 'CISO' : 'DEPARTMENT_MANAGER',
        userId: deptManagerUser.id,
        userName: deptManagerUser.username,
        fullName: deptManagerUser.fullName,
        title: deptManagerUser.title,
        email: deptManagerUser.email,
        entityType: 'DEPARTMENT',
        entityName: department?.name || 'Departament Rəhbərliyi',
      });
    }

    return {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      title: user.title,
      departmentId: user.departmentId,
      departmentName: department?.name || 'Ümumi Bank Xidmətləri',
      departmentManager: deptManagerUser
        ? { id: deptManagerUser.id, name: deptManagerUser.fullName, email: deptManagerUser.email, title: deptManagerUser.title }
        : undefined,
      sectionId: section?.id,
      sectionName: section?.name,
      sectionManager: sectionManagerUser
        ? { id: sectionManagerUser.id, name: sectionManagerUser.fullName, email: sectionManagerUser.email, title: sectionManagerUser.title }
        : undefined,
      unitId: unit?.id,
      unitName: unit?.name,
      directManager: directManager
        ? { id: directManager.id, name: directManager.fullName, email: directManager.email, title: directManager.title }
        : undefined,
      approvalChain: chain,
    };
  }
}
