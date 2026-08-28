import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConnectorScopedVCenterSessionManager,
  VCenterCapabilityDetector,
  type AutomationRestClient,
  type VimSoapClient,
  type VimSoapSession,
} from '../server/integrations/vcenter/vcenter-connector.js';
import { VCenterConnectorRegistry } from '../server/integrations/vcenter/vcenter-registry.js';
import { assertVCenterResolvedTarget, normalizeVCenterHost, validateVCenterTransport, vCenterRequestPolicy } from '../server/integrations/vcenter/vcenter-endpoint-policy.js';
import { VCenterRetryPolicy } from '../server/integrations/vcenter/vcenter-connector.js';
import { ConnectorScopedLockService } from '../server/services/discovery-lock.service.js';
import { sourceIdentityKey } from '../shared/types/vcenter.js';
import type { VCenterConnectorConfiguration } from '../shared/types/vcenter.js';

const configuration = (connectorId: string): VCenterConnectorConfiguration => ({
  connectorId,
  endpointFqdn: `${connectorId}.example.test`,
  port: 443,
  soapEndpointPath: '/sdk',
  automationApiBasePath: '/api',
  tlsVerifyCertificates: true,
  requestTimeoutMs: 30_000,
  responseSizeLimitBytes: 4_194_304,
  endpointAllowPrivateNetwork: true,
  accessMode: 'READ_ONLY',
});

test('vCenter source identity is scoped by connector, object type and object id', () => {
  assert.notEqual(sourceIdentityKey('vc-a', 'VirtualMachine', 'vm-123'), sourceIdentityKey('vc-b', 'VirtualMachine', 'vm-123'));
  assert.equal(sourceIdentityKey('vc-a', 'VirtualMachine', 'vm-123'), sourceIdentityKey('vc-a', 'VirtualMachine', 'vm-123'));
  assert.throws(() => sourceIdentityKey('vc-a', 'VirtualMachine', ''));
  assert.equal(ConnectorScopedLockService.key('vc-a', 'sync'), 'aegissec:discovery:sync:vc-a');
  assert.notEqual(ConnectorScopedLockService.key('vc-a', 'sync'), ConnectorScopedLockService.key('vc-b', 'sync'));
});

test('session manager does not reuse a SOAP session across connectors', async () => {
  const sessions = new ConnectorScopedVCenterSessionManager();
  const calls: string[] = [];
  const client: VimSoapClient = {
    async connect(config) { calls.push(`connect:${config.connectorId}`); },
    async login(config) { calls.push(`login:${config.connectorId}`); return { connectorId: config.connectorId, sessionId: `session-${config.connectorId}` }; },
    async serviceContent() { throw new Error('not used'); },
    async logout(session) { calls.push(`logout:${session.connectorId}`); },
  };
  const a = await sessions.login(configuration('vc-a'), client, { opaque: true });
  const b = await sessions.login(configuration('vc-b'), client, { opaque: true });
  assert.equal(a.connectorId, 'vc-a');
  assert.equal(b.connectorId, 'vc-b');
  assert.equal((await sessions.ensureSession('vc-a')).sessionId, 'session-vc-a');
  assert.equal((await sessions.ensureSession('vc-b')).sessionId, 'session-vc-b');
  assert.deepEqual(calls, ['connect:vc-a', 'login:vc-a', 'connect:vc-b', 'login:vc-b']);
  await assert.rejects(() => sessions.ensureSession('vc-missing'));
});

test('SOAP/VIM remains the common baseline when REST and VI/JSON are absent', () => {
  const capabilities = VCenterCapabilityDetector.detect({
    soap: {
      about: { product: 'VMware vCenter Server', version: '8.0.0', build: '20519528', apiVersion: '8.0' },
      hasPropertyCollector: true,
      hasSessionManager: true,
    },
    automation: { available: false, supportsTagging: false, supportsViJson: false },
  });
  assert.equal(capabilities.supportsSoapVim, true);
  assert.equal(capabilities.supportsPropertyCollector, true);
  assert.equal(capabilities.supportsAutomationApi, false);
  assert.equal(capabilities.supportsTagging, false);
  assert.equal(capabilities.supportsViJson, false);
  assert.equal(capabilities.build, '20519528');
});

test('vCenter endpoint policy is HTTPS-only, host-only and fail-closed for private targets', async () => {
  assert.equal(normalizeVCenterHost('VCENTER.EXAMPLE.TEST.'), 'vcenter.example.test');
  assert.throws(() => normalizeVCenterHost('https://user:password@vcenter.example.test/sdk'));
  assert.throws(() => validateVCenterTransport({ ...configuration('vc-a'), tlsVerifyCertificates: false }));
  assert.throws(() => validateVCenterTransport({ ...configuration('vc-a'), soapEndpointPath: '/arbitrary' }));
  await assert.rejects(() => assertVCenterResolvedTarget({ ...configuration('vc-a'), endpointFqdn: '10.0.0.10', endpointAllowPrivateNetwork: false }));
  await assert.doesNotReject(() => assertVCenterResolvedTarget({ ...configuration('vc-a'), endpointFqdn: '10.0.0.10', endpointAllowPrivateNetwork: true }));
  assert.deepEqual(vCenterRequestPolicy({ requestTimeoutMs: 30_000, responseSizeLimitBytes: 4_194_304 }), { timeoutMs: 30_000, maxResponseBytes: 4_194_304, redirect: 'error' });
});

test('retry policy only retries transient classes with bounded exponential jitter', () => {
  assert.equal(VCenterRetryPolicy.isRetryable('VCENTER_CONNECT_TIMEOUT'), true);
  assert.equal(VCenterRetryPolicy.isRetryable('VCENTER_AUTH_FAILED'), false);
  assert.equal(VCenterRetryPolicy.delayMs(1, () => 0), 500);
  assert.equal(VCenterRetryPolicy.delayMs(2, () => 1), 3000);
  assert.equal(VCenterRetryPolicy.delayMs(99, () => 1) <= 300000, true);
});

test('vCenter runtime dependencies are connector-local', () => {
  const clientFactory = {
    vim: (_config: VCenterConnectorConfiguration): VimSoapClient => ({
      async connect() { return; },
      async login(config): Promise<VimSoapSession> { return { connectorId: config.connectorId, sessionId: config.connectorId }; },
      async serviceContent() { throw new Error('not used'); },
      async logout() { return; },
    }),
    automation: (_config: VCenterConnectorConfiguration): AutomationRestClient => ({ async probe() { return { available: false, supportsTagging: false, supportsViJson: false }; } }),
  };
  const registry = new VCenterConnectorRegistry(clientFactory);
  const a = registry.getOrCreate(configuration('vc-a'));
  const b = registry.getOrCreate(configuration('vc-b'));
  assert.notEqual(a, b);
  assert.equal(registry.getOrCreate(configuration('vc-a')), a);
  assert.equal(registry.size(), 2);
});
