import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db/database.js';
import { LDAPSyncService } from '../server/services/ldap-sync.service.js';
import { mapBaselineRecord } from '../server/services/directory-baseline.service.js';
import { extractDirectoryBranchName, makeDepartmentNodeId, makeDirectoryBranchMatchKey, makeDirectoryNameMatchKey, normalizeDirectoryEmployeeId, normalizeDirectoryObjectGuid } from '../server/services/ldap-directory.data.js';

test('binary AD objectGUID values normalize to the same stable identity key', () => {
  const binaryGuid = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  assert.equal(normalizeDirectoryObjectGuid(binaryGuid), '33221100-5544-7766-8899-aabbccddeeff');
  assert.equal(normalizeDirectoryObjectGuid('33221100-5544-7766-8899-aabbccddeeff'), '33221100-5544-7766-8899-aabbccddeeff');
  assert.equal(normalizeDirectoryEmployeeId('00027'), '27');
  assert.equal(makeDirectoryNameMatchKey('İsmayılova Günay Fərhad qızı'), makeDirectoryNameMatchKey('Gunay Ismayilova'));
  assert.equal(makeDirectoryNameMatchKey('Xəlilov Süleyman Əli oğlu'), makeDirectoryNameMatchKey('Suleyman A. Khalilov'));
  assert.equal(makeDirectoryNameMatchKey('Xozehəqq Emin Bahadır oğlu'), makeDirectoryNameMatchKey('Emin Khozehagg'));
  assert.equal(makeDirectoryNameMatchKey('Heybətov Elmar Bəxtiyaroviç'), makeDirectoryNameMatchKey('Elmar Heybatov'));
  assert.equal(makeDirectoryNameMatchKey('Məmmədov Rəşad Əlikram oğlu'), makeDirectoryNameMatchKey('Rashad Mammadov'));
  assert.equal(makeDirectoryNameMatchKey('Calalzadə Nərgiz Xalis qızı'), makeDirectoryNameMatchKey('Nargiz X. Jalalzada'));
  assert.equal(makeDirectoryBranchMatchKey('Bərdə filialı'), makeDirectoryBranchMatchKey('Barda Branch - SG'));
  assert.equal(extractDirectoryBranchName(['Barda Branch - SG']), 'Barda');
  assert.equal(extractDirectoryBranchName(['Bərdə filialının Kassa müdiri']), 'Bərdə');
});

test('baseline roots preserve the workbook structure instead of job-function remapping', () => {
  const mapping = mapBaselineRecord({
    structureName: 'Gəncə filialı',
    title: 'Gəncə filialının Kassa müdiri-Baş kassiri',
  });

  assert.equal(mapping.departmentId, 'dept-gence-filiali');
  assert.equal(mapping.departmentName, 'Gəncə filialı');
  assert.equal(mapping.divisionId, 'div-banking');
  assert.ok(!mapping.unitId || mapping.unitId.length <= 128);
  assert.ok(makeDepartmentNodeId('Çox uzun struktur adı '.repeat(8)).length <= 64);
});

