import assert from 'node:assert/strict';

/** Validate the connected server, not DB_NAME (DATABASE_URL can override it). */
export async function assertDisposableDatabase(
  client: { query: (sql: string) => Promise<{ rows: Array<{ database: string }> }> },
  expectedName: string,
): Promise<void> {
  assert.match(expectedName, /(?:^|_)(?:test|tests|e2e|integration)(?:_|$)/i, 'An explicitly named disposable database is required.');
  const result = await client.query('SELECT current_database() AS database');
  const actualName = result.rows[0]?.database;
  assert.equal(actualName, expectedName, 'Connected database differs from the explicitly selected disposable database. Check DATABASE_URL before running any write test.');
  assert.match(actualName, /(?:^|_)(?:test|tests|e2e|integration)(?:_|$)/i, 'Refusing fixture writes to a non-disposable database.');
}
