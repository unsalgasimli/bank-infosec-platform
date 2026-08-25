import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { classifyDirectoryAccount } from '../services/ldap-directory.data.js';

type DirectoryUserRow = {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  sam_account_name: string | null;
  user_principal_name: string | null;
  distinguished_name: string | null;
  source_payload: Record<string, unknown> | null;
};

const apply = process.argv.includes('--apply');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const client = await pool.connect();
  try {
    const result = await client.query<DirectoryUserRow>(
      `SELECT id, username, email, first_name, last_name, full_name, title, sam_account_name, user_principal_name, distinguished_name, source_payload
         FROM bank_users
        WHERE directory_source = 'ACTIVE_DIRECTORY'
        ORDER BY username`,
    );
    const candidates = result.rows
      .map((row) => ({
        row,
        accountType: classifyDirectoryAccount({
          username: row.username,
          sAMAccountName: row.sam_account_name || row.username,
          userPrincipalName: row.user_principal_name || undefined,
          mail: row.email,
          givenName: row.first_name,
          sn: row.last_name,
          fullName: row.full_name,
          title: row.title,
          distinguishedName: row.distinguished_name || undefined,
        }),
      }))
      .filter((candidate) => candidate.accountType !== 'HUMAN');

    const summary = {
      scanned: result.rowCount || 0,
      nonHumanCandidates: candidates.length,
      candidates: candidates.map(({ row, accountType }) => ({ id: row.id, username: row.username, accountType })),
    };

    if (!apply) {
      console.log(JSON.stringify({ ...summary, applied: false }, null, 2));
      process.exitCode = 0;
    } else {
      let deleted = 0;
      let archivedBecauseReferenced = 0;
      await client.query('BEGIN');
      for (const { row, accountType } of candidates) {
        const savepoint = `nonhuman_${deleted + archivedBecauseReferenced}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        try {
          const removed = await client.query('DELETE FROM bank_users WHERE id = $1', [row.id]);
          if (removed.rowCount === 1) deleted++;
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch {
          // Reporter/audit/workflow foreign keys can legally retain an old
          // identity. Never corrupt that history merely to remove a directory
          // account: archive it and remove it from every active hierarchy.
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(
            `UPDATE bank_users
                SET is_active = FALSE, department_id = NULL, section_id = NULL,
                    source_payload = coalesce(source_payload, '{}'::jsonb) || $2::jsonb,
                    updated_at = NOW()
              WHERE id = $1`,
            [row.id, JSON.stringify({ directoryAccountType: accountType, organizationEligible: false, directoryCleanup: { action: 'ARCHIVED_BECAUSE_REFERENCED', at: new Date().toISOString() } })],
          );
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          archivedBecauseReferenced++;
        }
      }
      await client.query(
        `INSERT INTO audit_events(id, event_type, action, actor_id, actor_name, actor_role, ip_address, user_agent, entity_type, entity_id, after_state, timestamp, source_payload)
         VALUES ($1, 'ADMIN_CONFIG_CHANGED', 'NON_HUMAN_DIRECTORY_USERS_PRUNED', 'SYSTEM', 'Directory cleanup', 'SYSTEM', 'local-administration', 'non-human directory cleanup', 'DIRECTORY', 'active-ad-projection', $2::jsonb, NOW(), $3::jsonb)`,
        [
          `aud-${randomUUID()}`,
          JSON.stringify({ deleted, archivedBecauseReferenced, candidates: candidates.map(({ row }) => row.id) }),
          JSON.stringify({ strategy: 'delete unreferenced accounts; archive identities with protected references' }),
        ],
      );
      await client.query('COMMIT');
      console.log(JSON.stringify({ ...summary, applied: true, deleted, archivedBecauseReferenced }, null, 2));
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
