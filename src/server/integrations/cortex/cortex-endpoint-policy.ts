import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateOrLocalAddress } from '../vcenter/vcenter-endpoint-policy.js';

export class CortexEndpointPolicyError extends Error {
  public constructor(public readonly code: 'CORTEX_CONFIG_INVALID' | 'CORTEX_DNS_FAILED', message: string) { super(message); this.name = 'CortexEndpointPolicyError'; }
}

export type CortexTransportConfiguration = {
  endpointUrl: string; endpointAllowPrivateNetwork: boolean; tlsVerifyCertificates: boolean;
  requestTimeoutMs: number; responseSizeLimitBytes: number;
};

export function validateCortexTransport(configuration: CortexTransportConfiguration): URL {
  let url: URL;
  try { url = new URL(configuration.endpointUrl); } catch { throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'Cortex endpoint must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'Cortex endpoint must be an HTTPS origin without credentials, path, query, or fragment.');
  if (!configuration.tlsVerifyCertificates) throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'TLS certificate verification must remain enabled for Cortex connectors.');
  if (!Number.isInteger(configuration.requestTimeoutMs) || configuration.requestTimeoutMs < 1000 || configuration.requestTimeoutMs > 120000) throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'Cortex request timeout is outside the allowed range.');
  if (!Number.isInteger(configuration.responseSizeLimitBytes) || configuration.responseSizeLimitBytes < 65536 || configuration.responseSizeLimitBytes > 268435456) throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'Cortex response size limit is outside the allowed range.');
  return url;
}

/** Resolve immediately before each request to constrain DNS-rebinding SSRF. */
export async function assertCortexResolvedTarget(configuration: CortexTransportConfiguration): Promise<URL> {
  const url = validateCortexTransport(configuration); const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || isPrivateOrLocalAddress(host)) {
    if (!configuration.endpointAllowPrivateNetwork) throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'Private or local Cortex targets require explicit endpointAllowPrivateNetwork approval.');
    return url;
  }
  try {
    const addresses = (isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    if (!addresses.length || (!configuration.endpointAllowPrivateNetwork && addresses.some(isPrivateOrLocalAddress))) throw new CortexEndpointPolicyError('CORTEX_CONFIG_INVALID', 'Cortex target resolves to a private or local address without explicit approval.');
  } catch (error) { if (error instanceof CortexEndpointPolicyError) throw error; throw new CortexEndpointPolicyError('CORTEX_DNS_FAILED', 'Cortex endpoint DNS resolution failed.'); }
  return url;
}
