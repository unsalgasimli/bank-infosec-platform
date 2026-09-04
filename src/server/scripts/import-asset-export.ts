import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pgClient } from '../db/postgres/client.js';

type CsvRow = Record<string, string>;

const sourceArgument = process.argv.find((argument) => argument.startsWith('--source='))?.slice('--source='.length);
const sourceSystemArgument = process.argv.find((argument) => argument.startsWith('--source-system='))?.slice('--source-system='.length);
const sourcePath = sourceArgument ? path.resolve(process.cwd(), sourceArgument) : null;
const isApply = process.argv.includes('--apply');
const SOURCE_SYSTEM = String(sourceSystemArgument || 'ASSET_EXPORT_2026_09_03').trim().toUpperCase();
const IMPORT_ACTOR = 'system-cmdb-import';

const trim = (value: unknown): string => String(value ?? '').trim();
const optional = (value: unknown): string | null => {
  const normalized = trim(value);
  return normalized && !['n/a', 'no ip', 'unknown'].includes(normalized.toLowerCase()) ? normalized : null;
};
const capped = (value: unknown, limit: number): string | null => {
  const normalized = optional(value);
  return normalized ? normalized.slice(0, limit) : null;
};
const hash = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const stableId = (prefix: string, value: string): string => `${prefix}-${hash(value).slice(0, 24)}`;

/** RFC 4180-compatible enough for the exported asset file, including quoted commas/newlines. */
function parseCsv(raw: string): CsvRow[] {
  const records: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < raw.length; index++) {
    const character = raw[index];
    if (quoted) {
      if (character === '"' && raw[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === ',') { row.push(field); field = ''; continue; }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && raw[index + 1] === '\n') index++;
      row.push(field); field = '';
      if (row.some((value) => value.length > 0)) records.push(row);
      row = []; continue;
    }
    field += character;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  row.push(field); if (row.some((value) => value.length > 0)) records.push(row);
  const [headers, ...values] = records;
  if (!headers?.length) return [];
  return values.map((record) => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), record[index] ?? ''])));
}

function typeId(row: CsvRow): string {
  switch (trim(row.Category).toLowerCase()) {
    case 'vm': return 'virtual_machine';
    case 'network devices': return 'network_device';
    case 'physical server': return 'physical_server';
    case 'workstation': return 'workstation';
    case 'printer': return 'printer';
    default: return 'other';
  }
}

function environment(value: string): string {
  switch (trim(value).toLowerCase()) {
    case 'production': return 'PRODUCTION';
    case 'dr': return 'DR';
    case 'uat': return 'UAT';
    case 'staging': return 'STAGING';
    case 'test': return 'TEST';
    case 'dev': return 'DEV';
    default: return 'UNKNOWN';
  }
}

function criticality(value: string): string {
  switch (trim(value).toLowerCase()) {
    case 'kritik': case 'critical': return 'CRITICAL';
    case 'yüksək': case 'yuksek': case 'high': return 'HIGH';
    case 'orta': case 'medium': return 'MEDIUM';
    case 'aşağı': case 'asagi': case 'low': return 'LOW';
    default: return 'MEDIUM';
  }
}

function lifecycle(value: string): { status: string; lifecycleStatus: string; lifecycleState: string } {
  const normalized = trim(value).toLowerCase();
  if (normalized.includes('silinib') || normalized.includes('sondurulub') || normalized.includes('retired')) {
    return { status: 'RETIRED', lifecycleStatus: 'RETIRED', lifecycleState: 'RETIRED' };
  }
  return { status: 'ACTIVE', lifecycleStatus: 'IN_STOCK', lifecycleState: 'ACTIVE' };
}

