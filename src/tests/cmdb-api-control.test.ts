import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../server/services/auth.service.js';
import { AuditService } from '../server/services/audit.service.js';
import type { BankUser } from '../shared/types/auth.js';

const user = (roles: BankUser['roles'], active = true): BankUser => ({
  id: 'u-test', username: 'test', email: 'test@example.test', fullName: 'Test User', title: 'Test',
  divisionId: 'd', departmentId: 'dept', teamIds: [], roles, securityClearance: 'INTERNAL',
  ownedApplicationIds: [], ownedAssetIds: [], ownedRiskIds: [], isActive: active,
});

test('CMDB permissions enforce role boundaries and inactive fail-closed behavior', () => {
    assert.equal(AuthService.hasCmdbPermission(user(['READ_ONLY_USER']), 'assets.read'), true);
    assert.equal(AuthService.hasCmdbPermission(user(['READ_ONLY_USER']), 'assets.update'), false);
    assert.equal(AuthService.hasCmdbPermission(user(['IT_ADMIN']), 'asset_discovery.run'), true);
    assert.equal(AuthService.hasCmdbPermission(user(['ASSET_OWNER']), 'asset_correlation.resolve'), false);
    assert.equal(AuthService.hasCmdbPermission(user(['PLATFORM_ADMIN'], false), 'assets.read'), false);
    assert.throws(() => AuthService.assertCmdbPermission(user(['READ_ONLY_USER']), 'assets.delete'));
  });

test('audit sanitization redacts secret-like fields recursively', () => {
    const value = AuditService.sanitize({ password: 'secret', nested: { apiToken: 'token' }, safe: 'ok', list: [{ clientSecret: 'x' }] });
    assert.deepEqual(value, { password: '[REDACTED]', nested: { apiToken: '[REDACTED]' }, safe: 'ok', list: [{ clientSecret: '[REDACTED]' }] });
  });
