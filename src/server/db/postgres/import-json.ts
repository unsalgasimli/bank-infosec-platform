import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pgClient } from './client.js';
import { isServiceAccount, normalizeDirectoryKey, normalizeDirectoryText } from '../../services/ldap-directory.data.js';
import { logger } from '../../services/logger.service.js';

type JsonRecord = Record<string, any>;
type ImportDatabase = Record<string, JsonRecord[]>;

const sourceArgument = process.argv.find((argument) => argument.startsWith('--source='))?.slice('--source='.length);
const configuredSource = sourceArgument || process.env.JSON_IMPORT_SOURCE;
const sourcePath = configuredSource ? path.resolve(process.cwd(), configuredSource) : null;
const isApply = process.argv.includes('--apply');

function readSource(): { raw: string; data: ImportDatabase; checksum: string } {
  if (!sourcePath) throw new Error('JSON_IMPORT_SOURCE or --source=<path> is required for a one-time import.');
  if (!fs.existsSync(sourcePath)) throw new Error(`JSON source not found: ${sourcePath}`);
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return { raw, data: JSON.parse(raw) as ImportDatabase, checksum: crypto.createHash('sha256').update(raw).digest('hex') };
}

function rows(data: ImportDatabase, collection: string): JsonRecord[] {
  return Array.isArray(data[collection]) ? data[collection] : [];
}

function nullable(value: unknown): string | null {
  const normalized = normalizeDirectoryText(value);
  return normalized || null;
}

