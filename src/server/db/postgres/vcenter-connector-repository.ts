import type pg from 'pg';
import type { VCenterCategorySourceRecord, VCenterConnectionSnapshot, VCenterConnectorConfiguration, VCenterSyncState, VCenterTagSourceRecord } from '../../../shared/types/vcenter.js';
import { pgClient } from './client.js';
import type { EncryptedVCenterCredential } from '../../services/vcenter-credential-crypto.service.js';

type VCenterConnectorRow = {
  connector_id: string;
  name: string;
  environment: string;
  enabled: boolean;
  health_status: string;
  operational_state: string;
  endpoint_fqdn: string;
  port: number;
  soap_endpoint_path: string;
  automation_api_base_path: string;
  tls_verify_certificates: boolean;
  tls_ca_reference: string | null;
  secret_reference: string | null;
  request_timeout_ms: number;
  endpoint_allow_private_network: boolean;
  response_size_limit_bytes: number;
  access_mode: 'READ_ONLY';
  certificate_metadata: Record<string, unknown>;
  detected_product: string | null;
  detected_version: string | null;
  detected_build: string | null;
  detected_api_version: string | null;
  detected_instance_uuid: string | null;
  capabilities_json: Record<string, unknown>;
  last_connection_test_at: Date | string | null;
  last_successful_connection_at: Date | string | null;
  last_full_sync_at: Date | string | null;
  last_incremental_at: Date | string | null;
  last_reconciliation_at: Date | string | null;
};

const iso = (value: Date | string | null | undefined): string | undefined => value ? new Date(value).toISOString() : undefined;
const optional = (value: unknown): string | undefined => value === null || value === undefined || value === '' ? undefined : String(value);

function selectSql(): string {
  return `
    SELECT c.id AS connector_id, COALESCE(c.name, dc.name) AS name, c.environment, c.enabled, c.health_status,
           c.operational_state, v.endpoint_fqdn, v.port, v.soap_endpoint_path,
           v.automation_api_base_path, v.response_size_limit_bytes, v.access_mode, v.certificate_metadata,
           c.tls_verify_certificates, c.tls_ca_reference, c.endpoint_allow_private_network,
           c.secret_reference, c.request_timeout_ms, c.detected_product,
           c.detected_version, c.detected_build, c.detected_api_version,
           c.detected_instance_uuid, c.capabilities_json, c.last_connection_test_at,
           c.last_successful_connection_at, c.last_full_sync_at, c.last_incremental_at,
           c.last_reconciliation_at
    FROM cmdb_discovery_connectors c
    LEFT JOIN department_connections dc ON dc.id = c.connection_id
    JOIN cmdb_vcenter_connector_profiles v ON v.connector_id = c.id
    WHERE c.id = $1 AND c.connector_type_id = 'VCENTER'
      AND c.deleted_at IS NULL AND (dc.deleted_at IS NULL OR c.connection_id IS NULL)`;
}

export class VCenterConnectorRepository {
  public static async findCredential(connectorId: string): Promise<EncryptedVCenterCredential | undefined> {
    const result = await pgClient.query('SELECT credential_ciphertext,credential_iv,credential_auth_tag,credential_key_version FROM cmdb_vcenter_credentials WHERE connector_id=$1', [connectorId]);
    const row = result.rows[0];
    return row ? { credentialCiphertext: row.credential_ciphertext, credentialIv: row.credential_iv, credentialAuthTag: row.credential_auth_tag, credentialKeyVersion: row.credential_key_version } : undefined;
  }

  public static async upsertCredential(client: pg.PoolClient, connectorId: string, credential: EncryptedVCenterCredential): Promise<void> {
    await client.query(`INSERT INTO cmdb_vcenter_credentials(connector_id,credential_ciphertext,credential_iv,credential_auth_tag,credential_key_version)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(connector_id) DO UPDATE SET credential_ciphertext=EXCLUDED.credential_ciphertext,credential_iv=EXCLUDED.credential_iv,credential_auth_tag=EXCLUDED.credential_auth_tag,credential_key_version=EXCLUDED.credential_key_version,updated_at=NOW()`, [connectorId, credential.credentialCiphertext, credential.credentialIv, credential.credentialAuthTag, credential.credentialKeyVersion]);
  }
  public static async find(connectorId: string): Promise<VCenterConnectorConfiguration | undefined> {
    const result = await pgClient.query<VCenterConnectorRow>(selectSql(), [connectorId]);
    const row = result.rows[0];
    return row ? this.configuration(row) : undefined;
  }

