import type {
  VCenterCapabilities,
  VCenterConnectionSnapshot,
  VCenterConnectorConfiguration,
  VCenterErrorCode,
  VCenterRuntimeState,
  VCenterServerInfo,
} from '../../../shared/types/vcenter.js';
import { assertVCenterResolvedTarget, validateVCenterTransport } from './vcenter-endpoint-policy.js';

export class VCenterConnectorError extends Error {
  public constructor(public readonly code: VCenterErrorCode, message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'VCenterConnectorError';
  }
}

export class VCenterRetryPolicy {
  private static readonly retryableCodes = new Set<VCenterErrorCode>([
    'VCENTER_DNS_FAILED', 'VCENTER_CONNECT_TIMEOUT', 'VCENTER_SESSION_EXPIRED',
    'VCENTER_RATE_LIMITED', 'VCENTER_INTERNAL_ERROR',
  ]);

  public static isRetryable(code: VCenterErrorCode): boolean {
    return this.retryableCodes.has(code);
  }

  public static delayMs(attempt: number, random = Math.random): number {
    const safeAttempt = Math.max(1, Math.min(10, Math.floor(attempt)));
    const exponential = Math.min(300_000, 1_000 * (2 ** (safeAttempt - 1)));
    return Math.min(300_000, Math.floor(exponential * (0.5 + Math.max(0, Math.min(1, random())))));
  }
}

/** Opaque secret material is resolved by the deployment's secret manager. */
export interface VCenterCredentialResolver {
  resolve(secretReference: string): Promise<unknown>;
}

export interface VimSoapSession {
  readonly connectorId: string;
  readonly sessionId: string;
}

export interface VimSoapServiceContent {
  about: VCenterServerInfo;
  hasPropertyCollector: boolean;
  hasSessionManager: boolean;
  certificate?: import('../../../shared/types/vcenter.js').VCenterCertificateMetadata;
}

/**
 * Classic VIM/SOAP boundary. Implementations may use generated VIM bindings,
 * but this phase does not traverse inventory or call RetrievePropertiesEx.
 */
export interface VimSoapClient {
  connect(configuration: VCenterConnectorConfiguration): Promise<void>;
  login(configuration: VCenterConnectorConfiguration, credential: unknown): Promise<VimSoapSession>;
  serviceContent(session: VimSoapSession): Promise<VimSoapServiceContent>;
  logout(session: VimSoapSession): Promise<void>;
}

export interface AutomationRestProbe {
  available: boolean;
  supportsTagging: boolean;
  supportsViJson: boolean;
}

/** REST is an enrichment boundary, not the common inventory compatibility layer. */
export interface AutomationRestClient {
  probe(configuration: VCenterConnectorConfiguration, credential: unknown): Promise<AutomationRestProbe>;
}

export interface VCenterSessionManager {
  login(configuration: VCenterConnectorConfiguration, client: VimSoapClient, credential: unknown): Promise<VimSoapSession>;
  ensureSession(connectorId: string): Promise<VimSoapSession>;
  logout(connectorId: string, client: VimSoapClient): Promise<void>;
  invalidate(connectorId: string): void;
  reconnect(configuration: VCenterConnectorConfiguration, client: VimSoapClient, credential: unknown): Promise<VimSoapSession>;
}

type SessionState = {
  configuration: VCenterConnectorConfiguration;
  session: VimSoapSession;
};

/**
 * Process-local session ownership. The map key is the immutable connector ID,
 * so a session can never be accidentally reused for another vCenter.
 */
export class ConnectorScopedVCenterSessionManager implements VCenterSessionManager {
  private readonly sessions = new Map<string, SessionState>();

  public async login(configuration: VCenterConnectorConfiguration, client: VimSoapClient, credential: unknown): Promise<VimSoapSession> {
    if (this.sessions.has(configuration.connectorId)) await this.logout(configuration.connectorId, client);
    await client.connect(configuration);
    const session = await client.login(configuration, credential);
    if (session.connectorId !== configuration.connectorId) {
      throw new Error('vCenter SOAP client returned a session for a different connector.');
    }
    this.sessions.set(configuration.connectorId, { configuration, session });
    return session;
  }

  public async ensureSession(connectorId: string): Promise<VimSoapSession> {
    const state = this.sessions.get(connectorId);
    if (!state) throw new Error(`No active vCenter session for connector ${connectorId}.`);
    return state.session;
  }

