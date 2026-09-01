import assert from 'node:assert/strict';
import test from 'node:test';
import { VCenterConnector, VCenterRestClient, VCenterRetryPolicy } from '../server/integrations/vcenter/vcenter-connector.js';
import { VCenterConnectorRegistry } from '../server/integrations/vcenter/vcenter-registry.js';
import { assertVCenterResolvedTarget, normalizeVCenterHost, validateVCenterTransport, vCenterRequestPolicy } from '../server/integrations/vcenter/vcenter-endpoint-policy.js';
import { ConnectorScopedLockService } from '../server/services/discovery-lock.service.js';
import { vCenterInventoryPayloadMapper } from '../server/services/vcenter-inventory-sync.service.js';
import { sourceIdentityKey, type VCenterConnectorConfiguration } from '../shared/types/vcenter.js';

const configuration = (connectorId: string): VCenterConnectorConfiguration => ({ connectorId, endpointFqdn: `${connectorId}.example.test`, port: 443, soapEndpointPath: '/sdk', automationApiBasePath: '/api', tlsVerifyCertificates: true, requestTimeoutMs: 30_000, responseSizeLimitBytes: 4_194_304, endpointAllowPrivateNetwork: true, accessMode: 'READ_ONLY' });

test('vCenter source identity and runtime sessions remain connector-scoped', () => {
  assert.notEqual(sourceIdentityKey('vc-a', 'VirtualMachine', 'vm-123'), sourceIdentityKey('vc-b', 'VirtualMachine', 'vm-123'));
  assert.throws(() => sourceIdentityKey('vc-a', 'VirtualMachine', ''));
  assert.notEqual(ConnectorScopedLockService.key('vc-a', 'sync'), ConnectorScopedLockService.key('vc-b', 'sync'));
  const registry = new VCenterConnectorRegistry(() => new VCenterRestClient());
  const a = registry.getOrCreate(configuration('vc-a')); const b = registry.getOrCreate(configuration('vc-b'));
  assert.notEqual(a, b); assert.equal(registry.getOrCreate(configuration('vc-a')), a); assert.equal(registry.size(), 2);
});

test('vCenter endpoint policy is HTTPS-only, REST-path fixed and fail-closed for unapproved private targets', async () => {
  assert.equal(normalizeVCenterHost('VCENTER.EXAMPLE.TEST.'), 'vcenter.example.test');
  assert.throws(() => normalizeVCenterHost('https://user:password@vcenter.example.test/api/session'));
  assert.throws(() => validateVCenterTransport({ ...configuration('vc-a'), tlsVerifyCertificates: false }));
  assert.throws(() => validateVCenterTransport({ ...configuration('vc-a'), automationApiBasePath: '/arbitrary' }));
  await assert.rejects(() => assertVCenterResolvedTarget({ ...configuration('vc-a'), endpointFqdn: '10.0.0.10', endpointAllowPrivateNetwork: false }));
  await assert.doesNotReject(() => assertVCenterResolvedTarget({ ...configuration('vc-a'), endpointFqdn: '10.0.0.10', endpointAllowPrivateNetwork: true }));
  assert.deepEqual(vCenterRequestPolicy(configuration('vc-a')), { timeoutMs: 30_000, maxResponseBytes: 4_194_304, redirect: 'error' });
});

test('retry policy only retries transient errors with bounded jitter', () => {
  assert.equal(VCenterRetryPolicy.isRetryable('VCENTER_SESSION_EXPIRED'), true);
  assert.equal(VCenterRetryPolicy.isRetryable('VCENTER_AUTH_FAILED'), false);
  assert.equal(VCenterRetryPolicy.delayMs(1, () => 0), 500);
  assert.equal(VCenterRetryPolicy.delayMs(2, () => 1), 3000);
  assert.equal(VCenterRetryPolicy.delayMs(99, () => 1) <= 300000, true);
});

test('the REST connector never exposes a token through its public runtime state', () => {
  const connector = new VCenterConnector(configuration('vc-a'), new VCenterRestClient());
  assert.deepEqual(connector.getRuntimeState(), { connectorId: 'vc-a', retryAttempt: 0 });
});

test('vCenter discovery maps every supported inventory object to a canonical CMDB type', () => {
  const cases = [
    ['VirtualMachine', 'virtual_machine'],
    ['HostSystem', 'hypervisor'],
    ['ClusterComputeResource', 'cluster'],
    ['Datacenter', 'datacenter'],
    ['Datastore', 'datastore'],
    ['Network', 'network'],
    ['ResourcePool', 'infrastructure'],
    ['VCenterServer', 'vcenter'],
  ] as const;

  for (const [objectType, expectedType] of cases) {
    const raw = { objectType, objectId: `${objectType}-1`, name: `${objectType} 1`, payload: {} };
    const normalized = vCenterInventoryPayloadMapper.normalize(raw, {
      connectorId: 'vc-a', syncRunId: 'run-1', sourceObjectType: objectType,
      sourceObjectId: raw.objectId, observedAt: '2026-08-31T00:00:00.000Z', rawPayload: raw,
    });
    assert.equal(normalized.classification.type, expectedType);
    assert.equal(normalized.source.connectorId, 'vc-a');
    assert.equal(normalized.source.objectId, raw.objectId);
  }
});

