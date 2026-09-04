import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { db } from '../server/db/database.js';
import { PostgresProjectionRepository as projection } from '../server/db/postgres/projection-repository.js';
import { LDAPSyncService as ldap } from '../server/services/ldap-sync.service.js';
import type { LDAPRawEntry } from '../server/services/ldap-directory.data.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1' && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1';
before(async () => { if (enabled) { await assertDisposableDatabase(pgClient, config.DB_NAME); await db.initialize(); } });
after(() => pgClient.close());
const gate = () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
};

test('LDAP stages privately and commits projection/report/audit together; rollback and late snapshots cannot overwrite committed state', { skip: !enabled }, async () => {
  const username = `ali.valiyev${randomUUID().replace(/-/g, '').slice(0, 8).replace(/\d/g, (digit) => String.fromCharCode(103 + Number(digit)))}`;
  const guid = randomUUID();
  const entry = (title: string): LDAPRawEntry => ({ sAMAccountName: username, displayName: 'Ali Valiyev', givenName: 'Ali', sn: 'Valiyev',
    mail: `${username}@example.invalid`, title, department: 'Information Security', objectGUID: guid, userAccountControl: 512 });
  const originalPersist = projection.persist;
  const originalQuery = ldap.queryLdapDirectory;
  const counts = async () => (await pgClient.query(`SELECT
    (SELECT count(*)::int FROM directory_sync_runs) AS reports,
    (SELECT count(*)::int FROM audit_events WHERE entity_id='ldap-sync-engine') AS audits`)).rows[0];
  const initialCounts = await counts();
  const originalLocal = structuredClone(db.data);
  const previousReport = ldap.getLastSyncReport();
  const ready = gate(); const release = gate();
  projection.persist = async (...args) => {
    assert.ok(args[2]?.client, 'The projection must use the caller transaction');
    await originalPersist.apply(projection, args);
    ready.release(); await release.wait;
  };
  const pending = ldap.syncAllUsers({ mockEntries: [entry('Security Analyst')], trigger: 'MANUAL_TRIGGER' });
  try {
    await Promise.race([ready.wait, pending.then(() => { throw new Error('Sync returned before reaching the staged persistence gate'); })]);
    assert.deepEqual(db.data, originalLocal, 'Other async contexts cannot see staged directory mutations');
    assert.equal(ldap.getLastSyncReport(), previousReport, 'Report is not published before commit');
    assert.deepEqual(await counts(), initialCounts, 'Neither report nor audit is committed early');
    assert.equal((await pgClient.query('SELECT count(*)::int AS n FROM bank_users WHERE username=$1', [username])).rows[0].n, 0);
    await pgClient.transaction(async (client) => {
      const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('aegissec:active-directory-sync',0)) AS acquired");
      assert.equal(lock.rows[0].acquired, false, 'Other commit transactions are excluded');
    });
  } finally { release.release(); }
  const accepted = await pending;
  projection.persist = originalPersist;
  assert.equal(accepted.snapshotAccepted, true);
  assert.ok(db.data.users.some((user) => user.username === username));
  const committed = (await pgClient.query('SELECT id,title,xmin::text AS xid FROM bank_users WHERE username=$1', [username])).rows[0];
  const reportRow = (await pgClient.query('SELECT status,xmin::text AS xid FROM directory_sync_runs WHERE started_at=$1', [accepted.timestamp])).rows[0];
  const auditRow = (await pgClient.query("SELECT xmin::text AS xid FROM audit_events WHERE entity_id='ldap-sync-engine' ORDER BY timestamp DESC LIMIT 1")).rows[0];
  assert.equal(reportRow.status, 'SUCCEEDED');
  assert.equal(committed.xid, reportRow.xid); assert.equal(committed.xid, auditRow.xid, 'All three records share the same PostgreSQL transaction');

  const durableCounts = await counts(); const durableLocal = structuredClone(db.data);
  projection.persist = async (...args) => { await originalPersist.apply(projection, args); await args[2]!.client!.query('SELECT 1/0'); };
  try {
    await assert.rejects(ldap.syncAllUsers({ mockEntries: [entry('Security Manager')] }), (error: any) => error.code === '22012');
  } finally { projection.persist = originalPersist; }
  assert.deepEqual(await counts(), durableCounts);
  assert.deepEqual(db.data, durableLocal, 'Failed transaction does not leak its staged projection');
  assert.equal(ldap.getLastSyncReport(), accepted);
  assert.equal((await pgClient.query('SELECT title FROM bank_users WHERE id=$1', [committed.id])).rows[0].title, committed.title);
  await pgClient.transaction(async (client) => {
    assert.equal((await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('aegissec:active-directory-sync',0)) AS acquired")).rows[0].acquired, true);
  });

  const disconnectReady = gate(); const disconnectRelease = gate(); let ownedBackend = 0;
  projection.persist = async (...args) => {
    await originalPersist.apply(projection, args);
    ownedBackend = Number((await args[2]!.client!.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    disconnectReady.release(); await disconnectRelease.wait;
  };
  const disconnected = ldap.syncAllUsers({ mockEntries: [entry('Disconnected Snapshot')] });
  const disconnectedAssertion = assert.rejects(disconnected);
  try {
    await Promise.race([disconnectReady.wait, disconnected]);
    await assertDisposableDatabase(pgClient, config.DB_NAME);
    const terminated = await pgClient.query(`SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
      WHERE pid=$1 AND datname=current_database() AND pid<>pg_backend_pid()`, [ownedBackend]);
    assert.equal(terminated.rows[0]?.terminated, true, 'Terminate only the transaction owned by this isolated fixture');
    // Observe the server-side end rather than sleeping before releasing work.
    await pgClient.query('SELECT 1');
  } finally { disconnectRelease.release(); await disconnectedAssertion; projection.persist = originalPersist; }
  assert.deepEqual(await counts(), durableCounts);
  assert.deepEqual(db.data, durableLocal);
  assert.equal(ldap.getLastSyncReport(), accepted);
  assert.equal((await pgClient.query('SELECT title FROM bank_users WHERE id=$1', [committed.id])).rows[0].title, committed.title);

  const preview = await ldap.syncAllUsers({ mockEntries: [entry('Security Manager')], dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.deepEqual(db.data, durableLocal);
  assert.equal((await pgClient.query('SELECT title FROM bank_users WHERE id=$1', [committed.id])).rows[0].title, committed.title);

  // Enter the actual core pipeline independently to represent a second worker
  // process; only the process-local single-flight wrapper is intentionally bypassed.
  const perform = (ldap as unknown as { performSync: typeof ldap.syncAllUsers }).performSync.bind(ldap);
  const olderReady = gate(); const olderRelease = gate();
  ldap.queryLdapDirectory = async () => { olderReady.release(); await olderRelease.wait; return { isLiveLdap: true, users: [entry('Old Snapshot Title')] }; };
  const older = assert.rejects(perform(), (error: any) => error.code === 'STALE_DIRECTORY_SNAPSHOT');
  try {
    await olderReady.wait;
    await perform({ mockEntries: [entry('New Snapshot Title')] });
  } finally { olderRelease.release(); await older; ldap.queryLdapDirectory = originalQuery; }
  assert.equal((await pgClient.query('SELECT title FROM bank_users WHERE id=$1', [committed.id])).rows[0].title, 'New Snapshot Title');
});
