// Tests use the same PostgreSQL projection as the application, but all
// mutations remain process-local because Database.persist() detects the Node
// test runner from argv. Keep the configured development profile intact for
// the explicit LDAP development-bypass contract test.
// Hydration fans out many reads. Do not let each test process compete for a
// production-sized pool with the running API/worker/scheduler on this host.
process.env.DB_POOL_MIN ??= '0';
process.env.DB_POOL_MAX ??= '3';
const { db } = await import('../server/db/database.js');
const { pgClient } = await import('../server/db/postgres/client.js');
const { installPostgresTestFixture } = await import('./fixtures/postgres-fixture.js');
await db.initialize();
installPostgresTestFixture(db.data);
await pgClient.close();

export {};
