import crypto from 'node:crypto';
import https from 'node:https';
import { z } from 'zod';
import { assertCortexResolvedTarget, type CortexTransportConfiguration } from './cortex-endpoint-policy.js';

export type CortexApiKeySecurityLevel = 'STANDARD' | 'ADVANCED';
export type CortexClientConfiguration = CortexTransportConfiguration & {
  apiKeyId: string;
  apiKey: string;
  apiKeySecurityLevel?: CortexApiKeySecurityLevel;
  tlsCa?: string;
  pageSize?: number;
  maxRetries?: number;
};
export type CortexTransport = (request: {
  method: 'GET' | 'POST'; url: URL; body?: string; headers: Record<string, string>;
  timeoutMs: number; maxResponseBytes: number; ca?: string; signal?: AbortSignal;
}) => Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: unknown }>;

export type CortexCapability = { available: boolean; statusCode?: number; reason?: string };
export type CortexPage = { records: Record<string, unknown>[]; totalCount?: number; resultCount?: number };
export type CortexCapabilities = {
  endpointInventory: CortexCapability;
  unifiedAssetInventory: CortexCapability & { schemaFieldCount?: number };
};

const endpointReplySchema = z.object({ reply: z.object({
  endpoints: z.array(z.record(z.unknown())).optional(),
  total_count: z.number().int().nonnegative().optional(),
  result_count: z.number().int().nonnegative().optional(),
}).passthrough() }).passthrough();
const assetReplySchema = z.object({ reply: z.object({
  data: z.array(z.record(z.unknown())).optional(),
  metadata: z.object({
    filter_count: z.number().int().nonnegative().optional(),
    total_count: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
  // Kept for backwards compatibility with older tenant response envelopes.
  total_count: z.number().int().nonnegative().optional(),
  result_count: z.number().int().nonnegative().optional(),
}).passthrough() }).passthrough();

export class CortexConnectorError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly statusCode?: number,
    public readonly responseHeaders: Record<string, string | string[] | undefined> = {},
  ) { super(message); this.name = 'CortexConnectorError'; }
}

const defaultTransport: CortexTransport = ({ method, url, body, headers, timeoutMs, maxResponseBytes, ca, signal }) => new Promise((resolve, reject) => {
  const request = https.request(url, { method, headers, rejectUnauthorized: true, ca, timeout: timeoutMs }, (response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxResponseBytes) request.destroy(new CortexConnectorError('CORTEX_RESPONSE_TOO_LARGE', 'Cortex response exceeded the configured size limit.'));
      else chunks.push(chunk);
    });
    response.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: {} });
      try { resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: JSON.parse(raw) }); }
      catch {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) return resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: {} });
        reject(new CortexConnectorError('CORTEX_RESPONSE_INVALID', 'Cortex returned invalid JSON.'));
      }
    });
  });
  request.on('timeout', () => request.destroy(Object.assign(new Error('Cortex request timed out.'), { code: 'ETIMEDOUT' })));
  request.on('error', reject);
  signal?.addEventListener('abort', () => request.destroy(Object.assign(new Error('Cortex request cancelled.'), { code: 'ABORT_ERR' })), { once: true });
  request.end(body);
});

const retryAfterMs = (headers: Record<string, string | string[] | undefined>) => {
  const raw = headers['retry-after'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const seconds = value === undefined ? Number.NaN : Number(value);
  if (Number.isFinite(seconds)) return Math.min(60000, Math.max(0, seconds * 1000));
  const date = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(date) ? Math.min(60000, Math.max(0, date - Date.now())) : undefined;
};
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('Cortex request cancelled.'), { code: 'ABORT_ERR' })); }, { once: true });
});
const redirectApiOrigin = (location: string | string[] | undefined, requestUrl: URL): string | undefined => {
  const raw = Array.isArray(location) ? location[0] : location;
  if (!raw) return undefined;
  try { const target = new URL(raw, requestUrl); return target.protocol === 'https:' && target.hostname.toLowerCase().startsWith('api-') ? target.origin : undefined; }
  catch { return undefined; }
};

