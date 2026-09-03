import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { VCenterCapabilities, VCenterCertificateMetadata, VCenterConnectionSnapshot, VCenterConnectorConfiguration, VCenterErrorCode, VCenterRuntimeState, VCenterServerInfo, VCenterConnectionTestResult } from '../../../shared/types/vcenter.js';
import { assertVCenterResolvedTarget, validateVCenterTransport, vCenterRequestPolicy } from './vcenter-endpoint-policy.js';

export type VCenterCredential = { username: string; password: string };
export type VCenterRestSession = { connectorId: string; token: string; expiresAt: number };
/** Stable inventory summary records returned by the vCenter REST inventory APIs. */
export type VCenterInventoryObject = {
  objectType:
    | 'VirtualMachine'
    | 'HostSystem'
    | 'ClusterComputeResource'
    | 'Datacenter'
    | 'Datastore'
    | 'Network'
    | 'ResourcePool'
    | 'VCenterServer';
  objectId: string;
  name: string;
  payload: Record<string, unknown>;
};
export class VCenterConnectorError extends Error { constructor(public readonly code: VCenterErrorCode, message: string, public readonly retryable: boolean) { super(message); this.name = 'VCenterConnectorError'; } }
export class VCenterRetryPolicy { private static readonly retryableCodes = new Set<VCenterErrorCode>(['VCENTER_DNS_FAILED', 'VCENTER_CONNECT_TIMEOUT', 'VCENTER_SESSION_EXPIRED', 'VCENTER_RATE_LIMITED', 'VCENTER_INTERNAL_ERROR']); public static isRetryable(code: VCenterErrorCode): boolean { return this.retryableCodes.has(code); } public static delayMs(attempt: number, random = Math.random): number { const safe = Math.max(1, Math.min(10, Math.floor(attempt))); return Math.min(300_000, Math.floor(Math.min(300_000, 1_000 * 2 ** (safe - 1)) * (0.5 + Math.max(0, Math.min(1, random()))))); } }

function credential(value: unknown): VCenterCredential { if (!value || typeof value !== 'object' || typeof (value as any).username !== 'string' || typeof (value as any).password !== 'string' || !(value as any).username || !(value as any).password) throw new VCenterConnectorError('VCENTER_CONFIG_INVALID', 'vCenter credential must provide username and password.', false); return { username: (value as any).username, password: (value as any).password }; }
function mapTransportError(error: any): VCenterConnectorError { const code = String(error?.code || ''); if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new VCenterConnectorError('VCENTER_DNS_FAILED', 'vCenter DNS resolution failed.', true); if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED') return new VCenterConnectorError('VCENTER_CONNECT_TIMEOUT', 'vCenter endpoint could not be reached within the configured timeout.', true); if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') return new VCenterConnectorError('VCENTER_TLS_HOSTNAME_MISMATCH', 'vCenter TLS certificate hostname validation failed.', false); if (code === 'CERT_HAS_EXPIRED' || code === 'CERT_NOT_YET_VALID') return new VCenterConnectorError('VCENTER_TLS_EXPIRED', 'vCenter TLS certificate is expired or not yet valid.', false); if (/CERT|TLS|SSL|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(code)) return new VCenterConnectorError('VCENTER_TLS_UNTRUSTED', 'vCenter TLS certificate trust validation failed.', false); return new VCenterConnectorError('VCENTER_TLS_HANDSHAKE_FAILED', 'vCenter TLS handshake failed.', true); }
function certificateMetadata(socket: tls.TLSSocket | null | undefined): VCenterCertificateMetadata | undefined { if (!socket) return undefined; const cert = socket.getPeerCertificate(); if (!cert?.raw) return undefined; return { subject: typeof cert.subject === 'object' ? String(cert.subject.CN || JSON.stringify(cert.subject)) : cert.subject, issuer: typeof cert.issuer === 'object' ? String(cert.issuer.CN || JSON.stringify(cert.issuer)) : cert.issuer, serialNumber: cert.serialNumber, notBefore: cert.valid_from ? new Date(cert.valid_from).toISOString() : undefined, notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : undefined, sha256Fingerprint: crypto.createHash('sha256').update(cert.raw).digest('hex').match(/.{2}/g)?.join(':').toUpperCase() }; }
type HttpResult = { status: number; body: string; certificate?: VCenterCertificateMetadata };
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
function customCaFilePath(reference: string): string {
  if (!reference.startsWith('file://')) throw new VCenterConnectorError('VCENTER_CONFIG_INVALID', 'Custom vCenter CA references must be backend-resolved file:// references.', false);
  const nativePath = fileURLToPath(reference);
  if (process.platform === 'win32') return nativePath;
  const hostRoot = process.env.VCENTER_CA_HOST_ROOT?.replace(/\\/g, '/').replace(/\/+$/, '');
  const mountRoot = process.env.VCENTER_CA_MOUNT_ROOT;
  const windowsPath = nativePath.replace(/^\/([A-Za-z]:\/)/, '$1').replace(/\\/g, '/');
  if (hostRoot && mountRoot && windowsPath.toLowerCase().startsWith(`${hostRoot.toLowerCase()}/`)) {
    return path.posix.join(mountRoot, windowsPath.slice(hostRoot.length + 1));
  }
  return nativePath;
}

