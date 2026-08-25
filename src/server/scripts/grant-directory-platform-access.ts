import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const PLATFORM_ROLES = [
  'PLATFORM_ADMIN',
  'CISO',
  'INFOSEC_ADMIN',
  'SECURITY_ANALYST',
  'SOC_ANALYST',
  'APPROVER',
  'REQUESTER',
] as const;
const PLATFORM_CLEARANCE = 'HIGHLY_RESTRICTED_HR_LEGAL';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const username = argument('--username')?.toLowerCase();
if (!username || !/^[a-z0-9._-]{1,64}$/.test(username) || !process.argv.includes('--confirm')) {
  throw new Error('Usage: tsx src/server/scripts/grant-directory-platform-access.ts --username <active-ad-user> --confirm');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      `SELECT id, username, full_name, roles, security_clearance
         FROM bank_users
        WHERE lower(username) = $1
          AND is_active = TRUE
          AND directory_source = 'ACTIVE_DIRECTORY'
        FOR UPDATE`,
      [username],
    );
    if (target.rowCount !== 1) throw new Error('Exactly one active Active Directory user must match the requested username.');

    const user = target.rows[0];
    const update = await client.query(
      `UPDATE bank_users
          SET roles = $1::jsonb,
              security_clearance = $2::varchar,
              source_payload = jsonb_set(
                jsonb_set(coalesce(source_payload, '{}'::jsonb), '{roles}', $1::jsonb, TRUE),
                '{securityClearance}', to_jsonb($2::text), TRUE
              ),
              updated_at = NOW()
        WHERE id = $3
        RETURNING roles, security_clearance`,
      [JSON.stringify(PLATFORM_ROLES), PLATFORM_CLEARANCE, user.id],
    );

    await client.query(
      `INSERT INTO audit_events(
        id, event_type, action, actor_id, actor_name, actor_role,
        ip_address, user_agent, entity_type, entity_id,
        before_state, after_state, timestamp, source_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, NOW(), $13::jsonb)`,
      [
        `aud-${randomUUID()}`,
        'ADMIN_CONFIG_CHANGED',
        'DIRECTORY_PLATFORM_ACCESS_GRANTED',
        user.id,
        user.full_name,
        'PLATFORM_ADMIN',
        'local-administration',
        'directory-platform-access script',
        'USER',
        user.id,
        JSON.stringify({ roles: user.roles, securityClearance: user.security_clearance }),
        JSON.stringify({ roles: update.rows[0].roles, securityClearance: update.rows[0].security_clearance }),
        JSON.stringify({ username, authorization: 'user-directed full access grant' }),
      ],
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({ username, roles: update.rows[0].roles, securityClearance: update.rows[0].security_clearance }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
