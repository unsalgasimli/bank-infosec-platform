import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assetCursorScope, assetCursorBoundary, encodeAssetCursor, decodeAssetCursor, type AssetCursor } from '../server/services/cmdb-cursor.js';

test('cursor signature binds actor, filter set, page size and sort but not navigation/count options', () => {
  const scope = assetCursorScope('reader', { pageSize: 25, sortBy: 'updatedAt', typeIds: ['b', 'a'], includeTotal: 'true' });
  assert.equal(scope, assetCursorScope('reader', { pageSize: 25, sortBy: 'updatedAt', typeIds: ['a', 'b'], page: 2, includeTotal: 'false' }));
  const cursor: AssetCursor = { version: 2, scope, insertionSnapshot: '100:200:100,150', snapshotAt: '2026-09-03 10:00:00.123456+00', expiresAt: 2000, boundary: { id: 'asset-a', value: '2026-09-02 09:00:00.123456+00' } };
  const token = encodeAssetCursor(cursor, 'test-secret');
  assert.deepEqual(decodeAssetCursor(token, scope, 'test-secret', 1000), cursor);
  for (const invalidScope of [assetCursorScope('other', { pageSize: 25 }), assetCursorScope('reader', { pageSize: 100 }), assetCursorScope('reader', { sortBy: 'name' })]) assert.throws(() => decodeAssetCursor(token, invalidScope, 'test-secret', 1000), /invalid/);
  assert.throws(() => decodeAssetCursor(token, scope, 'wrong-secret', 1000), /invalid/);
  assert.throws(() => decodeAssetCursor(token, scope, 'test-secret', 2000), /expired/);
  assert.throws(() => decodeAssetCursor(`${token}x`, scope, 'test-secret', 1000), /invalid/);
  const { insertionSnapshot, ...oldCursor } = cursor;
  const legacyPayload = Buffer.from(JSON.stringify({ ...oldCursor, version: 1 })).toString('base64url');
  const legacyToken = `${legacyPayload}.${createHmac('sha256', 'test-secret').update(legacyPayload).digest('base64url')}`;
  assert.throws(() => decodeAssetCursor(legacyToken, scope, 'test-secret', 1000), /invalid/);
});

test('keyset SQL preserves microsecond values, uses row comparisons and handles both null orders', () => {
  const params: unknown[] = [];
  assert.equal(assetCursorBoundary('a.updated_at', 'DESC', { id: 'b', value: '2026-09-03 10:00:00.000001+00' }, params), '((a.updated_at,a.id)<($2::timestamptz,$1))');
  assert.deepEqual(params, ['b', '2026-09-03 10:00:00.000001+00']);
  assert.match(assetCursorBoundary('a.last_seen_at', 'DESC', { id: 'b', value: null }, []), /IS NULL AND a.id<\$1.*IS NOT NULL/);
  assert.match(assetCursorBoundary('a.last_seen_at', 'ASC', { id: 'b', value: null }, []), /IS NULL AND a.id>\$1/);
  assert.match(assetCursorBoundary('a.last_seen_at', 'ASC', { id: 'b', value: '2026-09-03' }, []), /OR a.last_seen_at IS NULL/);
  assert.throws(() => assetCursorBoundary('a.password', 'ASC', { id: 'b', value: 'x' }, []));
});
