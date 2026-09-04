import assert from 'node:assert/strict';
import test from 'node:test';
import { cortexAuthenticationHeaders, CortexClient, CortexConnectorError, type CortexTransport } from '../server/integrations/cortex/cortex-client.js';
import { cortexEndpointPayloadMapper, cortexUnifiedAssetPayloadMapper } from '../server/services/cortex-inventory-sync.service.js';

const envelope = { schemaVersion: 1, connectorId: 'cortex-a', syncRunId: 'run-a', sourceObjectType: 'CORTEX_ENDPOINT', sourceObjectId: 'ep-1', observedAt: '2026-09-01T00:00:00.000Z', rawPayload: {} } as const;
const configuration = { endpointUrl: 'https://localhost', endpointAllowPrivateNetwork: true, tlsVerifyCertificates: true, requestTimeoutMs: 1000, responseSizeLimitBytes: 65536, apiKeyId: '42', apiKey: 'not-a-real-secret', maxRetries: 1 };

test('Cortex endpoint normalizes through the generic observation DTO with scoped persistent identity', async () => {
  const raw = cortexEndpointPayloadMapper.validateRaw({ endpoint_id: 'ep-1', endpoint_name: 'ws-01', fqdn: 'ws-01.bank.example', domain: 'bank.example', ip_addresses: ['10.0.0.5', 'not-an-ip'], mac_address: 'AA:BB:CC:DD:EE:FF', os_type: 'Windows', agent_version: '8.1', is_isolated: true, unknown_future_field: { preserved: true } });
  const dto = await cortexEndpointPayloadMapper.normalize(raw, envelope);
  assert.equal(dto.source.objectId, 'ep-1');
  assert.deepEqual(dto.identity.identifiers[0], { type: 'EDR_DEVICE_ID', namespace: 'cortex-a', value: 'ep-1', confidence: 100, primary: true });
  assert.equal(dto.network.interfaces[0]?.ipAddresses.length, 1);
  assert.equal((dto.sourceSpecificMetadata.cortex as any).securityTelemetry.unknown_future_field.preserved, true);
  assert.throws(() => cortexEndpointPayloadMapper.validateRaw({ endpoint_name: 'missing-id' }), /endpoint_id/);
});

test('Cortex Unified Asset Inventory preserves native classification and emits strong cross-source identifiers', async () => {
  const raw = cortexUnifiedAssetPayloadMapper.validateRaw({
    'xdm.asset.id': 'cortex-native-77', 'xdm.asset.strong_id': 'asset-77', 'xdm.asset.name': 'srv-01.bank.example',
    'xdm.asset.type.class': 'Compute', 'xdm.asset.type.category': 'Virtual Machine', 'xdm.asset.type.name': 'VMware VM',
    'xdm.host.fqdn': 'srv-01.bank.example', 'xdm.host.bios_uuid': '11111111-2222-3333-4444-555555555555',
    'xdm.host.serial_number': 'SER-77', 'xdm.host.mac_addresses': ['02:11:22:33:44:55'],
    'xdm.host.ipv4_addresses': ['10.20.30.40'], endpoint_id: 'endpoint-77', agent_version: '8.7.1',
    operational_status: 'PROTECTED', content_status: 'up_to_date', unknown_asset_field: { preserved: true },
  });
  const dto = await cortexUnifiedAssetPayloadMapper.normalize(raw, { ...envelope, sourceObjectType: 'CORTEX_ASSET', sourceObjectId: 'cortex-native-77' });
  assert.equal(dto.classification.type, 'virtual_machine');
  assert.equal((dto.sourceSpecificMetadata.cortex as any).assetClass, 'Compute');
  assert.ok(dto.identity.identifiers.some((item) => item.type === 'CORTEX_ASSET_ID' && item.value === 'cortex-native-77'));
  assert.ok(dto.identity.identifiers.some((item) => item.value === 'asset-77'));
  assert.ok(dto.identity.identifiers.some((item) => item.type === 'BIOS_UUID'));
  assert.equal(((dto.sourceSpecificMetadata.cortex as any).securityTelemetry as any).unknown_asset_field.preserved, true);
});

