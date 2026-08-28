import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import type { VCenterConnectorConfiguration } from '../../../shared/types/vcenter.js';

export class VCenterEndpointPolicyError extends Error {
  public constructor(public readonly code: 'VCENTER_CONFIG_INVALID' | 'VCENTER_DNS_FAILED', message: string) {
    super(message);
    this.name = 'VCenterEndpointPolicyError';
  }
}

export function normalizeVCenterHost(endpointFqdn: string): string {
  const host = endpointFqdn.trim().replace(/\.$/, '').toLowerCase();
  if (!host || host.includes('://') || /[\s/@%\\/?#]/.test(host)) {
    throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter endpoint must be a host name or IP address without credentials, scheme or path.');
  }
  if (isIP(host) === 0 && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host)) {
    throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter endpoint is not a valid DNS host name or IP address.');
  }
  return host;
}

export function validateVCenterTransport(configuration: Pick<VCenterConnectorConfiguration, 'endpointFqdn' | 'port' | 'tlsVerifyCertificates' | 'soapEndpointPath' | 'automationApiBasePath'>): string {
  const host = normalizeVCenterHost(configuration.endpointFqdn);
  if (!Number.isInteger(configuration.port) || configuration.port < 1 || configuration.port > 65535) {
    throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter port must be between 1 and 65535.');
  }
  if (!configuration.tlsVerifyCertificates) {
    throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'TLS certificate verification must remain enabled for vCenter connectors.');
  }
  if (configuration.soapEndpointPath !== '/sdk' || configuration.automationApiBasePath !== '/api') {
    throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter SOAP and Automation API paths are fixed to /sdk and /api.');
  }
  return host;
}

export function isPrivateOrLocalAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number);
    return first === 0 || first === 10 || first === 127 || first === 169 && second === 254
      || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) return isPrivateOrLocalAddress(normalized.slice(7));
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return false;
}

/** Resolve immediately before connect to reduce DNS-rebinding SSRF risk. */
export async function assertVCenterResolvedTarget(configuration: Pick<VCenterConnectorConfiguration, 'endpointFqdn' | 'port' | 'endpointAllowPrivateNetwork' | 'tlsVerifyCertificates' | 'soapEndpointPath' | 'automationApiBasePath'>): Promise<void> {
  const host = validateVCenterTransport(configuration);
  if (host === 'localhost' || host.endsWith('.local')) {
    if (!configuration.endpointAllowPrivateNetwork) throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'Private or local vCenter targets require explicit endpointAllowPrivateNetwork approval.');
    return;
  }
  if (isPrivateOrLocalAddress(host)) {
    if (!configuration.endpointAllowPrivateNetwork) throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'Private vCenter IP targets require explicit endpointAllowPrivateNetwork approval.');
    return;
  }
  try {
    const addresses = (await dns.lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    if (!addresses.length) throw new Error('No DNS address returned.');
    if (!configuration.endpointAllowPrivateNetwork && addresses.some(isPrivateOrLocalAddress)) {
      throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter DNS target resolves to a private or local address without explicit approval.');
    }
  } catch (error) {
    if (error instanceof VCenterEndpointPolicyError) throw error;
    throw new VCenterEndpointPolicyError('VCENTER_DNS_FAILED', 'vCenter endpoint DNS resolution failed.');
  }
}

export function vCenterRequestPolicy(configuration: Pick<VCenterConnectorConfiguration, 'requestTimeoutMs' | 'responseSizeLimitBytes'>): { timeoutMs: number; maxResponseBytes: number; redirect: 'error' } {
  if (!Number.isInteger(configuration.requestTimeoutMs) || configuration.requestTimeoutMs < 1000 || configuration.requestTimeoutMs > 120000) throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter request timeout is outside the allowed range.');
  if (!Number.isInteger(configuration.responseSizeLimitBytes) || configuration.responseSizeLimitBytes < 65536 || configuration.responseSizeLimitBytes > 268435456) throw new VCenterEndpointPolicyError('VCENTER_CONFIG_INVALID', 'vCenter response size limit is outside the allowed range.');
  return { timeoutMs: configuration.requestTimeoutMs, maxResponseBytes: configuration.responseSizeLimitBytes, redirect: 'error' };
}
