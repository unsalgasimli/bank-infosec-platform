export type ConnectionType =
  | 'SIEM'
  | 'EDR'
  | 'ACTIVE_DIRECTORY'
  | 'CLOUD_INFRA'
  | 'VULN_SCANNER'
  | 'HRIS'
  | 'CORE_BANKING'
  | 'PAYMENT_GATEWAY'
  | 'TICKETING'
  | 'COMMUNICATION'
  | 'DATABASE';

export type ConnectionStatus = 'CONNECTED' | 'SYNCING' | 'ERROR' | 'DISCONNECTED';

export interface DepartmentConnection {
  id: string;
  departmentId: string;
  name: string;
  type: ConnectionType;
  provider: string; // e.g. "Splunk Enterprise", "Microsoft Active Directory", "Workday Cloud", "SWIFT Alliance"
  endpointUrl: string;
  authType: 'API_KEY' | 'OAUTH2' | 'MTLS_CERTIFICATE' | 'LDAP_BIND' | 'BEARER_TOKEN';
  status: ConnectionStatus;
  lastSyncAt: string;
  latencyMs?: number;
  healthScore?: number; // 0 - 100
  syncFrequencyMinutes: number;
  description: string;
  configSummary?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  timestamp: string;
  details?: {
    authenticatedUser?: string;
    serverVersion?: string;
    tlsCipher?: string;
    syncRecordsCount?: number;
  };
}