test('vCenter discovery preserves high-confidence VM and host identity evidence', () => {
  const vm = vCenterInventoryPayloadMapper.normalize({ objectType: 'VirtualMachine', objectId: 'vm-1', name: 'payments-01', payload: { instance_uuid: 'instance-uuid', bios_uuid: 'bios-uuid' } }, {
    connectorId: 'vc-a', syncRunId: 'run-1', sourceObjectType: 'VirtualMachine', sourceObjectId: 'vm-1', observedAt: '2026-08-31T00:00:00.000Z', rawPayload: {},
  });
  assert.deepEqual(vm.identity.identifiers.map((item) => [item.type, item.value]), [['VMWARE_INSTANCE_UUID', 'instance-uuid'], ['BIOS_UUID', 'bios-uuid']]);

  const host = vCenterInventoryPayloadMapper.normalize({ objectType: 'HostSystem', objectId: 'host-1', name: 'esx-01', payload: { serial_number: 'host-serial' } }, {
    connectorId: 'vc-a', syncRunId: 'run-1', sourceObjectType: 'HostSystem', sourceObjectId: 'host-1', observedAt: '2026-08-31T00:00:00.000Z', rawPayload: {},
  });
  assert.deepEqual(host.identity.identifiers.map((item) => [item.type, item.value]), [['SERIAL_NUMBER', 'host-serial']]);
});

test('vCenter discovery emits source-scoped placement evidence for graph resolution', () => {
  const vm = vCenterInventoryPayloadMapper.normalize({ objectType: 'VirtualMachine', objectId: 'vm-1', name: 'payments-01', payload: { host: 'host-1', datacenter: 'dc-1' } }, {
    connectorId: 'vc-a', syncRunId: 'run-1', sourceObjectType: 'VirtualMachine', sourceObjectId: 'vm-1', observedAt: '2026-08-31T00:00:00.000Z', rawPayload: {},
  });
  assert.deepEqual(vm.placement.relationships, [
    { type: 'RUNS_ON', target: { objectType: 'HostSystem', objectId: 'host-1', identifiers: [] }, confidence: 100 },
    { type: 'LOCATED_IN', target: { objectType: 'Datacenter', objectId: 'dc-1', identifiers: [] }, confidence: 100 },
  ]);
  const host = vCenterInventoryPayloadMapper.normalize({ objectType: 'HostSystem', objectId: 'host-1', name: 'esx-01', payload: { cluster: 'cluster-1', datacenter: 'dc-1' } }, {
    connectorId: 'vc-a', syncRunId: 'run-1', sourceObjectType: 'HostSystem', sourceObjectId: 'host-1', observedAt: '2026-08-31T00:00:00.000Z', rawPayload: {},
  });
  assert.deepEqual(host.placement.relationships, [
    { type: 'MEMBER_OF', target: { objectType: 'ClusterComputeResource', objectId: 'cluster-1', identifiers: [] }, confidence: 100 },
    { type: 'LOCATED_IN', target: { objectType: 'Datacenter', objectId: 'dc-1', identifiers: [] }, confidence: 100 },
  ]);
});

test('vCenter VM detail maps guest identity, NICs, disks and stable backing relationships', () => {
  const vm = vCenterInventoryPayloadMapper.normalize({ objectType: 'VirtualMachine', objectId: 'vm-1', name: 'payments-01', payload: {
    instance_uuid: 'instance-uuid', guest_os: 'RHEL_8_64', cpu: { count: 4 }, memory: { size_MiB: 8192 },
    guest: { host_name: 'payments-01.bank.local', name: 'RHEL_8_64', ip_address: '10.10.10.15' },
    nics: [{ nic: '4000', label: 'Network adapter 1', type: 'VMXNET3', mac_address: '00:50:56:aa:bb:cc', state: 'CONNECTED', backing: { network: 'network-1' } }],
    disks: [{ disk: '2000', label: 'Hard disk 1', type: 'SCSI', capacity: 10737418240, backing: { vmdk_file: '[ds-1] payments/payments.vmdk', datastore: 'datastore-1' } }],
  } }, {
    connectorId: 'vc-a', syncRunId: 'run-1', sourceObjectType: 'VirtualMachine', sourceObjectId: 'vm-1', observedAt: '2026-08-31T00:00:00.000Z', rawPayload: {},
  });
  assert.equal(vm.identity.hostname, 'payments-01.bank.local');
  assert.deepEqual(vm.compute, { cpuCount: 4, memoryBytes: 8589934592 });
  assert.deepEqual(vm.network.interfaces[0]?.macAddresses, ['00:50:56:aa:bb:cc']);
  assert.deepEqual(vm.network.interfaces[0]?.ipAddresses, [{ address: '10.10.10.15', role: 'GUEST', dnsName: 'payments-01.bank.local', primary: true, dynamic: true }]);
  assert.deepEqual(vm.storage.disks[0], { key: '2000', name: 'Hard disk 1', type: 'SCSI', technicalState: 'CONNECTED', capacityBytes: 10737418240, mountPath: '[ds-1] payments/payments.vmdk' });
  assert.deepEqual(vm.placement.relationships, [
    { type: 'CONNECTED_TO', target: { objectType: 'Network', objectId: 'network-1', identifiers: [] }, confidence: 100 },
    { type: 'STORED_ON', target: { objectType: 'Datastore', objectId: 'datastore-1', identifiers: [] }, confidence: 100 },
  ]);
});
