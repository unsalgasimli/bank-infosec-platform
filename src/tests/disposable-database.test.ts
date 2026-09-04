import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposableDatabase } from './fixtures/disposable-database.js';

test('disposable database guard verifies server identity before allowing fixture writes', async () => {
  const statements: string[] = [];
  const client = (database: string) => ({ query: async (sql: string) => { statements.push(sql); return { rows: [{ database }] }; } });
  await assert.rejects(assertDisposableDatabase(client('bank_infosec_db'), 'bank_integration_123'), /Connected database differs/);
  await assert.rejects(assertDisposableDatabase(client('bank_integration_other'), 'bank_integration_123'), /Connected database differs/);
  await assert.rejects(assertDisposableDatabase(client('contest'), 'contest'), /explicitly named disposable/);
  await assert.doesNotReject(assertDisposableDatabase(client('bank_integration_123'), 'bank_integration_123'));
  assert.ok(statements.every((sql) => sql === 'SELECT current_database() AS database'));
});
