import { ConfidentialityTier } from './auth.js';

export type EvidenceType =
  | 'PEN_TEST_REPORT'
  | 'SAST_SCAN_LOG'
  | 'DAST_REPORT'
  | 'POC_SCRIPT'
  | 'NETWORK_PCAP'
  | 'EDR_FORENSIC_DUMP'
  | 'CONFIG_FILE'
  | 'AUDIT_WORKPAPER'
  | 'CHANGE_APPROVAL'
  | 'EXECUTIVE_SIGN_OFF';

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  evidenceType: EvidenceType;
  sha256Checksum: string;
  isEncrypted: boolean;
  virusScanStatus: 'PENDING' | 'CLEAN' | 'QUARANTINED';
  confidentiality: ConfidentialityTier;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string;
  isImmutableEvidence: boolean;
  retentionUntil: string;
  downloadCount: number;
  /**
   * Opaque object-store locator. This is never returned to the client and must
   * only be resolved after ticket-level authorization succeeds.
   */
  storageKey?: string;
  /** Internal-only locator for bytes awaiting or failing malware scanning. */
  quarantineStorageKey?: string;
}
