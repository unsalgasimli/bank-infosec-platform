import { pgClient } from '../src/server/db/postgres/client.js';

async function main() {
  const cols = await pgClient.query("SELECT column_name FROM information_schema.columns WHERE table_name='bank_users'");
  console.log('Columns:', cols.rows.map((r: any) => r.column_name));

  const users = await pgClient.query("SELECT id, username, roles, is_active FROM bank_users WHERE is_active=true LIMIT 20");
  console.log('Users:', users.rows);
  process.exit(0);
}

main().catch(console.error);