const cortexNonce = () => Array.from({ length: 64 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[crypto.randomInt(62)]).join('');
const cortexTimestamp = () => String(Math.floor(Date.now() / 1000) * 1000);

/** Advanced keys prove each request without transmitting the raw API key. */
export function cortexAuthenticationHeaders(configuration: Pick<CortexClientConfiguration, 'apiKey' | 'apiKeyId' | 'apiKeySecurityLevel'>, nonce = cortexNonce(), timestamp = cortexTimestamp()): Record<string, string> {
  if (configuration.apiKeySecurityLevel === 'ADVANCED') {
    const authorization = crypto.createHash('sha256').update(`${configuration.apiKey}${nonce}${timestamp}`, 'utf8').digest('hex');
    return { authorization, 'x-xdr-auth-id': configuration.apiKeyId, 'x-xdr-nonce': nonce, 'x-xdr-timestamp': timestamp };
  }
  return { authorization: configuration.apiKey, 'x-xdr-auth-id': configuration.apiKeyId };
}

export class CortexClient {
  public constructor(private readonly configuration: CortexClientConfiguration, private readonly transport: CortexTransport = defaultTransport) {}

  private async request(method: 'GET' | 'POST', path: string, body: unknown, correlationId: string, signal?: AbortSignal) {
    const retries = Math.min(5, Math.max(0, this.configuration.maxRetries ?? 3));
    for (let attempt = 0;; attempt += 1) {
      try {
        const origin = await assertCortexResolvedTarget(this.configuration);
        const requestUrl = new URL(path, origin);
        const serialized = method === 'POST' ? JSON.stringify(body ?? {}) : undefined;
        const result = await this.transport({
          method, url: requestUrl, body: serialized,
          headers: { accept: 'application/json', ...(serialized ? { 'content-type': 'application/json' } : {}), ...cortexAuthenticationHeaders(this.configuration), 'x-correlation-id': correlationId },
          timeoutMs: this.configuration.requestTimeoutMs, maxResponseBytes: this.configuration.responseSizeLimitBytes,
          ca: this.configuration.tlsCa, signal,
        });
        if (result.statusCode === 401) throw new CortexConnectorError('CORTEX_AUTH_FAILED', 'Cortex authentication was rejected.', false, result.statusCode, result.headers);
        if (result.statusCode >= 300 && result.statusCode < 400) {
          const apiOrigin = redirectApiOrigin(result.headers.location, requestUrl);
          throw new CortexConnectorError('CORTEX_API_REDIRECT', apiOrigin
            ? `Cortex redirected this request. Update the connector Base URL to the Cortex API origin: ${apiOrigin}.`
            : 'Cortex redirected this request. Configure the API origin shown in Cortex, not the console or sign-in URL.', false, result.statusCode, result.headers);
        }
        if ([408, 425, 429].includes(result.statusCode) || result.statusCode >= 500) throw new CortexConnectorError(result.statusCode === 429 ? 'CORTEX_RATE_LIMITED' : 'CORTEX_SERVER_ERROR', 'Cortex API is temporarily unavailable.', true, result.statusCode, result.headers);
        return result;
      } catch (error: any) {
        if (['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(String(error?.code))) throw new CortexConnectorError('CORTEX_TLS_FAILED', 'Cortex TLS certificate validation failed.');
        const retryable = error instanceof CortexConnectorError ? error.retryable : ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(String(error?.code));
        if (!retryable || attempt >= retries) throw error instanceof CortexConnectorError ? error : new CortexConnectorError('CORTEX_TRANSPORT_FAILED', 'Cortex transport request failed.', retryable);
        const backoffCeiling = Math.min(30000, 500 * 2 ** attempt);
        const backoff = Math.floor(Math.random() * Math.max(1, backoffCeiling));
        await pause(error instanceof CortexConnectorError ? retryAfterMs(error.responseHeaders) ?? backoff : backoff, signal);
      }
    }
  }

  public async endpointPage(searchFrom: number, correlationId: string, options: { lastSeenAfter?: number; pageSize?: number; signal?: AbortSignal } = {}): Promise<CortexPage> {
    const pageSize = Math.min(100, Math.max(1, options.pageSize || this.configuration.pageSize || 100));
    const filters = options.lastSeenAfter === undefined ? [] : [{ field: 'last_seen', operator: 'gte', value: options.lastSeenAfter }];
    // Cortex treats search_to as the exclusive upper boundary in practice: the
    // documented 0..100 window returns at most 100 records. Subtracting one
    // silently reduced every full page to 99 records on the live tenant.
    const result = await this.request('POST', '/public_api/v1/endpoints/get_endpoint', { request_data: { filters, search_from: searchFrom, search_to: searchFrom + pageSize, sort: { field: 'endpoint_id', keyword: 'ASC' } } }, correlationId, options.signal);
    if (result.statusCode < 200 || result.statusCode >= 300) throw new CortexConnectorError('CORTEX_CAPABILITY_UNAVAILABLE', `Cortex Endpoint API is unavailable (HTTP ${result.statusCode}).`, false, result.statusCode, result.headers);
    const reply = endpointReplySchema.safeParse(result.body);
    if (!reply.success) throw new CortexConnectorError('CORTEX_RESPONSE_INVALID', 'Cortex Endpoint API returned an invalid reply envelope.');
    return { records: reply.data.reply.endpoints || [], totalCount: reply.data.reply.total_count, resultCount: reply.data.reply.result_count };
  }

  /** Backwards-compatible endpoint page used by existing callers/tests. */
  public async page(searchFrom: number, correlationId: string, signal?: AbortSignal): Promise<{ endpoints: Record<string, unknown>[]; totalCount?: number }> {
    const page = await this.endpointPage(searchFrom, correlationId, { signal });
    return { endpoints: page.records, totalCount: page.totalCount };
  }

  public async assetPage(searchFrom: number, correlationId: string, options: { lastObservedAfter?: number; signal?: AbortSignal } = {}): Promise<CortexPage> {
    const pageSize = Math.min(1000, Math.max(1, this.configuration.pageSize || 100));
    const filters = options.lastObservedAfter === undefined ? undefined : { AND: [{ SEARCH_FIELD: 'xdm.asset.last_observed', SEARCH_TYPE: 'GTE', SEARCH_VALUE: options.lastObservedAfter }] };
    const result = await this.request('POST', '/public_api/v1/assets', { ...(filters ? { filters } : {}), on_demand_fields: ['xdm.host.ipv4_addresses', 'xdm.host.mac_addresses'], sort: [{ FIELD: 'xdm.asset.strong_id', ORDER: 'ASC' }], search_from: searchFrom, search_to: searchFrom + pageSize }, correlationId, options.signal);
    if (result.statusCode < 200 || result.statusCode >= 300) throw new CortexConnectorError('CORTEX_CAPABILITY_UNAVAILABLE', `Cortex Unified Asset Inventory API is unavailable (HTTP ${result.statusCode}).`, false, result.statusCode, result.headers);
    const reply = assetReplySchema.safeParse(result.body);
    if (!reply.success) throw new CortexConnectorError('CORTEX_RESPONSE_INVALID', 'Cortex Unified Asset Inventory API returned an invalid reply envelope.');
    return {
      records: reply.data.reply.data || [],
      totalCount: reply.data.reply.metadata?.total_count ?? reply.data.reply.total_count,
      resultCount: reply.data.reply.metadata?.filter_count ?? reply.data.reply.result_count,
    };
  }

  public async detectCapabilities(correlationId: string, signal?: AbortSignal): Promise<CortexCapabilities> {
    const capability = async (operation: () => Promise<unknown>): Promise<CortexCapability> => {
      try { await operation(); return { available: true }; }
      catch (error: any) {
        if (error instanceof CortexConnectorError && error.code === 'CORTEX_AUTH_FAILED') throw error;
        if (error instanceof CortexConnectorError && error.code === 'CORTEX_CAPABILITY_UNAVAILABLE') return { available: false, statusCode: error.statusCode, reason: error.statusCode === 403 ? 'FORBIDDEN_OR_UNLICENSED' : 'NOT_EXPOSED' };
        throw error;
      }
    };
    // Capability probing should not download an inventory page that the sync
    // will immediately request again.
    const endpointInventory = await capability(() => this.endpointPage(0, correlationId, { pageSize: 1, signal }));
    let schemaFieldCount: number | undefined;
    const unifiedAssetInventory = await capability(async () => {
      const result = await this.request('GET', '/public_api/v1/assets/schema', undefined, correlationId, signal);
      if (result.statusCode < 200 || result.statusCode >= 300) throw new CortexConnectorError('CORTEX_CAPABILITY_UNAVAILABLE', `Cortex Asset Inventory schema API is unavailable (HTTP ${result.statusCode}).`, false, result.statusCode, result.headers);
      const reply = (result.body as any)?.reply;
      const fields = Array.isArray(reply?.data) ? reply.data : Array.isArray(reply?.fields) ? reply.fields : [];
      schemaFieldCount = fields.length;
    });
    return { endpointInventory, unifiedAssetInventory: { ...unifiedAssetInventory, ...(schemaFieldCount === undefined ? {} : { schemaFieldCount }) } };
  }
}