test('Cortex Unified Asset Inventory maps identity and cloud-runtime taxonomy to canonical CMDB CI types', async () => {
  const group = await cortexUnifiedAssetPayloadMapper.normalize(cortexUnifiedAssetPayloadMapper.validateRaw({
    'xdm.asset.id': 'group-1', 'xdm.asset.type.class': 'Identity', 'xdm.asset.type.category': 'IAM Group', 'xdm.asset.type.name': 'AD Group', 'xdm.identity.group.dn': 'CN=SG-Admins,DC=bank,DC=example', 'xdm.asset.tags': ['privileged'],
  }), { ...envelope, sourceObjectType: 'CORTEX_ASSET', sourceObjectId: 'group-1' });
  const runtime = await cortexUnifiedAssetPayloadMapper.normalize(cortexUnifiedAssetPayloadMapper.validateRaw({
    'xdm.asset.id': 'image-1', 'xdm.asset.type.class': 'Compute', 'xdm.asset.type.category': 'Container Image', 'xdm.asset.type.name': 'Runtime Image', 'xdm.business_application.names': ['payments'],
  }), { ...envelope, sourceObjectType: 'CORTEX_ASSET', sourceObjectId: 'image-1' });
  assert.equal(group.classification.type, 'directory_group');
  assert.equal(group.identity.name, 'CN=SG-Admins,DC=bank,DC=example');
  assert.deepEqual(group.tags, [{ key: 'cortex', value: 'privileged' }]);
  assert.equal(runtime.classification.type, 'cloud_resource');
  assert.ok(runtime.tags.some((tag) => tag.key === 'businessApplication' && tag.value === 'business-application:payments'));
});

test('Cortex client retries a rate-limited transport response and never exposes auth headers to callers', async () => {
  let attempts = 0;
  const transport: CortexTransport = async (request) => {
    attempts += 1;
    assert.equal(request.headers.authorization, 'not-a-real-secret');
    assert.equal(request.headers['x-xdr-auth-id'], '42');
    return attempts === 1
      ? { statusCode: 429, headers: {}, body: {} }
      : { statusCode: 200, headers: {}, body: { reply: { endpoints: [{ endpoint_id: 'ep-1' }], total_count: 1 } } };
  };
  const page = await new CortexClient(configuration, transport).page(0, 'correlation-test');
  assert.equal(attempts, 2); assert.equal(page.endpoints[0].endpoint_id, 'ep-1');
});

test('Cortex page windows use the documented exclusive upper bound and preserve API counts', async () => {
  const requests: Array<Record<string, any>> = [];
  const transport: CortexTransport = async (request) => {
    requests.push(JSON.parse(request.body || '{}'));
    return request.url.pathname.endsWith('/endpoints/get_endpoint')
      ? { statusCode: 200, headers: {}, body: { reply: { endpoints: [{ endpoint_id: 'ep-1' }], total_count: 225, result_count: 1 } } }
      : { statusCode: 200, headers: {}, body: { reply: { data: [{ 'xdm.asset.strong_id': 'asset-1' }], metadata: { total_count: 1200, filter_count: 1 } } } };
  };
  const client = new CortexClient({ ...configuration, pageSize: 100 }, transport);
  const endpointPage = await client.endpointPage(100, 'endpoint-page-window');
  const assetPage = await client.assetPage(1000, 'asset-page-window');
  assert.equal(requests[0].request_data.search_from, 100);
  assert.equal(requests[0].request_data.search_to, 200);
  assert.equal(requests[1].request_data.search_from, 1000);
  assert.equal(requests[1].request_data.search_to, 2000);
  assert.deepEqual(requests[1].request_data.sort, [{ FIELD: 'xdm.asset.id', ORDER: 'ASC' }]);
  assert.deepEqual(requests[1].request_data.filters, { AND: [{ SEARCH_FIELD: 'xdm.asset.type.class', SEARCH_TYPE: 'NEQ', SEARCH_VALUE: 'Other' }] });
  assert.equal(endpointPage.totalCount, 225);
  assert.equal(endpointPage.resultCount, 1);
  assert.equal(assetPage.totalCount, 1200);
  assert.equal(assetPage.resultCount, 1);
});

test('Cortex Asset Inventory retries the same native page without optional fields only after an upstream 5xx', async () => {
  const payloads: Array<{ request_data: Record<string, unknown> }> = [];
  let attempts = 0;
  const transport: CortexTransport = async (request) => {
    attempts += 1; payloads.push(JSON.parse(request.body || '{}'));
    return attempts === 1
      ? { statusCode: 500, headers: {}, body: {} }
      : { statusCode: 200, headers: {}, body: { reply: { data: [], metadata: { total_count: 0, filter_count: 0 } } } };
  };
  const page = await new CortexClient({ ...configuration, maxRetries: 0 }, transport).assetPage(0, 'asset-field-fallback');
  assert.equal(page.usedOnDemandFieldFallback, true);
  assert.deepEqual(payloads[0].request_data.on_demand_fields, ['xdm.host.ipv4_addresses']);
  assert.deepEqual(payloads[0].request_data.filters, { AND: [{ SEARCH_FIELD: 'xdm.asset.type.class', SEARCH_TYPE: 'NEQ', SEARCH_VALUE: 'Other' }] });
  assert.equal('on_demand_fields' in payloads[1].request_data, false);
  assert.deepEqual(payloads[1].request_data.filters, payloads[0].request_data.filters);
  assert.equal(payloads[1].request_data.search_to, 1000);
});

