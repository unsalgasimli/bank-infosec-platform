import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { BankDepartment, BankDepartmentSection, BankRole, BankUser } from '../../../shared/types/auth.js';
import type { DepartmentConnection } from '../../../shared/types/connections.js';
import { pgClient } from './client.js';
import { isGenuineEmployeeOrIntern } from '../../services/ldap-directory.data.js';

type JsonRecord = Record<string, any>;

export class DepartmentRepositoryError extends Error {
  public constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'DepartmentRepositoryError';
  }
}

const roleValues: BankRole[] = [
  'PLATFORM_ADMIN', 'DEPARTMENT_ADMIN', 'INFOSEC_ADMIN', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN',
  'LEGAL_ADMIN', 'CISO', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST',
  'GRC_ANALYST', 'APPSEC_ANALYST', 'DLP_ANALYST', 'VULN_ANALYST', 'AUDITOR', 'DEPARTMENT_MANAGER',
  'ASSIGNEE', 'REQUESTER', 'APPROVER', 'RISK_OWNER', 'APPLICATION_OWNER', 'ASSET_OWNER',
  'READ_ONLY_USER', 'EXTERNAL_VENDOR',
];

const departmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  divisionId: z.string().trim().min(1).max(128),
  description: z.string().trim().max(2000).optional().default(''),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).optional().default('#0052CC'),
  icon: z.string().trim().max(64).optional().default('Building2'),
  defaultSlaHours: z.coerce.number().min(1).max(720).optional().default(24),
  criticalSlaHours: z.coerce.number().min(0.25).max(168).optional().default(2),
  autoAssignEnabled: z.boolean().optional().default(true),
  requireDualApproval: z.boolean().optional().default(false),
});

const departmentPatchSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).optional(),
  icon: z.string().trim().max(64).optional(),
  managerId: z.string().trim().min(1).max(64).nullable().optional(),
  adminUserIds: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  isActive: z.boolean().optional(),
});

const settingsPatchSchema = z.object({
  defaultSlaHours: z.coerce.number().min(1).max(720).optional(),
  criticalSlaHours: z.coerce.number().min(0.25).max(168).optional(),
  autoAssignEnabled: z.boolean().optional(),
  defaultAssigneeId: z.string().trim().min(1).max(64).nullable().optional(),
  requireDualApproval: z.boolean().optional(),
  allowedTicketCategories: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  workingHours: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().trim().min(1).max(64),
  }).optional(),
  notifications: z.object({
    emailAlerts: z.boolean(),
    slackWebhook: z.string().trim().max(512).optional(),
    escalateAfterHours: z.coerce.number().min(0).max(720),
  }).optional(),
}).strict();

const memberSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  roles: z.array(z.enum(roleValues as [BankRole, ...BankRole[]])).max(8).default([]),
  isDeptAdminFlag: z.boolean().optional().default(false),
});

const connectionSchema = z.object({
  name: z.string().trim().min(2).max(255),
  type: z.enum(['SIEM', 'EDR', 'ACTIVE_DIRECTORY', 'CLOUD_INFRA', 'VULN_SCANNER', 'HRIS', 'CORE_BANKING', 'PAYMENT_GATEWAY', 'TICKETING', 'COMMUNICATION', 'DATABASE']),
  provider: z.string().trim().min(2).max(255),
  endpointUrl: z.string().trim().url().max(1024),
  authType: z.enum(['API_KEY', 'OAUTH2', 'MTLS_CERTIFICATE', 'LDAP_BIND', 'BEARER_TOKEN']),
  syncFrequencyMinutes: z.coerce.number().int().min(0).max(10080).default(15),
  description: z.string().trim().max(2000).optional().default(''),
  configSummary: z.record(z.string().max(255)).optional().default({}),
});

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value && typeof value === 'object') return value as T;
  return fallback;
};