  public static async createProfile(client: pg.PoolClient, input: {
    connectorId: string;
    endpointFqdn: string;
    port: number;
    soapEndpointPath: string;
    automationApiBasePath: string;
    responseSizeLimitBytes: number;
  }): Promise<void> {
    await client.query(`
      INSERT INTO cmdb_vcenter_connector_profiles(
        connector_id,endpoint_fqdn,port,soap_endpoint_path,automation_api_base_path,response_size_limit_bytes
      ) VALUES($1,$2,$3,$4,$5,$6)`, [
      input.connectorId, input.endpointFqdn, input.port,
      input.soapEndpointPath, input.automationApiBasePath, input.responseSizeLimitBytes,
    ]);
  }

  public static async updateProfile(client: pg.PoolClient, input: {
    connectorId: string;
    endpointFqdn: string;
    port: number;
    soapEndpointPath: string;
    automationApiBasePath: string;
    responseSizeLimitBytes: number;
  }): Promise<void> {
    await client.query(`
      INSERT INTO cmdb_vcenter_connector_profiles(
        connector_id,endpoint_fqdn,port,soap_endpoint_path,automation_api_base_path,response_size_limit_bytes
      ) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(connector_id) DO UPDATE SET
        endpoint_fqdn=EXCLUDED.endpoint_fqdn,
        port=EXCLUDED.port,
        soap_endpoint_path=EXCLUDED.soap_endpoint_path,
        automation_api_base_path=EXCLUDED.automation_api_base_path,
        response_size_limit_bytes=EXCLUDED.response_size_limit_bytes,
        updated_at=NOW()`, [
      input.connectorId, input.endpointFqdn, input.port,
      input.soapEndpointPath, input.automationApiBasePath, input.responseSizeLimitBytes,
    ]);
  }

  public static async recordConnectionSuccess(connectorId: string, snapshot: VCenterConnectionSnapshot): Promise<void> {
    await pgClient.transaction(async (client) => this.recordConnectionSuccessInTransaction(client, connectorId, snapshot));
  }

  /** Persist a successful connection that was already verified before the connector is committed. */
  public static async recordConnectionSuccessInTransaction(client: pg.PoolClient, connectorId: string, snapshot: VCenterConnectionSnapshot): Promise<void> {
      await client.query(`
      UPDATE cmdb_discovery_connectors SET
        health_status='HEALTHY', operational_state=CASE WHEN enabled THEN 'READY' ELSE 'DISABLED' END,
        last_connection_test_at=$2, last_successful_connection_at=$2,
        detected_product=$3, detected_version=$4, detected_build=$5,
        detected_api_version=$6, detected_instance_uuid=$7,
        capabilities_json=$8::jsonb,
        configuration_status='VALID', connection_status='CONNECTED', discovery_status=CASE WHEN discovery_status='UNKNOWN' THEN 'READY' ELSE discovery_status END,
        last_connection_attempt_at=$2, last_auth_success_at=$2, retry_attempt=0, next_retry_at=NULL,
        consecutive_failures=0,
        last_failure_at=NULL, last_failure_code=NULL, last_failure_message=NULL,
        updated_at=NOW()
      WHERE id=$1 AND connector_type_id='VCENTER' AND deleted_at IS NULL`, [
      connectorId, snapshot.connectionTestedAt, snapshot.server.product,
      snapshot.server.version, snapshot.server.build, snapshot.server.apiVersion || null,
      snapshot.server.instanceUuid || null, JSON.stringify(snapshot.capabilities),
    ]);
    if (snapshot.certificate) {
      await client.query(`UPDATE cmdb_vcenter_connector_profiles SET certificate_metadata=$2::jsonb,updated_at=NOW() WHERE connector_id=$1`, [connectorId, JSON.stringify(snapshot.certificate)]);
    }
  }

