import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAssetLifecycleTransition,
  assetIdentifierSchema,
  discoveryConnectorProfileSchema,
  isStrongAssetIdentifier,
  normalizeAssetIdentifier,
  sourceRecordSchema,
} from '../server/db/postgres/cmdb-foundation-repository.js';

test('CMDB foundation rejects secrets recursively and stores only secret references', () => {
  const valid = discoveryConnectorProfileSchema.parse({
    id: 'connector-test',
    connectionId: 'connection-test',
    connectorType: 'GENERIC',
    nonSecretConfiguration: { inventoryScope: { path: '/bank/production' } },
    secretReference: 'secret-manager://cmdb/connector-test',
    tlsCaReference: 'secret-manager://cmdb/connector-test-ca',
  });
  assert.equal(valid.enabled, false);
  assert.throws(() => discoveryConnectorProfileSchema.parse({
    id: 'connector-test',
    connectionId: 'connection-test',
    connectorType: 'GENERIC',
    nonSecretConfiguration: { nested: { access_token: 'plaintext-token' } },
  }), /Secret-bearing key/);
});

test('CMDB identifiers normalize deterministically and IP is not an identity type', () => {
  assert.equal(normalizeAssetIdentifier('FQDN', ' APP01.Bank.Local. '), 'app01.bank.local');
  assert.equal(normalizeAssetIdentifier('MAC_ADDRESS', 'AA:BB:CC:DD:EE:FF'), 'aabbccddeeff');
  assert.equal(normalizeAssetIdentifier('AD_OBJECT_GUID', '{ABCDEF00-0000-0000-0000-000000000001}'), 'abcdef00-0000-0000-0000-000000000001');
  assert.equal(isStrongAssetIdentifier('HOSTNAME'), false);
  assert.equal(isStrongAssetIdentifier('SERIAL_NUMBER'), true);
  assert.equal(assetIdentifierSchema.safeParse({
    id: 'identifier-test',
    assetId: 'asset-test',
    identifierType: 'IP_ADDRESS',
    value: '10.0.0.1',
    source: 'DISCOVERY',
    firstSeenAt: '2026-08-28T00:00:00.000Z',
    lastSeenAt: '2026-08-28T00:00:00.000Z',
  }).success, false);
});

test('CMDB lifecycle supports reactivation but treats archived assets as terminal', () => {
  assert.doesNotThrow(() => assertAssetLifecycleTransition('STALE', 'ACTIVE'));
  assert.doesNotThrow(() => assertAssetLifecycleTransition('RETIRED', 'ACTIVE'));
  assert.throws(() => assertAssetLifecycleTransition('ARCHIVED', 'ACTIVE'), /Invalid canonical asset lifecycle transition/);
});

test('CMDB source records may remain unmatched but cannot claim an asset at the same time', () => {
  const base = {
    id: 'source-record-test',
    connectorId: 'connector-test',
    externalObjectType: 'GENERIC_OBJECT',
    externalObjectId: 'native-001',
    firstSeenAt: '2026-08-28T00:00:00.000Z',
    lastSeenAt: '2026-08-28T00:00:00.000Z',
    lastSyncRunId: 'sync-run-test',
    status: 'UNMATCHED' as const,
  };
  assert.equal(sourceRecordSchema.safeParse(base).success, true);
  assert.equal(sourceRecordSchema.safeParse({ ...base, assetId: 'asset-test' }).success, false);
});
