import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { config } from '../config/index.js';
import { pgClient } from '../db/postgres/client.js';
import { StrictReadOnlyLdapClient } from '../utils/readonly-ldap-client.js';
import { resolveSecret } from '../utils/crypto.js';
import { normalizeDirectoryObjectGuid, classifyDirectoryAccount, isAccountDisabled, toSafeString } from './ldap-directory.data.js';
import { DiscoveryIngestionService, type DiscoveryPayloadMapper } from './discovery-ingestion.service.js';
import type { NormalizedDiscoveryDto } from '../../shared/utils/cmdb-discovery-contract.js';
import type { BankUser } from '../../shared/types/auth.js';

type Entry = Record<string, unknown>;
type AdObjectType = 'User' | 'Computer' | 'Group' | 'OrganizationalUnit' | 'Department';
type AdInventory = { objectType: AdObjectType; objectId: string; entry: Entry; relationships: Array<{ type: 'MEMBER_OF' | 'LOCATED_IN' | 'MANAGED_BY' | 'PART_OF'; objectType: AdObjectType; objectId: string }> };

const values = (value: unknown): string[] => (Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => toSafeString(item)).filter(Boolean);
const text = (entry: Entry, ...keys: string[]): string | undefined => keys.map((key) => toSafeString(entry[key]).trim()).find(Boolean);
const guid = (entry: Entry): string | undefined => {
  const raw = entry.objectGUID ?? entry.objectGuid;
  return raw ? normalizeDirectoryObjectGuid(raw as any) || undefined : undefined;
};
const dn = (entry: Entry): string | undefined => text(entry, 'distinguishedName', 'dn');
const ouPath = (entry: Entry): string[] => (dn(entry)?.match(/(?:^|,)OU=([^,]+)/gi) || []).map((part) => part.replace(/^(?:,)?OU=/i, '').trim()).filter(Boolean).reverse();
const fileTime = (value: unknown): string | undefined => {
  const raw = toSafeString(value); if (!/^\d+$/.test(raw) || raw === '0') return undefined;
  const millis = Number((BigInt(raw) / 10000n) - 11644473600000n);
  return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : undefined;
};
const uac = (entry: Entry) => Number(text(entry, 'userAccountControl') || 0);
const disabled = (entry: Entry) => isAccountDisabled(entry as any) || Boolean(uac(entry) & 0x2);
const accountStatus = (entry: Entry) => ({ enabled: !disabled(entry), passwordNeverExpires: Boolean(uac(entry) & 0x10000), passwordNotRequired: Boolean(uac(entry) & 0x20), trustedForDelegation: Boolean(uac(entry) & 0x80000), accountExpiresAt: fileTime(entry.accountExpires), passwordLastSetAt: fileTime(entry.pwdLastSet) });
function resolveConnectorSecret(reference: unknown): string {
  const value = String(reference || '');
  const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(value);
  if (!match) throw Object.assign(new Error('Active Directory bind secret must be a server-side env:// secret reference.'), { code: 'AD_SECRET_REFERENCE_INVALID' });
  const secret = process.env[match[1]];
  if (!secret) throw Object.assign(new Error('Active Directory bind secret reference is unavailable to this server.'), { code: 'AD_SECRET_UNAVAILABLE' });
  return resolveSecret(secret);
}
async function resolveConnectorCa(reference: unknown): Promise<string | undefined> {
  const value = String(reference || '').trim();
  if (!value) return undefined;
  if (!value.startsWith('file://')) throw Object.assign(new Error('Active Directory CA reference must be a backend-resolved file:// reference.'), { code: 'AD_CA_REFERENCE_INVALID' });
  try { return await fs.readFile(new URL(value), 'utf8'); }
  catch { throw Object.assign(new Error('Active Directory CA reference cannot be read by this server.'), { code: 'AD_CA_REFERENCE_UNAVAILABLE' }); }
}
const objectTypeFor = (entry: Entry): AdObjectType | undefined => {
  const classes = values(entry.objectClass).map((value) => value.toLowerCase());
  if (classes.includes('computer')) return 'Computer';
  if (classes.includes('group')) return 'Group';
  if (classes.includes('organizationalunit')) return 'OrganizationalUnit';
  if (classes.includes('user') || classes.includes('person')) return 'User';
  return undefined;
};

function sourceName(item: AdInventory): string {
  return text(item.entry, 'displayName', 'name', 'cn', 'sAMAccountName', 'dNSHostName') || item.objectId;
}