  public static async markConnectionAttempt(connectorId: string): Promise<void> {
    await pgClient.query(`
      UPDATE cmdb_discovery_connectors SET
        operational_state=CASE WHEN enabled THEN 'CONNECTING' ELSE 'DISABLED' END,
        connection_status=CASE WHEN enabled THEN 'CONNECTING' ELSE 'UNKNOWN' END,
        last_connection_attempt_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND connector_type_id='VCENTER' AND deleted_at IS NULL`, [connectorId]);
  }

  public static async recordConnectionFailure(connectorId: string, code: string, message: string, nextRetryAt?: string): Promise<void> {
    await pgClient.query(`
      UPDATE cmdb_discovery_connectors SET
        health_status=CASE WHEN NOT enabled THEN 'DISABLED' WHEN $2 IN ('VCENTER_AUTH_FAILED','VCENTER_TLS_UNTRUSTED','VCENTER_TLS_HOSTNAME_MISMATCH','VCENTER_TLS_EXPIRED','VCENTER_TLS_HANDSHAKE_FAILED','VCENTER_PERMISSION_DENIED','VCENTER_API_UNSUPPORTED','VCENTER_CONFIG_INVALID') THEN 'UNHEALTHY' ELSE 'DEGRADED' END,
        operational_state=CASE WHEN NOT enabled THEN 'DISABLED'
          WHEN $2='VCENTER_CONFIG_INVALID' THEN 'CONFIG_INVALID'
          WHEN $2='VCENTER_AUTH_FAILED' THEN 'AUTH_FAILED'
          WHEN $2='VCENTER_TLS_UNTRUSTED' THEN 'TLS_FAILED'
          WHEN $2 IN ('VCENTER_TLS_HOSTNAME_MISMATCH','VCENTER_TLS_EXPIRED','VCENTER_TLS_HANDSHAKE_FAILED') THEN 'TLS_FAILED'
          WHEN $2='VCENTER_DNS_FAILED' THEN 'DNS_FAILED'
          WHEN $2='VCENTER_PERMISSION_DENIED' THEN 'PERMISSION_DENIED'
          WHEN $2='VCENTER_API_UNSUPPORTED' THEN 'UNSUPPORTED_VERSION'
          WHEN $2='VCENTER_CONNECT_TIMEOUT' THEN 'NETWORK_FAILED'
          ELSE 'DEGRADED' END,
        configuration_status=CASE WHEN $2='VCENTER_CONFIG_INVALID' THEN 'INVALID' ELSE configuration_status END,
        connection_status=CASE WHEN $2='VCENTER_AUTH_FAILED' THEN 'AUTH_FAILED'
          WHEN $2 IN ('VCENTER_TLS_UNTRUSTED','VCENTER_TLS_HOSTNAME_MISMATCH','VCENTER_TLS_EXPIRED','VCENTER_TLS_HANDSHAKE_FAILED') THEN 'TLS_FAILED'
          WHEN $2='VCENTER_DNS_FAILED' THEN 'DNS_FAILED'
          WHEN $2='VCENTER_CONNECT_TIMEOUT' THEN 'NETWORK_FAILED'
          WHEN $2='VCENTER_PERMISSION_DENIED' THEN 'PERMISSION_DENIED'
          WHEN $2='VCENTER_API_UNSUPPORTED' THEN 'UNSUPPORTED_VERSION'
          ELSE 'NETWORK_FAILED' END,
        discovery_status='DEGRADED',
        last_connection_test_at=NOW(), last_connection_attempt_at=NOW(), last_failure_at=NOW(),
        last_failure_code=$2, last_failure_message=$3,
        retry_attempt=CASE WHEN $2 IN ('VCENTER_DNS_FAILED','VCENTER_CONNECT_TIMEOUT','VCENTER_SESSION_EXPIRED','VCENTER_RATE_LIMITED','VCENTER_INTERNAL_ERROR') THEN retry_attempt+1 ELSE 0 END,
        next_retry_at=$4,
        consecutive_failures=consecutive_failures+1, updated_at=NOW()
      WHERE id=$1 AND connector_type_id='VCENTER' AND deleted_at IS NULL`, [
      connectorId, code.slice(0, 128), message.slice(0, 4000), nextRetryAt || null,
    ]);
  }

