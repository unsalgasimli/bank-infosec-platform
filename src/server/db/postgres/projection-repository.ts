import { pgClient } from './client.js';
import { directoryUserColumns, rowToUser } from './departments-repository.js';
import type { DatabaseSchema } from '../database.js';
import { normalizeDirectoryKey, normalizeDirectoryText } from '../../services/ldap-directory.data.js';
import crypto from 'node:crypto';
import type { AuditEvent } from '../../../shared/types/audit.js';
import type { BankUser } from '../../../shared/types/auth.js';

type RecordValue = Record<string, any>;

const json = (value: unknown) => JSON.stringify(value ?? null);
const text = (value: unknown) => normalizeDirectoryText(value);
const nullable = (value: unknown) => text(value) || null;
const jsonArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const isUnitTestProcess = () =>
  process.env.NODE_ENV === 'test' ||
  process.argv.some((argument) => argument === '--test' || argument.includes('.test.ts') || argument.includes('test-concurrency'));
const iso = (value: unknown, fallback = new Date().toISOString()) => {
  const valueText = text(value);
  return valueText && !Number.isNaN(Date.parse(valueText)) ? new Date(valueText).toISOString() : fallback;
};

function splitName(value: unknown): { first: string; last: string; full: string } {
  const full = text(value) || 'Unknown User';
  const parts = full.split(' ').filter(Boolean);
  return { full, first: parts[0] || 'Unknown', last: parts.slice(1).join(' ') || parts[0] || 'User' };
}

