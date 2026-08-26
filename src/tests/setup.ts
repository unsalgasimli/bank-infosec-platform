// Tests use the same PostgreSQL projection as the application, but all
// mutations remain process-local because Database.persist() detects the Node
// test runner from argv. Keep the configured development profile intact for
// the explicit LDAP development-bypass contract test.
const { db } = await import('../server/db/database.js');
const { pgClient } = await import('../server/db/postgres/client.js');
const { installPostgresTestFixture } = await import('./fixtures/postgres-fixture.js');
await db.initialize();
installPostgresTestFixture(db.data);
await pgClient.close();

export {};