function computerType(entry: Entry): 'virtual_machine' | 'physical_server' | 'workstation' {
  const os = (text(entry, 'operatingSystem') || '').toLowerCase();
  if (/server/.test(os)) return 'physical_server';
  return 'workstation';
}

export const activeDirectoryInventoryPayloadMapper: DiscoveryPayloadMapper<AdInventory> = {
  name: 'active-directory-ldap-inventory-v1', normalizedSchemaVersion: 1,
  validateRaw(payload: unknown): AdInventory {
    const item = payload as AdInventory;
    if (!item || !['User', 'Computer', 'Group', 'OrganizationalUnit', 'Department'].includes(item.objectType) || !item.objectId || !item.entry) throw new Error('Invalid Active Directory inventory object.');
    return item;
  },
  normalize(item, envelope): NormalizedDiscoveryDto {
    const entry = item.entry; const name = sourceName(item); const fqdn = text(entry, 'dNSHostName'); const hostname = fqdn?.split('.')[0] || text(entry, 'sAMAccountName', 'name');
    const type = item.objectType === 'Computer' ? computerType(entry) : item.objectType === 'User' ? 'directory_user' : item.objectType === 'Group' ? 'directory_group' : item.objectType === 'Department' ? 'directory_department' : 'organizational_unit';
    const identifiers: NormalizedDiscoveryDto['identity']['identifiers'] = [{ type: 'AD_OBJECT_GUID', namespace: envelope.connectorId, value: item.objectId, confidence: 100, primary: true }];
    if (item.objectType === 'Computer' && hostname) identifiers.push({ type: 'HOSTNAME' as const, namespace: 'AD', value: hostname, confidence: 80, primary: false });
    if (item.objectType === 'Computer' && fqdn) identifiers.push({ type: 'FQDN' as const, namespace: 'DNS', value: fqdn, confidence: 90, primary: false });
    return {
      schemaVersion: 1 as const, source: { connectorId: envelope.connectorId, objectType: item.objectType, objectId: item.objectId, nativeUuid: item.objectId },
      identity: { name, ...(item.objectType === 'Computer' && hostname ? { hostname } : {}), ...(item.objectType === 'Computer' && fqdn ? { fqdn } : {}), identifiers },
      classification: { type, subtype: item.objectType, environment: 'UNKNOWN' as const },
      compute: {}, network: { interfaces: [] }, storage: { disks: [] },
      operatingSystem: item.objectType === 'Computer' ? { ...(text(entry, 'operatingSystem') ? { configured: text(entry, 'operatingSystem') } : {}), ...(text(entry, 'operatingSystemVersion') ? { version: text(entry, 'operatingSystemVersion') } : {}) } : {},
      placement: { relationships: item.relationships.map((relationship) => ({ type: relationship.type, target: { objectType: relationship.objectType, objectId: relationship.objectId, identifiers: [] }, confidence: 100 })) },
      tags: [{ key: 'adObjectType', value: item.objectType }, ...(item.objectType === 'Group' ? [{ key: 'groupType', value: Number(entry.groupType || 0) < 0 ? 'SECURITY' : 'DISTRIBUTION' }] : [])],
      technicalState: item.objectType === 'User' || item.objectType === 'Computer' ? (disabled(entry) ? 'DISABLED' : 'ACTIVE') : 'ACTIVE',
      sourceSpecificMetadata: {
        distinguishedName: dn(entry), ouPath: ouPath(entry), samAccountName: text(entry, 'sAMAccountName'), upn: text(entry, 'userPrincipalName'), displayName: text(entry, 'displayName'), mail: text(entry, 'mail'), department: text(entry, 'department'), title: text(entry, 'title'), company: text(entry, 'company'), managerDn: text(entry, 'manager'), groupScope: Number(entry.groupType || 0) & 0x8 ? 'UNIVERSAL' : Number(entry.groupType || 0) & 0x4 ? 'DOMAIN_LOCAL' : 'GLOBAL', accountStatus: item.objectType === 'User' || item.objectType === 'Computer' ? accountStatus(entry) : undefined,
        lastLogonAt: fileTime(entry.lastLogon), lastLogonTimestampAt: fileTime(entry.lastLogonTimestamp), whenCreated: text(entry, 'whenCreated'), whenChanged: text(entry, 'whenChanged'), directoryAccountClassification: item.objectType === 'User' ? classifyDirectoryAccount(entry as any) : undefined, privilegedIdentity: Boolean(entry.__cmdbPrivilegedIdentity), privilegedGroup: Boolean(entry.__cmdbPrivilegedGroup),
      },
    };
  },
};