function iso(value: unknown, fallback = new Date().toISOString()): string {
  const candidate = normalizeDirectoryText(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : fallback;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function splitName(fullName: unknown): { firstName: string; lastName: string; fullName: string } {
  const full = normalizeDirectoryText(fullName) || 'Unknown User';
  const parts = full.split(' ').filter(Boolean);
  return { fullName: full, firstName: parts[0] || 'Unknown', lastName: parts.slice(1).join(' ') || parts[0] || 'User' };
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

function assertUnique(records: JsonRecord[], field: string, collection: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    const value = normalizeDirectoryKey(record[field]);
    if (!value) throw new Error(`${collection}.${field} is required for record ${record.id || '<unknown>'}`);
    if (seen.has(value)) throw new Error(`Duplicate ${collection}.${field}: ${value}`);
    seen.add(value);
  }
}

function validate(data: ImportDatabase): { users: JsonRecord[]; departments: JsonRecord[]; tickets: JsonRecord[] } {
  const users = rows(data, 'users').filter((user) => !isServiceAccount(user));
  const departments = rows(data, 'departments');
  const tickets = rows(data, 'tickets');
  assertUnique(users, 'id', 'users');
  assertUnique(users, 'username', 'users');
  assertUnique(users, 'email', 'users');
  assertUnique(departments, 'id', 'departments');
  assertUnique(tickets, 'id', 'tickets');
  assertUnique(tickets, 'key', 'tickets');

  const userIds = new Set(users.map((user) => user.id));
  const departmentIds = new Set(departments.map((department) => department.id));
  const ticketIds = new Set(tickets.map((ticket) => ticket.id));
  const errors: string[] = [];
  for (const ticket of tickets) {
    if (!userIds.has(ticket.reporterId)) errors.push(`ticket ${ticket.id}: missing reporter ${ticket.reporterId}`);
    if (ticket.departmentId && !departmentIds.has(ticket.departmentId)) errors.push(`ticket ${ticket.id}: missing department ${ticket.departmentId}`);
    if (ticket.parentTicketId && !ticketIds.has(ticket.parentTicketId)) errors.push(`ticket ${ticket.id}: missing parent ${ticket.parentTicketId}`);
  }
  if (errors.length) throw new Error(`Source validation failed:\n${errors.slice(0, 20).join('\n')}`);
  return { users, departments, tickets };
}

async function importJson(): Promise<void> {
  const source = readSource();
  const validated = validate(source.data);
  const allCollections = Object.keys(source.data).filter((key) => Array.isArray(source.data[key]));
  const serviceExcluded = rows(source.data, 'users').length - validated.users.length;

  logger.info({
    mode: isApply ? 'APPLY' : 'DRY_RUN', source: sourcePath, sourceChecksum: source.checksum,
    users: validated.users.length, serviceAccountsExcluded: serviceExcluded,
    departments: validated.departments.length, tickets: validated.tickets.length,
    auditEvents: rows(source.data, 'auditEvents').length, collections: allCollections.length,
  }, 'Validated JSON to PostgreSQL import plan');
  if (!isApply) return;

  await pgClient.transaction(async (client) => {
    const divisionRows = new Map<string, JsonRecord>();
    for (const record of [...validated.departments, ...validated.users]) {
      if (record.divisionId && !divisionRows.has(record.divisionId)) divisionRows.set(record.divisionId, { id: record.divisionId, code: record.divisionId, name: record.divisionId });
    }
    const divisionCodes = new Set<string>();
    // A previous interrupted/imported snapshot may already contain a code that
    // another incoming record needs. Stage the source IDs first so code
    // normalization and legitimate swaps remain atomic inside this transaction.
    if (divisionRows.size > 0) {
      await client.query(
        `UPDATE bank_divisions SET code = CONCAT('__IMPORT_', LEFT(MD5(id), 23)) WHERE id = ANY($1::text[])`,
        [[...divisionRows.keys()]]
      );
    }
    for (const division of divisionRows.values()) {
      await client.query(
        `INSERT INTO bank_divisions(id, code, name, source_payload) VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [division.id, safeCode(division.code, division.id, divisionCodes), division.name, json(division)]
      );
    }

    const departmentCodes = new Set<string>();
    const departmentIds = new Set(validated.departments.map((item) => item.id));
    if (departmentIds.size > 0) {
      await client.query(
        `UPDATE bank_departments SET code = CONCAT('__IMPORT_', LEFT(MD5(id), 23)) WHERE id = ANY($1::text[])`,
        [[...departmentIds]]
      );
    }
    for (const department of validated.departments) {
      await client.query(
        `INSERT INTO bank_departments(id,division_id,code,name,description,manager_id,admin_user_ids,color,icon,is_active,settings,directory_source,source_payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13::jsonb)
         ON CONFLICT(id) DO UPDATE SET division_id=EXCLUDED.division_id,code=EXCLUDED.code,name=EXCLUDED.name,description=EXCLUDED.description,manager_id=EXCLUDED.manager_id,admin_user_ids=EXCLUDED.admin_user_ids,color=EXCLUDED.color,icon=EXCLUDED.icon,is_active=EXCLUDED.is_active,settings=EXCLUDED.settings,directory_source=EXCLUDED.directory_source,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [department.id, department.divisionId, safeCode(department.code, department.id, departmentCodes), normalizeDirectoryText(department.name) || department.id, department.description || '', department.managerId || null, json(department.adminUserIds || []), department.color || null, department.icon || null, department.isActive !== false, json(department.settings || {}), department.directorySource || null, json(department)]
      );
    }

    const teamIds = new Set<string>();
    const sectionRows = rows(source.data, 'departmentSections');
    const sectionIds = new Set<string>();
    for (const section of sectionRows) {
      if (!section.id || !section.departmentId || !departmentIds.has(section.departmentId)) continue;
      sectionIds.add(section.id);
      await client.query(
        `INSERT INTO bank_department_sections(id,department_id,code,name,manager_id,is_active,source_payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT(id) DO UPDATE SET department_id=EXCLUDED.department_id,code=EXCLUDED.code,name=EXCLUDED.name,manager_id=EXCLUDED.manager_id,is_active=EXCLUDED.is_active,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [section.id, section.departmentId, safeCode(section.code, section.id, new Set<string>()), normalizeDirectoryText(section.name) || section.id, section.managerId || null, section.isActive !== false, json(section)]
      );
    }
    for (const team of rows(source.data, 'teams')) {
      if (!team.id || !team.departmentId || !departmentIds.has(team.departmentId)) continue;
      teamIds.add(team.id);
      await client.query(
        `INSERT INTO bank_teams(id,department_id,name,email,source_payload) VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT(id) DO UPDATE SET department_id=EXCLUDED.department_id,name=EXCLUDED.name,email=EXCLUDED.email,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [team.id, team.departmentId, normalizeDirectoryText(team.name) || team.id, normalizeDirectoryKey(team.email) || `${team.id}@invalid.local`, json(team)]
      );
    }

    const divisionIds = new Set(Array.from(divisionRows.keys()));
    const userIds = new Set(validated.users.map((user) => user.id));
    for (const user of validated.users) {
      const name = splitName(user.fullName);
      await client.query(
        `INSERT INTO bank_users(id,username,email,first_name,last_name,full_name,title,department_id,section_id,division_id,security_clearance,is_active,last_login_at,roles,team_ids,owned_application_ids,owned_risk_ids,sam_account_name,user_principal_name,distinguished_name,ldap_domain,ldap_bind_status,distribution_groups,directory_source,source_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19,$20,$21,$22,$23::jsonb,$24,$25::jsonb)
         ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,full_name=EXCLUDED.full_name,title=EXCLUDED.title,department_id=EXCLUDED.department_id,section_id=EXCLUDED.section_id,division_id=EXCLUDED.division_id,security_clearance=EXCLUDED.security_clearance,is_active=EXCLUDED.is_active,roles=EXCLUDED.roles,team_ids=EXCLUDED.team_ids,owned_application_ids=EXCLUDED.owned_application_ids,owned_risk_ids=EXCLUDED.owned_risk_ids,sam_account_name=EXCLUDED.sam_account_name,user_principal_name=EXCLUDED.user_principal_name,distinguished_name=EXCLUDED.distinguished_name,ldap_domain=EXCLUDED.ldap_domain,ldap_bind_status=EXCLUDED.ldap_bind_status,distribution_groups=EXCLUDED.distribution_groups,directory_source=EXCLUDED.directory_source,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [user.id, normalizeDirectoryKey(user.username), normalizeDirectoryKey(user.email), name.firstName, name.lastName, name.fullName, normalizeDirectoryText(user.title) || 'Bank Specialist', departmentIds.has(user.departmentId) ? user.departmentId : null, sectionIds.has(user.sectionId) ? user.sectionId : null, divisionIds.has(user.divisionId) ? user.divisionId : null, user.securityClearance || 'INTERNAL', Boolean(user.isActive), user.lastLdapLoginAt ? iso(user.lastLdapLoginAt) : null, json(user.roles || []), json(user.teamIds || []), json(user.ownedApplicationIds || []), json(user.ownedRiskIds || []), normalizeDirectoryKey(user.sAMAccountName || user.username), nullable(user.userPrincipalName), nullable(user.distinguishedName), nullable(user.ldapDomain), nullable(user.ldapBindStatus), json(user.distributionGroups || []), nullable(user.directorySource), json(user)]
      );
    }

    const policyIds = new Set<string>();
    for (const policy of rows(source.data, 'slaPolicies')) {
      policyIds.add(policy.id);
      await client.query(
        `INSERT INTO sla_policies(id,name,description,is_active,is_default,rules,business_hours,source_payload) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
         ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=EXCLUDED.is_active,is_default=EXCLUDED.is_default,rules=EXCLUDED.rules,business_hours=EXCLUDED.business_hours,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [policy.id, policy.name || policy.id, policy.description || '', policy.isActive !== false, Boolean(policy.isDefault), json(policy.thresholds || policy.rules || []), json(policy.businessHours || policy), json(policy)]
      );
    }

    const workflowIds = new Set(validated.tickets.map((ticket) => ticket.workflowId).filter(Boolean));
    for (const workflow of rows(source.data, 'workflows')) workflowIds.add(workflow.id);
    for (const workflowId of workflowIds) {
      const workflow = rows(source.data, 'workflows').find((item) => item.id === workflowId);
      await client.query(
        `INSERT INTO workflows(id,name,description,project_code,version,is_active,initial_state_id,states,transitions,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)
         ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
        [workflowId, workflow?.name || workflowId, workflow?.description || 'Imported workflow placeholder', workflow?.projectCode || 'SEC', workflow?.version || 1, workflow?.isActive !== false, workflow?.initialStateId || 'OPEN', json(workflow?.states || []), json(workflow?.transitions || []), json(workflow || { id: workflowId, importedPlaceholder: true })]
      );
    }

    const ticketIds = new Set(validated.tickets.map((ticket) => ticket.id));
    const ticketById = new Map(validated.tickets.map((ticket) => [ticket.id, ticket]));
    const orderedTickets: JsonRecord[] = [];
    const visitedTickets = new Set<string>();
    const appendTicket = (ticket: JsonRecord): void => {
      if (visitedTickets.has(ticket.id)) return;
      if (ticket.parentTicketId && ticketById.has(ticket.parentTicketId)) appendTicket(ticketById.get(ticket.parentTicketId)!);
      visitedTickets.add(ticket.id);
      orderedTickets.push(ticket);
    };
    for (const ticket of validated.tickets) appendTicket(ticket);
    for (const ticket of orderedTickets) {
      const createdAt = iso(ticket.createdAt);
      const dueDate = iso(ticket.dueDate, createdAt);
      const remediationDeadline = iso(ticket.remediationDeadline, dueDate);
      const userRef = (id: unknown) => id && userIds.has(id as string) ? id : null;
      await client.query(
        `INSERT INTO tickets(id,key,project_code,ticket_type_id,ticket_type_name,category,security_domain,title,description,status_id,status_name,status_category,workflow_id,workflow_version,technical_severity,business_priority,business_impact,inherent_risk,residual_risk,risk_score,cvss_score,cvss_vector,confidentiality,restricted_user_ids,restricted_team_ids,reporter_id,assignee_id,security_owner_id,department_id,watcher_ids,finding_details,incident_details,exception_details,custom_fields,tags,detected_at,created_at,updated_at,assigned_at,acknowledged_at,first_response_at,due_date,remediation_deadline,resolved_at,closed_at,reopened_at,sla_policy_id,sla_state,sla_paused_reason,sla_remaining_minutes,version,requester_id,on_behalf_of_user_id,assignment_group_id,owner_id,parent_ticket_id,source_payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb,$26,$27,$28,$29,$30::jsonb,$31::jsonb,$32::jsonb,$33::jsonb,$34::jsonb,$35::jsonb,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57::jsonb)
         ON CONFLICT(id) DO UPDATE SET key=EXCLUDED.key,title=EXCLUDED.title,description=EXCLUDED.description,status_id=EXCLUDED.status_id,status_name=EXCLUDED.status_name,status_category=EXCLUDED.status_category,updated_at=EXCLUDED.updated_at,version=EXCLUDED.version,source_payload=EXCLUDED.source_payload`,
        [ticket.id, ticket.key, ticket.projectCode || 'SEC', ticket.ticketTypeId || ticket.category || 'GENERAL_TASK', ticket.ticketTypeName || 'Security Ticket', ticket.category || 'GENERAL_TASK', ticket.securityDomain || 'GENERAL_INFOSEC', ticket.title || 'Imported ticket', ticket.description || '', ticket.statusId || 'OPEN', ticket.statusName || 'Open', ticket.statusCategory || 'TO_DO', ticket.workflowId || 'wf-imported', ticket.workflowVersion || 1, ticket.technicalSeverity || 'MEDIUM', ticket.businessPriority || 'P3_MEDIUM', ticket.businessImpact || 'MODERATE', ticket.inherentRisk || 'MEDIUM', ticket.residualRisk || 'LOW', ticket.riskScore ?? 0, ticket.cvssScore ?? null, ticket.cvssVector || null, ticket.confidentiality || 'INTERNAL', json(ticket.restrictedUserIds || []), json(ticket.restrictedTeamIds || []), ticket.reporterId, userRef(ticket.assigneeId), userRef(ticket.securityOwnerId), departmentIds.has(ticket.departmentId) ? ticket.departmentId : null, json(ticket.watcherIds || []), json(ticket.findingDetails || null), json(ticket.incidentDetails || null), json(ticket.exceptionDetails || null), json(ticket.customFields || []), json(ticket.tags || []), iso(ticket.detectedAt, createdAt), createdAt, iso(ticket.updatedAt, createdAt), ticket.assignedAt ? iso(ticket.assignedAt) : null, ticket.acknowledgedAt ? iso(ticket.acknowledgedAt) : null, ticket.firstResponseAt ? iso(ticket.firstResponseAt) : null, dueDate, remediationDeadline, ticket.resolvedAt ? iso(ticket.resolvedAt) : null, ticket.closedAt ? iso(ticket.closedAt) : null, ticket.reopenedAt ? iso(ticket.reopenedAt) : null, policyIds.has(ticket.slaPolicyId) ? ticket.slaPolicyId : null, ticket.slaState || 'SAFE', ticket.slaPausedReason || null, ticket.slaRemainingMinutes ?? null, ticket.version || 1, userRef(ticket.requesterId), userRef(ticket.onBehalfOfUserId), null, userRef(ticket.ownerId), ticketIds.has(ticket.parentTicketId) ? ticket.parentTicketId : null, json(ticket)]
      );
    }

    // Comments are ticket history, not expendable legacy payload. Keep them in
    // the transactional relational projection and remove any earlier
    // compatibility copies so a restart cannot hydrate duplicates.
    await client.query(`DELETE FROM legacy_json_records WHERE collection = 'comments'`);
    for (const comment of rows(source.data, 'comments')) {
      if (!ticketIds.has(comment.ticketId) || !userIds.has(comment.authorId)) continue;
      await client.query(
        `INSERT INTO ticket_comments(id,ticket_id,author_id,content,visibility,is_audit_note,is_resolution_summary,created_at,updated_at,source_payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,visibility=EXCLUDED.visibility,updated_at=EXCLUDED.updated_at,source_payload=EXCLUDED.source_payload`,
        [comment.id, comment.ticketId, comment.authorId, comment.content || '', comment.visibility || 'ALL', Boolean(comment.isAuditNote), Boolean(comment.isResolutionSummary), iso(comment.createdAt), iso(comment.updatedAt, iso(comment.createdAt)), json(comment)]
      );
    }

    for (const event of rows(source.data, 'auditEvents')) {
      await client.query(
        `INSERT INTO audit_events(id,event_type,action,actor_id,actor_name,actor_role,ip_address,user_agent,entity_type,entity_id,timestamp,source_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         ON CONFLICT(id) DO UPDATE SET action=EXCLUDED.action,source_payload=EXCLUDED.source_payload`,
        [event.id, event.eventType || event.action || 'LEGACY_EVENT', event.action || 'LEGACY_EVENT', event.actorId || 'usr-system-admin', event.actorName || 'System Administrator', event.actorRole || null, event.ipAddress || null, event.userAgent || null, event.entityType || 'SYSTEM', event.entityId || event.id, iso(event.timestamp), json(event)]
      );
    }

    const mapped = new Set(['divisions','departments','teams','users','slaPolicies','workflows','tickets','comments','auditEvents']);
    for (const collection of allCollections.filter((item) => !mapped.has(item))) {
      for (const record of rows(source.data, collection)) {
        const recordId = normalizeDirectoryText(record.id) || crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex').slice(0, 32);
        await client.query(
          `INSERT INTO legacy_json_records(collection,record_id,payload,source_checksum) VALUES($1,$2,$3::jsonb,$4)
           ON CONFLICT(collection,record_id) DO UPDATE SET payload=EXCLUDED.payload,source_checksum=EXCLUDED.source_checksum,imported_at=NOW()`,
          [collection, recordId, json(record), source.checksum]
        );
      }
    }
  });
  logger.info({ sourceChecksum: source.checksum }, 'Controlled JSON to PostgreSQL import committed successfully.');
}

importJson()
  .catch(async (error) => { logger.error({ error: error instanceof Error ? error.message : error }, 'Controlled JSON to PostgreSQL import failed.'); process.exitCode = 1; })
  .finally(async () => { await pgClient.close(); });