test('daily sync keeps the user row across sAMAccountName changes and clears removed managers', async () => {
  const originalData = structuredClone(db.data);
  const originalQuery = LDAPSyncService.queryLdapDirectory;
  db.data.users = [{
    id: 'usr-stable-object-guid',
    username: 'old.username',
    sAMAccountName: 'old.username',
    directoryObjectGuid: 'guid-employee-1',
    email: 'employee@expressbank.az',
    fullName: 'Unsal Gasimli',
    title: 'Security Analyst',
    divisionId: 'div-sec',
    departmentId: 'dept-secops',
    managerId: 'usr-removed-manager',
    teamIds: [],
    roles: ['SECURITY_ANALYST', 'REQUESTER'],
    securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
    directorySource: 'ACTIVE_DIRECTORY',
    directoryAccountType: 'HUMAN',
    organizationEligible: true,
  }];
  db.data.departments = [{ id: 'dept-secops', divisionId: 'div-sec', name: 'Information Security', code: 'INFOSEC', isActive: true }];
  db.data.departmentSections = [];
  LDAPSyncService.queryLdapDirectory = async () => ({
    isLiveLdap: true,
    users: [{
      sAMAccountName: 'new.username',
      objectGUID: 'guid-employee-1',
      userPrincipalName: 'new.username@expressbank.az',
      mail: 'employee@expressbank.az',
      displayName: 'Unsal Gasimli',
      givenName: 'Unsal',
      sn: 'Gasimli',
      title: 'Security Analyst',
      department: 'Information Security',
      userAccountControl: 512,
    }],
  });

  try {
    const report = await LDAPSyncService.syncAllUsers({ trigger: 'MANUAL_TRIGGER' });
    assert.equal(report.addedCount, 0);
    assert.equal(db.data.users.length, 1);
    assert.equal(db.data.users[0].id, 'usr-stable-object-guid');
    assert.equal(db.data.users[0].username, 'new.username');
    assert.equal(db.data.users[0].sAMAccountName, 'new.username');
    assert.equal(db.data.users[0].managerId, undefined);
  } finally {
    LDAPSyncService.queryLdapDirectory = originalQuery;
    db.data = originalData;
  }
});

test('live snapshot quality gate rejects duplicate stable identities before any projection write', async () => {
  const originalQuery = LDAPSyncService.queryLdapDirectory;
  const before = structuredClone(db.data);
  db.data.users = [{
    id: 'usr-existing-quality-gate',
    username: 'existing.user',
    sAMAccountName: 'existing.user',
    fullName: 'Existing User',
    email: 'existing.user@expressbank.az',
    title: 'Specialist',
    departmentId: 'dept-secops',
    divisionId: 'div-sec',
    teamIds: [],
    roles: ['REQUESTER'],
    securityClearance: 'INTERNAL',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
    directorySource: 'ACTIVE_DIRECTORY',
    directoryAccountType: 'HUMAN',
    organizationEligible: true,
  }];
  const stateBeforeSync = structuredClone(db.data);
  LDAPSyncService.queryLdapDirectory = async () => ({
    isLiveLdap: true,
    requiresStableIdentity: true,
    users: [
      { sAMAccountName: 'first.user', displayName: 'First User', objectGUID: 'same-guid', employeeID: '1001' },
      { sAMAccountName: 'second.user', displayName: 'Second User', objectGUID: 'same-guid', employeeID: '1002' },
    ],
  });

  try {
    const report = await LDAPSyncService.syncAllUsers({ trigger: 'MANUAL_TRIGGER' });
    assert.equal(report.snapshotAccepted, false);
    assert.ok(report.snapshotRejectedReason?.includes('Duplicate objectGUID'));
    assert.deepEqual(db.data, stateBeforeSync, 'Rejected snapshots must not change runtime projection state');
  } finally {
    LDAPSyncService.queryLdapDirectory = originalQuery;
    db.data = before;
  }
});

test('dry-run calculates the same reconciliation without persisting or mutating runtime state', async () => {
  const originalQuery = LDAPSyncService.queryLdapDirectory;
  const before = structuredClone(db.data);
  db.data.users = [];
  db.data.departments = [];
  db.data.departmentSections = [];
  const stateBeforeSync = structuredClone(db.data);
  LDAPSyncService.queryLdapDirectory = async () => ({
    isLiveLdap: true,
    users: [{
      sAMAccountName: 'preview.user',
      userPrincipalName: 'preview.user@expressbank.az',
      mail: 'preview.user@expressbank.az',
      displayName: 'Preview User',
      givenName: 'Preview',
      sn: 'User',
      title: 'Security Analyst',
      department: 'Information Security',
    }],
  });

  try {
    const report = await LDAPSyncService.syncAllUsers({ trigger: 'MANUAL_TRIGGER', dryRun: true });
    assert.equal(report.snapshotAccepted, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.addedCount, 1);
    assert.deepEqual(db.data, stateBeforeSync, 'Dry-run must restore the runtime projection after calculating changes');
  } finally {
    LDAPSyncService.queryLdapDirectory = originalQuery;
    db.data = before;
  }
});
