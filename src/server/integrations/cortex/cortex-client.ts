import https from 'node:https';
import { z } from 'zod';
import { assertCortexResolvedTarget, type CortexTransportConfiguration } from './cortex-endpoint-policy.js';

export type CortexClientConfiguration = CortexTransportConfiguration & { apiKeyId: string; apiKey: string; tlsCa?: string; pageSize?: number; maxRetries?: number; };
export type CortexTransport = (request: { url: URL; body: string; headers: Record<string, string>; timeoutMs: number; maxResponseBytes: number; ca?: string; signal?: AbortSignal }) => Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: unknown }>;
const replySchema = z.object({ reply: z.object({ endpoints: z.array(z.record(z.unknown())).optional(), total_count: z.number().int().nonnegative().optional() }).passthrough() }).passthrough();
export class CortexConnectorError extends Error { public constructor(public readonly code: string, message: string, public readonly retryable = false) { super(message); this.name = 'CortexConnectorError'; } }

const defaultTransport: CortexTransport = ({ url, body, headers, timeoutMs, maxResponseBytes, ca, signal }) => new Promise((resolve, reject) => {
  const request = https.request(url, { method: 'POST', headers, rejectUnauthorized: true, ca, timeout: timeoutMs }, (response) => {
    const chunks: Buffer[] = []; let size = 0;
    response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maxResponseBytes) { request.destroy(new CortexConnectorError('CORTEX_RESPONSE_TOO_LARGE', 'Cortex response exceeded the configured size limit.')); } else chunks.push(chunk); });
    response.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      // Redirect and other non-success responses are commonly HTML. Preserve their
      // status and headers so the caller can give safe, actionable diagnostics.
      if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
        resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: {} });
        return;
      }
      try { resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: raw ? JSON.parse(raw) : {} }); } catch { reject(new CortexConnectorError('CORTEX_RESPONSE_INVALID', 'Cortex returned invalid JSON.')); }
    });
  });
  request.on('timeout', () => request.destroy(Object.assign(new Error('Cortex request timed out.'), { code: 'ETIMEDOUT' })));
  request.on('error', reject); signal?.addEventListener('abort', () => request.destroy(Object.assign(new Error('Cortex request cancelled.'), { code: 'ABORT_ERR' })), { once: true }); request.end(body);
});
const retryAfterMs = (value: string | string[] | undefined) => { const raw = Array.isArray(value) ? value[0] : value; const seconds = raw === undefined ? Number.NaN : Number(raw); return Number.isFinite(seconds) ? Math.min(60000, Math.max(0, seconds * 1000)) : undefined; };
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('Cortex request cancelled.'), { code: 'ABORT_ERR' })); }, { once: true }); });
const redirectApiOrigin = (location: string | string[] | undefined, requestUrl: URL): string | undefined => {
  const raw = Array.isArray(location) ? location[0] : location;
  if (!raw) return undefined;
  try {
    const target = new URL(raw, requestUrl);
    return target.protocol === 'https:' && target.hostname.toLowerCase().startsWith('api-') ? target.origin : undefined;
  } catch { return undefined; }
};

export class CortexClient {
  public constructor(private readonly configuration: CortexClientConfiguration, private readonly transport: CortexTransport = defaultTransport) {}
  public async page(searchFrom: number, correlationId: string, signal?: AbortSignal): Promise<{ endpoints: Record<string, unknown>[]; totalCount?: number }> {
    const pageSize = Math.min(100, Math.max(1, this.configuration.pageSize || 100)); const retries = Math.min(5, Math.max(0, this.configuration.maxRetries ?? 3));
    for (let attempt = 0;; attempt += 1) try {
      const origin = await assertCortexResolvedTarget(this.configuration);
      const requestUrl = new URL('/public_api/v1/endpoints/get_endpoint', origin);
      const result = await this.transport({ url: requestUrl, body: JSON.stringify({ request_data: { search_from: searchFrom, search_to: searchFrom + pageSize - 1, sort: { field: 'endpoint_id', keyword: 'ASC' } } }), headers: { 'content-type': 'application/json', accept: 'application/json', authorization: this.configuration.apiKey, 'x-xdr-auth-id': this.configuration.apiKeyId, 'x-correlation-id': correlationId }, timeoutMs: this.configuration.requestTimeoutMs, maxResponseBytes: this.configuration.responseSizeLimitBytes, ca: this.configuration.tlsCa, signal });
      if (result.statusCode === 401 || result.statusCode === 403) throw new CortexConnectorError('CORTEX_AUTH_FAILED', 'Cortex authentication was rejected.');
      if (result.statusCode >= 300 && result.statusCode < 400) {
        const apiOrigin = redirectApiOrigin(result.headers.location, requestUrl);
        throw new CortexConnectorError('CORTEX_API_REDIRECT', apiOrigin
          ? `Cortex redirected this request. Update the connector Base URL to the Cortex API origin: ${apiOrigin}.`
          : 'Cortex redirected this request. Configure the connector with the API origin shown in Cortex (https://api-{tenant-fqdn}), not the console or sign-in URL.');
      }
      if (result.statusCode === 429 || result.statusCode >= 500) throw new CortexConnectorError(result.statusCode === 429 ? 'CORTEX_RATE_LIMITED' : 'CORTEX_SERVER_ERROR', 'Cortex endpoint query is temporarily unavailable.', true);
      if (result.statusCode < 200 || result.statusCode >= 300) throw new CortexConnectorError('CORTEX_HTTP_ERROR', `Cortex endpoint query failed with HTTP ${result.statusCode}.`);
      const reply = replySchema.safeParse(result.body); if (!reply.success) throw new CortexConnectorError('CORTEX_RESPONSE_INVALID', 'Cortex response did not contain a valid reply envelope.');
      return { endpoints: reply.data.reply.endpoints || [], totalCount: reply.data.reply.total_count };
    } catch (error: any) {
      if (['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(String(error?.code))) {
        throw new CortexConnectorError('CORTEX_TLS_FAILED', 'Cortex TLS certificate validation failed.');
      }
      const retryable = error instanceof CortexConnectorError ? error.retryable : ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(String(error?.code));
      if (!retryable || attempt >= retries) throw error instanceof CortexConnectorError ? error : new CortexConnectorError('CORTEX_TRANSPORT_FAILED', 'Cortex transport request failed.', retryable);
      await pause(retryAfterMs((error as any)?.headers?.['retry-after']) ?? Math.min(30000, 250 * 2 ** attempt), signal);
    }
  }
}