function recordId(value: RecordValue, index: number): string {
  return text(value.id) || crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

function safeCode(value: unknown, fallback: string, used: Set<string>): string {
  const base = (normalizeDirectoryKey(value) || fallback).replace(/[^a-z0-9_]/g, '_').slice(0, 24).toUpperCase();
  let candidate = base || fallback.toUpperCase();
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 24 - String(suffix).length - 1)}_${suffix}`;
    suffix++;
  }
  used.add(candidate);
  return candidate;
}

export class PostgresProjectionRepository {
  private static persistedHashes = new Map<string, Map<string, string>>();

  private static hash(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
  }

  private static buildHashes(data: DatabaseSchema): Map<string, Map<string, string>> {
    const result = new Map<string, Map<string, string>>();
    for (const [collection, value] of Object.entries(data)) {
      if (!Array.isArray(value)) continue;
      const collectionHashes = new Map<string, string>();
      value.forEach((record, index) => collectionHashes.set(recordId(record as RecordValue, index), this.hash(record)));
      result.set(collection, collectionHashes);
    }
    return result;
  }

  public static async hydrate(): Promise<DatabaseSchema> {
    const base = await import('../seed.js').then(({ initialSeedData }) => JSON.parse(JSON.stringify(initialSeedData)) as DatabaseSchema);
    for (const key of Object.keys(base)) {
      if (Array.isArray((base as any)[key])) (base as any)[key] = [];
    }

    const [divisions, departments, departmentSections, teams, users, assets, applications, cmdbTypes, cmdbRelationshipTypes, configurationItems, ciRelationships, ciRecordLinks, slaPolicies, workflows, tickets, comments, approvals, attachments, auditEvents, relationships, tasks, worklogs, slaInstances, satisfaction, aiRecommendations, connections, legacy] = await Promise.all([
      pgClient.query('SELECT source_payload FROM bank_divisions ORDER BY id'),
      pgClient.query('SELECT source_payload FROM bank_departments ORDER BY id'),
      pgClient.query('SELECT source_payload FROM bank_department_sections ORDER BY department_id, name'),
      pgClient.query('SELECT source_payload FROM bank_teams ORDER BY id'),
      pgClient.query(`SELECT ${directoryUserColumns} FROM bank_users ORDER BY username`),
      pgClient.query('SELECT id, tag, name, type, ip_address, fqdn, environment, critical_asset, pci_dss_scope, owner_id, custodian_id, department_id, os, created_at, updated_at FROM bank_assets ORDER BY id'),
      pgClient.query('SELECT id, code, name, tier, architecture_type, repository_url, technical_owner_id, business_owner_id, department_id, active_cve_count, created_at, updated_at FROM bank_applications ORDER BY id'),
      pgClient.query('SELECT source_payload FROM cmdb_ci_types ORDER BY id'),
      pgClient.query('SELECT source_payload FROM cmdb_relationship_types ORDER BY id'),
      pgClient.query('SELECT source_payload FROM configuration_items ORDER BY created_at DESC'),
      pgClient.query('SELECT source_payload FROM ci_relationships ORDER BY created_at DESC'),
      pgClient.query('SELECT source_payload FROM ci_record_links ORDER BY created_at DESC'),
      pgClient.query('SELECT source_payload FROM sla_policies ORDER BY id'),
      pgClient.query('SELECT source_payload FROM workflows ORDER BY id'),
      pgClient.query('SELECT source_payload FROM tickets ORDER BY created_at DESC'),
      pgClient.query('SELECT id, ticket_id, author_id, content, visibility, is_audit_note, is_resolution_summary, created_at, updated_at, source_payload FROM ticket_comments ORDER BY created_at ASC'),
      pgClient.query('SELECT id, ticket_id, workflow_id, transition_id, status, initiated_by_user_id, initiated_at, completed_at, steps, created_at, updated_at, source_payload FROM ticket_approvals ORDER BY created_at ASC'),
      pgClient.query('SELECT id, ticket_id, file_name, file_size_bytes, mime_type, storage_key, sha256_hash, uploaded_by_user_id, uploaded_at, is_forensic_artifact, source_payload FROM ticket_attachments ORDER BY uploaded_at ASC'),
      pgClient.query('SELECT id, event_type, action, actor_id, actor_name, actor_role, ip_address, user_agent, entity_type, entity_id, timestamp, source_payload FROM audit_events ORDER BY timestamp DESC'),
      pgClient.query('SELECT id, source_ticket_id, target_ticket_id, relationship_type, note, created_by_user_id, created_at, source_payload FROM ticket_relationships ORDER BY created_at ASC'),
      pgClient.query('SELECT id, ticket_id, title, description, owner_id, group_id, status, due_at, dependency_task_ids, completion_condition, created_by_user_id, created_at, updated_at, completed_at, source_payload FROM ticket_tasks ORDER BY created_at ASC'),
      pgClient.query('SELECT id, ticket_id, agent_id, started_at, duration_minutes, description, billable, activity_type, created_at, source_payload FROM ticket_worklogs ORDER BY started_at DESC'),
      pgClient.query('SELECT id, ticket_id, policy_id, metric, target_minutes, started_at, deadline_at, state, elapsed_minutes, remaining_minutes, paused_at, paused_reason, accrued_paused_minutes, completed_at, breached_at, source_payload FROM ticket_sla_instances ORDER BY started_at ASC'),
      pgClient.query('SELECT id, ticket_id, requester_id, score, comment, agent_rating, resolution_quality, speed_rating, submitted_at, source_payload FROM ticket_satisfaction ORDER BY submitted_at DESC'),
      pgClient.query('SELECT id, ticket_id, status, recommendation, confidence, engine_version, requires_human_confirmation, created_at, reviewed_at, reviewed_by_user_id, source_payload FROM ticket_ai_recommendations ORDER BY created_at DESC'),
      pgClient.query('SELECT id, department_id, name, type, provider, endpoint_url, auth_type, status, last_sync_at, latency_ms, health_score, sync_frequency_minutes, description, config_summary, source_payload, created_at, updated_at FROM department_connections WHERE deleted_at IS NULL ORDER BY department_id, name'),
      pgClient.query('SELECT collection, payload FROM legacy_json_records ORDER BY collection, record_id'),
    ]);

    const fromPayload = (row: any) => row.source_payload && typeof row.source_payload === 'object' ? row.source_payload : null;
    base.divisions = divisions.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.departments = departments.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.departmentSections = departmentSections.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.teams = teams.rows.map((row) => fromPayload(row)).filter(Boolean);
    // Identity, authorization, and organizational placement are normalized
    // columns. They outrank the compatibility payload so an outdated in-memory
    // login snapshot cannot restore old roles or old section membership.
    base.users = users.rows.map(rowToUser).filter(Boolean);
    base.assets = assets.rows.map((row) => ({
      id: row.id,
      name: row.name,
      assetType: row.type,
      hostname: row.fqdn || undefined,
      ipAddress: row.ip_address || undefined,
      environment: row.environment,
      criticality: row.critical_asset ? 'TIER_1' : 'TIER_2',
      internetExposed: false,
      ownerId: row.owner_id || '',
      departmentId: row.department_id || '',
      dataClassification: 'INTERNAL',
      cmdbId: row.tag,
      operatingSystem: row.os || undefined,
    }));
    base.applications = applications.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: '',
      criticality: row.tier,
      businessOwnerId: row.business_owner_id || '',
      technicalOwnerId: row.technical_owner_id || '',
      securityLeadId: '',
      developmentTeamId: '',
      environment: 'PRODUCTION',
      techStack: [],
      gitRepositories: row.repository_url ? [row.repository_url] : [],
      connectedDatabases: [],
      connectedApis: [],
      internetExposed: false,
      dataClassification: 'INTERNAL',
      activeRiskCount: 0,
      openVulnerabilitiesCount: Number(row.active_cve_count) || 0,
    }));
    base.cmdbTypes = cmdbTypes.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.cmdbRelationshipTypes = cmdbRelationshipTypes.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.configurationItems = configurationItems.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.ciRelationships = ciRelationships.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.ciRecordLinks = ciRecordLinks.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.slaPolicies = slaPolicies.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.workflows = workflows.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.tickets = tickets.rows.map((row) => fromPayload(row)).filter(Boolean);
    base.comments = comments.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      authorId: row.author_id,
      authorName: row.author_id,
      authorRole: 'BANK_USER',
      content: row.content,
      visibility: row.visibility,
      confidentiality: 'INTERNAL',
      mentions: [],
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at, iso(row.created_at)),
      isEdited: false,
      metadata: { isAuditNote: Boolean(row.is_audit_note), isResolutionSummary: Boolean(row.is_resolution_summary) },
      reactions: [],
    })).filter(Boolean);
    base.approvals = approvals.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      workflowId: row.workflow_id,
      transitionId: row.transition_id,
      status: row.status,
      initiatedByUserId: row.initiated_by_user_id,
      initiatedAt: iso(row.initiated_at),
      completedAt: row.completed_at ? iso(row.completed_at) : undefined,
      steps: jsonArray(row.steps),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at, iso(row.created_at)),
    })).filter(Boolean);
    base.attachments = attachments.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      fileName: row.file_name,
      fileSizeBytes: numberValue(row.file_size_bytes),
      mimeType: row.mime_type,
      evidenceType: 'AUDIT_WORKPAPER',
      sha256Checksum: row.sha256_hash,
      isEncrypted: true,
      virusScanStatus: 'CLEAN',
      confidentiality: 'INTERNAL',
      uploaderId: row.uploaded_by_user_id,
      uploaderName: row.uploaded_by_user_id,
      uploadedAt: iso(row.uploaded_at),
      isImmutableEvidence: Boolean(row.is_forensic_artifact),
      retentionUntil: iso(row.uploaded_at),
      downloadCount: 0,
      storageKey: row.storage_key,
    })).filter(Boolean);
    base.auditEvents = auditEvents.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      timestamp: iso(row.timestamp),
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorRole: row.actor_role || 'BANK_USER',
      ipAddress: row.ip_address || '',
      userAgent: row.user_agent || '',
      correlationId: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
    })).filter(Boolean);
    base.ticketRelationships = relationships.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      sourceTicketId: row.source_ticket_id,
      targetTicketId: row.target_ticket_id,
      type: row.relationship_type,
      note: row.note || undefined,
      createdByUserId: row.created_by_user_id,
      createdAt: iso(row.created_at),
    })).filter(Boolean);
    base.ticketTasks = tasks.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      title: row.title,
      description: row.description || undefined,
      ownerId: row.owner_id || undefined,
      groupId: row.group_id || undefined,
      status: row.status,
      dueAt: row.due_at ? iso(row.due_at) : undefined,
      dependencyTaskIds: jsonArray(row.dependency_task_ids),
      completionCondition: row.completion_condition || undefined,
      createdByUserId: row.created_by_user_id,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at, iso(row.created_at)),
      completedAt: row.completed_at ? iso(row.completed_at) : undefined,
    })).filter(Boolean);
    base.ticketWorklogs = worklogs.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      agentId: row.agent_id,
      startedAt: iso(row.started_at),
      durationMinutes: numberValue(row.duration_minutes),
      description: row.description,
      billable: Boolean(row.billable),
      activityType: row.activity_type,
      createdAt: iso(row.created_at),
    })).filter(Boolean);
    base.ticketSlaInstances = slaInstances.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      policyId: row.policy_id,
      metric: row.metric,
      targetMinutes: numberValue(row.target_minutes),
      startedAt: iso(row.started_at),
      deadlineAt: iso(row.deadline_at),
      state: row.state,
      elapsedMinutes: numberValue(row.elapsed_minutes),
      remainingMinutes: numberValue(row.remaining_minutes),
      pausedAt: row.paused_at ? iso(row.paused_at) : undefined,
      pausedReason: row.paused_reason || undefined,
      accruedPausedMinutes: numberValue(row.accrued_paused_minutes),
      completedAt: row.completed_at ? iso(row.completed_at) : undefined,
      breachedAt: row.breached_at ? iso(row.breached_at) : undefined,
    })).filter(Boolean);
    base.ticketSatisfaction = satisfaction.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      requesterId: row.requester_id,
      score: numberValue(row.score) as 1 | 2 | 3 | 4 | 5,
      comment: row.comment || undefined,
      agentRating: row.agent_rating ? numberValue(row.agent_rating) as 1 | 2 | 3 | 4 | 5 : undefined,
      resolutionQuality: row.resolution_quality ? numberValue(row.resolution_quality) as 1 | 2 | 3 | 4 | 5 : undefined,
      speedRating: row.speed_rating ? numberValue(row.speed_rating) as 1 | 2 | 3 | 4 | 5 : undefined,
      submittedAt: iso(row.submitted_at),
    })).filter(Boolean);
    base.ticketAiRecommendations = aiRecommendations.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      ticketId: row.ticket_id,
      status: row.status,
      ...(row.recommendation || {}),
      confidence: Number(row.confidence),
      engineVersion: row.engine_version,
      requiresHumanConfirmation: Boolean(row.requires_human_confirmation) as true,
      createdAt: iso(row.created_at),
      reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : undefined,
      reviewedByUserId: row.reviewed_by_user_id || undefined,
    })).filter(Boolean);
    base.connections = connections.rows.map((row) => fromPayload(row) || ({
      id: row.id,
      departmentId: row.department_id,
      name: row.name,
      type: row.type,
      provider: row.provider,
      endpointUrl: row.endpoint_url,
      authType: row.auth_type,
      status: row.status,
      lastSyncAt: row.last_sync_at ? iso(row.last_sync_at) : '',
      latencyMs: row.latency_ms == null ? undefined : Number(row.latency_ms),
      healthScore: row.health_score == null ? undefined : Number(row.health_score),
      syncFrequencyMinutes: Number(row.sync_frequency_minutes || 0),
      description: row.description || '',
      configSummary: row.config_summary || {},
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    })).filter(Boolean);

    for (const row of legacy.rows) {
      const collection = (base as any)[row.collection];
      if (!Array.isArray(collection)) continue;
      const payload = row.payload as RecordValue;
      // Relational rows are authoritative after hydration. Keep legacy JSON
      // as a compatibility fallback without duplicating a record that was
      // already loaded from its normalized table.
      if (payload?.id && collection.some((record: RecordValue) => record?.id === payload.id)) continue;
      collection.push(payload);
    }
    this.persistedHashes = this.buildHashes(base);
    return base;
  }

  /**
   * Login is a hot path. Persist only its user state and audit event instead of
   * serializing the whole compatibility projection on every authentication.
   */
  public static async persistLogin(user: BankUser, event: AuditEvent): Promise<void> {
    if (isUnitTestProcess()) return;
    await pgClient.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE bank_users
         SET last_login_at = $2, ldap_bind_status = $3, source_payload = $4::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [user.id, user.lastLdapLoginAt ? iso(user.lastLdapLoginAt) : null, nullable(user.ldapBindStatus), json(user)]
      );
      if (updated.rowCount !== 1) throw new Error(`Active Directory user ${user.id} is missing from PostgreSQL.`);

      await client.query(
        `INSERT INTO audit_events(id,event_type,action,actor_id,actor_name,actor_role,ip_address,user_agent,entity_type,entity_id,timestamp,source_payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         ON CONFLICT(id) DO NOTHING`,
        [event.id, event.action || 'USER_LOGIN', event.action, event.actorId, event.actorName, event.actorRole || null, event.ipAddress || null, event.userAgent || null, event.entityType, event.entityId, iso(event.timestamp), json(event)]
      );
    });
    this.persistedHashes.get('users')?.set(user.id, this.hash(user));
    this.persistedHashes.get('auditEvents')?.set(event.id, this.hash(event));
  }

  public static async persist(data: DatabaseSchema): Promise<void> {
    const nextHashes = this.buildHashes(data);
    const changed = (collection: string, record: RecordValue, index: number) => {
      const id = recordId(record, index);
      return this.persistedHashes.get(collection)?.get(id) !== nextHashes.get(collection)?.get(id);
    };

    await pgClient.transaction(async (client) => {
      const divisions = data.divisions || [];
      const departments = data.departments || [];
      const departmentSections = data.departmentSections || [];
      const departmentIds = new Set(departments.map((item) => item.id));
      const sectionIds = new Set(departmentSections.map((item) => item.id));
      const divisionIds = new Set(divisions.map((item) => item.id));
      const userIds = new Set((data.users || []).map((item) => item.id));
      const teamIds = new Set((data.teams || []).map((item) => item.id));
      const assetIds = new Set((data.assets || []).map((item) => item.id));
      const applicationIds = new Set((data.applications || []).map((item) => item.id));
      const ticketIds = new Set((data.tickets || []).map((item) => item.id));
      const divisionCodes = new Set<string>();
      const departmentCodes = new Set<string>();
      const changedDivisions = divisions.filter((item, index) => changed('divisions', item as RecordValue, index));
      const changedDepartments = departments.filter((item, index) => changed('departments', item as RecordValue, index));
      const normalizeDivisionCodes = changedDivisions.length > 0;
      const normalizeDepartmentCodes = changedDepartments.length > 0;

      // Codes are UNIQUE and two records can legitimately exchange their
      // normalized collision suffixes between snapshots. Stage existing
      // codes first so an otherwise valid swap cannot fail mid-transaction.
      if (normalizeDivisionCodes) {
        await client.query(
          `UPDATE bank_divisions SET code = CONCAT('__P_', LEFT(MD5(id), 28))
           WHERE id = ANY($1::text[])`,
          [[...divisionIds]]
        );
      }
      if (normalizeDepartmentCodes) {
        await client.query(
          `UPDATE bank_departments SET code = CONCAT('__P_', LEFT(MD5(id), 28))
           WHERE id = ANY($1::text[])`,
          [[...departmentIds]]
        );
      }

      for (let index = 0; index < divisions.length; index++) {
        const division = divisions[index];
        if (!normalizeDivisionCodes && !changed('divisions', division as RecordValue, index)) continue;
        await client.query(
          `INSERT INTO bank_divisions(id,code,name,source_payload) VALUES($1,$2,$3,$4::jsonb)
           ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [division.id, safeCode(division.code, division.id, divisionCodes), text(division.name) || division.id, json(division)]
        );
      }
      for (let index = 0; index < departments.length; index++) {
        const department = departments[index];
        if (!normalizeDepartmentCodes && !changed('departments', department as RecordValue, index)) continue;
        if (!divisionIds.has(department.divisionId)) continue;
        await client.query(
          `INSERT INTO bank_departments(id,division_id,code,name,description,manager_id,admin_user_ids,color,icon,is_active,settings,directory_source,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13::jsonb)
           ON CONFLICT(id) DO UPDATE SET division_id=EXCLUDED.division_id,code=EXCLUDED.code,name=EXCLUDED.name,description=EXCLUDED.description,manager_id=EXCLUDED.manager_id,admin_user_ids=EXCLUDED.admin_user_ids,color=EXCLUDED.color,icon=EXCLUDED.icon,is_active=EXCLUDED.is_active,settings=EXCLUDED.settings,directory_source=EXCLUDED.directory_source,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [department.id, department.divisionId, safeCode(department.code, department.id, departmentCodes), text(department.name) || department.id, department.description || '', department.managerId || null, json(department.adminUserIds || []), department.color || null, department.icon || null, department.isActive !== false, json(department.settings || {}), department.directorySource || null, json(department)]
        );
      }
      const sectionCodes = new Set<string>();
      for (let index = 0; index < departmentSections.length; index++) {
        const section = departmentSections[index];
        if (!changed('departmentSections', section as RecordValue, index)) continue;
        if (!departmentIds.has(section.departmentId)) continue;
        await client.query(
          `INSERT INTO bank_department_sections(id,department_id,code,name,manager_id,is_active,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
           ON CONFLICT(id) DO UPDATE SET department_id=EXCLUDED.department_id,code=EXCLUDED.code,name=EXCLUDED.name,manager_id=EXCLUDED.manager_id,is_active=EXCLUDED.is_active,source_payload=EXCLUDED.source_payload,updated_at=NOW()` ,
          [section.id, section.departmentId, safeCode(section.code, section.id, sectionCodes), text(section.name) || section.id, section.managerId || null, section.isActive !== false, json(section)]
        );
      }
      for (let index = 0; index < (data.teams || []).length; index++) {
        const team = data.teams![index];
        if (!changed('teams', team as RecordValue, index)) continue;
        if (!departmentIds.has(team.departmentId)) continue;
        await client.query(
          `INSERT INTO bank_teams(id,department_id,name,email,source_payload) VALUES($1,$2,$3,$4,$5::jsonb)
           ON CONFLICT(id) DO UPDATE SET department_id=EXCLUDED.department_id,name=EXCLUDED.name,email=EXCLUDED.email,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [team.id, team.departmentId, text(team.name) || team.id, normalizeDirectoryKey((team as any).email) || `${team.id}@invalid.local`, json(team)]
        );
      }
      for (let index = 0; index < (data.users || []).length; index++) {
        const user = data.users![index];
        if (!changed('users', user as RecordValue, index)) continue;
        const name = splitName(user.fullName);
        await client.query(
          `INSERT INTO bank_users(id,username,email,first_name,last_name,full_name,title,department_id,section_id,division_id,security_clearance,is_active,last_login_at,roles,team_ids,owned_application_ids,owned_risk_ids,sam_account_name,user_principal_name,distinguished_name,ldap_domain,ldap_bind_status,distribution_groups,directory_source,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19,$20,$21,$22,$23::jsonb,$24,$25::jsonb)
           ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,full_name=EXCLUDED.full_name,title=EXCLUDED.title,department_id=EXCLUDED.department_id,section_id=EXCLUDED.section_id,division_id=EXCLUDED.division_id,is_active=EXCLUDED.is_active,roles=EXCLUDED.roles,team_ids=EXCLUDED.team_ids,owned_application_ids=EXCLUDED.owned_application_ids,owned_risk_ids=EXCLUDED.owned_risk_ids,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [user.id, normalizeDirectoryKey(user.username), normalizeDirectoryKey(user.email), name.first, name.last, name.full, text(user.title) || 'Bank Specialist', departmentIds.has(user.departmentId) ? user.departmentId : null, sectionIds.has(user.sectionId || '') ? user.sectionId : null, divisionIds.has(user.divisionId) ? user.divisionId : null, user.securityClearance || 'INTERNAL', Boolean(user.isActive), user.lastLdapLoginAt ? iso(user.lastLdapLoginAt) : null, json(user.roles || []), json(user.teamIds || []), json(user.ownedApplicationIds || []), json(user.ownedRiskIds || []), normalizeDirectoryKey(user.sAMAccountName || user.username), nullable(user.userPrincipalName), nullable(user.distinguishedName), nullable(user.ldapDomain), nullable(user.ldapBindStatus), json(user.distributionGroups || []), nullable(user.directorySource), json(user)]
        );
      }

      // CMDB is persisted in its own normalized relational model. source_payload
      // preserves full typed metadata while columns/indexes serve operational queries.
      // PostgreSQL enforces the self-reference on parent_type_id, so a
      // snapshot loaded from legacy_json_records must be written parent-first.
      const cmdbTypeIds = new Set((data.cmdbTypes || []).map((type) => type.id));
      const pendingCmdbTypes = [...(data.cmdbTypes || [])];
      const orderedCmdbTypes: typeof pendingCmdbTypes = [];
      const writtenCmdbTypeIds = new Set<string>();
      while (pendingCmdbTypes.length > 0) {
        const next = pendingCmdbTypes.findIndex((type) => !type.parentTypeId || writtenCmdbTypeIds.has(type.parentTypeId) || !cmdbTypeIds.has(type.parentTypeId));
        const [type] = pendingCmdbTypes.splice(next >= 0 ? next : 0, 1);
        orderedCmdbTypes.push(type);
        writtenCmdbTypeIds.add(type.id);
      }
      for (const type of orderedCmdbTypes) {
        const parentTypeId = type.parentTypeId && cmdbTypeIds.has(type.parentTypeId) ? type.parentTypeId : null;
        await client.query(
          `INSERT INTO cmdb_ci_types(id,name,parent_type_id,icon,is_active,required_attributes,optional_attributes,validation_rules,allowed_relationship_type_ids,source_payload)
           VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
           ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,parent_type_id=EXCLUDED.parent_type_id,icon=EXCLUDED.icon,is_active=EXCLUDED.is_active,required_attributes=EXCLUDED.required_attributes,optional_attributes=EXCLUDED.optional_attributes,validation_rules=EXCLUDED.validation_rules,allowed_relationship_type_ids=EXCLUDED.allowed_relationship_type_ids,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [type.id, type.name, parentTypeId, type.icon || 'Box', type.isActive !== false, json(type.requiredAttributes), json(type.optionalAttributes), json(type.validationRules), json(type.allowedRelationshipTypeIds), json(type)]
        );
      }
      for (const type of data.cmdbRelationshipTypes || []) {
        await client.query(
          `INSERT INTO cmdb_relationship_types(id,name,inverse_name,is_dependency,prevents_cycles,is_active,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
           ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,inverse_name=EXCLUDED.inverse_name,is_dependency=EXCLUDED.is_dependency,prevents_cycles=EXCLUDED.prevents_cycles,is_active=EXCLUDED.is_active,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [type.id, type.name, type.inverseName, type.isDependency, type.preventsCycles, type.isActive !== false, json(type)]
        );
      }
      for (const ci of data.configurationItems || []) {
        if (!userIds.has(ci.createdBy) || !userIds.has(ci.updatedBy)) continue;
        await client.query(
          `INSERT INTO configuration_items(id,ci_number,name,display_name,type_id,status,lifecycle_status,environment,criticality,business_criticality,description,owner_user_id,technical_owner_user_id,business_owner_user_id,support_group_id,department_id,location_id,vendor,manufacturer,model,serial_number,asset_tag,hostname,fqdn,ip_address,mac_address,operating_system,os_version,external_reference,source,source_system,source_record_id,discovery_status,last_discovered_at,last_verified_at,last_seen_at,last_sync_at,sync_status,details,version,created_at,updated_at,created_by,updated_by,archived_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39::jsonb,$40,$41,$42,$43,$44,$45,$46::jsonb)
           ON CONFLICT(id) DO UPDATE SET ci_number=EXCLUDED.ci_number,name=EXCLUDED.name,display_name=EXCLUDED.display_name,type_id=EXCLUDED.type_id,status=EXCLUDED.status,lifecycle_status=EXCLUDED.lifecycle_status,environment=EXCLUDED.environment,criticality=EXCLUDED.criticality,business_criticality=EXCLUDED.business_criticality,description=EXCLUDED.description,owner_user_id=EXCLUDED.owner_user_id,technical_owner_user_id=EXCLUDED.technical_owner_user_id,business_owner_user_id=EXCLUDED.business_owner_user_id,support_group_id=EXCLUDED.support_group_id,department_id=EXCLUDED.department_id,location_id=EXCLUDED.location_id,vendor=EXCLUDED.vendor,manufacturer=EXCLUDED.manufacturer,model=EXCLUDED.model,serial_number=EXCLUDED.serial_number,asset_tag=EXCLUDED.asset_tag,hostname=EXCLUDED.hostname,fqdn=EXCLUDED.fqdn,ip_address=EXCLUDED.ip_address,mac_address=EXCLUDED.mac_address,operating_system=EXCLUDED.operating_system,os_version=EXCLUDED.os_version,external_reference=EXCLUDED.external_reference,source=EXCLUDED.source,source_system=EXCLUDED.source_system,source_record_id=EXCLUDED.source_record_id,discovery_status=EXCLUDED.discovery_status,last_discovered_at=EXCLUDED.last_discovered_at,last_verified_at=EXCLUDED.last_verified_at,last_seen_at=EXCLUDED.last_seen_at,last_sync_at=EXCLUDED.last_sync_at,sync_status=EXCLUDED.sync_status,details=EXCLUDED.details,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by,archived_at=EXCLUDED.archived_at,source_payload=EXCLUDED.source_payload`,
          [ci.id, ci.ciNumber, ci.name, ci.displayName || null, ci.typeId, ci.status, ci.lifecycleStatus, ci.environment, ci.criticality, ci.businessCriticality || null, ci.description || null, userIds.has(ci.ownerUserId || '') ? ci.ownerUserId : null, userIds.has(ci.technicalOwnerUserId || '') ? ci.technicalOwnerUserId : null, userIds.has(ci.businessOwnerUserId || '') ? ci.businessOwnerUserId : null, ci.supportGroupId || null, departmentIds.has(ci.departmentId || '') ? ci.departmentId : null, ci.locationId || null, ci.vendor || null, ci.manufacturer || null, ci.model || null, ci.serialNumber || null, ci.assetTag || null, ci.hostname || null, ci.fqdn || null, ci.ipAddress || null, ci.macAddress || null, ci.operatingSystem || null, ci.osVersion || null, ci.externalReference || null, ci.source, ci.sourceSystem || null, ci.sourceRecordId || null, ci.discoveryStatus, ci.lastDiscoveredAt ? iso(ci.lastDiscoveredAt) : null, ci.lastVerifiedAt ? iso(ci.lastVerifiedAt) : null, ci.lastSeenAt ? iso(ci.lastSeenAt) : null, ci.lastSyncAt ? iso(ci.lastSyncAt) : null, ci.syncStatus || null, json(ci.details), ci.version, iso(ci.createdAt), iso(ci.updatedAt), ci.createdBy, ci.updatedBy, ci.archivedAt ? iso(ci.archivedAt) : null, json(ci)]
        );
      }
      const ciIds = new Set((data.configurationItems || []).map((ci) => ci.id));
      for (const relationship of data.ciRelationships || []) {
        if (!ciIds.has(relationship.sourceCiId) || !ciIds.has(relationship.targetCiId)) continue;
        await client.query(`INSERT INTO ci_relationships(id,source_ci_id,target_ci_id,relationship_type_id,status,description,source,confidence,valid_from,valid_to,created_at,created_by,archived_at,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,description=EXCLUDED.description,confidence=EXCLUDED.confidence,valid_to=EXCLUDED.valid_to,archived_at=EXCLUDED.archived_at,source_payload=EXCLUDED.source_payload`, [relationship.id, relationship.sourceCiId, relationship.targetCiId, relationship.relationshipTypeId, relationship.status, relationship.description || null, relationship.source, relationship.confidence, iso(relationship.validFrom), relationship.validTo ? iso(relationship.validTo) : null, iso(relationship.createdAt), userIds.has(relationship.createdBy) ? relationship.createdBy : null, relationship.archivedAt ? iso(relationship.archivedAt) : null, json(relationship)]);
      }
      for (const link of data.ciRecordLinks || []) {
        if (!ciIds.has(link.ciId)) continue;
        await client.query(`INSERT INTO ci_record_links(id,ci_id,record_type,record_id,relationship,created_at,created_by,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(id) DO UPDATE SET relationship=EXCLUDED.relationship,source_payload=EXCLUDED.source_payload`, [link.id, link.ciId, link.recordType, link.recordId, link.relationship, iso(link.createdAt), userIds.has(link.createdBy) ? link.createdBy : null, json(link)]);
      }

      for (let index = 0; index < (data.assets || []).length; index++) {
        const asset = data.assets![index];
        if (!changed('assets', asset as RecordValue, index)) continue;
        await client.query(
          `INSERT INTO bank_assets(id,tag,name,type,ip_address,fqdn,environment,critical_asset,pci_dss_scope,owner_id,custodian_id,department_id,os)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT(id) DO UPDATE SET tag=EXCLUDED.tag,name=EXCLUDED.name,type=EXCLUDED.type,ip_address=EXCLUDED.ip_address,fqdn=EXCLUDED.fqdn,environment=EXCLUDED.environment,critical_asset=EXCLUDED.critical_asset,owner_id=EXCLUDED.owner_id,custodian_id=EXCLUDED.custodian_id,department_id=EXCLUDED.department_id,os=EXCLUDED.os,updated_at=NOW()`,
          [asset.id, asset.cmdbId || asset.id, asset.name || asset.id, asset.assetType || 'OTHER', asset.ipAddress || null, asset.hostname || null, asset.environment || 'PRODUCTION', asset.criticality === 'TIER_1', false, userIds.has(asset.ownerId) ? asset.ownerId : null, null, departmentIds.has(asset.departmentId) ? asset.departmentId : null, asset.operatingSystem || null]
        );
      }
      for (let index = 0; index < (data.applications || []).length; index++) {
        const application = data.applications![index];
        if (!changed('applications', application as RecordValue, index)) continue;
        await client.query(
          `INSERT INTO bank_applications(id,code,name,tier,architecture_type,repository_url,technical_owner_id,business_owner_id,department_id,active_cve_count)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,tier=EXCLUDED.tier,architecture_type=EXCLUDED.architecture_type,repository_url=EXCLUDED.repository_url,technical_owner_id=EXCLUDED.technical_owner_id,business_owner_id=EXCLUDED.business_owner_id,department_id=EXCLUDED.department_id,active_cve_count=EXCLUDED.active_cve_count,updated_at=NOW()`,
          [application.id, application.code || application.id, application.name || application.id, application.criticality || 'TIER_2', 'UNKNOWN', application.gitRepositories?.[0] || null, userIds.has(application.technicalOwnerId) ? application.technicalOwnerId : null, userIds.has(application.businessOwnerId) ? application.businessOwnerId : null, departmentIds.has((application as any).departmentId) ? (application as any).departmentId : null, application.openVulnerabilitiesCount || 0]
        );
      }

      const policyIds = new Set((data.slaPolicies || []).map((item) => item.id));
      for (let index = 0; index < (data.slaPolicies || []).length; index++) {
        const policy = data.slaPolicies![index];
        if (!changed('slaPolicies', policy as RecordValue, index)) continue;
        await client.query(
          `INSERT INTO sla_policies(id,name,description,is_active,is_default,rules,business_hours,source_payload) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
           ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,rules=EXCLUDED.rules,business_hours=EXCLUDED.business_hours,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [policy.id, text(policy.name) || policy.id, text(policy.description), (policy as any).isActive !== false, Boolean(policy.isDefault), json((policy as any).rules || (policy as any).thresholds || []), json((policy as any).businessHours || policy), json(policy)]
        );
      }
      // SLA DELETE is represented as an archive in the controller, but keep
      // this reconciliation guard so any future hard-delete path cannot leave
      // stale policy rows in PostgreSQL after projection synchronization.
      await client.query('DELETE FROM sla_policies WHERE NOT (id = ANY($1::text[]))', [[...policyIds]]);
      const workflowIds = new Set((data.workflows || []).map((item) => item.id));
      for (const ticket of data.tickets || []) workflowIds.add(ticket.workflowId);
      for (const workflowId of workflowIds) {
        if (!workflowId) continue;
        const workflow = (data.workflows || []).find((item) => item.id === workflowId);
        await client.query(
          `INSERT INTO workflows(id,name,description,project_code,version,is_active,initial_state_id,states,transitions,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)
           ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [workflowId, workflow?.name || workflowId, workflow?.description || 'Imported workflow placeholder', (workflow as any)?.projectCode || 'SEC', workflow?.version || 1, workflow?.isActive !== false, (workflow as any)?.initialStateId || 'OPEN', json((workflow as any)?.states || []), json((workflow as any)?.transitions || []), json(workflow || { id: workflowId })]
        );
      }

      const ticketById = new Map((data.tickets || []).map((item) => [item.id, item]));
      const orderedTickets: any[] = [];
      const visited = new Set<string>();
      const append = (ticket: any): void => { if (visited.has(ticket.id)) return; if (ticket.parentTicketId && ticketById.has(ticket.parentTicketId)) append(ticketById.get(ticket.parentTicketId)); visited.add(ticket.id); orderedTickets.push(ticket); };
      for (const ticket of data.tickets || []) append(ticket);
      for (const ticket of orderedTickets) {
        const ticketIndex = data.tickets?.indexOf(ticket) ?? -1;
        if (ticketIndex >= 0 && !changed('tickets', ticket as RecordValue, ticketIndex)) continue;
        const createdAt = iso(ticket.createdAt);
        const userRef = (id: unknown) => id && userIds.has(id as string) ? id : null;
        await client.query(
          `INSERT INTO tickets(id,key,project_code,ticket_type_id,ticket_type_name,category,security_domain,title,description,status_id,status_name,status_category,workflow_id,workflow_version,technical_severity,business_priority,business_impact,inherent_risk,residual_risk,risk_score,cvss_score,cvss_vector,confidentiality,restricted_user_ids,restricted_team_ids,reporter_id,assignee_id,security_owner_id,team_id,department_id,application_id,asset_id,risk_owner_id,watcher_ids,finding_details,incident_details,exception_details,custom_fields,tags,detected_at,created_at,updated_at,due_date,remediation_deadline,sla_policy_id,sla_state,sla_remaining_minutes,version,requester_id,owner_id,parent_ticket_id,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb,$26,$27,$28,$29,$30,$31,$32,$33,$34::jsonb,$35::jsonb,$36::jsonb,$37::jsonb,$38::jsonb,$39::jsonb,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52::jsonb)
           ON CONFLICT(id) DO UPDATE SET key=EXCLUDED.key,category=EXCLUDED.category,security_domain=EXCLUDED.security_domain,title=EXCLUDED.title,description=EXCLUDED.description,status_id=EXCLUDED.status_id,status_name=EXCLUDED.status_name,status_category=EXCLUDED.status_category,workflow_id=EXCLUDED.workflow_id,workflow_version=EXCLUDED.workflow_version,assignee_id=EXCLUDED.assignee_id,security_owner_id=EXCLUDED.security_owner_id,team_id=EXCLUDED.team_id,department_id=EXCLUDED.department_id,application_id=EXCLUDED.application_id,asset_id=EXCLUDED.asset_id,risk_owner_id=EXCLUDED.risk_owner_id,watcher_ids=EXCLUDED.watcher_ids,finding_details=EXCLUDED.finding_details,incident_details=EXCLUDED.incident_details,exception_details=EXCLUDED.exception_details,custom_fields=EXCLUDED.custom_fields,tags=EXCLUDED.tags,due_date=EXCLUDED.due_date,remediation_deadline=EXCLUDED.remediation_deadline,sla_policy_id=EXCLUDED.sla_policy_id,sla_state=EXCLUDED.sla_state,sla_remaining_minutes=EXCLUDED.sla_remaining_minutes,requester_id=EXCLUDED.requester_id,owner_id=EXCLUDED.owner_id,parent_ticket_id=EXCLUDED.parent_ticket_id,updated_at=EXCLUDED.updated_at,version=EXCLUDED.version,source_payload=EXCLUDED.source_payload`,
          [ticket.id, ticket.key, ticket.projectCode || 'SEC', ticket.ticketTypeId || ticket.category || 'GENERAL_TASK', ticket.ticketTypeName || 'Security Ticket', ticket.category || 'GENERAL_TASK', ticket.securityDomain || 'GENERAL_INFOSEC', ticket.title || 'Imported ticket', ticket.description || '', ticket.statusId || 'OPEN', ticket.statusName || 'Open', ticket.statusCategory || 'TO_DO', ticket.workflowId || 'wf-imported', ticket.workflowVersion || 1, ticket.technicalSeverity || 'MEDIUM', ticket.businessPriority || 'P3_MEDIUM', ticket.businessImpact || 'MODERATE', ticket.inherentRisk || 'MEDIUM', ticket.residualRisk || 'LOW', ticket.riskScore ?? 0, ticket.cvssScore ?? null, ticket.cvssVector || null, ticket.confidentiality || 'INTERNAL', json(ticket.restrictedUserIds || []), json(ticket.restrictedTeamIds || []), ticket.reporterId, userRef(ticket.assigneeId), userRef(ticket.securityOwnerId), teamIds.has(ticket.teamId) ? ticket.teamId : null, departmentIds.has(ticket.departmentId) ? ticket.departmentId : null, applicationIds.has(ticket.applicationId) ? ticket.applicationId : null, assetIds.has(ticket.assetId) ? ticket.assetId : null, userRef(ticket.riskOwnerId), json(ticket.watcherIds || []), json(ticket.findingDetails || null), json(ticket.incidentDetails || null), json(ticket.exceptionDetails || null), json(ticket.customFields || []), json(ticket.tags || []), iso(ticket.detectedAt, createdAt), createdAt, iso(ticket.updatedAt, createdAt), iso(ticket.dueDate, createdAt), iso(ticket.remediationDeadline, createdAt), policyIds.has(ticket.slaPolicyId) ? ticket.slaPolicyId : null, ticket.slaState || 'SAFE', ticket.slaRemainingMinutes ?? null, ticket.version || 1, userRef(ticket.requesterId), userRef(ticket.ownerId), ticket.parentTicketId && ticketIds.has(ticket.parentTicketId) ? ticket.parentTicketId : null, json(ticket)]
        );
      }

      for (let index = 0; index < (data.comments || []).length; index++) {
        const comment = data.comments![index];
        if (!changed('comments', comment as RecordValue, index)) continue;
        if (!ticketIds.has(comment.ticketId) || !userIds.has(comment.authorId)) continue;
        await client.query(
          `INSERT INTO ticket_comments(id,ticket_id,author_id,content,visibility,is_audit_note,is_resolution_summary,created_at,updated_at,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,visibility=EXCLUDED.visibility,updated_at=EXCLUDED.updated_at,source_payload=EXCLUDED.source_payload`,
          [comment.id, comment.ticketId, comment.authorId, comment.content || '', comment.visibility || 'ALL', Boolean((comment as any).isAuditNote), Boolean((comment as any).isResolutionSummary), iso(comment.createdAt), iso(comment.updatedAt, iso(comment.createdAt)), json(comment)]
        );
      }
      for (let index = 0; index < (data.approvals || []).length; index++) {
        const approval = data.approvals![index] as any;
        if (!changed('approvals', approval, index)) continue;
        const ticket = ticketById.get(approval.ticketId);
        const workflowId = approval.workflowId || ticket?.workflowId;
        const initiatedByUserId = approval.initiatedByUserId || approval.requesterId || ticket?.requesterId || ticket?.reporterId;
        if (!ticketIds.has(approval.ticketId) || !workflowIds.has(workflowId) || !userIds.has(initiatedByUserId)) continue;
        await client.query(
          `INSERT INTO ticket_approvals(id,ticket_id,workflow_id,transition_id,status,initiated_by_user_id,initiated_at,completed_at,steps,created_at,updated_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb)
           ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,steps=EXCLUDED.steps,updated_at=EXCLUDED.updated_at,source_payload=EXCLUDED.source_payload`,
          [approval.id, approval.ticketId, workflowId, approval.transitionId || approval.steps?.[0]?.transitionId || approval.id, approval.status || 'PENDING', initiatedByUserId, iso(approval.initiatedAt || approval.createdAt), approval.completedAt ? iso(approval.completedAt) : null, json(approval.steps || []), iso(approval.createdAt), iso(approval.updatedAt || approval.createdAt), json(approval)]
        );
      }
      for (let index = 0; index < (data.attachments || []).length; index++) {
        const attachment = data.attachments![index] as any;
        if (!changed('attachments', attachment, index)) continue;
        if (!ticketIds.has(attachment.ticketId) || !userIds.has(attachment.uploaderId)) continue;
        const checksum = attachment.sha256Checksum || crypto.createHash('sha256').update(`${attachment.id}:${attachment.fileName}`).digest('hex');
        await client.query(
          `INSERT INTO ticket_attachments(id,ticket_id,file_name,file_size_bytes,mime_type,storage_provider,storage_key,sha256_hash,uploaded_by_user_id,uploaded_at,is_forensic_artifact,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT(id) DO UPDATE SET file_name=EXCLUDED.file_name,file_size_bytes=EXCLUDED.file_size_bytes,mime_type=EXCLUDED.mime_type,storage_key=EXCLUDED.storage_key,sha256_hash=EXCLUDED.sha256_hash,is_forensic_artifact=EXCLUDED.is_forensic_artifact,source_payload=EXCLUDED.source_payload`,
          [attachment.id, attachment.ticketId, attachment.fileName || attachment.id, numberValue(attachment.fileSizeBytes), attachment.mimeType || 'application/octet-stream', attachment.storageProvider || 's3', attachment.storageKey || attachment.id, checksum, attachment.uploaderId, iso(attachment.uploadedAt), Boolean(attachment.isImmutableEvidence), json(attachment)]
        );
      }
      for (let index = 0; index < (data.ticketRelationships || []).length; index++) {
        const relationship = data.ticketRelationships![index];
        if (!changed('ticketRelationships', relationship as RecordValue, index)) continue;
        if (!ticketIds.has(relationship.sourceTicketId) || !ticketIds.has(relationship.targetTicketId) || relationship.sourceTicketId === relationship.targetTicketId || !userIds.has(relationship.createdByUserId)) continue;
        await client.query(
          `INSERT INTO ticket_relationships(id,source_ticket_id,target_ticket_id,relationship_type,note,created_by_user_id,created_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
           ON CONFLICT(id) DO UPDATE SET relationship_type=EXCLUDED.relationship_type,note=EXCLUDED.note,source_payload=EXCLUDED.source_payload`,
          [relationship.id, relationship.sourceTicketId, relationship.targetTicketId, relationship.type, relationship.note || null, relationship.createdByUserId, iso(relationship.createdAt), json(relationship)]
        );
      }
      for (let index = 0; index < (data.ticketTasks || []).length; index++) {
        const task = data.ticketTasks![index];
        if (!changed('ticketTasks', task as RecordValue, index)) continue;
        if (!ticketIds.has(task.ticketId) || !userIds.has(task.createdByUserId)) continue;
        await client.query(
          `INSERT INTO ticket_tasks(id,ticket_id,title,description,owner_id,group_id,status,due_at,dependency_task_ids,completion_condition,created_by_user_id,created_at,updated_at,completed_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb)
           ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,owner_id=EXCLUDED.owner_id,group_id=EXCLUDED.group_id,status=EXCLUDED.status,due_at=EXCLUDED.due_at,dependency_task_ids=EXCLUDED.dependency_task_ids,completion_condition=EXCLUDED.completion_condition,updated_at=EXCLUDED.updated_at,completed_at=EXCLUDED.completed_at,source_payload=EXCLUDED.source_payload`,
          [task.id, task.ticketId, task.title, task.description || null, task.ownerId && userIds.has(task.ownerId) ? task.ownerId : null, task.groupId && teamIds.has(task.groupId) ? task.groupId : null, task.status || 'TO_DO', task.dueAt ? iso(task.dueAt) : null, json(task.dependencyTaskIds || []), task.completionCondition || null, task.createdByUserId, iso(task.createdAt), iso(task.updatedAt || task.createdAt), task.completedAt ? iso(task.completedAt) : null, json(task)]
        );
      }
      for (let index = 0; index < (data.ticketWorklogs || []).length; index++) {
        const worklog = data.ticketWorklogs![index];
        if (!changed('ticketWorklogs', worklog as RecordValue, index)) continue;
        if (!ticketIds.has(worklog.ticketId) || !userIds.has(worklog.agentId)) continue;
        await client.query(
          `INSERT INTO ticket_worklogs(id,ticket_id,agent_id,started_at,duration_minutes,description,billable,activity_type,created_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT(id) DO UPDATE SET started_at=EXCLUDED.started_at,duration_minutes=EXCLUDED.duration_minutes,description=EXCLUDED.description,billable=EXCLUDED.billable,activity_type=EXCLUDED.activity_type,source_payload=EXCLUDED.source_payload`,
          [worklog.id, worklog.ticketId, worklog.agentId, iso(worklog.startedAt), Math.max(1, Math.min(1440, Math.round(numberValue(worklog.durationMinutes, 1)))), worklog.description || 'Worklog', Boolean(worklog.billable), worklog.activityType || 'OTHER', iso(worklog.createdAt), json(worklog)]
        );
      }
      for (let index = 0; index < (data.ticketSlaInstances || []).length; index++) {
        const metric = data.ticketSlaInstances![index];
        if (!changed('ticketSlaInstances', metric as RecordValue, index)) continue;
        if (!ticketIds.has(metric.ticketId) || !policyIds.has(metric.policyId)) continue;
        const targetMinutes = Math.max(1, Math.round(numberValue(metric.targetMinutes, 1)));
        await client.query(
          `INSERT INTO ticket_sla_instances(id,ticket_id,policy_id,metric,target_minutes,started_at,deadline_at,state,elapsed_minutes,remaining_minutes,paused_at,paused_reason,accrued_paused_minutes,completed_at,breached_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
           ON CONFLICT(id) DO UPDATE SET policy_id=EXCLUDED.policy_id,metric=EXCLUDED.metric,target_minutes=EXCLUDED.target_minutes,deadline_at=EXCLUDED.deadline_at,state=EXCLUDED.state,elapsed_minutes=EXCLUDED.elapsed_minutes,remaining_minutes=EXCLUDED.remaining_minutes,paused_at=EXCLUDED.paused_at,paused_reason=EXCLUDED.paused_reason,accrued_paused_minutes=EXCLUDED.accrued_paused_minutes,completed_at=EXCLUDED.completed_at,breached_at=EXCLUDED.breached_at,source_payload=EXCLUDED.source_payload`,
          [metric.id, metric.ticketId, metric.policyId, metric.metric, targetMinutes, iso(metric.startedAt), iso(metric.deadlineAt), metric.state || 'RUNNING', Math.max(0, Math.round(numberValue(metric.elapsedMinutes))), Math.round(numberValue(metric.remainingMinutes)), metric.pausedAt ? iso(metric.pausedAt) : null, metric.pausedReason || null, Math.max(0, Math.round(numberValue(metric.accruedPausedMinutes))), metric.completedAt ? iso(metric.completedAt) : null, metric.breachedAt ? iso(metric.breachedAt) : null, json(metric)]
        );
      }
      for (let index = 0; index < (data.ticketSatisfaction || []).length; index++) {
        const satisfaction = data.ticketSatisfaction![index];
        if (!changed('ticketSatisfaction', satisfaction as RecordValue, index)) continue;
        if (!ticketIds.has(satisfaction.ticketId) || !userIds.has(satisfaction.requesterId)) continue;
        const score = Math.max(1, Math.min(5, Math.round(numberValue(satisfaction.score, 1))));
        await client.query(
          `INSERT INTO ticket_satisfaction(id,ticket_id,requester_id,score,comment,agent_rating,resolution_quality,speed_rating,submitted_at,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT(id) DO UPDATE SET score=EXCLUDED.score,comment=EXCLUDED.comment,agent_rating=EXCLUDED.agent_rating,resolution_quality=EXCLUDED.resolution_quality,speed_rating=EXCLUDED.speed_rating,source_payload=EXCLUDED.source_payload`,
          [satisfaction.id, satisfaction.ticketId, satisfaction.requesterId, score, satisfaction.comment || null, satisfaction.agentRating || null, satisfaction.resolutionQuality || null, satisfaction.speedRating || null, iso(satisfaction.submittedAt), json(satisfaction)]
        );
      }
      for (let index = 0; index < (data.ticketAiRecommendations || []).length; index++) {
        const recommendation = data.ticketAiRecommendations![index] as any;
        if (!changed('ticketAiRecommendations', recommendation, index)) continue;
        if (!ticketIds.has(recommendation.ticketId)) continue;
        await client.query(
          `INSERT INTO ticket_ai_recommendations(id,ticket_id,status,recommendation,confidence,engine_version,requires_human_confirmation,created_at,reviewed_at,reviewed_by_user_id,source_payload)
           VALUES($1,$2,$3,$4::jsonb,$5,$6,TRUE,$7,$8,$9,$10::jsonb)
           ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,recommendation=EXCLUDED.recommendation,confidence=EXCLUDED.confidence,engine_version=EXCLUDED.engine_version,reviewed_at=EXCLUDED.reviewed_at,reviewed_by_user_id=EXCLUDED.reviewed_by_user_id,source_payload=EXCLUDED.source_payload`,
          [recommendation.id, recommendation.ticketId, recommendation.status || 'PENDING_REVIEW', json({ ...recommendation, id: undefined, ticketId: undefined, status: undefined, confidence: undefined, engineVersion: undefined, requiresHumanConfirmation: undefined, createdAt: undefined, reviewedAt: undefined, reviewedByUserId: undefined }), Math.max(0, Math.min(1, numberValue(recommendation.confidence))), recommendation.engineVersion || 'unknown', iso(recommendation.createdAt), recommendation.reviewedAt ? iso(recommendation.reviewedAt) : null, userIds.has(recommendation.reviewedByUserId) ? recommendation.reviewedByUserId : null, json(recommendation)]
        );
      }
      for (let index = 0; index < (data.auditEvents || []).length; index++) {
        const event = data.auditEvents![index];
        if (!changed('auditEvents', event as RecordValue, index)) continue;
        await client.query(
          `INSERT INTO audit_events(id,event_type,action,actor_id,actor_name,actor_role,ip_address,user_agent,entity_type,entity_id,timestamp,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT(id) DO UPDATE SET action=EXCLUDED.action,source_payload=EXCLUDED.source_payload`,
          [event.id, event.action || 'LEGACY_EVENT', event.action || 'LEGACY_EVENT', event.actorId || 'usr-system-admin', event.actorName || 'System Administrator', event.actorRole || null, event.ipAddress || null, event.userAgent || null, event.entityType || 'SYSTEM', event.entityId || event.id, iso(event.timestamp), json(event)]
        );
      }

      const connectionRecords = data.connections || [];
      const connectionIds = new Set(connectionRecords.map((connection) => connection.id));
      if (connectionIds.size === 0) {
        await client.query('UPDATE department_connections SET deleted_at=NOW(),updated_at=NOW() WHERE deleted_at IS NULL');
      } else {
        await client.query('UPDATE department_connections SET deleted_at=NOW(),updated_at=NOW() WHERE deleted_at IS NULL AND NOT (id = ANY($1::text[]))', [[...connectionIds]]);
      }
      for (let index = 0; index < connectionRecords.length; index++) {
        const connection = connectionRecords[index];
        if (!changed('connections', connection as RecordValue, index)) continue;
        if (!departmentIds.has(connection.departmentId)) continue;
        await client.query(
          `INSERT INTO department_connections(id,department_id,name,type,provider,endpoint_url,auth_type,status,last_sync_at,latency_ms,health_score,sync_frequency_minutes,description,config_summary,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb)
           ON CONFLICT(id) DO UPDATE SET department_id=EXCLUDED.department_id,name=EXCLUDED.name,type=EXCLUDED.type,provider=EXCLUDED.provider,endpoint_url=EXCLUDED.endpoint_url,auth_type=EXCLUDED.auth_type,status=EXCLUDED.status,last_sync_at=EXCLUDED.last_sync_at,latency_ms=EXCLUDED.latency_ms,health_score=EXCLUDED.health_score,sync_frequency_minutes=EXCLUDED.sync_frequency_minutes,description=EXCLUDED.description,config_summary=EXCLUDED.config_summary,source_payload=EXCLUDED.source_payload,deleted_at=NULL,updated_at=NOW()`,
          [connection.id, connection.departmentId, connection.name, connection.type, connection.provider, connection.endpointUrl, connection.authType, connection.status, connection.lastSyncAt ? iso(connection.lastSyncAt) : null, connection.latencyMs ?? null, connection.healthScore ?? null, connection.syncFrequencyMinutes || 0, connection.description || '', json(connection.configSummary || {}), json(connection)]
        );
      }

      const relational = new Set(['divisions','departments','teams','users','assets','applications','cmdbTypes','cmdbRelationshipTypes','configurationItems','ciRelationships','ciRecordLinks','slaPolicies','workflows','tickets','approvals','comments','attachments','auditEvents','connections','ticketRelationships','ticketTasks','ticketWorklogs','ticketSlaInstances','ticketSatisfaction','ticketAiRecommendations']);
      for (const [collection, value] of Object.entries(data)) {
        if (relational.has(collection) || !Array.isArray(value)) continue;
        const records = value as RecordValue[];
        const recordIds = records.map((record, index) => recordId(record, index));
        if (recordIds.length === 0) {
          await client.query('DELETE FROM legacy_json_records WHERE collection = $1', [collection]);
        } else {
          await client.query(
            'DELETE FROM legacy_json_records WHERE collection = $1 AND NOT (record_id = ANY($2::text[]))',
            [collection, recordIds]
          );
        }
        for (let index = 0; index < records.length; index++) {
          const record = records[index];
          if (!changed(collection, record, index)) continue;
          await client.query(
            `INSERT INTO legacy_json_records(collection,record_id,payload,source_checksum) VALUES($1,$2,$3::jsonb,$4)
             ON CONFLICT(collection,record_id) DO UPDATE SET payload=EXCLUDED.payload,source_checksum=EXCLUDED.source_checksum,imported_at=NOW()`,
            [collection, recordId(record, index), json(record), 'runtime-projection']
          );
        }
      }
    });
    this.persistedHashes = nextHashes;
  }
}
