import assert from 'node:assert/strict';
import test from 'node:test';
import { rowToUser } from '../server/db/postgres/departments-repository.js';
import { encryptSecret } from '../server/utils/crypto.js';

test('directory identity mapping never exposes encrypted storage placeholders', () => {
  const user = rowToUser({
    id: 'usr-placeholder',
    username: 'u.gasimli',
    email: 'pii+masked@encrypted.invalid',
    full_name: 'Encrypted Directory User',
    title: 'Encrypted',
    sam_account_name: 'u.gasimli',
    identity_ciphertext: 'not-a-decryptable-payload',
    department_id: 'dept-secops',
    division_id: 'div-sec',
    is_active: true,
    security_clearance: 'CONFIDENTIAL_SECURITY_ONLY',
    roles: ['SECURITY_ANALYST'],
    team_ids: [],
    owned_application_ids: [],
    owned_asset_ids: [],
    owned_risk_ids: [],
    source_payload: {},
  } as any);

  assert.equal(user.fullName, 'u.gasimli');
  assert.equal(user.email, '');
  assert.equal(user.title, 'Authenticated directory user');
  assert.notEqual(user.fullName, 'Encrypted Directory User');
  assert.ok(!user.email.includes('@encrypted.invalid'));
});

test('directory identity mapping keeps ordinary profile fields plain and protects only sensitive metadata', () => {
  const user = rowToUser({
    id: 'usr-plain-profile',
    username: 'plain.user',
    email: 'plain.user@expressbank.az',
    first_name: 'Plain',
    last_name: 'User',
    full_name: 'Plain User',
    title: 'Security Analyst',
    department_id: 'dept-secops',
    division_id: 'div-sec',
    is_active: true,
    security_clearance: 'CONFIDENTIAL',
    roles: [],
    team_ids: [],
    owned_application_ids: [],
    owned_asset_ids: [],
    owned_risk_ids: [],
    sam_account_name: 'plain.user',
    identity_ciphertext: encryptSecret(JSON.stringify({
      userPrincipalName: 'plain.user@expressbank.az',
      distinguishedName: 'CN=Plain User,OU=Users,DC=expressbank,DC=az',
      distributionGroups: ['SECURITY-OPS'],
    })),
    source_payload: {},
  } as any);

  assert.equal(user.fullName, 'Plain User');
  assert.equal(user.email, 'plain.user@expressbank.az');
  assert.equal(user.title, 'Security Analyst');
  assert.equal(user.departmentId, 'dept-secops');
  assert.equal(user.userPrincipalName, 'plain.user@expressbank.az');
  assert.deepEqual(user.distributionGroups, ['SECURITY-OPS']);
});