  public static async findSyncState(connectorId: string): Promise<VCenterSyncState | undefined> {
    const result = await pgClient.query(`SELECT connector_id,baseline_generation,incremental_version,filter_generation,last_full_sync_at,last_reconcile_at,last_incremental_update_at,state,metadata,updated_at FROM cmdb_vcenter_sync_state WHERE connector_id=$1`, [connectorId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      connectorId: row.connector_id,
      baselineGeneration: Number(row.baseline_generation),
      incrementalVersion: optional(row.incremental_version),
      filterGeneration: Number(row.filter_generation),
      lastFullSyncAt: iso(row.last_full_sync_at),
      lastReconcileAt: iso(row.last_reconcile_at),
      lastIncrementalUpdateAt: iso(row.last_incremental_update_at),
      state: row.state,
      metadata: row.metadata || {},
      updatedAt: iso(row.updated_at)!,
    };
  }

  public static async upsertSyncState(client: pg.PoolClient, state: VCenterSyncState): Promise<void> {
    await client.query(`
      INSERT INTO cmdb_vcenter_sync_state(
        connector_id,baseline_generation,incremental_version,filter_generation,
        last_full_sync_at,last_reconcile_at,last_incremental_update_at,state,metadata,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
      ON CONFLICT(connector_id) DO UPDATE SET
        baseline_generation=EXCLUDED.baseline_generation,
        incremental_version=EXCLUDED.incremental_version,
        filter_generation=EXCLUDED.filter_generation,
        last_full_sync_at=EXCLUDED.last_full_sync_at,
        last_reconcile_at=EXCLUDED.last_reconcile_at,
        last_incremental_update_at=EXCLUDED.last_incremental_update_at,
        state=EXCLUDED.state,metadata=EXCLUDED.metadata,updated_at=NOW()`, [
      state.connectorId, state.baselineGeneration, state.incrementalVersion || null,
      state.filterGeneration, state.lastFullSyncAt || null, state.lastReconcileAt || null,
      state.lastIncrementalUpdateAt || null, state.state, JSON.stringify(state.metadata),
    ]);
  }

  public static async upsertCategorySource(client: pg.PoolClient, record: Omit<VCenterCategorySourceRecord, 'createdAt' | 'updatedAt'>): Promise<void> {
    await client.query(`
      INSERT INTO cmdb_vcenter_category_sources(connector_id,category_id,name,description,cardinality)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(connector_id,category_id) DO UPDATE SET
        name=EXCLUDED.name,description=EXCLUDED.description,cardinality=EXCLUDED.cardinality,updated_at=NOW()`,
      [record.connectorId, record.categoryId, record.name || null, record.description || null, record.cardinality || null]);
  }

  public static async upsertTagSource(client: pg.PoolClient, record: Omit<VCenterTagSourceRecord, 'createdAt' | 'updatedAt'>): Promise<void> {
    await client.query(`
      INSERT INTO cmdb_vcenter_tag_sources(connector_id,tag_id,category_id,name,description)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(connector_id,tag_id) DO UPDATE SET
        category_id=EXCLUDED.category_id,name=EXCLUDED.name,description=EXCLUDED.description,updated_at=NOW()`,
      [record.connectorId, record.tagId, record.categoryId || null, record.name || null, record.description || null]);
  }

  private static configuration(row: VCenterConnectorRow): VCenterConnectorConfiguration {
    return {
      connectorId: row.connector_id,
      endpointFqdn: row.endpoint_fqdn,
      port: Number(row.port),
      soapEndpointPath: row.soap_endpoint_path,
      automationApiBasePath: row.automation_api_base_path,
      tlsVerifyCertificates: Boolean(row.tls_verify_certificates),
      tlsCaReference: optional(row.tls_ca_reference),
      credentialSecretReference: optional(row.secret_reference),
      requestTimeoutMs: Number(row.request_timeout_ms),
      responseSizeLimitBytes: Number(row.response_size_limit_bytes),
      endpointAllowPrivateNetwork: Boolean(row.endpoint_allow_private_network),
      accessMode: 'READ_ONLY',
    };
  }
}