/** Connector-local REST client. Tokens never leave this in-memory map. */
export class VCenterRestClient {
  private readonly sessions = new Map<string, VCenterRestSession>();
  private readonly agent = new https.Agent({ keepAlive: true, maxSockets: 4, maxFreeSockets: 2, scheduling: 'lifo' });
  public constructor(private readonly caResolver: (reference: string) => Promise<string | undefined> = async (reference) => {
    return fs.readFile(customCaFilePath(reference), 'utf8');
  }) {}
  public async test(configuration: VCenterConnectorConfiguration, rawCredential: unknown): Promise<VCenterConnectionSnapshot> {
    validateVCenterTransport(configuration); await assertVCenterResolvedTarget(configuration);
    const ca = configuration.tlsCaReference ? await this.caResolver(configuration.tlsCaReference) : undefined; const certificate = await this.handshake(configuration, ca); const creds = credential(rawCredential); const session = await this.createSession(configuration, creds, ca);
    const sessionInfo = await this.withSessionRetry(configuration, creds, ca, (active) => this.request(configuration, '/api/session', 'GET', active.token, {}, ca)); if (sessionInfo.status >= 400) throw this.httpError(sessionInfo.status, 'vCenter session validation failed.');
    const inventory = await this.withSessionRetry(configuration, creds, ca, (active) => this.request(configuration, '/api/vcenter/vm', 'GET', active.token, {}, ca)); if (inventory.status >= 400) throw this.httpError(inventory.status, 'vCenter inventory permission check failed.');
    const version = await this.withSessionRetry(configuration, creds, ca, (active) => this.request(configuration, '/api/appliance/system/version', 'GET', active.token, {}, ca)); const info = serverInfo(version.body); const capabilities = capabilitiesFor(info);
    return { server: info, capabilities, certificate, connectionTestedAt: new Date().toISOString(), testResult: { status: 'READY', connection: { validateConfig: 'OK', resolveSecret: 'OK', dns: 'OK', tcp: 'OK', tls: 'OK', authentication: 'OK', session: 'OK', inventory: 'OK', permissions: 'OK', serverInfo: version.status < 400 ? 'OK' : 'SKIPPED' }, server: info, capabilities, session: sessionIdentity(sessionInfo.body, creds.username) } };
  }
  public invalidate(connectorId: string): void { this.sessions.delete(connectorId); }
  public async discover(configuration: VCenterConnectorConfiguration, rawCredential: unknown, onProgress?: (progress: { objectType: VCenterInventoryObject['objectType']; discovered: number; phase: 'LISTED' | 'COLLECTED' }) => Promise<void> | void): Promise<VCenterInventoryObject[]> {
    validateVCenterTransport(configuration); await assertVCenterResolvedTarget(configuration);
    const ca = configuration.tlsCaReference ? await this.caResolver(configuration.tlsCaReference) : undefined; const creds = credential(rawCredential);
    // These are documented, independent REST inventory collections. Keep each
    // source object keyed by its MoRef only within this connector namespace.
    const endpoints: Array<[VCenterInventoryObject['objectType'], string, string]> = [
      ['VirtualMachine', '/api/vcenter/vm', 'vm'],
      ['HostSystem', '/api/vcenter/host', 'host'],
      ['ClusterComputeResource', '/api/vcenter/cluster', 'cluster'],
      ['Datacenter', '/api/vcenter/datacenter', 'datacenter'],
      ['Datastore', '/api/vcenter/datastore', 'datastore'],
      ['Network', '/api/vcenter/network', 'network'],
      ['ResourcePool', '/api/vcenter/resource-pool', 'resource_pool'],
    ];
    const objects: VCenterInventoryObject[] = [];
    for (const [objectType, path, idKey] of endpoints) {
      const response = await this.withSessionRetry(configuration, creds, ca, (active) => this.request(configuration, path, 'GET', active.token, {}, ca));
      if (response.status >= 400) throw this.httpError(response.status, `vCenter ${objectType} inventory query failed.`);
      let rows: unknown;
      try { rows = JSON.parse(response.body); } catch { throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', `vCenter ${objectType} inventory response was not valid JSON.`, false); }
      if (!Array.isArray(rows)) throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', `vCenter ${objectType} inventory response was not an array.`, false);
      await onProgress?.({ objectType, discovered: objects.length, phase: 'LISTED' });
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const payload = row as Record<string, unknown>;
        const objectId = payload[idKey]; const name = payload.name;
        if (typeof objectId !== 'string' || !objectId || typeof name !== 'string' || !name) throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', `vCenter ${objectType} inventory contains an object without a stable ID or name.`, false);
        objects.push({ objectType, objectId, name, payload: objectType === 'VirtualMachine' ? await this.hydrateVirtualMachine(configuration, creds, ca, objectId, payload) : payload });
        await onProgress?.({ objectType, discovered: objects.length, phase: 'COLLECTED' });
      }
    }
    return objects;
  }
  /**
   * The inventory list is intentionally only a summary. Enrich VMs with the
   * documented detail, Ethernet, disk and guest-identity reads before the
   * payload enters the source ledger. This remains connector-scoped and
   * read-only; the CMDB mapper, rather than this client, decides what wins.
   */
  private async hydrateVirtualMachine(configuration: VCenterConnectorConfiguration, creds: VCenterCredential, ca: string | undefined, vm: string, summary: Record<string, unknown>): Promise<Record<string, unknown>> {
    const encodedVm = encodeURIComponent(vm);
    const detail = asRecord(await this.requiredJson(configuration, creds, ca, `/api/vcenter/vm/${encodedVm}`, 'vCenter VM detail query failed.'));
    const guest = await this.optionalJson(configuration, creds, ca, `/api/vcenter/vm/${encodedVm}/guest/identity`);
    const nics = await this.hardwareDetails(configuration, creds, ca, encodedVm, 'ethernet', 'nic');
    const disks = await this.hardwareDetails(configuration, creds, ca, encodedVm, 'disk', 'disk');
    const identity = asRecord(detail.identity);
    return {
      ...summary,
      ...detail,
      instance_uuid: stringValue(identity.instance_uuid) || stringValue(detail.instance_uuid) || stringValue(summary.instance_uuid),
      bios_uuid: stringValue(identity.bios_uuid) || stringValue(detail.bios_uuid) || stringValue(summary.bios_uuid),
      guest,
      nics,
      disks,
    };
  }
  private async hardwareDetails(configuration: VCenterConnectorConfiguration, creds: VCenterCredential, ca: string | undefined, encodedVm: string, kind: 'ethernet' | 'disk', idKey: 'nic' | 'disk'): Promise<Record<string, unknown>[]> {
    const listed = await this.requiredJson(configuration, creds, ca, `/api/vcenter/vm/${encodedVm}/hardware/${kind}`, `vCenter VM ${kind} inventory query failed.`);
    if (!Array.isArray(listed)) throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', `vCenter VM ${kind} inventory response was not an array.`, false);
    const results: Record<string, unknown>[] = [];
    for (const item of listed) {
      const row = asRecord(item); const id = stringValue(row[idKey]);
      if (!id) throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', `vCenter VM ${kind} inventory contains an object without a stable ID.`, false);
      const detail = await this.requiredJson(configuration, creds, ca, `/api/vcenter/vm/${encodedVm}/hardware/${kind}/${encodeURIComponent(id)}`, `vCenter VM ${kind} detail query failed.`);
      results.push({ [idKey]: id, ...detail });
    }
    return results;
  }
  private async requiredJson(configuration: VCenterConnectorConfiguration, creds: VCenterCredential, ca: string | undefined, path: string, message: string): Promise<Record<string, unknown> | unknown[]> {
    const response = await this.withSessionRetry(configuration, creds, ca, (active) => this.request(configuration, path, 'GET', active.token, {}, ca));
    if (response.status >= 400) throw this.httpError(response.status, message);
    try { return JSON.parse(response.body) as Record<string, unknown> | unknown[]; } catch { throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', `${message} Response was not valid JSON.`, false); }
  }
  private async optionalJson(configuration: VCenterConnectorConfiguration, creds: VCenterCredential, ca: string | undefined, path: string): Promise<Record<string, unknown> | undefined> {
    const response = await this.withSessionRetry(configuration, creds, ca, (active) => this.request(configuration, path, 'GET', active.token, {}, ca));
    // Guest identity is supplied by VMware Tools. Absence, an unsupported API,
    // or a source policy that omits guest telemetry is evidence of no guest
    // fact, not an inventory failure.
    if ([403, 404, 501, 503].includes(response.status)) return undefined;
    if (response.status >= 400) throw this.httpError(response.status, 'vCenter guest identity query failed.');
    try { const value = JSON.parse(response.body); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; } catch { return undefined; }
  }
  private async createSession(configuration: VCenterConnectorConfiguration, creds: VCenterCredential, ca?: string): Promise<VCenterRestSession> { const auth = Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64'); const response = await this.request(configuration, '/api/session', 'POST', undefined, { authorization: `Basic ${auth}`, 'content-length': '0' }, ca); if (response.status >= 400) throw this.httpError(response.status, 'vCenter rejected the service-account credentials.'); let token: unknown; try { token = JSON.parse(response.body); } catch { throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', 'vCenter session response was not valid JSON.', false); } if (typeof token !== 'string' || !token) throw new VCenterConnectorError('VCENTER_RESPONSE_INVALID', 'vCenter session response did not contain a session ID.', false); const session = { connectorId: configuration.connectorId, token, expiresAt: Date.now() + 20 * 60_000 }; this.sessions.set(configuration.connectorId, session); return session; }
  private async withSessionRetry(configuration: VCenterConnectorConfiguration, creds: VCenterCredential, ca: string | undefined, call: (session: VCenterRestSession) => Promise<HttpResult>): Promise<HttpResult> { let active = this.sessions.get(configuration.connectorId); if (!active || active.expiresAt <= Date.now()) active = await this.createSession(configuration, creds, ca); let result = await call(active); if (result.status !== 401) return result; this.invalidate(configuration.connectorId); active = await this.createSession(configuration, creds, ca); result = await call(active); if (result.status === 401) throw new VCenterConnectorError('VCENTER_SESSION_EXPIRED', 'vCenter session expired after one re-authentication retry.', true); return result; }
  private async handshake(configuration: VCenterConnectorConfiguration, ca?: string): Promise<VCenterCertificateMetadata | undefined> { const host = validateVCenterTransport(configuration); const policy = vCenterRequestPolicy(configuration); return new Promise((resolve, reject) => { const socket = tls.connect({ host, port: configuration.port, servername: host, rejectUnauthorized: true, ca, timeout: policy.timeoutMs }, () => { const cert = certificateMetadata(socket); socket.end(); resolve(cert); }); socket.once('error', (error) => reject(mapTransportError(error))); socket.once('timeout', () => socket.destroy(new VCenterConnectorError('VCENTER_CONNECT_TIMEOUT', 'vCenter TLS handshake timed out.', true))); }); }
  private async request(configuration: VCenterConnectorConfiguration, path: string, method: 'GET' | 'POST', token?: string, headers: Record<string, string> = {}, ca?: string): Promise<HttpResult> { const host = validateVCenterTransport(configuration); const policy = vCenterRequestPolicy(configuration); return new Promise((resolve, reject) => { const request = https.request({ agent: this.agent, hostname: host, servername: host, port: configuration.port, path, method, rejectUnauthorized: true, ca, timeout: policy.timeoutMs, headers: { accept: 'application/json', ...(token ? { 'vmware-api-session-id': token } : {}), ...headers } }, (response) => { const chunks: Buffer[] = []; let length = 0; response.on('data', (chunk: Buffer) => { length += chunk.length; if (length <= policy.maxResponseBytes) chunks.push(chunk); else request.destroy(new VCenterConnectorError('VCENTER_RESPONSE_INVALID', 'vCenter response exceeded the configured size limit.', false)); }); response.once('end', () => resolve({ status: response.statusCode || 500, body: Buffer.concat(chunks).toString('utf8'), certificate: certificateMetadata(response.socket as tls.TLSSocket) })); }); request.once('timeout', () => request.destroy(new VCenterConnectorError('VCENTER_CONNECT_TIMEOUT', 'vCenter API request timed out.', true))); request.once('error', (error) => reject(error instanceof VCenterConnectorError ? error : mapTransportError(error))); request.end(); }); }
  private httpError(status: number, message: string): VCenterConnectorError { if (status === 401 || status === 403) return new VCenterConnectorError('VCENTER_AUTH_FAILED', message, false); if (status === 429) return new VCenterConnectorError('VCENTER_RATE_LIMITED', 'vCenter rate limited the request.', true); if (status >= 500) return new VCenterConnectorError('VCENTER_INTERNAL_ERROR', 'vCenter API returned a server error.', true); return new VCenterConnectorError(status === 404 ? 'VCENTER_API_UNSUPPORTED' : 'VCENTER_PERMISSION_DENIED', message, false); }
}
function serverInfo(body: string): VCenterServerInfo { try { const parsed = JSON.parse(body); const version = String(parsed.version || parsed.product_version || '8.x'); const instanceUuid = stringValue(parsed.instance_uuid) || stringValue(parsed.instanceUuid) || stringValue(parsed.system_uuid); return { product: String(parsed.product || 'VMware vCenter Server'), version, build: String(parsed.build || parsed.build_number || ''), apiVersion: version, ...(instanceUuid ? { instanceUuid } : {}) }; } catch { return { product: 'VMware vCenter Server', version: '8.x', build: '' }; } }
function capabilitiesFor(info: VCenterServerInfo): VCenterCapabilities { return { version: info.version, build: info.build, ...(info.apiVersion ? { apiVersion: info.apiVersion } : {}), supportsRestApi: true, supportsVmInventory: true, supportsHostInventory: true, supportsClusterInventory: true, supportsDatacenterInventory: true, supportsDatastoreInventory: true, supportsNetworkInventory: true, supportsResourcePoolInventory: true, supportsTagging: true }; }
function sessionIdentity(body: string, fallbackUsername: string): { username: string; createdAt?: string; lastAccessedAt?: string } { try { const value = JSON.parse(body); return { username: String(value.user || value.username || fallbackUsername), ...(value.creation_time ? { createdAt: String(value.creation_time) } : {}), ...(value.last_access_time ? { lastAccessedAt: String(value.last_access_time) } : {}) }; } catch { return { username: fallbackUsername }; } }
export class VCenterConnector { private readonly runtimeState: VCenterRuntimeState; public constructor(public readonly configuration: VCenterConnectorConfiguration, private readonly client: VCenterRestClient) { validateVCenterTransport(configuration); this.runtimeState = { connectorId: configuration.connectorId, retryAttempt: 0 }; } public getRuntimeState(): VCenterRuntimeState { return { ...this.runtimeState }; } public markRetryableFailure(code: VCenterErrorCode, now = new Date()): void { if (!VCenterRetryPolicy.isRetryable(code)) return; this.runtimeState.retryAttempt += 1; this.runtimeState.nextRetryAt = new Date(now.getTime() + VCenterRetryPolicy.delayMs(this.runtimeState.retryAttempt)).toISOString(); } public markConnectionSuccess(): void { this.runtimeState.retryAttempt = 0; delete this.runtimeState.nextRetryAt; } public connect(rawCredential: unknown): Promise<VCenterConnectionSnapshot> { return this.client.test(this.configuration, rawCredential); } public discover(rawCredential: unknown, onProgress?: (progress: { objectType: VCenterInventoryObject['objectType']; discovered: number; phase: 'LISTED' | 'COLLECTED' }) => Promise<void> | void): Promise<VCenterInventoryObject[]> { return this.client.discover(this.configuration, rawCredential, onProgress); } public disconnect(): Promise<void> { this.client.invalidate(this.configuration.connectorId); return Promise.resolve(); } }