test('Cortex Advanced API keys send a fresh nonce, timestamp, and SHA-256 proof instead of the raw secret', async () => {
  const headers = cortexAuthenticationHeaders({ ...configuration, apiKeySecurityLevel: 'ADVANCED' }, 'a'.repeat(64), '1725148800000');
  assert.equal(headers.authorization, '82a4a109074d577af275a60a46ae1d657ba9d477e3332a5c1e95c45cb6626ee4');
  assert.equal(headers['x-xdr-auth-id'], '42');
  assert.equal(headers['x-xdr-nonce'], 'a'.repeat(64));
  assert.equal(headers['x-xdr-timestamp'], '1725148800000');
  assert.equal(Object.values(headers).includes(configuration.apiKey), false);
});

test('Cortex client handles authentication failures and malformed replies safely', async () => {
  const denied: CortexTransport = async () => ({ statusCode: 401, headers: {}, body: {} });
  await assert.rejects(() => new CortexClient(configuration, denied).page(0, 'correlation-test'), (error: any) => error instanceof CortexConnectorError && error.code === 'CORTEX_AUTH_FAILED');
  const malformed: CortexTransport = async () => ({ statusCode: 200, headers: {}, body: { reply: { endpoints: 'bad' } } });
  await assert.rejects(() => new CortexClient(configuration, malformed).page(0, 'correlation-test'), (error: any) => error instanceof CortexConnectorError && error.code === 'CORTEX_RESPONSE_INVALID');
  const tlsFailure: CortexTransport = async () => { throw Object.assign(new Error('certificate rejected'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }); };
  await assert.rejects(() => new CortexClient(configuration, tlsFailure).page(0, 'correlation-test'), (error: any) => error instanceof CortexConnectorError && error.code === 'CORTEX_TLS_FAILED');
});

test('Cortex client never follows a redirect for an authenticated POST and reports the API origin', async () => {
  const redirected: CortexTransport = async () => ({ statusCode: 303, headers: { location: 'https://api-tenant.xdr.paloaltonetworks.com/login' }, body: {} });
  await assert.rejects(
    () => new CortexClient(configuration, redirected).page(0, 'correlation-test'),
    (error: any) => error instanceof CortexConnectorError && error.code === 'CORTEX_API_REDIRECT' && error.message.includes('https://api-tenant.xdr.paloaltonetworks.com'),
  );
});

test('Cortex capability detection keeps Endpoint Management and native Asset Inventory independent', async () => {
  const transport: CortexTransport = async (request) => {
    const body = JSON.parse(request.body || '{}');
    if (request.url.pathname.endsWith('/endpoints/get_endpoint')) {
      assert.equal(body.request_data.search_from, 0);
      assert.equal(body.request_data.search_to, 100);
      return { statusCode: 200, headers: {}, body: { reply: { endpoints: [], total_count: 0, result_count: 0 } } };
    }
    assert.equal(request.url.pathname.endsWith('/assets'), true);
    assert.equal(body.request_data.search_from, 0);
    assert.equal(body.request_data.search_to, 1000);
    return { statusCode: 500, headers: {}, body: {} };
  };
  const capabilities = await new CortexClient(configuration, transport).detectCapabilities('capability-test');
  assert.equal(capabilities.endpointManagement.available, true);
  assert.equal(capabilities.unifiedAssetInventory.available, false);
  assert.equal(capabilities.unifiedAssetInventory.reason, 'CORTEX_SERVER_ERROR');

  let assetRequested = false;
  const endpointOnly = await new CortexClient(configuration, async (request) => {
    assetRequested ||= request.url.pathname.endsWith('/assets');
    return { statusCode: 200, headers: {}, body: { reply: { endpoints: [], total_count: 0, result_count: 0 } } };
  }).detectCapabilities('endpoint-only-test', undefined, 'ENDPOINTS');
  assert.equal(endpointOnly.endpointManagement.available, true);
  assert.equal(endpointOnly.unifiedAssetInventory.reason, 'NOT_CHECKED');
  assert.equal(assetRequested, false);
});