function toCi(row: CsvRow, index: number, sourceChecksum: string, assetTagOverride?: string | null) {
  const exportedAssetTag = capped(row['Asset Tag'], 128);
  const assetTag = assetTagOverride === undefined ? exportedAssetTag : assetTagOverride;
  const name = optional(row['Asset Name']) || exportedAssetTag || `Imported asset ${index + 1}`;
  const sourceRecordId = exportedAssetTag || hash(JSON.stringify(row));
  const id = stableId('ci-import', `${SOURCE_SYSTEM}:${sourceRecordId}`);
  const now = new Date().toISOString();
  const state = lifecycle(`${row.Status} ${row.Description}`);
  const host = capped(row.hostname_workstation, 255);
  const firstIpAddress = optional(row['IP address'])?.split(/[\s,;]+/)[0] || null;
  const ci = {
    id,
    ciNumber: `IMP-${hash(`${SOURCE_SYSTEM}:${sourceRecordId}`).slice(0, 12).toUpperCase()}`,
    assetKey: `IMP-${hash(`${SOURCE_SYSTEM}:${sourceRecordId}`).slice(0, 20).toUpperCase()}`,
    name: name.slice(0, 255),
    displayName: name.slice(0, 255),
    typeId: typeId(row),
    status: state.status,
    lifecycleState: state.lifecycleState,
    technicalStatus: capped(row.Status, 64) || 'IMPORTED',
    lifecycleStatus: state.lifecycleStatus,
    environment: environment(row.Environment),
    criticality: criticality(row.Criticality),
    description: optional(row.Description),
    locationId: capped(row.Location, 128),
    model: capped(row.Model, 255),
    serialNumber: capped(row.Serial, 128),
    assetTag,
    hostname: host,
    fqdn: host?.includes('.') ? host : null,
    ipAddress: capped(firstIpAddress, 64),
    operatingSystem: capped(row.OS, 255),
    externalReference: sourceRecordId.slice(0, 255),
    source: 'IMPORT',
    sourceSystem: SOURCE_SYSTEM,
    sourceRecordId,
    discoveryStatus: 'SYNCED',
    firstSeenAt: now,
    lastSeenAt: now,
    retiredAt: state.lifecycleState === 'RETIRED' ? now : null,
    lastSyncAt: now,
    syncStatus: 'SYNCED',
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: IMPORT_ACTOR,
    updatedBy: IMPORT_ACTOR,
    details: {
      import: {
        sourceFile: path.basename(sourcePath!), sourceChecksum, importedAt: now,
        rowNumber: index + 2, raw: row,
        ownerDisplayName: optional(row.Owner), checkedOutTo: optional(row['Checked Out To']),
        currentValue: optional(row['Current Value']), purchaseCost: optional(row['Purchase Cost']),
        cluster: optional(row.Cluster), vcenterId: optional(row.vcenterid), hostedOn: optional(row['Hosted on']),
        memoryMb: optional(row['Memory MB']), cpu: optional(row.CPU), users: optional(row.Users),
      },
    },
  };
  return ci;
}

