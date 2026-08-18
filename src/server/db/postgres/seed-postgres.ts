import { pgClient } from './client.js';
import { initialSeedData } from '../seed.js';
import { logger } from '../../services/logger.service.js';

export async function seedPostgres(): Promise<void> {
  logger.info('🌱 Starting PostgreSQL database seeding for Apex Bank International...');

  try {
    await pgClient.transaction(async (client) => {
      // 1. Seed Divisions
      for (const div of initialSeedData.divisions) {
        await client.query(
          `INSERT INTO bank_divisions (id, code, name, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;`,
          [div.id, div.code, div.name, `${div.name} Division`]
        );
      }

      // 2. Seed Departments
      for (const dept of initialSeedData.departments) {
        await client.query(
          `INSERT INTO bank_departments (id, division_id, code, name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`,
          [dept.id, dept.divisionId, dept.code, dept.name]
        );
      }

      // 3. Seed Teams
      for (const team of initialSeedData.teams) {
        await client.query(
          `INSERT INTO bank_teams (id, department_id, name, email, on_call_schedule)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`,
          [team.id, team.departmentId, team.name, `${team.code.toLowerCase()}@apexbank.int`, '24/7 Follow-the-Sun']
        );
      }

      // 4. Seed Users
      for (const user of initialSeedData.users) {
        await client.query(
          `INSERT INTO bank_users (
            id, username, email, first_name, last_name, title,
            department_id, division_id, security_clearance, is_active,
            roles, team_ids, owned_application_ids, owned_asset_ids
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            roles = EXCLUDED.roles,
            is_active = EXCLUDED.is_active;`,
          [
            user.id,
            user.username,
            user.email,
            user.fullName.split(' ')[0] || user.username,
            user.fullName.split(' ').slice(1).join(' ') || 'BankUser',
            user.title,
            user.departmentId,
            user.divisionId,
            user.securityClearance,
            user.isActive,
            JSON.stringify(user.roles),
            JSON.stringify(user.teamIds),
            JSON.stringify(user.ownedApplicationIds),
            JSON.stringify(user.ownedAssetIds),
          ]
        );
      }

      // 5. Seed Workflows
      for (const wf of initialSeedData.workflows) {
        await client.query(
          `INSERT INTO workflows (id, name, description, project_code, version, is_active, initial_state_id, states, transitions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            states = EXCLUDED.states,
            transitions = EXCLUDED.transitions;`,
          [
            wf.id,
            wf.name,
            wf.description,
            wf.ticketTypeId,
            wf.version,
            wf.isActive,
            wf.states[0]?.id || 'OPEN',
            JSON.stringify(wf.states),
            JSON.stringify(wf.transitions),
          ]
        );
      }

      // 6. Seed SLA Policies
      for (const sla of initialSeedData.slaPolicies) {
        await client.query(
          `INSERT INTO sla_policies (id, name, description, is_active, is_default, rules, business_hours)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
            rules = EXCLUDED.rules,
            business_hours = EXCLUDED.business_hours;`,
          [
            sla.id,
            sla.name,
            sla.description,
            true,
            sla.isDefault,
            JSON.stringify(sla.thresholds),
            JSON.stringify({ businessHoursOnly: sla.businessHoursOnly, timezone: sla.timezone }),
          ]
        );
      }

      // 7. Seed Assets
      for (const asset of initialSeedData.assets) {
        await client.query(
          `INSERT INTO bank_assets (id, tag, name, type, ip_address, fqdn, environment, critical_asset, pci_dss_scope, owner_id, custodian_id, department_id, os)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, ip_address = EXCLUDED.ip_address;`,
          [
            asset.id,
            asset.cmdbId || asset.id,
            asset.name,
            asset.assetType,
            asset.ipAddress || null,
            asset.hostname || null,
            asset.environment,
            asset.criticality === 'TIER_1',
            asset.dataClassification === 'RESTRICTED' || asset.dataClassification === 'CONFIDENTIAL_SECURITY_ONLY',
            asset.ownerId,
            asset.ownerId,
            asset.departmentId,
            'Linux Enterprise RHEL 9 / Hardened',
          ]
        );
      }

      // 8. Seed Applications
      for (const app of initialSeedData.applications) {
        await client.query(
          `INSERT INTO bank_applications (id, code, name, tier, architecture_type, repository_url, technical_owner_id, business_owner_id, department_id, active_cve_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active_cve_count = EXCLUDED.active_cve_count;`,
          [
            app.id,
            app.code,
            app.name,
            app.criticality,
            'Cloud Native Microservices Architecture',
            app.gitRepositories[0] || null,
            app.technicalOwnerId,
            app.businessOwnerId,
            'dept-appdev',
            app.openVulnerabilitiesCount,
          ]
        );
      }

      // 9. Seed Tickets
      for (const t of initialSeedData.tickets) {
        await client.query(
          `INSERT INTO tickets (
            id, key, project_code, ticket_type_id, ticket_type_name, category, security_domain,
            title, description, status_id, status_name, status_category, workflow_id, workflow_version,
            technical_severity, business_priority, business_impact, inherent_risk, residual_risk,
            risk_score, cvss_score, cvss_vector, confidentiality, restricted_user_ids, restricted_team_ids,
            reporter_id, assignee_id, security_owner_id, team_id, department_id, application_id, asset_id,
            risk_owner_id, watcher_ids, finding_details, incident_details, exception_details, custom_fields,
            tags, due_date, remediation_deadline, sla_policy_id, sla_state, sla_breach_deadline,
            sla_remaining_minutes, version, created_at, updated_at
           ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25,
            $26, $27, $28, $29, $30, $31, $32,
            $33, $34, $35, $36, $37, $38,
            $39, $40, $41, $42, $43, $44,
            $45, $46, $47, $48
           )
           ON CONFLICT (id) DO UPDATE SET
            status_id = EXCLUDED.status_id,
            status_name = EXCLUDED.status_name,
            sla_state = EXCLUDED.sla_state;`,
          [
            t.id,
            t.key,
            t.projectCode,
            t.ticketTypeId,
            t.ticketTypeName,
            t.category,
            t.securityDomain,
            t.title,
            t.description,
            t.statusId,
            t.statusName,
            t.statusCategory,
            t.workflowId,
            t.workflowVersion,
            t.technicalSeverity,
            t.businessPriority,
            t.businessImpact,
            t.inherentRisk,
            t.residualRisk,
            t.riskScore,
            t.cvssScore || null,
            t.cvssVector || null,
            t.confidentiality,
            JSON.stringify(t.restrictedUserIds || []),
            JSON.stringify(t.restrictedTeamIds || []),
            t.reporterId,
            t.assigneeId || null,
            t.securityOwnerId || null,
            t.teamId || null,
            t.departmentId || null,
            t.applicationId || null,
            t.assetId || null,
            t.riskOwnerId || null,
            JSON.stringify(t.watcherIds || []),
            t.findingDetails ? JSON.stringify(t.findingDetails) : null,
            t.incidentDetails ? JSON.stringify(t.incidentDetails) : null,
            t.exceptionDetails ? JSON.stringify(t.exceptionDetails) : null,
            JSON.stringify(t.customFields || []),
            JSON.stringify(t.tags || []),
            t.dueDate,
            t.remediationDeadline,
            t.slaPolicyId || null,
            t.slaState,
            t.slaBreachDeadline || null,
            t.slaRemainingMinutes || null,
            t.version,
            t.createdAt,
            t.updatedAt,
          ]
        );
      }

      // 10. Seed Comments
      for (const c of initialSeedData.comments) {
        await client.query(
          `INSERT INTO ticket_comments (id, ticket_id, author_id, content, visibility, is_audit_note, is_resolution_summary, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING;`,
          [c.id, c.ticketId, c.authorId, c.content, c.visibility, false, false, c.createdAt, c.updatedAt || c.createdAt]
        );
      }

      // 11. Seed Approvals
      for (const a of initialSeedData.approvals) {
        await client.query(
          `INSERT INTO ticket_approvals (id, ticket_id, workflow_id, transition_id, status, initiated_by_user_id, initiated_at, steps)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, steps = EXCLUDED.steps;`,
          [a.id, a.ticketId, 'wf-approval', 'tr-submit', a.status, a.steps[0]?.assignedApproverId || 'usr-ciso', a.createdAt, JSON.stringify(a.steps)]
        );
      }

      // 12. Seed Risks
      for (const r of initialSeedData.risks) {
        await client.query(
          `INSERT INTO risk_register_items (id, risk_id, title, description, category, inherent_risk, residual_risk, status, risk_owner_id, mitigation_plan, review_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status;`,
          [r.id, r.riskCode, r.title, r.description, 'Enterprise Cyber Risk', r.inherentRating, r.residualRating, r.status, r.ownerId, r.treatmentPlan, r.treatmentDeadline]
        );
      }

      // 13. Seed KB Articles
      for (const kb of initialSeedData.kbArticles) {
        await client.query(
          `INSERT INTO kb_articles (id, slug, title, summary, content, category, author_id, tags, is_published)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;`,
          [kb.id, kb.slug, kb.title, kb.summary, kb.contentMarkdown, kb.category, 'usr-appsec-lead', JSON.stringify(kb.tags), true]
        );
      }

      // 14. Seed Automation Rules
      for (const ar of initialSeedData.automationRules) {
        await client.query(
          `INSERT INTO automation_rules (id, name, description, is_active, trigger, conditions, actions)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;`,
          [ar.id, ar.name, ar.description, ar.isActive, ar.trigger, JSON.stringify(ar.conditions), JSON.stringify(ar.actions)]
        );
      }
    });

    logger.info('✅ PostgreSQL seeding completed successfully.');
  } catch (error) {
    logger.error({ error }, '❌ PostgreSQL seeding failed.');
    throw error;
  }
}

// Allow direct execution via CLI `npm run db:seed`
if (process.argv[1]?.endsWith('seed-postgres.ts') || process.argv[1]?.endsWith('seed-postgres.js')) {
  seedPostgres()
    .then(async () => {
      await pgClient.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pgClient.close();
      process.exit(1);
    });
}