export class ActiveDirectoryInventorySyncService {
  /** Proves the persisted connector can establish a read-only LDAPS session.
   * It deliberately performs a base-object read only; inventory is never run
   * from the Test action. */
  public static async testConnection(connectorId: string) {
    const result = await pgClient.query<any>(`SELECT non_secret_configuration,secret_reference,tls_ca_reference,tls_verify_certificates
      FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='ACTIVE_DIRECTORY' AND deleted_at IS NULL`, [connectorId]);
    const row = result.rows[0];
    if (!row) throw Object.assign(new Error('Active Directory connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
    const source = row.non_secret_configuration || {};
    const url = String(source.url || ''); const baseDn = String(source.baseDn || ''); const bindUser = String(source.bindUser || '');
    if (!url.startsWith('ldaps://') || !baseDn || !bindUser) throw Object.assign(new Error('Active Directory connector requires LDAPS, base DN and a read-only bind identity.'), { statusCode: 422, code: 'AD_CONNECTOR_CONFIG_INVALID' });
    const client = new StrictReadOnlyLdapClient({ url, timeout: 30000, connectTimeout: 10000, tlsRejectUnauthorized: row.tls_verify_certificates !== false, caCertContent: await resolveConnectorCa(row.tls_ca_reference) });
    try {
      await client.bind(bindUser, resolveConnectorSecret(row.secret_reference));
      await client.search(baseDn, { scope: 'base', filter: '(objectClass=*)', attributes: ['distinguishedName'] });
      return { connectorId, snapshot: { testResult: { status: 'SUCCEEDED', transport: 'LDAPS', authentication: 'SUCCEEDED', readOnlyProbe: 'SUCCEEDED', writeOperations: 'BLOCKED' } } };
    } finally { await client.unbind().catch(() => undefined); }
  }

  public static async enqueue(connectorId: string, actor: BankUser, runType: 'FULL' | 'INCREMENTAL' = 'INCREMENTAL', context: { correlationId?: string } = {}) {
    const runId = `dsrun-${crypto.randomUUID()}`;
    await pgClient.transaction(async (client) => {
      const connector = await client.query(`SELECT id FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='ACTIVE_DIRECTORY' AND enabled AND deleted_at IS NULL FOR UPDATE`, [connectorId]);
      if (!connector.rows[0]) throw Object.assign(new Error('Enabled Active Directory connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
      await client.query(`INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,requested_by_user_id,correlation_id,queued_at) VALUES($1,$2,$3,'QUEUED',$4,$5,NOW())`, [runId, connectorId, runType, actor.id, context.correlationId || null]);
      await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())`, [`out-${crypto.randomUUID()}`, runId, JSON.stringify({ runId, connectorId, connectorType: 'ACTIVE_DIRECTORY', actorId: actor.id, runType }), context.correlationId || `cmdb.discovery.sync:${runId}`]);
    });
    return { runId, state: 'QUEUED' as const, runType };
  }

  public static async runQueued(runId: string): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    const run = await pgClient.transaction(async (client) => {
      const result = await client.query<any>('SELECT r.connector_id,r.state,r.run_type,c.non_secret_configuration,c.secret_reference,c.tls_ca_reference,c.tls_verify_certificates FROM cmdb_discovery_sync_runs r JOIN cmdb_discovery_connectors c ON c.id=r.connector_id WHERE r.id=$1 AND c.connector_type_id=\'ACTIVE_DIRECTORY\' FOR UPDATE', [runId]);
      const row = result.rows[0]; if (!row) throw Object.assign(new Error('Active Directory discovery run was not found.'), { code: 'DISCOVERY_RUN_NOT_FOUND' });
      if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(row.state)) return row;
      await client.query("UPDATE cmdb_discovery_sync_runs SET state='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1", [runId]); return row;
    });
    if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(run.state)) return { runId, discovered: 0, failed: 0, state: run.state };
    let client: StrictReadOnlyLdapClient | undefined;
    try {
      const source = run.non_secret_configuration || {}; const url = String(source.url || config.LDAP_URL || ''); const baseDn = String(source.baseDn || config.LDAP_BASE_DN || ''); const bindUser = String(source.bindUser || config.LDAP_BIND_USER || ''); const password = resolveConnectorSecret(run.secret_reference);
      if (!url.startsWith('ldaps://') || !baseDn || !bindUser || !password) throw Object.assign(new Error('Active Directory connector requires LDAPS, base DN, dedicated read-only bind identity and a server-side secret.'), { code: 'AD_CONNECTOR_CONFIG_INVALID' });
      client = new StrictReadOnlyLdapClient({ url, timeout: 30000, connectTimeout: 10000, tlsRejectUnauthorized: run.tls_verify_certificates !== false, caCertContent: await resolveConnectorCa(run.tls_ca_reference), caCertPath: config.LDAP_CA_CERT_PATH });
      await client.bind(bindUser, password);
      const attributes = ['objectGUID','objectClass','distinguishedName','name','cn','sAMAccountName','userPrincipalName','displayName','mail','department','title','manager','company','enabled','userAccountControl','accountExpires','pwdLastSet','lastLogon','lastLogonTimestamp','whenCreated','whenChanged','operatingSystem','operatingSystemVersion','dNSHostName','member','memberOf','groupType','servicePrincipalName','description'];
      // This connector is the CMDB asset source, not the USER SYNC source.
      // Do not ingest people, groups, or OUs as inventory assets; identities
      // remain owned by the canonical LDAP user-sync pipeline.
      const response = await client.search(baseDn, { scope: 'sub', filter: '(&(objectCategory=computer)(objectClass=computer))', paged: { pageSize: 500 }, attributes });
      const entries = (response.searchEntries as Entry[]).map((entry) => ({ entry, objectType: objectTypeFor(entry), objectId: guid(entry), distinguishedName: dn(entry) })).filter((item) => Boolean(item.objectType && item.objectId)) as Array<{ entry: Entry; objectType: AdObjectType; objectId: string; distinguishedName: string | undefined }>;
      const idByDn = new Map(entries.filter((item) => item.distinguishedName).map((item) => [item.distinguishedName!.toLowerCase(), { objectType: item.objectType, objectId: item.objectId }]));
      const configuredPrivileged = new Set(values(source.privilegedGroupDns).map((value) => value.toLowerCase()));
      const isPrivilegedGroup = (entry: Entry) => configuredPrivileged.has(String(dn(entry) || '').toLowerCase()) || /^Domain Admins$/i.test(String(text(entry, 'cn', 'name') || ''));
      const raw: AdInventory[] = entries.map((item) => {
        // Keep full distinguished names here. Human-directory projections may
        // reduce memberOf to display names, but correlation needs stable DNs.
        const refs = [...values(item.entry.memberOf), ...(item.objectType === 'Group' ? values(item.entry.member) : [])];
        const relationships: AdInventory['relationships'] = refs.map((ref) => idByDn.get(ref.toLowerCase())).filter(Boolean).map((target) => ({ type: 'MEMBER_OF', objectType: target!.objectType, objectId: target!.objectId }));
        const parentDn = item.distinguishedName?.replace(/^[^,]+,/, ''); const parent = parentDn ? idByDn.get(parentDn.toLowerCase()) : undefined;
        if (parent?.objectType === 'OrganizationalUnit') relationships.push({ type: 'LOCATED_IN', objectType: parent.objectType, objectId: parent.objectId });
        const manager = text(item.entry, 'manager'); const managerTarget = manager ? idByDn.get(manager.toLowerCase()) : undefined;
        if (managerTarget?.objectType === 'User') relationships.push({ type: 'MANAGED_BY', objectType: managerTarget.objectType, objectId: managerTarget.objectId });
        const department = text(item.entry, 'department');
        if (item.objectType === 'User' && department) relationships.push({ type: 'PART_OF', objectType: 'Department', objectId: `department:${department.trim().toLowerCase()}` });
        const privileged = item.objectType === 'Group' ? isPrivilegedGroup(item.entry) : values(item.entry.memberOf).some((groupDn) => configuredPrivileged.has(groupDn.toLowerCase()) || /^CN=Domain Admins(?:,|$)/i.test(groupDn));
        return { objectType: item.objectType, objectId: item.objectId, entry: { ...item.entry, __cmdbPrivilegedGroup: item.objectType === 'Group' && privileged, __cmdbPrivilegedIdentity: item.objectType === 'User' && privileged }, relationships };
      });
      const observedAt = new Date().toISOString(); const batch = await DiscoveryIngestionService.ingestBatch(raw.map((rawPayload) => ({ connectorId: run.connector_id, syncRunId: runId, sourceObjectType: rawPayload.objectType, sourceObjectId: rawPayload.objectId, observedAt, rawPayload })), activeDirectoryInventoryPayloadMapper);
      await DiscoveryIngestionService.reconcileAndCompleteRun(runId);
      return { runId, discovered: batch.succeeded.length, failed: batch.failed.length, state: batch.failed.length ? 'PARTIAL' : 'SUCCEEDED' };
    } catch (error) { await DiscoveryIngestionService.failRun(runId, error); throw error; } finally { await client?.unbind().catch(() => undefined); }
  }
}
