import crypto from 'crypto';
import type pg from 'pg';
import { stableJson } from '../../shared/utils/cmdb-discovery-contract.js';

export interface DiscoveryAttributeInput {
  path: string;
  value: unknown;
  confidence: number;
}

export interface AppliedAttributeChange {
  path: string;
  beforeValue: unknown;
  afterValue: unknown;
  changeId?: string;
}

const hash = (value: unknown): string => crypto.createHash('sha256').update(stableJson(value)).digest('hex');

const governedBusinessFields: Array<{ path: string; column: string }> = [
  { path: 'business.ownerUserId', column: 'owner_user_id' },
  { path: 'business.technicalOwnerUserId', column: 'technical_owner_user_id' },
  { path: 'business.departmentId', column: 'department_id' },
  { path: 'business.criticality', column: 'criticality' },
  { path: 'business.businessCriticality', column: 'business_criticality' },
  { path: 'business.supportGroupId', column: 'support_group_id' },
];

export class CmdbPrecedenceService {
  public static async protectExistingBusinessFields(
    client: pg.PoolClient,
    asset: Record<string, unknown>,
  ): Promise<void> {
    for (const field of governedBusinessFields) {
      const value = asset[field.column];
      if (value === null || value === undefined || value === '') continue;
      const valueHash = hash(value);
      await client.query(`
        INSERT INTO cmdb_asset_attribute_state(
          asset_id,attribute_path,effective_value,effective_value_hash,source,
          precedence,confidence,manually_managed,manual_lock,observed_at,updated_at
        ) VALUES($1,$2,$3::jsonb,$4,'MANUAL',1000,100,TRUE,TRUE,$5,NOW())
        ON CONFLICT(asset_id,attribute_path) DO NOTHING`,
      [asset.id, field.path, JSON.stringify(value), valueHash, asset.updated_at || new Date().toISOString()]);
    }
  }

