import { VCenterConnectorRepository } from '../db/postgres/vcenter-connector-repository.js';
import { VCenterConnectorError, type VCenterCredentialResolver } from '../integrations/vcenter/vcenter-connector.js';
import { VCenterConnectorRegistry } from '../integrations/vcenter/vcenter-registry.js';
import type { VCenterConnectionSnapshot, VCenterErrorCode } from '../../shared/types/vcenter.js';
import { VCenterEndpointPolicyError } from '../integrations/vcenter/vcenter-endpoint-policy.js';
import { VCenterObservabilityService } from './vcenter-observability.service.js';
import { logger } from './logger.service.js';

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
    private readonly credentials: VCenterCredentialResolver,
  ) {}

  public async connectAndPersist(connectorId: string): Promise<{ connectorId: string; snapshot: VCenterConnectionSnapshot }> {
    const configuration = await VCenterConnectorRepository.find(connectorId);
    if (!configuration) throw new VCenterRuntimeError('VCENTER_NOT_FOUND', 'vCenter connector was not found.', 404);
    VCenterObservabilityService.recordAttempt(connectorId);
    logger.info({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect' }, 'vCenter connection attempt started');
    await VCenterConnectorRepository.markConnectionAttempt(connectorId);
    if (!configuration.credentialSecretReference) {
      VCenterObservabilityService.recordFailure(connectorId, 'VCENTER_CONFIG_INVALID');
      logger.warn({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect', error_code: 'VCENTER_CONFIG_INVALID' }, 'vCenter connection configuration is incomplete');
      await VCenterConnectorRepository.recordConnectionFailure(connectorId, 'VCENTER_CONFIG_INVALID', 'vCenter connector has no credential secret reference.');
      throw new VCenterRuntimeError('VCENTER_CONFIG_INVALID', 'vCenter connector has no credential secret reference.');
    }

    let runtime: ReturnType<VCenterConnectorRegistry['getOrCreate']> | undefined;
    try {
      const credential = await this.credentials.resolve(configuration.credentialSecretReference);
      runtime = this.registry.getOrCreate(configuration);
      const snapshot = await runtime.connect(credential);
      runtime.markConnectionSuccess();
      await VCenterConnectorRepository.recordConnectionSuccess(connectorId, snapshot);
      VCenterObservabilityService.recordSuccess(connectorId, snapshot.connectionTestedAt);
      logger.info({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect' }, 'vCenter connection succeeded');
      return { connectorId, snapshot };
    } catch (error) {
      const message = safeConnectionError(error);
      const code = connectionErrorCode(error);
      VCenterObservabilityService.recordFailure(connectorId, code);
      logger.warn({ connector_id: connectorId, connector_type: 'VCENTER', operation: 'connect', error_code: code }, 'vCenter connection failed');
      runtime?.markRetryableFailure(code);
      await VCenterConnectorRepository.recordConnectionFailure(connectorId, code, message, runtime?.getRuntimeState().nextRetryAt);
      throw error;
    } finally {
      await runtime?.disconnect().catch(() => undefined);
    }
  }
}

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