const rowToUser = (row: JsonRecord): BankUser => {
  const payload = parseJson<JsonRecord>(row.source_payload, {});
  return {
    ...payload,
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name || payload.fullName || `${row.first_name} ${row.last_name}`.trim(),
    title: row.title,
    divisionId: row.division_id || payload.divisionId || '',
    departmentId: row.department_id || payload.departmentId || '',
    sectionId: row.section_id || payload.sectionId || undefined,
    teamIds: parseJson<string[]>(row.team_ids, payload.teamIds || []),
    roles: parseJson<BankRole[]>(row.roles, payload.roles || []),
    securityClearance: row.security_clearance || payload.securityClearance || 'INTERNAL',
    ownedApplicationIds: parseJson<string[]>(row.owned_application_ids, payload.ownedApplicationIds || []),
    ownedAssetIds: parseJson<string[]>(row.owned_asset_ids, payload.ownedAssetIds || []),
    ownedRiskIds: parseJson<string[]>(row.owned_risk_ids, payload.ownedRiskIds || []),
    isActive: Boolean(row.is_active),
    managerId: payload.managerId || undefined,
    sAMAccountName: row.sam_account_name || payload.sAMAccountName || undefined,
    userPrincipalName: row.user_principal_name || payload.userPrincipalName || undefined,
    distinguishedName: row.distinguished_name || payload.distinguishedName || undefined,
    ldapDomain: row.ldap_domain || payload.ldapDomain || undefined,
    ldapBindStatus: row.ldap_bind_status || payload.ldapBindStatus || undefined,
    distributionGroups: parseJson<string[]>(row.distribution_groups, payload.distributionGroups || []),
    lastLdapLoginAt: payload.lastLdapLoginAt || undefined,
    directorySource: row.directory_source || payload.directorySource || undefined,
  };
};

const directoryUserColumns = `
  id, username, email, first_name, last_name, full_name, title,
  department_id, section_id, division_id, security_clearance, is_active,
  roles, team_ids, owned_application_ids, owned_asset_ids, owned_risk_ids,
  sam_account_name, user_principal_name, distinguished_name,
  ldap_domain, ldap_bind_status, distribution_groups, directory_source,
  source_payload
`;

const rowToDepartment = (row: JsonRecord): BankDepartment & JsonRecord => {
  const payload = parseJson<JsonRecord>(row.source_payload, {});
  // Some older imports had to generate unique storage keys for colliding AD
  // department codes (for example `__P_<hash>`). Those keys are not an AD
  // attribute and must never be presented as the department code in the UI.
  // Keep the stable database id for routing, but prefer the directory payload
  // code for display whenever it is a valid organizational code.
  const payloadCode = typeof payload.code === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(payload.code.trim())
    ? payload.code.trim().toUpperCase()
    : undefined;
  return {
    ...payload,
    id: row.id,
    divisionId: row.division_id,
    name: row.name,
    code: payloadCode || row.code,
    description: row.description ?? payload.description ?? '',
    managerId: row.manager_id || payload.managerId || undefined,
    adminUserIds: parseJson<string[]>(row.admin_user_ids, payload.adminUserIds || []),
    color: row.color || payload.color || undefined,
    icon: row.icon || payload.icon || 'Building2',
    isActive: Boolean(row.is_active),
    settings: parseJson(row.settings, payload.settings || {}),
    directorySource: row.directory_source || payload.directorySource,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    memberCount: Number(row.member_count || 0),
    connectionCount: Number(row.connection_count || 0),
    templateCount: Number(row.template_count || 0),
    activeTaskCount: Number(row.active_task_count || 0),
    managerName: row.manager_name || undefined,
    managerEmail: row.manager_email || undefined,
    sections: parseJson<BankDepartmentSection[]>(row.sections, []),
    sectionCount: parseJson<BankDepartmentSection[]>(row.sections, []).length,
  };
};