async function main(): Promise<void> {
  if (!sourcePath) throw new Error('Use --source=<CSV path>.');
  if (!/^[A-Z0-9_]{3,128}$/.test(SOURCE_SYSTEM)) throw new Error('--source-system must contain only A-Z, 0-9, and underscores.');
  if (!fs.existsSync(sourcePath)) throw new Error(`CSV file not found: ${sourcePath}`);
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const rows = parseCsv(raw);
  if (!rows.length) throw new Error('The CSV has no importable rows.');
  const checksum = hash(raw);
  let cis = rows.map((row, index) => toCi(row, index, checksum));
  const sourceIds = cis.map((ci) => ci.sourceRecordId);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error('CSV contains duplicate Asset Tag/source identities; resolve them before importing.');

  const types = [...new Set(cis.map((ci) => ci.typeId))];
  const typeResult = await pgClient.query<{ id: string }>('SELECT id FROM cmdb_ci_types WHERE id = ANY($1::text[]) AND is_active = TRUE', [types]);
  if (typeResult.rows.length !== types.length) throw new Error(`Missing active CMDB CI types: ${types.filter((type) => !typeResult.rows.some((row) => row.id === type)).join(', ')}`);
  const collisionResult = await pgClient.query<{ source_record_id: string; conflicting_ci_number: string }>(
    `SELECT incoming.source_record_id, existing.ci_number AS conflicting_ci_number
       FROM unnest($1::text[], $2::text[], $3::text[]) AS incoming(source_record_id, asset_tag, hostname)
       JOIN configuration_items existing ON existing.archived_at IS NULL
        AND existing.source_system <> $4
        AND ((incoming.asset_tag <> '' AND lower(existing.asset_tag) = lower(incoming.asset_tag))
          OR (incoming.hostname <> '' AND lower(existing.hostname) = lower(incoming.hostname)))`,
    [cis.map((ci) => ci.sourceRecordId), cis.map((ci) => ci.assetTag || ''), cis.map((ci) => ci.hostname || ''), SOURCE_SYSTEM]
  );
  // A legacy export may legitimately overlap discovery sources. Never merge a
  // weak/ambiguous collision: retain it as a distinct imported CI and preserve
  // its original tag in immutable source evidence, while clearing only the
  // indexed canonical tag that would violate the global uniqueness constraint.
  const collisionSourceIds = new Set(collisionResult.rows.map((row) => row.source_record_id));
  if (collisionSourceIds.size) {
    cis = rows.map((row, index) => {
      const sourceRecordId = optional(row['Asset Tag']) || hash(JSON.stringify(row));
      return toCi(row, index, checksum, collisionSourceIds.has(sourceRecordId) ? null : undefined);
    });
  }

  console.log(JSON.stringify({ mode: isApply ? 'APPLY' : 'DRY_RUN', source: sourcePath, checksum, rows: cis.length, types, protectedCrossSourceCollisions: collisionSourceIds.size, existingSourceRows: (await pgClient.query('SELECT count(*)::int AS count FROM configuration_items WHERE source_system = $1', [SOURCE_SYSTEM])).rows[0].count }, null, 2));
  if (!isApply) return;
  const batches = Array.from(new Map(types.sort().map((type) => [type, cis.filter((ci) => ci.typeId === type)])).values());
  for (const batch of batches) {
    let imported = false;
    for (let attempt = 1; attempt <= 5 && !imported; attempt++) {
      try {
        await pgClient.transaction(async (client) => {
          for (const ci of batch) {
      await client.query(
        `INSERT INTO configuration_items(
          id,ci_number,asset_key,name,display_name,type_id,status,lifecycle_status,environment,criticality,description,
          location_id,model,serial_number,asset_tag,hostname,fqdn,ip_address,operating_system,external_reference,
          source,source_system,source_record_id,discovery_status,first_seen_at,last_seen_at,retired_at,last_sync_at,sync_status,
          lifecycle_state,technical_status,details,version,created_by,updated_by,source_payload
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32::jsonb,$33,$34,$35,$36::jsonb
        ) ON CONFLICT (source_system, source_record_id)
          WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL AND archived_at IS NULL DO UPDATE SET
          name=EXCLUDED.name,display_name=EXCLUDED.display_name,type_id=EXCLUDED.type_id,status=EXCLUDED.status,
          lifecycle_status=EXCLUDED.lifecycle_status,environment=EXCLUDED.environment,criticality=EXCLUDED.criticality,
          description=EXCLUDED.description,location_id=EXCLUDED.location_id,model=EXCLUDED.model,serial_number=EXCLUDED.serial_number,
          asset_tag=EXCLUDED.asset_tag,hostname=EXCLUDED.hostname,fqdn=EXCLUDED.fqdn,ip_address=EXCLUDED.ip_address,
          operating_system=EXCLUDED.operating_system,external_reference=EXCLUDED.external_reference,discovery_status=EXCLUDED.discovery_status,
          last_seen_at=EXCLUDED.last_seen_at,retired_at=EXCLUDED.retired_at,last_sync_at=EXCLUDED.last_sync_at,sync_status=EXCLUDED.sync_status,
          lifecycle_state=EXCLUDED.lifecycle_state,technical_status=EXCLUDED.technical_status,details=EXCLUDED.details,
          version=configuration_items.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW(),source_payload=EXCLUDED.source_payload`,
        [ci.id, ci.ciNumber, ci.assetKey, ci.name, ci.displayName, ci.typeId, ci.status, ci.lifecycleStatus, ci.environment, ci.criticality, ci.description,
          ci.locationId, ci.model, ci.serialNumber, ci.assetTag, ci.hostname, ci.fqdn, ci.ipAddress, ci.operatingSystem, ci.externalReference,
          ci.source, ci.sourceSystem, ci.sourceRecordId, ci.discoveryStatus, ci.firstSeenAt, ci.lastSeenAt, ci.retiredAt, ci.lastSyncAt, ci.syncStatus,
          ci.lifecycleState, ci.technicalStatus, JSON.stringify(ci.details), ci.version, null, null, JSON.stringify(ci)]
      );
          }
        });
        imported = true;
      } catch (error: any) {
        if (!['40P01', '55P03'].includes(error?.code) || attempt === 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  const result = await pgClient.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM configuration_items
      WHERE source_system = $1 AND archived_at IS NULL AND source_record_id = ANY($2::text[])`,
    [SOURCE_SYSTEM, cis.map((ci) => ci.sourceRecordId)]
  );
  if (result.rows[0].count !== cis.length) throw new Error(`Post-import verification failed: expected ${cis.length} report identities, found ${result.rows[0].count}.`);
  console.log(`Imported and verified all ${result.rows[0].count} report identities.`);
}

main().then(() => pgClient.close()).catch(async (error) => { console.error(error); await pgClient.close(); process.exitCode = 1; });
