import { VCenterConnectorRepository } from '../db/postgres/vcenter-connector-repository.js';
import { VCenterConnectorError, type VCenterInventoryObject } from '../integrations/vcenter/vcenter-connector.js';
import { VCenterConnectorRegistry } from '../integrations/vcenter/vcenter-registry.js';
import type { VCenterConnectionSnapshot, VCenterErrorCode, VCenterConnectionTestResult } from '../../shared/types/vcenter.js';
import { VCenterEndpointPolicyError } from '../integrations/vcenter/vcenter-endpoint-policy.js';
import { VCenterObservabilityService } from './vcenter-observability.service.js';
import { logger } from './logger.service.js';
import { VCenterCredentialCryptoService } from './vcenter-credential-crypto.service.js';

export class VCenterRuntimeError extends Error {
  public constructor(public readonly code: string, message: string, public readonly statusCode = 422) {
    super(message);
    this.name = 'VCenterRuntimeError';
  }
}

/**
 * Connection lifecycle only. No inventory objects are fetched here; the
 * returned snapshot is the control-plane metadata needed by later discovery.
 */
export class VCenterRuntimeService {
  public constructor(
    private readonly registry: VCenterConnectorRegistry,
  ) {}

  public async connectAndPersist(connectorId: string, context: { correlationId?: string } = {}): Promise<{ connectorId: string; snapshot: VCenterConnectionSnapshot }> {
    const startedAt = Date.now();
    const configuration = await VCenterConnectorRepository.find(connectorId);
    if (!configuration) throw new VCenterRuntimeError('VCENTER_NOT_FOUND', 'vCenter connector was not found.', 404);
    VCenterObservabilityService.recordAttempt(connectorId);
    logger.info({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect', stage: 'CONNECT', correlation_id: context.correlationId, result: 'STARTED' }, 'vCenter connection attempt started');
    await VCenterConnectorRepository.markConnectionAttempt(connectorId);
    const storedCredential = await VCenterConnectorRepository.findCredential(connectorId);
    if (!storedCredential) {
      VCenterObservabilityService.recordFailure(connectorId, 'VCENTER_CONFIG_INVALID');
      logger.warn({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect', error_code: 'VCENTER_CONFIG_INVALID' }, 'vCenter connection configuration is incomplete');
      await VCenterConnectorRepository.recordConnectionFailure(connectorId, 'VCENTER_CONFIG_INVALID', 'vCenter connector has no encrypted credential.');
      const error = new VCenterRuntimeError('VCENTER_CONFIG_INVALID', 'vCenter connector has no encrypted credential.');
      (error as any).details = failureTestResult('VCENTER_CONFIG_INVALID', false);
      throw error;
    }

    let runtime: ReturnType<VCenterConnectorRegistry['getOrCreate']> | undefined;
    let secretResolved = false;
    try {
      const credential = VCenterCredentialCryptoService.decrypt(storedCredential);
      secretResolved = true;
      runtime = this.registry.getOrCreate(configuration);
      const snapshot = await runtime.connect(credential);
      runtime.markConnectionSuccess();
      await VCenterConnectorRepository.recordConnectionSuccess(connectorId, snapshot);
      VCenterObservabilityService.recordSuccess(connectorId, snapshot.connectionTestedAt);
      VCenterObservabilityService.recordDuration(connectorId, Date.now() - startedAt);
      logger.info({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect', stage: 'COMPLETE', correlation_id: context.correlationId, duration_ms: Date.now() - startedAt, result: 'SUCCEEDED' }, 'vCenter connection succeeded');
      return { connectorId, snapshot };
    } catch (error) {
      const message = safeConnectionError(error);
      const code = connectionErrorCode(error);
      if (error && typeof error === 'object') (error as any).details = failureTestResult(code, secretResolved);
      VCenterObservabilityService.recordFailure(connectorId, code);
      VCenterObservabilityService.recordDuration(connectorId, Date.now() - startedAt);
      logger.warn({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect', stage: failureStage(code), correlation_id: context.correlationId, duration_ms: Date.now() - startedAt, result: 'FAILED', error_code: code }, 'vCenter connection failed');
      runtime?.markRetryableFailure(code);
      await VCenterConnectorRepository.recordConnectionFailure(connectorId, code, message, runtime?.getRuntimeState().nextRetryAt);
      throw error;
    } finally {
      await runtime?.disconnect().catch(() => undefined);
    }
  }

  /** Reads connector-scoped, read-only VMware inventory after a verified connection. */
  public async discoverInventory(connectorId: string, context: { correlationId?: string } = {}): Promise<VCenterInventoryObject[]> {
    await this.connectAndPersist(connectorId, context);
    const configuration = await VCenterConnectorRepository.find(connectorId);
    const storedCredential = await VCenterConnectorRepository.findCredential(connectorId);
    if (!configuration || !storedCredential) throw new VCenterRuntimeError('VCENTER_CONFIG_INVALID', 'vCenter connector configuration is incomplete.');
    const runtime = this.registry.getOrCreate(configuration);
    try { return await runtime.discover(VCenterCredentialCryptoService.decrypt(storedCredential)); }
    finally { await runtime.disconnect().catch(() => undefined); }
  }
}

function failureTestResult(code: VCenterErrorCode, secretResolved = true): VCenterConnectionTestResult {
  const connection: VCenterConnectionTestResult['connection'] = { validateConfig: 'OK', resolveSecret: 'OK', dns: 'OK', tcp: 'OK', tls: 'OK', authentication: 'OK', session: 'OK', inventory: 'OK', serverInfo: 'OK', permissions: 'OK' };
  if (code === 'VCENTER_CONFIG_INVALID') { if (secretResolved) connection.validateConfig = 'FAILED'; else { connection.validateConfig = 'OK'; connection.resolveSecret = 'FAILED'; } }
  else if (code === 'VCENTER_DNS_FAILED') { connection.dns = 'FAILED'; connection.tcp = 'SKIPPED'; connection.tls = 'SKIPPED'; connection.authentication = 'SKIPPED'; connection.session = 'SKIPPED'; connection.inventory = 'SKIPPED'; connection.serverInfo = 'SKIPPED'; connection.permissions = 'SKIPPED'; }
  else if (code.startsWith('VCENTER_TLS_')) { connection.tls = 'FAILED'; connection.authentication = 'SKIPPED'; connection.session = 'SKIPPED'; connection.inventory = 'SKIPPED'; connection.serverInfo = 'SKIPPED'; connection.permissions = 'SKIPPED'; }
  else if (code === 'VCENTER_AUTH_FAILED') { connection.authentication = 'FAILED'; connection.session = 'SKIPPED'; connection.inventory = 'SKIPPED'; connection.serverInfo = 'SKIPPED'; connection.permissions = 'SKIPPED'; }
  else if (code === 'VCENTER_PERMISSION_DENIED') connection.permissions = 'FAILED';
  else if (code === 'VCENTER_API_UNSUPPORTED') connection.inventory = 'FAILED';
  else { connection.tcp = 'FAILED'; connection.tls = 'SKIPPED'; connection.authentication = 'SKIPPED'; connection.session = 'SKIPPED'; connection.inventory = 'SKIPPED'; connection.serverInfo = 'SKIPPED'; connection.permissions = 'SKIPPED'; }
  return { status: 'FAILED', connection, errorCode: code };
}

function failureStage(code: VCenterErrorCode): string { if (code === 'VCENTER_CONFIG_INVALID') return 'VALIDATE_CONFIG'; if (code === 'VCENTER_DNS_FAILED') return 'DNS'; if (code.startsWith('VCENTER_TLS_')) return 'TLS'; if (code === 'VCENTER_AUTH_FAILED') return 'AUTH'; if (code === 'VCENTER_PERMISSION_DENIED') return 'PERMISSION'; if (code === 'VCENTER_API_UNSUPPORTED') return 'CAPABILITY'; return 'TCP'; }

function connectionErrorCode(error: unknown): VCenterErrorCode {
  if (error instanceof VCenterConnectorError) return error.code;
  if (error instanceof VCenterEndpointPolicyError) return error.code;
  return 'VCENTER_INTERNAL_ERROR';
}

function safeConnectionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'vCenter connection failed.';
  return raw
    .replace(/(password|passwd|pwd|token|secret|authorization|credential)(\s*[:=]\s*)\S+/gi, '$1$2[REDACTED]')
    .slice(0, 4000);
}

const vcenterRegistry = new VCenterConnectorRegistry();
export const defaultVCenterRuntimeService = new VCenterRuntimeService(vcenterRegistry);
