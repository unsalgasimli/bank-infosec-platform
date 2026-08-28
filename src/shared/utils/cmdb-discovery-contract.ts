import { z } from 'zod';

const identifierTypeSchema = z.enum([
  'HOSTNAME', 'FQDN', 'SERIAL_NUMBER', 'BIOS_UUID', 'VMWARE_INSTANCE_UUID',
  'CLOUD_INSTANCE_ID', 'MAC_ADDRESS', 'AGENT_ID', 'EDR_DEVICE_ID',
  'SCCM_RESOURCE_ID', 'AD_OBJECT_GUID', 'OTHER',
]);

const identifierSchema = z.object({
  type: identifierTypeSchema,
  namespace: z.string().trim().min(1).max(255).default('GLOBAL'),
  value: z.string().trim().min(1).max(2048),
  confidence: z.number().min(0).max(100).default(100),
  primary: z.boolean().default(false),
}).strict();

const relationshipTargetSchema = z.object({
  connectorId: z.string().trim().min(1).max(64).optional(),
  objectType: z.string().trim().min(1).max(128),
  objectId: z.string().trim().min(1).max(512),
  nativeUuid: z.string().trim().min(1).max(255).optional(),
  identifiers: z.array(identifierSchema).max(50).default([]),
}).strict();

export const normalizedDiscoveryDtoSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    connectorId: z.string().trim().min(1).max(64),
    objectType: z.string().trim().min(1).max(128),
    objectId: z.string().trim().min(1).max(512),
    nativeUuid: z.string().trim().min(1).max(255).optional(),
  }).strict(),
  identity: z.object({
    name: z.string().trim().min(1).max(255),
    hostname: z.string().trim().min(1).max(255).optional(),
    fqdn: z.string().trim().min(1).max(255).optional(),
    serialNumber: z.string().trim().min(1).max(512).optional(),
    identifiers: z.array(identifierSchema).max(100).default([]),
  }).strict(),
  classification: z.object({
    type: z.string().trim().min(1).max(64),
    subtype: z.string().trim().min(1).max(128).optional(),
    environment: z.enum(['DEV', 'TEST', 'UAT', 'STAGING', 'PRODUCTION', 'DR', 'UNKNOWN']).default('UNKNOWN'),
  }).strict(),
  compute: z.object({
    cpuCount: z.number().int().min(0).max(1048576).optional(),
    memoryBytes: z.number().int().safe().min(0).optional(),
  }).strict().default({}),
  operatingSystem: z.object({
    configured: z.string().trim().min(1).max(512).optional(),
    reported: z.string().trim().min(1).max(512).optional(),
    version: z.string().trim().min(1).max(255).optional(),
  }).strict().default({}),
  network: z.object({
    interfaces: z.array(z.object({
      key: z.string().trim().min(1).max(255),
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(2048).optional(),
      type: z.string().trim().min(1).max(64).optional(),
      technicalState: z.string().trim().min(1).max(64).default('UNKNOWN'),
      mtu: z.number().int().positive().max(1000000).optional(),
      speedBps: z.number().int().safe().min(0).optional(),
      virtual: z.boolean().default(false),
      macAddresses: z.array(z.string().trim().min(1).max(32)).max(100).default([]),
      ipAddresses: z.array(z.object({
        address: z.string().ip(),
        role: z.string().trim().min(1).max(64).default('UNKNOWN'),
        dnsName: z.string().trim().min(1).max(255).optional(),
        primary: z.boolean().default(false),
        dynamic: z.boolean().default(false),
      }).strict()).max(1000).default([]),
    }).strict()).max(1000).default([]),
  }).strict().default({ interfaces: [] }),
  storage: z.object({
    disks: z.array(z.object({
      key: z.string().trim().min(1).max(255),
      name: z.string().trim().min(1).max(255),
      type: z.string().trim().min(1).max(64),
      technicalState: z.string().trim().min(1).max(64).default('UNKNOWN'),
      vendor: z.string().trim().min(1).max(255).optional(),
      model: z.string().trim().min(1).max(255).optional(),
      serialNumber: z.string().trim().min(1).max(255).optional(),
      capacityBytes: z.number().int().safe().min(0).optional(),
      usedBytes: z.number().int().safe().min(0).optional(),
      freeBytes: z.number().int().safe().min(0).optional(),
      filesystem: z.string().trim().min(1).max(128).optional(),
      mountPath: z.string().trim().min(1).max(2048).optional(),
    }).strict()).max(1000).default([]),
  }).strict().default({ disks: [] }),
  placement: z.object({
    relationships: z.array(z.object({
      type: z.enum(['RUNS_ON', 'MEMBER_OF', 'LOCATED_IN', 'CONNECTED_TO', 'STORED_ON', 'DEPENDS_ON', 'HOSTS', 'PART_OF', 'MANAGED_BY', 'BACKED_UP_BY', 'PROTECTED_BY', 'RELATED_TO']),
      target: relationshipTargetSchema,
      confidence: z.number().min(0).max(100).default(100),
    }).strict()).max(1000).default([]),
  }).strict().default({ relationships: [] }),
  tags: z.array(z.object({
    key: z.string().trim().min(1).max(255),
    value: z.string().trim().max(1024).default(''),
  }).strict()).max(1000).default([]),
  technicalState: z.string().trim().min(1).max(64).default('UNKNOWN'),
  /** Quarantined source facts. These are persisted on the source record only. */
  sourceSpecificMetadata: z.record(z.unknown()).default({}),
}).strict().superRefine((value, context) => {
  if (value.source.connectorId.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'connectorId'], message: 'connectorId is required.' });
  }
  for (let index = 0; index < value.storage.disks.length; index += 1) {
    const disk = value.storage.disks[index];
    if (disk.capacityBytes !== undefined && disk.usedBytes !== undefined && disk.usedBytes > disk.capacityBytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['storage', 'disks', index, 'usedBytes'], message: 'usedBytes cannot exceed capacityBytes.' });
    }
    if (disk.capacityBytes !== undefined && disk.freeBytes !== undefined && disk.freeBytes > disk.capacityBytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['storage', 'disks', index, 'freeBytes'], message: 'freeBytes cannot exceed capacityBytes.' });
    }
  }
});

export const discoveryObservationEnvelopeSchema = z.object({
  connectorId: z.string().trim().min(1).max(64),
  syncRunId: z.string().trim().min(1).max(64),
  sourceObjectType: z.string().trim().min(1).max(128),
  sourceObjectId: z.string().trim().min(1).max(512),
  rawPayload: z.unknown(),
  observedAt: z.string().datetime({ offset: true }),
  schemaVersion: z.number().int().positive().default(1),
}).strict();

export type NormalizedDiscoveryDto = z.infer<typeof normalizedDiscoveryDtoSchema>;
export type DiscoveryObservationEnvelope = z.infer<typeof discoveryObservationEnvelopeSchema>;
export type NormalizedDiscoveryIdentifier = z.infer<typeof identifierSchema>;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
