import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { classifyDirectoryAccount, getDepartmentColor, getDepartmentIcon, mapDepartment } from '../services/ldap-directory.data.js';

type DirectoryRow = {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  department_id: string | null;
  section_id: string | null;
  distinguished_name: string | null;
  distribution_groups: string[];
};

type HumanPlacement = {
  id: string;
  accountType: 'HUMAN';
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  divisionId: string;
  sectionId?: string;
  sectionName?: string;
  sectionCode?: string;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const actorUsername = argument('--actor')?.toLowerCase();
const dryRun = process.argv.includes('--dry-run');
if (!actorUsername || !/^[a-z0-9._-]{1,64}$/.test(actorUsername)) {
  throw new Error('Usage: tsx src/server/scripts/reconcile-ad-section-projection.ts --actor <platform-admin> [--dry-run]');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const client = await pool.connect();
  try {
    const users = await client.query<DirectoryRow>(
      `SELECT id, username, email, first_name, last_name, full_name, title, department_id, section_id, distinguished_name, distribution_groups
         FROM bank_users
        WHERE is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'`,
    );
    const accountTypes = new Map<string, string>();
    const placements: HumanPlacement[] = [];
    for (const row of users.rows) {
      const accountType = classifyDirectoryAccount({
        username: row.username,
        sAMAccountName: row.username,
        mail: row.email,
        givenName: row.first_name,
        sn: row.last_name,
        fullName: row.full_name,
        title: row.title,
        distinguishedName: row.distinguished_name || '',
      });
      accountTypes.set(row.id, accountType);
      if (accountType !== 'HUMAN') continue;
      // memberOf is intentionally empty for placement: it grants access only.
      const mapping = mapDepartment(row.department_id || '', row.title, [], row.distinguished_name || '');
      placements.push({
        id: row.id,
        accountType,
        departmentId: mapping.departmentId,
        departmentName: mapping.departmentName,
        departmentCode: mapping.departmentCode,
        divisionId: mapping.divisionId,
        sectionId: mapping.sectionId,
        sectionName: mapping.sectionName,
        sectionCode: mapping.sectionCode,
      });
    }

    const classificationCounts = Object.fromEntries(Array.from(accountTypes.values()).reduce((counts, kind) => {
      counts.set(kind, (counts.get(kind) || 0) + 1);
      return counts;
    }, new Map<string, number>()));
    const summary = {
      scanned: users.rowCount || 0,
      humanMembers: placements.length,
      excludedAccounts: (users.rowCount || 0) - placements.length,
      classifications: classificationCounts,
      departments: new Set(placements.map((placement) => placement.departmentId)).size,
      sections: new Set(placements.map((placement) => placement.sectionId).filter(Boolean)).size,
    };

    if (dryRun) {
      console.log(JSON.stringify({ ...summary, applied: false }, null, 2));
      process.exitCode = 0;
    } else {
      await client.query('BEGIN');
      const actor = await client.query(
        `SELECT id, full_name, roles FROM bank_users
          WHERE lower(username) = $1 AND is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'
          FOR UPDATE`,
        [actorUsername],
      );
      if (actor.rowCount !== 1 || !actor.rows[0].roles.includes('PLATFORM_ADMIN')) {
        throw new Error('A single active Active Directory PLATFORM_ADMIN actor is required.');
      }

      // Retain old records for audit/history, but remove every previous AD
      // branch from selectable organisation state before rebuilding it.
      await client.query(`UPDATE bank_department_sections SET is_active = FALSE, updated_at = NOW() WHERE coalesce(source_payload->>'directorySource', 'ACTIVE_DIRECTORY') = 'ACTIVE_DIRECTORY'`);
      await client.query(`UPDATE bank_departments SET is_active = FALSE, updated_at = NOW() WHERE directory_source = 'ACTIVE_DIRECTORY'`);

      for (const department of new Map(placements.map((item) => [item.departmentId, item])).values()) {
        await client.query(
          `INSERT INTO bank_departments(id, division_id, code, name, description, color, icon, is_active, settings, directory_source, source_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8::jsonb, 'ACTIVE_DIRECTORY', $9::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             division_id = EXCLUDED.division_id, name = EXCLUDED.name, description = EXCLUDED.description,
             color = EXCLUDED.color, icon = EXCLUDED.icon, is_active = TRUE, directory_source = 'ACTIVE_DIRECTORY',
             source_payload = coalesce(bank_departments.source_payload, '{}'::jsonb) || EXCLUDED.source_payload,
             updated_at = NOW()`,
          [
            department.departmentId, department.divisionId, department.departmentCode, department.departmentName,
            `${department.departmentName} - Active Directory organisational branch`,
            getDepartmentColor(department.departmentName), getDepartmentIcon(department.departmentName),
            JSON.stringify({ defaultSlaHours: 24, criticalSlaHours: 4, autoAssignEnabled: true, requireDualApproval: false }),
            JSON.stringify({ id: department.departmentId, divisionId: department.divisionId, name: department.departmentName, code: department.departmentCode, isActive: true, directorySource: 'ACTIVE_DIRECTORY' }),
          ],
        );
      }

      for (const section of new Map(placements.filter((item) => item.sectionId && item.sectionName && item.sectionCode).map((item) => [item.sectionId!, item])).values()) {
        await client.query(
          `INSERT INTO bank_department_sections(id, department_id, code, name, is_active, source_payload)
           VALUES ($1, $2, $3, $4, TRUE, $5::jsonb)
           ON CONFLICT (id) DO UPDATE SET department_id = EXCLUDED.department_id, code = EXCLUDED.code,
             name = EXCLUDED.name, is_active = TRUE,
             source_payload = coalesce(bank_department_sections.source_payload, '{}'::jsonb) || EXCLUDED.source_payload,
             updated_at = NOW()`,
          [section.sectionId, section.departmentId, section.sectionCode, section.sectionName, JSON.stringify({ id: section.sectionId, departmentId: section.departmentId, name: section.sectionName, code: section.sectionCode, isActive: true, directorySource: 'ACTIVE_DIRECTORY' })],
        );
      }

      for (const row of users.rows) {
        const placement = placements.find((item) => item.id === row.id);
        const accountType = accountTypes.get(row.id)!;
        const patch = placement
          ? { departmentId: placement.departmentId, sectionId: placement.sectionId || null, directoryAccountType: accountType, organizationEligible: true }
          : { departmentId: null, sectionId: null, directoryAccountType: accountType, organizationEligible: false };
        await client.query(
          `UPDATE bank_users SET department_id = $2::varchar, section_id = $3::varchar,
             source_payload = coalesce(source_payload, '{}'::jsonb) || $4::jsonb, updated_at = NOW()
           WHERE id = $1 AND is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY'`,
          [row.id, patch.departmentId, patch.sectionId, JSON.stringify(patch)],
        );
      }

      await client.query(
        `INSERT INTO audit_events(id, event_type, action, actor_id, actor_name, actor_role, ip_address, user_agent, entity_type, entity_id, after_state, timestamp, source_payload)
         VALUES ($1, 'ADMIN_CONFIG_CHANGED', 'DIRECTORY_TREE_REBUILT', $2, $3, 'PLATFORM_ADMIN', 'local-administration', 'directory tree rebuild', 'DIRECTORY', 'active-ad-projection', $4::jsonb, NOW(), $5::jsonb)`,
        [`aud-${randomUUID()}`, actor.rows[0].id, actor.rows[0].full_name, JSON.stringify(summary), JSON.stringify({ strategy: 'identity classification; DN/title placement; groups are access-only' })],
      );
      await client.query('COMMIT');
      console.log(JSON.stringify({ ...summary, applied: true }, null, 2));
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
