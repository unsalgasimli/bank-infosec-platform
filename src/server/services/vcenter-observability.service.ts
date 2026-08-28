type ConnectorMetricState = {
  attempts: number;
  failures: number;
  authFailures: number;
  tlsFailures: number;
  lastSuccessTimestamp?: string;
  up: boolean;
};

/**
 * Process-local vCenter counters. Labels are limited to connector identity;
 * inventory object names and VMware managed-object IDs never enter metrics.
 * The existing MetricsService exporter can expose this snapshot later without
 * changing the connector lifecycle contract.
 */
export class VCenterObservabilityService {
  private static readonly states = new Map<string, ConnectorMetricState>();

  private static state(connectorId: string): ConnectorMetricState {
    const current = this.states.get(connectorId);
    if (current) return current;
    const created: ConnectorMetricState = { attempts: 0, failures: 0, authFailures: 0, tlsFailures: 0, up: false };
    this.states.set(connectorId, created);
    return created;
  }

  public static recordAttempt(connectorId: string): void {
    this.state(connectorId).attempts += 1;
  }

  public static recordSuccess(connectorId: string, timestamp = new Date().toISOString()): void {
    const state = this.state(connectorId);
    state.up = true;
    state.lastSuccessTimestamp = timestamp;
  }

  public static recordFailure(connectorId: string, code: string): void {
    const state = this.state(connectorId);
    state.up = false;
    state.failures += 1;
    if (code === 'VCENTER_AUTH_FAILED') state.authFailures += 1;
    if (code === 'VCENTER_TLS_UNTRUSTED' || code === 'VCENTER_TLS_HOSTNAME_MISMATCH') state.tlsFailures += 1;
  }

  public static snapshot(connectorId: string): Record<string, unknown> {
    const state = this.state(connectorId);
    return {
      connectorId,
      connectorType: 'VCENTER',
      up: state.up,
      connectionAttemptsTotal: state.attempts,
      connectionFailuresTotal: state.failures,
      authenticationFailuresTotal: state.authFailures,
      tlsFailuresTotal: state.tlsFailures,
      lastSuccessTimestamp: state.lastSuccessTimestamp,
    };
  }

  public static all(): Record<string, Record<string, unknown>> {
    return Object.fromEntries([...this.states.keys()].sort().map((id) => [id, this.snapshot(id)]));
  }
}