  public static async applyDiscoveryAttributes(
    client: pg.PoolClient,
    input: {
      assetId: string;
      connectorId: string;
      sourceRecordId: string;
      sourceRecordRevision: number;
      syncRunId: string;
      observedAt: string;
      attributes: DiscoveryAttributeInput[];
      recordChanges: boolean;
    },
  ): Promise<AppliedAttributeChange[]> {
    const changes: AppliedAttributeChange[] = [];
    for (const attribute of input.attributes) {
      if (attribute.value === undefined) continue;
      const rule = await client.query<{ precedence: number; allow_override_manual: boolean }>(`
        SELECT r.precedence,r.allow_override_manual
        FROM cmdb_source_precedence_rules r
        JOIN cmdb_discovery_connectors c ON c.id=$2
        WHERE r.attribute_path=$1 AND r.source_kind='DISCOVERY' AND r.is_active
          AND (r.connector_type_id IS NULL OR r.connector_type_id=c.connector_type_id)
        ORDER BY (r.connector_type_id IS NOT NULL) DESC,r.precedence DESC,r.rule_version DESC
        LIMIT 1`, [attribute.path, input.connectorId]);
      const precedence = Number(rule.rows[0]?.precedence ?? 50);
      const allowOverrideManual = Boolean(rule.rows[0]?.allow_override_manual);
      const valueHash = hash(attribute.value);

      await client.query(`
        INSERT INTO cmdb_attribute_observations(
          asset_id,attribute_path,observed_value,value_hash,source,connector_id,
          source_record_id,source_record_revision,sync_run_id,observed_at,
          confidence,precedence,is_manual
        ) VALUES($1,$2,$3::jsonb,$4,'DISCOVERY',$5,$6,$7,$8,$9,$10,$11,FALSE)
        ON CONFLICT DO NOTHING`, [
        input.assetId,
        attribute.path,
        JSON.stringify(attribute.value),
        valueHash,
        input.connectorId,
        input.sourceRecordId,
        input.sourceRecordRevision,
        input.syncRunId,
        input.observedAt,
        attribute.confidence,
        precedence,
      ]);

      const current = await client.query<{
        effective_value: unknown;
        effective_value_hash: string;
        precedence: number;
        confidence: number;
        observed_at: Date | string;
        manual_lock: boolean;
      }>(`SELECT effective_value,effective_value_hash,precedence,confidence,observed_at,manual_lock
          FROM cmdb_asset_attribute_state WHERE asset_id=$1 AND attribute_path=$2 FOR UPDATE`,
      [input.assetId, attribute.path]);
      const state = current.rows[0];
      if (state?.manual_lock && !allowOverrideManual) continue;
      if (state && Number(state.precedence) > precedence) continue;
      if (state && Number(state.precedence) === precedence) {
        const currentObservedAt = new Date(state.observed_at).valueOf();
        const incomingObservedAt = new Date(input.observedAt).valueOf();
        if (currentObservedAt > incomingObservedAt) continue;
        if (currentObservedAt === incomingObservedAt && Number(state.confidence) > attribute.confidence) continue;
      }

      if (state?.effective_value_hash === valueHash) {
        await client.query(`
          UPDATE cmdb_asset_attribute_state
          SET source='DISCOVERY',connector_id=$3,source_record_id=$4,precedence=$5,
              confidence=$6,observed_at=$7,updated_at=NOW()
          WHERE asset_id=$1 AND attribute_path=$2`, [
          input.assetId, attribute.path, input.connectorId, input.sourceRecordId,
          precedence, attribute.confidence, input.observedAt,
        ]);
        continue;
      }

      const beforeValue = state?.effective_value;
      await client.query(`
        INSERT INTO cmdb_asset_attribute_state(
          asset_id,attribute_path,effective_value,effective_value_hash,source,
          connector_id,source_record_id,precedence,confidence,manually_managed,
          manual_lock,observed_at,updated_at
        ) VALUES($1,$2,$3::jsonb,$4,'DISCOVERY',$5,$6,$7,$8,FALSE,FALSE,$9,NOW())
        ON CONFLICT(asset_id,attribute_path) DO UPDATE SET
          effective_value=EXCLUDED.effective_value,
          effective_value_hash=EXCLUDED.effective_value_hash,
          source=EXCLUDED.source,
          connector_id=EXCLUDED.connector_id,
          source_record_id=EXCLUDED.source_record_id,
          precedence=EXCLUDED.precedence,
          confidence=EXCLUDED.confidence,
          manually_managed=FALSE,
          manual_lock=FALSE,
          observed_at=EXCLUDED.observed_at,
          updated_at=NOW()`, [
        input.assetId, attribute.path, JSON.stringify(attribute.value), valueHash,
        input.connectorId, input.sourceRecordId, precedence, attribute.confidence, input.observedAt,
      ]);
      await this.writeCanonicalField(client, input.assetId, attribute.path, attribute.value);

      let changeId: string | undefined;
      if (input.recordChanges && beforeValue !== undefined && stableJson(beforeValue) !== stableJson(attribute.value)) {
        const detectionHash = hash({
          sourceRecordId: input.sourceRecordId,
          revision: input.sourceRecordRevision,
          path: attribute.path,
          beforeValue,
          afterValue: attribute.value,
        });
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO cmdb_asset_changes(
            asset_id,change_type,field_path,before_value,after_value,source,
            connector_id,source_record_id,source_record_revision,sync_run_id,
            detection_hash,detected_at
          ) VALUES($1,'ATTRIBUTE_CHANGED',$2,$3::jsonb,$4::jsonb,'DISCOVERY',$5,$6,$7,$8,$9,$10)
          ON CONFLICT DO NOTHING RETURNING id`, [
          input.assetId, attribute.path, JSON.stringify(beforeValue), JSON.stringify(attribute.value),
          input.connectorId, input.sourceRecordId, input.sourceRecordRevision,
          input.syncRunId, detectionHash, input.observedAt,
        ]);
        changeId = inserted.rows[0] ? String(inserted.rows[0].id) : undefined;
      }
      changes.push({ path: attribute.path, beforeValue, afterValue: attribute.value, changeId });
    }
    return changes;
  }

  private static async writeCanonicalField(client: pg.PoolClient, assetId: string, path: string, value: unknown): Promise<void> {
    const mapping: Record<string, string> = {
      'identity.name': 'name',
      'identity.hostname': 'hostname',
      'identity.fqdn': 'fqdn',
      'identity.serialNumber': 'serial_number',
      'classification.environment': 'environment',
      technicalState: 'technical_status',
      'compute.cpuCount': 'cpu_count',
      'compute.memoryBytes': 'memory_bytes',
      'operatingSystem.name': 'operating_system',
      'operatingSystem.version': 'os_version',
    };
    const column = mapping[path];
    if (!column) return;
    // Column names come only from the closed map above; values remain bound.
    await client.query(`UPDATE configuration_items SET ${column}=$2,updated_at=NOW(),version=version+1 WHERE id=$1`, [assetId, value]);
  }
}
