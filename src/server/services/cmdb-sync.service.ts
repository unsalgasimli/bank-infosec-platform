import { z } from 'zod';
import type { BankUser } from '../../shared/types/auth.js';
import type { ConfigurationItem } from '../../shared/types/cmdb.js';
import { db } from '../db/database.js';
import { CMDBError, CMDBService } from './cmdb.service.js';

const syncInputSchema = z.object({
  sourceRecordId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  typeId: z.string().trim().min(1),
  environment: z.enum(['DEV', 'TEST', 'UAT', 'STAGING', 'PRODUCTION', 'DR', 'UNKNOWN']).default('UNKNOWN'),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  hostname: z.string().trim().max(255).optional(), fqdn: z.string().trim().max(255).optional(), ipAddress: z.string().trim().max(64).optional(),
  serialNumber: z.string().trim().max(128).optional(), assetTag: z.string().trim().max(128).optional(), manufacturer: z.string().trim().max(255).optional(), model: z.string().trim().max(255).optional(),
  operatingSystem: z.string().trim().max(255).optional(), osVersion: z.string().trim().max(128).optional(), details: z.record(z.unknown()).default({}),
}).strict();

/**
 * Ingestion boundary for AD/SCCM/Intune/VMware/discovery integrations.
 * Discovery systems may update technical facts but never overwrite curated
 * ownership, department, business criticality, or lifecycle decisions.
 */
export class CMDBSyncService {
  static readonly authority: Record<string, Set<string>> = {
    ACTIVE_DIRECTORY: new Set(['name', 'hostname', 'fqdn']),
    SCCM: new Set(['name', 'hostname', 'serialNumber', 'assetTag', 'manufacturer', 'model', 'operatingSystem', 'osVersion']),
    INTUNE: new Set(['name', 'hostname', 'serialNumber', 'assetTag', 'operatingSystem', 'osVersion']),
    VMWARE: new Set(['name', 'hostname', 'fqdn', 'ipAddress', 'operatingSystem']),
    SERVICE_DISCOVERY: new Set(['name', 'hostname', 'fqdn', 'ipAddress']),
    SECURITY_PLATFORM: new Set(['hostname', 'fqdn', 'ipAddress']),
    IMPORT: new Set(['name', 'hostname', 'fqdn', 'ipAddress', 'serialNumber', 'assetTag', 'manufacturer', 'model', 'operatingSystem', 'osVersion']),
    API: new Set(['name', 'hostname', 'fqdn', 'ipAddress']),
  };

  static sync(sourceSystem: string, raw: unknown, actor: BankUser): { ci: ConfigurationItem; action: 'CREATED' | 'UPDATED'; protectedFields: string[] } {
    const source = sourceSystem.trim().toUpperCase();
    if (!this.authority[source]) throw new CMDBError(400, 'Unsupported CMDB sync source.');
    if (!CMDBService.canManage(actor)) throw new CMDBError(403, 'CMDB sync permission is required.');
    const input = syncInputSchema.parse(raw); const now = new Date().toISOString();
    const existing = db.data.configurationItems.find((ci) => !ci.archivedAt && ci.sourceSystem === source && ci.sourceRecordId === input.sourceRecordId);
    if (!existing) {
      const ci = CMDBService.create({ ...input, source: source, sourceSystem: source, sourceRecordId: input.sourceRecordId, lifecycleStatus: 'IN_STOCK', criticality: input.criticality || 'MEDIUM' }, actor);
      const persisted = db.data.configurationItems.find((item) => item.id === ci.id)!;
      persisted.lastSeenAt = now; persisted.lastSyncAt = now; persisted.discoveryStatus = 'SYNCED'; persisted.syncStatus = 'SYNCED'; db.persist();
      return { ci: CMDBService.get(ci.id), action: 'CREATED', protectedFields: ['ownerUserId', 'technicalOwnerUserId', 'businessOwnerUserId', 'departmentId', 'businessCriticality', 'lifecycleStatus'] };
    }
    const allowed = this.authority[source]; const patch: Record<string, unknown> = { version: existing.version, lastSeenAt: now, lastSyncAt: now, syncStatus: 'SYNCED', discoveryStatus: 'SYNCED', sourceSystem: source, sourceRecordId: input.sourceRecordId };
    for (const [key, value] of Object.entries(input)) if (key !== 'sourceRecordId' && key !== 'details' && value !== undefined && allowed.has(key)) patch[key] = value;
    patch.details = { ...existing.details, discovery: { ...(existing.details.discovery as Record<string, unknown> || {}), [source]: input.details } };
    const ci = CMDBService.update(existing.id, patch, actor);
    return { ci, action: 'UPDATED', protectedFields: ['ownerUserId', 'technicalOwnerUserId', 'businessOwnerUserId', 'departmentId', 'businessCriticality', 'lifecycleStatus'] };
  }
}