const rowToConnection = (row: JsonRecord): DepartmentConnection => {
  const payload = parseJson<JsonRecord>(row.source_payload, {});
  return {
    ...payload,
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    type: row.type,
    provider: row.provider,
    endpointUrl: row.endpoint_url,
    authType: row.auth_type,
    status: row.status,
    lastSyncAt: row.last_sync_at?.toISOString?.() || row.last_sync_at || '',
    latencyMs: row.latency_ms == null ? undefined : Number(row.latency_ms),
    healthScore: row.health_score == null ? undefined : Number(row.health_score),
    syncFrequencyMinutes: Number(row.sync_frequency_minutes || 0),
    description: row.description || '',
    configSummary: parseJson(row.config_summary, {}),
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
};

const isGlobalAdmin = (user: BankUser): boolean => user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');

export class DepartmentsRepository {
  private static readonly departmentSelect = `
    SELECT d.id, d.division_id, d.code, d.name,
           COALESCE(NULLIF(d.description, ''), d.source_payload->>'description', '') AS description,
           COALESCE(d.manager_id, d.source_payload->>'managerId') AS manager_id,
           CASE WHEN jsonb_array_length(d.admin_user_ids) > 0 THEN d.admin_user_ids ELSE COALESCE(d.source_payload->'adminUserIds', '[]'::jsonb) END AS admin_user_ids,
           COALESCE(NULLIF(d.color, ''), d.source_payload->>'color') AS color,
           COALESCE(NULLIF(d.icon, ''), d.source_payload->>'icon', 'Building2') AS icon,
           d.is_active,
           CASE WHEN d.settings = '{}'::jsonb THEN COALESCE(d.source_payload->'settings', '{}'::jsonb) ELSE d.settings END AS settings,
           COALESCE(NULLIF(d.directory_source, ''), d.source_payload->>'directorySource') AS directory_source,
           d.created_at, d.updated_at, d.source_payload,
           v.name AS division_name, v.code AS division_code,
           manager.full_name AS manager_name, manager.email AS manager_email,
           (SELECT COUNT(*) FROM bank_users u WHERE u.department_id = d.id AND u.is_active = TRUE AND u.directory_source = 'ACTIVE_DIRECTORY') AS member_count,
           (SELECT COUNT(*) FROM department_connections c WHERE c.department_id = d.id AND c.deleted_at IS NULL) AS connection_count,
           (SELECT COUNT(*) FROM tickets t WHERE (t.department_id = d.id OR t.source_payload->>'targetDepartmentId' = d.id) AND t.status_category <> 'DONE') AS active_task_count
           ,COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'departmentId', s.department_id, 'name', s.name, 'code', s.code, 'managerId', s.manager_id, 'managerName', (SELECT manager.full_name FROM bank_users manager WHERE manager.id = s.manager_id), 'memberCount', (SELECT COUNT(*) FROM bank_users section_member WHERE section_member.section_id = s.id AND section_member.is_active = TRUE), 'isActive', s.is_active, 'directorySource', COALESCE(s.source_payload->>'directorySource', 'ACTIVE_DIRECTORY')) ORDER BY s.name) FROM bank_department_sections s WHERE s.department_id = d.id AND s.is_active = TRUE), '[]'::jsonb) AS sections
      FROM bank_departments d
      JOIN bank_divisions v ON v.id = d.division_id
      LEFT JOIN bank_users manager ON manager.id = COALESCE(d.manager_id, d.source_payload->>'managerId')
        AND manager.is_active = TRUE AND manager.directory_source = 'ACTIVE_DIRECTORY'`;

  private static async requireDepartment(client: PoolClient, idOrCode: string): Promise<JsonRecord> {
    const result = await client.query(`${this.departmentSelect} WHERE d.id = $1 OR LOWER(d.code) = LOWER($1) LIMIT 1`, [idOrCode]);
    if (!result.rows[0]) throw new DepartmentRepositoryError(404, 'Department not found');
    return result.rows[0];
  }

  private static async requireScope(client: PoolClient, idOrCode: string, user: BankUser, write = false): Promise<JsonRecord> {
    const row = await this.requireDepartment(client, idOrCode);
    if (!write || isGlobalAdmin(user)) return row;
    const admins = parseJson<string[]>(row.admin_user_ids, []);
    if (row.manager_id !== user.id && !admins.includes(user.id) && !(user.departmentId === row.id && user.roles.includes('DEPARTMENT_ADMIN'))) {
      throw new DepartmentRepositoryError(403, 'You are not authorized to manage this department.');
    }
    return row;
  }

  private static async assertUsers(client: PoolClient, ids: string[]): Promise<void> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;
    const result = await client.query(`SELECT id FROM bank_users WHERE id = ANY($1::text[]) AND is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'`, [unique]);
    if (result.rowCount !== unique.length) throw new DepartmentRepositoryError(400, 'Only active Active Directory users can receive department management rights.');
  }

  private static async audit(client: PoolClient, user: BankUser, action: 'ADMIN_CONFIG_CHANGED' | 'USER_UPDATE', entityType: 'DEPARTMENT' | 'USER', entityId: string, beforeState: unknown, afterState: unknown, metadata: JsonRecord = {}): Promise<void> {
    const id = `aud-${uuidv4()}`;
    const event = {
      id, timestamp: new Date().toISOString(), actorId: user.id, actorName: user.fullName,
      actorRole: user.roles[0] || 'REQUESTER', ipAddress: 'server-captured', userAgent: 'bank-infosec-platform',
      correlationId: `dept-${uuidv4()}`, action, entityType, entityId, metadata,
    };
    await client.query(
      `INSERT INTO audit_events(id,event_type,action,actor_id,actor_name,actor_role,ip_address,user_agent,entity_type,entity_id,before_state,after_state,timestamp,source_payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb)`,
      [id, action, action, user.id, user.fullName, user.roles[0] || null, null, null, entityType, entityId, JSON.stringify(beforeState ?? null), JSON.stringify(afterState ?? null), event.timestamp, JSON.stringify({ ...event, metadata })]
    );
  }

  public static async list(): Promise<Array<BankDepartment & JsonRecord>> {
    const [result, usersResult] = await Promise.all([
      pgClient.query(`${this.departmentSelect} WHERE d.is_active = TRUE ORDER BY v.name, d.name`),
      pgClient.query(`SELECT ${directoryUserColumns} FROM bank_users WHERE is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'`),
    ]);
    const users = usersResult.rows
      .map(rowToUser)
      .filter((user) => isGenuineEmployeeOrIntern(user, user.distributionGroups || [], user.sAMAccountName || user.username));
    const usersByDepartment = new Map<string, BankUser[]>();
    const usersById = new Map(users.map((user) => [user.id, user]));
    for (const user of users) {
      if (!user.departmentId) continue;
      const departmentUsers = usersByDepartment.get(user.departmentId) || [];
      departmentUsers.push(user);
      usersByDepartment.set(user.departmentId, departmentUsers);
    }

    return result.rows.map((row) => {
      const department = rowToDepartment(row);
      const manager = department.managerId ? usersById.get(department.managerId) : undefined;
      return {
        ...department,
        memberCount: usersByDepartment.get(department.id)?.length || 0,
        managerName: manager?.fullName,
        managerEmail: manager?.email,
      };
    });
  }

  public static async get(idOrCode: string, user: BankUser): Promise<{ department: BankDepartment & JsonRecord; members: BankUser[]; leadership: BankUser[]; connections: DepartmentConnection[] }> {
    const result = await pgClient.transaction(async (client) => {
      const departmentRow = await this.requireDepartment(client, idOrCode);
      const department = rowToDepartment(departmentRow);
      const members = await client.query(
        `SELECT ${directoryUserColumns}
           FROM bank_users WHERE department_id = $1 AND is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY' ORDER BY full_name, username`, [department.id]
      );
      const leadershipIds = [...new Set([department.managerId || '', ...(department.adminUserIds || [])].filter(Boolean))];
      const leadership = leadershipIds.length
        ? await client.query(`SELECT ${directoryUserColumns} FROM bank_users WHERE id = ANY($1::text[]) AND is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'`, [leadershipIds])
        : { rows: [] as JsonRecord[] };
      const connections = await client.query(
        `SELECT id,department_id,name,type,provider,endpoint_url,auth_type,status,last_sync_at,latency_ms,health_score,sync_frequency_minutes,description,config_summary,source_payload,created_at,updated_at
           FROM department_connections WHERE department_id = $1 AND deleted_at IS NULL ORDER BY name`, [department.id]
      );
      return {
        department,
        members: members.rows
          .map(rowToUser)
          .filter((member) => isGenuineEmployeeOrIntern(member, member.distributionGroups || [], member.sAMAccountName || member.username)),
        leadership: leadership.rows
          .map(rowToUser)
          .filter((member) => isGenuineEmployeeOrIntern(member, member.distributionGroups || [], member.sAMAccountName || member.username)),
        connections: connections.rows.map(rowToConnection),
      };
    });
    return result;
  }

  /** Directory-only projection used by member assignment. No JSON fallback is allowed here. */
  public static async listActiveDirectoryUsers(): Promise<BankUser[]> {
    const result = await pgClient.query(`SELECT ${directoryUserColumns} FROM bank_users WHERE is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY' ORDER BY full_name, username`);
    return result.rows
      .map(rowToUser)
      .filter((user) => isGenuineEmployeeOrIntern(user, user.distributionGroups || [], user.sAMAccountName || user.username));
  }

  /**
   * Read the assignment catalogue directly from PostgreSQL. This is kept
   * separate from the compatibility projection so a successful AD sync is
   * visible to new picker sessions without restarting the API process.
   */
  public static async listAssignmentOptions(input: { departmentId?: string; sectionId?: string; query?: string; offset?: number; limit?: number }): Promise<{
    directory: { source: 'ACTIVE_DIRECTORY'; ready: boolean; message?: string };
    departments: Array<BankDepartment & JsonRecord>;
    sections: BankDepartmentSection[];
    users: BankUser[];
    total: number;
    nextOffset: number | null;
  }> {
    const departmentResult = await pgClient.query(
      `${this.departmentSelect} WHERE d.is_active = TRUE AND COALESCE(NULLIF(d.directory_source, ''), d.source_payload->>'directorySource') = 'ACTIVE_DIRECTORY' ORDER BY v.name, d.name`
    );
    const departments = departmentResult.rows.map(rowToDepartment);
    const departmentIds = new Set(departments.map((department) => department.id));
    const sectionResult = await pgClient.query(
      `SELECT id, department_id, code, name, manager_id, is_active, source_payload
       FROM bank_department_sections
       WHERE is_active = TRUE AND department_id = ANY($1::text[])
         AND COALESCE(source_payload->>'directorySource', 'ACTIVE_DIRECTORY') = 'ACTIVE_DIRECTORY'
       ORDER BY name`,
      [[...departmentIds]]
    );
    const sections: BankDepartmentSection[] = sectionResult.rows.map((row) => ({
      id: row.id,
      departmentId: row.department_id,
      code: row.code,
      name: row.name,
      managerId: row.manager_id || undefined,
      isActive: Boolean(row.is_active),
      directorySource: 'ACTIVE_DIRECTORY',
    }));
    const sectionNames = new Map(sections.map((section) => [section.id, section.name]));
    const userResult = await pgClient.query(
      `SELECT ${directoryUserColumns}
       FROM bank_users
       WHERE is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'
         AND department_id = ANY($1::text[])
       ORDER BY full_name, username`,
      [[...departmentIds]]
    );
    const departmentId = input.departmentId?.trim() || undefined;
    const sectionId = input.sectionId?.trim() || undefined;
    const query = input.query?.trim().toLocaleLowerCase('az') || '';
    const users = userResult.rows
      .map(rowToUser)
      .filter((user) => isGenuineEmployeeOrIntern(user, user.distributionGroups || [], user.sAMAccountName || user.username))
      .filter((user) => !departmentId || user.departmentId === departmentId)
      .filter((user) => !sectionId || user.sectionId === sectionId)
      .filter((user) => !query || [user.fullName, user.title, user.username, user.email, sectionNames.get(user.sectionId || '')]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('az').includes(query)));
    const offset = Math.max(0, Math.floor(input.offset || 0));
    const limit = Math.min(100, Math.max(10, Math.floor(input.limit || 100)));
    const page = users.slice(offset, offset + limit).map((user) => ({
      ...user,
      sectionName: sectionNames.get(user.sectionId || ''),
    }));
    const ready = departments.length > 0 && users.length > 0;
    return {
      directory: {
        source: 'ACTIVE_DIRECTORY',
        ready,
        message: ready ? undefined : 'No live Active Directory directory data is available. Complete a successful LDAPS synchronization before assigning a user or department queue.',
      },
      departments,
      sections,
      users: page,
      total: users.length,
      nextOffset: offset + page.length < users.length ? offset + page.length : null,
    };
  }

  public static async create(input: unknown, user: BankUser): Promise<BankDepartment & JsonRecord> {
    if (!isGlobalAdmin(user)) throw new DepartmentRepositoryError(403, 'Only Platform Admins or CISO can create a department.');
    const parsed = departmentCreateSchema.safeParse(input);
    if (!parsed.success) throw new DepartmentRepositoryError(400, 'Invalid department data. Check name, code, division and SLA values.');
    const value = parsed.data;
    const id = `dept-${uuidv4()}`;
    const settings = { defaultSlaHours: value.defaultSlaHours, criticalSlaHours: value.criticalSlaHours, autoAssignEnabled: value.autoAssignEnabled, requireDualApproval: value.requireDualApproval, allowedTicketCategories: ['GENERAL_REQUEST', 'SECURITY_REVIEW'], workingHours: { start: '09:00', end: '18:00', timezone: 'Asia/Baku' }, notifications: { emailAlerts: true, escalateAfterHours: 4 } };
    const payload = { id, divisionId: value.divisionId, name: value.name, code: value.code.toUpperCase(), description: value.description, managerId: user.id, adminUserIds: [user.id], color: value.color, icon: value.icon, isActive: true, settings, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try {
      return await pgClient.transaction(async (client) => {
        const division = await client.query('SELECT id FROM bank_divisions WHERE id = $1', [value.divisionId]);
        if (!division.rows[0]) throw new DepartmentRepositoryError(400, 'Selected division does not exist in the directory projection.');
        await this.assertUsers(client, [user.id]);
        await client.query(
          `INSERT INTO bank_departments(id,division_id,code,name,description,manager_id,admin_user_ids,color,icon,is_active,settings,directory_source,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,NULL,$12::jsonb)`,
          [id, value.divisionId, payload.code, value.name, value.description, user.id, JSON.stringify([user.id]), value.color, value.icon, true, JSON.stringify(settings), JSON.stringify(payload)]
        );
        await this.audit(client, user, 'ADMIN_CONFIG_CHANGED', 'DEPARTMENT', id, null, payload, { action: 'CREATED_DEPARTMENT' });
        return rowToDepartment((await this.requireDepartment(client, id)));
      });
    } catch (error: any) {
      if (error instanceof DepartmentRepositoryError) throw error;
      if (error?.code === '23505') throw new DepartmentRepositoryError(409, 'Department code already exists.');
      throw error;
    }
  }

  public static async update(idOrCode: string, input: unknown, user: BankUser): Promise<BankDepartment & JsonRecord> {
    const parsed = departmentPatchSchema.safeParse(input);
    if (!parsed.success) throw new DepartmentRepositoryError(400, 'Invalid department update.');
    const value = parsed.data;
    try {
      return await pgClient.transaction(async (client) => {
        const existing = await this.requireScope(client, idOrCode, user, true);
        const current = rowToDepartment(existing);
        const managerId = value.managerId === undefined ? current.managerId || null : value.managerId;
        const adminUserIds = value.adminUserIds === undefined ? current.adminUserIds || [] : value.adminUserIds;
        await this.assertUsers(client, [managerId || '', ...adminUserIds]);
        const next = { ...current, ...value, managerId: managerId || undefined, adminUserIds, updatedAt: new Date().toISOString() };
        await client.query(
          `UPDATE bank_departments SET name=$2,description=$3,color=$4,icon=$5,manager_id=$6,admin_user_ids=$7::jsonb,is_active=$8,source_payload=$9::jsonb,updated_at=NOW() WHERE id=$1`,
          [current.id, next.name, next.description || '', next.color || null, next.icon || null, managerId, JSON.stringify(adminUserIds), next.isActive !== false, JSON.stringify(next)]
        );
        await this.audit(client, user, 'ADMIN_CONFIG_CHANGED', 'DEPARTMENT', current.id, current, next, { action: 'UPDATED_DEPARTMENT_METADATA' });
        return rowToDepartment(await this.requireDepartment(client, current.id));
      });
    } catch (error: any) {
      if (error instanceof DepartmentRepositoryError) throw error;
      if (error?.code === '23505') throw new DepartmentRepositoryError(409, 'Department code already exists.');
      throw error;
    }
  }

  public static async updateSettings(idOrCode: string, input: unknown, user: BankUser): Promise<JsonRecord> {
    const parsed = settingsPatchSchema.safeParse(input);
    if (!parsed.success) throw new DepartmentRepositoryError(400, 'Invalid department settings.');
    return pgClient.transaction(async (client) => {
      const existing = await this.requireScope(client, idOrCode, user, true);
      const currentSettings = parseJson<JsonRecord>(existing.settings, {});
      const nextSettings = { ...currentSettings, ...parsed.data };
      if (parsed.data.defaultAssigneeId) await this.assertUsers(client, [parsed.data.defaultAssigneeId]);
      const next = { ...rowToDepartment(existing), settings: nextSettings, updatedAt: new Date().toISOString() };
      await client.query('UPDATE bank_departments SET settings=$2::jsonb,source_payload=$3::jsonb,updated_at=NOW() WHERE id=$1', [existing.id, JSON.stringify(nextSettings), JSON.stringify(next)]);
      await this.audit(client, user, 'ADMIN_CONFIG_CHANGED', 'DEPARTMENT', existing.id, currentSettings, nextSettings, { action: 'UPDATED_DEPARTMENT_SETTINGS' });
      return nextSettings;
    });
  }

  public static async addMember(idOrCode: string, input: unknown, user: BankUser): Promise<BankUser> {
    const parsed = memberSchema.safeParse(input);
    if (!parsed.success) throw new DepartmentRepositoryError(400, 'Select an active Active Directory user and a valid role.');
    return pgClient.transaction(async (client) => {
      const department = await this.requireScope(client, idOrCode, user, true);
      const targetResult = await client.query(
        `SELECT id,username,email,first_name,last_name,full_name,title,department_id,division_id,security_clearance,is_active,roles,team_ids,owned_application_ids,owned_risk_ids,source_payload,directory_source
           FROM bank_users WHERE id=$1 AND is_active=TRUE AND directory_source='ACTIVE_DIRECTORY' FOR UPDATE`, [parsed.data.userId]
      );
      if (!targetResult.rows[0]) throw new DepartmentRepositoryError(400, 'The selected user is not an active Active Directory record.');
      const target = rowToUser(targetResult.rows[0]);
      const global = isGlobalAdmin(user);
      if (target.departmentId && target.departmentId !== department.id && !global) throw new DepartmentRepositoryError(403, 'Only a global administrator can move a user between departments.');
      const roles = [...new Set([...(target.roles || []), ...parsed.data.roles, ...(parsed.data.isDeptAdminFlag ? ['DEPARTMENT_ADMIN' as BankRole] : [])])];
      const adminIds = parseJson<string[]>(department.admin_user_ids, []);
      if (parsed.data.isDeptAdminFlag && !adminIds.includes(target.id)) adminIds.push(target.id);
      const payload = { ...target, departmentId: department.id, divisionId: department.division_id, roles, isActive: true };
      await client.query('UPDATE bank_users SET department_id=$2,division_id=$3,roles=$4::jsonb,source_payload=$5::jsonb,updated_at=NOW() WHERE id=$1', [target.id, department.id, department.division_id, JSON.stringify(roles), JSON.stringify(payload)]);
      await client.query('UPDATE bank_departments SET admin_user_ids=$2::jsonb,source_payload=jsonb_set(COALESCE(source_payload,\'{}\'::jsonb),\'{adminUserIds}\',$2::jsonb),updated_at=NOW() WHERE id=$1', [department.id, JSON.stringify(adminIds)]);
      await this.audit(client, user, 'USER_UPDATE', 'USER', target.id, target, payload, { action: 'ASSIGNED_DEPARTMENT_MEMBER', departmentId: department.id, grantedDepartmentAdmin: parsed.data.isDeptAdminFlag });
      return rowToUser((await client.query('SELECT id,username,email,first_name,last_name,full_name,title,department_id,division_id,security_clearance,is_active,roles,team_ids,owned_application_ids,owned_risk_ids,source_payload FROM bank_users WHERE id=$1', [target.id])).rows[0]);
    });
  }

  public static async listConnections(idOrCode: string): Promise<DepartmentConnection[]> {
    const row = await pgClient.query(`SELECT d.id FROM bank_departments d WHERE d.id=$1 OR LOWER(d.code)=LOWER($1)`, [idOrCode]);
    if (!row.rows[0]) throw new DepartmentRepositoryError(404, 'Department not found');
    const result = await pgClient.query(`SELECT id,department_id,name,type,provider,endpoint_url,auth_type,status,last_sync_at,latency_ms,health_score,sync_frequency_minutes,description,config_summary,source_payload,created_at,updated_at FROM department_connections WHERE department_id=$1 AND deleted_at IS NULL ORDER BY name`, [row.rows[0].id]);
    return result.rows.map(rowToConnection);
  }

  public static async createConnection(idOrCode: string, input: unknown, user: BankUser): Promise<DepartmentConnection> {
    const parsed = connectionSchema.safeParse(input);
    if (!parsed.success) throw new DepartmentRepositoryError(400, 'Invalid connector data. Endpoint must be a valid URL and all required fields must be present.');
    return pgClient.transaction(async (client) => {
      const department = await this.requireScope(client, idOrCode, user, true);
      const id = `conn-${uuidv4()}`;
      const now = new Date().toISOString();
      const payload = { id, departmentId: department.id, ...parsed.data, status: 'DISCONNECTED', lastSyncAt: '', createdAt: now, updatedAt: now };
      await client.query(
        `INSERT INTO department_connections(id,department_id,name,type,provider,endpoint_url,auth_type,status,sync_frequency_minutes,description,config_summary,source_payload,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,'DISCONNECTED',$8,$9,$10::jsonb,$11::jsonb,$12)`,
        [id, department.id, parsed.data.name, parsed.data.type, parsed.data.provider, parsed.data.endpointUrl, parsed.data.authType, parsed.data.syncFrequencyMinutes, parsed.data.description, JSON.stringify(parsed.data.configSummary), JSON.stringify(payload), user.id]
      );
      await this.audit(client, user, 'ADMIN_CONFIG_CHANGED', 'DEPARTMENT', department.id, null, payload, { action: 'CREATED_DEPARTMENT_CONNECTION', connectionId: id });
      return rowToConnection((await client.query('SELECT id,department_id,name,type,provider,endpoint_url,auth_type,status,last_sync_at,latency_ms,health_score,sync_frequency_minutes,description,config_summary,source_payload,created_at,updated_at FROM department_connections WHERE id=$1', [id])).rows[0]);
    });
  }

  public static async deleteConnection(idOrCode: string, connectionId: string, user: BankUser): Promise<void> {
    await pgClient.transaction(async (client) => {
      const department = await this.requireScope(client, idOrCode, user, true);
      const connection = await client.query('SELECT * FROM department_connections WHERE id=$1 AND department_id=$2 AND deleted_at IS NULL FOR UPDATE', [connectionId, department.id]);
      if (!connection.rows[0]) throw new DepartmentRepositoryError(404, 'Connection not found in department.');
      await client.query('UPDATE department_connections SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1', [connectionId]);
      await this.audit(client, user, 'ADMIN_CONFIG_CHANGED', 'DEPARTMENT', department.id, rowToConnection(connection.rows[0]), null, { action: 'DELETED_DEPARTMENT_CONNECTION', connectionId });
    });
  }
}