  public async logout(connectorId: string, client: VimSoapClient): Promise<void> {
    const state = this.sessions.get(connectorId);
    if (!state) return;
    try {
      await client.logout(state.session);
    } finally {
      this.invalidate(connectorId);
    }
  }

  public invalidate(connectorId: string): void {
    this.sessions.delete(connectorId);
  }

  public async reconnect(configuration: VCenterConnectorConfiguration, client: VimSoapClient, credential: unknown): Promise<VimSoapSession> {
    await this.logout(configuration.connectorId, client);
    return this.login(configuration, client, credential);
  }
}

export interface VCenterCapabilityDetectorInput {
  soap: VimSoapServiceContent;
  automation: AutomationRestProbe;
}

export class VCenterCapabilityDetector {
  public static detect(input: VCenterCapabilityDetectorInput): VCenterCapabilities {
    return {
      version: input.soap.about.version,
      build: input.soap.about.build,
      ...(input.soap.about.apiVersion ? { apiVersion: input.soap.about.apiVersion } : {}),
      supportsSoapVim: true,
      supportsPropertyCollector: input.soap.hasPropertyCollector,
      supportsAutomationApi: input.automation.available,
      supportsTagging: input.automation.available && input.automation.supportsTagging,
      supportsViJson: input.automation.available && input.automation.supportsViJson,
    };
  }
}

/** One runtime object owns one connector's clients and session state. */
export class VCenterConnector {
  private readonly runtimeState: VCenterRuntimeState;

  public constructor(
    public readonly configuration: VCenterConnectorConfiguration,
    private readonly vim: VimSoapClient,
    private readonly automation: AutomationRestClient,
    private readonly sessions: VCenterSessionManager,
  ) {
    validateVCenterTransport(configuration);
    this.runtimeState = { connectorId: configuration.connectorId, retryAttempt: 0 };
  }

  public getRuntimeState(): VCenterRuntimeState {
    return { ...this.runtimeState };
  }

  public markRetryableFailure(code: VCenterErrorCode, now = new Date()): void {
    if (!VCenterRetryPolicy.isRetryable(code)) return;
    this.runtimeState.retryAttempt += 1;
    this.runtimeState.nextRetryAt = new Date(now.getTime() + VCenterRetryPolicy.delayMs(this.runtimeState.retryAttempt)).toISOString();
  }

  public markConnectionSuccess(): void {
    this.runtimeState.retryAttempt = 0;
    delete this.runtimeState.nextRetryAt;
    delete this.runtimeState.rateLimitUntil;
  }

  public async connect(credential: unknown): Promise<VCenterConnectionSnapshot> {
    await assertVCenterResolvedTarget(this.configuration);
    const session = await this.sessions.login(this.configuration, this.vim, credential);
    const soap = await this.vim.serviceContent(session);
    const automation = await this.automation.probe(this.configuration, credential);
    const capabilities = VCenterCapabilityDetector.detect({ soap, automation });
    return {
      server: soap.about,
      capabilities,
      ...(soap.certificate ? { certificate: soap.certificate } : {}),
      connectionTestedAt: new Date().toISOString(),
    };
  }

  public async disconnect(): Promise<void> {
    await this.sessions.logout(this.configuration.connectorId, this.vim);
  }
}

/** Explicit fail-closed adapter until the real VIM binding is introduced. */
export class UnimplementedVimSoapClient implements VimSoapClient {
  public async connect(_configuration: VCenterConnectorConfiguration): Promise<void> { throw new Error('VIM/SOAP client implementation is not enabled yet.'); }
  public async login(_configuration: VCenterConnectorConfiguration, _credential: unknown): Promise<VimSoapSession> { throw new Error('VIM/SOAP client implementation is not enabled yet.'); }
  public async serviceContent(_session: VimSoapSession): Promise<VimSoapServiceContent> { throw new Error('VIM/SOAP client implementation is not enabled yet.'); }
  public async logout(_session: VimSoapSession): Promise<void> { return; }
}

export class UnimplementedAutomationRestClient implements AutomationRestClient {
  public async probe(_configuration: VCenterConnectorConfiguration, _credential: unknown): Promise<AutomationRestProbe> {
    throw new Error('vSphere Automation REST client implementation is not enabled yet.');
  }
}
