import type { VCenterConnector, VCenterSessionManager, VimSoapClient, AutomationRestClient } from './vcenter-connector.js';
import { VCenterConnector as VCenterConnectorRuntime, ConnectorScopedVCenterSessionManager } from './vcenter-connector.js';
import type { VCenterConnectorConfiguration } from '../../../shared/types/vcenter.js';

export interface VCenterClientFactory {
  vim(configuration: VCenterConnectorConfiguration): VimSoapClient;
  automation(configuration: VCenterConnectorConfiguration): AutomationRestClient;
}

/**
 * Worker-local registry. Every entry receives its own SOAP/REST clients and
 * session manager; no credential or session state is shared between entries.
 */
export class VCenterConnectorRegistry {
  private readonly runtimes = new Map<string, VCenterConnector>();

  public constructor(private readonly clients: VCenterClientFactory) {}

  public getOrCreate(configuration: VCenterConnectorConfiguration): VCenterConnector {
    const existing = this.runtimes.get(configuration.connectorId);
    if (existing) return existing;
    const runtime = new VCenterConnectorRuntime(
      configuration,
      this.clients.vim(configuration),
      this.clients.automation(configuration),
      new ConnectorScopedVCenterSessionManager(),
    );
    this.runtimes.set(configuration.connectorId, runtime);
    return runtime;
  }

  public remove(connectorId: string): boolean {
    return this.runtimes.delete(connectorId);
  }

  public size(): number {
    return this.runtimes.size;
  }
}
