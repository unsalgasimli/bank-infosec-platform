import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDirectoryInventoryPayloadMapper } from '../server/services/active-directory-inventory-sync.service.js';

const envelope = (objectType: string, objectId: string) => ({ connectorId: 'ad-prod', syncRunId: 'run-1', sourceObjectType: objectType, sourceObjectId: objectId, observedAt: '2026-09-01T00:00:00.000Z', rawPayload: {} });

test('Active Directory computer evidence preserves AD identity while offering safe vCenter correlation keys', () => {
  const value = activeDirectoryInventoryPayloadMapper.normalize({ objectType: 'Computer', objectId: 'f6c3f7fd-1212-4aaa-9999-123456789abc', relationships: [], entry: {
    name: 'SRV-APP-01', sAMAccountName: 'SRV-APP-01$', dNSHostName: 'srv-app-01.bank.local', operatingSystem: 'Windows Server 2022', operatingSystemVersion: '10.0', distinguishedName: 'CN=SRV-APP-01,OU=Production,OU=Servers,DC=bank,DC=local', userAccountControl: '4096', lastLogonTimestamp: '133696320000000000',
  } }, envelope('Computer', 'f6c3f7fd-1212-4aaa-9999-123456789abc'));
  assert.equal(value.classification.type, 'physical_server');
  assert.deepEqual(value.identity.identifiers.map((item) => item.type), ['AD_OBJECT_GUID', 'HOSTNAME', 'FQDN']);
  assert.equal(value.sourceSpecificMetadata.ouPath?.join('/'), 'Servers/Production');
});

test('Active Directory privileged and service identities are classified as identity evidence, never employee assets', () => {
  const value = activeDirectoryInventoryPayloadMapper.normalize({ objectType: 'User', objectId: 'f6c3f7fd-1212-4aaa-9999-123456789abd', relationships: [{ type: 'MEMBER_OF', objectType: 'Group', objectId: 'group-1' }], entry: {
    sAMAccountName: 'svc_cmdb', displayName: 'CMDB discovery service', userPrincipalName: 'svc_cmdb@bank.local', userAccountControl: '66050', distinguishedName: 'CN=svc_cmdb,OU=Service Accounts,DC=bank,DC=local',
  } }, envelope('User', 'f6c3f7fd-1212-4aaa-9999-123456789abd'));
  assert.equal(value.classification.type, 'directory_user');
  assert.equal(value.technicalState, 'DISABLED');
  assert.equal(value.sourceSpecificMetadata.directoryAccountClassification, 'SERVICE');
  assert.equal(value.placement.relationships[0]?.type, 'MEMBER_OF');
});

test('Active Directory group and OU evidence retains graph placement without CMDB overwrite fields', () => {
  const group = activeDirectoryInventoryPayloadMapper.normalize({ objectType: 'Group', objectId: 'group-1', relationships: [{ type: 'MEMBER_OF', objectType: 'Group', objectId: 'group-2' }], entry: { cn: 'Domain Admins', groupType: '-2147483646', distinguishedName: 'CN=Domain Admins,CN=Users,DC=bank,DC=local' } }, envelope('Group', 'group-1'));
  const ou = activeDirectoryInventoryPayloadMapper.normalize({ objectType: 'OrganizationalUnit', objectId: 'ou-1', relationships: [], entry: { name: 'Production', distinguishedName: 'OU=Production,OU=Servers,DC=bank,DC=local' } }, envelope('OrganizationalUnit', 'ou-1'));
  assert.equal(group.classification.type, 'directory_group');
  assert.equal(group.tags[1]?.value, 'SECURITY');
  assert.equal(group.placement.relationships[0]?.type, 'MEMBER_OF');
  assert.equal(ou.classification.type, 'organizational_unit');
  assert.equal(ou.sourceSpecificMetadata.ouPath?.join('/'), 'Servers/Production');
});
