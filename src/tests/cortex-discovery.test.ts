import assert from 'node:assert/strict';
import test from 'node:test';
import { CortexClient, CortexConnectorError, type CortexTransport } from '../server/integrations/cortex/cortex-client.js';
import { cortexEndpointPayloadMapper } from '../server/services/cortex-inventory-sync.service.js';

const envelope = { connectorId: 'cortex-a', syncRunId: 'run-a', sourceObjectType: 'CORTEX_ENDPOINT', sourceObjectId: 'ep-1', observedAt: '2026-09-01T00:00:00.000Z', rawPayload: {} } as const;
const configuration = { endpointUrl: 'https://localhost', endpointAllowPrivateNetwork: true, tlsVerifyCertificates: true, requestTimeoutMs: 1000, responseSizeLimitBytes: 65536, apiKeyId: '42', apiKey: 'not-a-real-secret', maxRetries: 1 };

test('Cortex endpoint normalizes through the generic observation DTO with scoped persistent identity', () => {
  const raw = cortexEndpointPayloadMapper.validateRaw({ endpoint_id: 'ep-1', endpoint_name: 'ws-01', fqdn: 'ws-01.bank.example', domain: 'bank.example', ip_addresses: ['10.0.0.5', 'not-an-ip'], mac_address: 'AA:BB:CC:DD:EE:FF', os_type: 'Windows', agent_version: '8.1', is_isolated: true, unknown_future_field: { preserved: true } });
  const dto = cortexEndpointPayloadMapper.normalize(raw, envelope);
  assert.equal(dto.source.objectId, 'ep-1');
  assert.deepEqual(dto.identity.identifiers[0], { type: 'EDR_DEVICE_ID', namespace: 'cortex-a', value: 'ep-1', confidence: 100, primary: true });
  assert.equal(dto.network.interfaces[0]?.ipAddresses.length, 1);
  assert.equal((dto.sourceSpecificMetadata.cortex as any).securityTelemetry.unknown_future_field.preserved, true);
  assert.throws(() => cortexEndpointPayloadMapper.validateRaw({ endpoint_name: 'missing-id' }), /endpoint_id/);
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
