import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { LDAPSyncService } from '../server/services/ldap-sync.service.js';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';

after(() => pgClient.close());

test('failed LDAP single-flight is observed by callers, resets, and never falls back to unlocked PostgreSQL work', async () => {
  const originalGetPool = pgClient.getPool;
  const originalQuery = LDAPSyncService.queryLdapDirectory;
  const originalDbType = config.DB_TYPE;
  let directoryReads = 0;
  config.DB_TYPE = 'postgres';
  LDAPSyncService.queryLdapDirectory = async () => { directoryReads += 1; throw new Error('controlled directory collection failure'); };
  pgClient.getPool = (() => ({})) as unknown as typeof pgClient.getPool;
  try {
    // With the old returned parent promise, the detached finally promise
    // generated an unhandledRejection after this explicitly handled error.
    await assert.rejects(LDAPSyncService.syncAllUsers(), /controlled directory collection failure/);
    await setImmediate();
    assert.equal(directoryReads, 1);

    const first = LDAPSyncService.syncAllUsers();
    const duplicate = LDAPSyncService.syncAllUsers();
    const outcomes = await Promise.allSettled([first, duplicate]);
    assert.ok(outcomes.every((outcome) => outcome.status === 'rejected'));
    assert.equal(directoryReads, 2, 'Concurrent calls must share one collection attempt');
    await setImmediate();

    pgClient.getPool = () => null;
    await assert.rejects(LDAPSyncService.syncAllUsers(), /cannot acquire its database lock/);
    await setImmediate();
    assert.equal(directoryReads, 2, 'Closed or unavailable pool must prevent an additional directory read');
  } finally {
    pgClient.getPool = originalGetPool;
    LDAPSyncService.queryLdapDirectory = originalQuery;
    config.DB_TYPE = originalDbType;
  }
});
