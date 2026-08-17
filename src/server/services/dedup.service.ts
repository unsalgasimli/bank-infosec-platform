import crypto from 'crypto';
import { Ticket, SecurityFindingDetails } from '../../shared/types/ticket.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';

export interface FindingIngestPayload {
  scannerSource: SecurityFindingDetails['scannerSource'];
  applicationId?: string;
  assetId?: string;
  title: string;
  description: string;
  cweId?: string;
  cweName?: string;
  cveId?: string;
  cvssScore?: number;
  cvssVector?: string;
  owaspCategory?: string;
  endpoint?: string;
  httpParameter?: string;
  filePath?: string;
  codeLine?: number;
  packageName?: string;
  installedVersion?: string;
  fixedVersion?: string;
  proofOfConcept?: string;
  remediationRecommendation?: string;
}

export class DedupService {
  /**
   * Generates a deterministic finding fingerprint based on key vulnerability attributes.
   */
  public static calculateFingerprint(payload: FindingIngestPayload): string {
    const raw = [
      payload.scannerSource || 'SCANNER',
      payload.applicationId || payload.assetId || 'GLOBAL',
      payload.cveId || payload.cweId || payload.title,
      payload.filePath || '',
      payload.codeLine || 0,
      payload.endpoint || '',
      payload.httpParameter || '',
    ].join('::');

    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
  }

  /**
   * Ingests a finding from a scanner/webhook.
   * If NEW -> creates a ticket.
   * If EXISTING ACTIVE -> updates observation count and lastDetectedAt.
   * If PREVIOUSLY CLOSED/FIXED -> reopens ticket with RECURRENCE flag and high priority.
   */
  public static ingestFinding(payload: FindingIngestPayload, actor: BankUser): { action: 'CREATED' | 'UPDATED' | 'REOPENED'; ticket: Ticket } {
    const fingerprint = DedupService.calculateFingerprint(payload);
    const now = new Date().toISOString();

    // Check for existing ticket with this fingerprint
    const existingTicket = db.data.tickets.find(
      (t) => t.findingDetails?.findingFingerprint === fingerprint
    );

    if (existingTicket) {
      if (existingTicket.statusCategory === 'DONE' || existingTicket.statusCategory === 'CANCELLED') {
        // Previously fixed finding has reappeared -> REOPEN / RECURRENCE
        existingTicket.statusId = 'VULN_FAILED_RETEST';
        existingTicket.statusName = 'Failed Retest (Re-opened Recurrence)';
        existingTicket.statusCategory = 'IN_PROGRESS';
        existingTicket.updatedAt = now;
        existingTicket.version += 1;
        if (!existingTicket.tags.includes('RECURRENCE-DETECTED')) {
          existingTicket.tags.push('RECURRENCE-DETECTED');
        }
        if (existingTicket.findingDetails) {
          existingTicket.findingDetails.lastDetectedAt = now;
          existingTicket.findingDetails.observationCount = (existingTicket.findingDetails.observationCount || 1) + 1;
        }

        // Add automated comment
        db.data.comments.unshift({
          id: `comm-${Date.now()}`,
          ticketId: existingTicket.id,
          authorId: actor.id,
          authorName: actor.fullName,
          authorRole: 'SECURITY_AUTOMATION',
          content: `🚨 [SCANNER RECURRENCE DETECTED] Scanner ${payload.scannerSource} observed this previously remediated finding again. Ticket has been automatically re-opened for immediate investigation.`,
          visibility: 'PUBLIC',
          confidentiality: existingTicket.confidentiality,
          mentions: [existingTicket.assigneeId || ''].filter(Boolean),
          createdAt: now,
          isEdited: false,
          reactions: [{ emoji: '⚠️', userIds: [actor.id] }],
        });

        AuditService.log({
          actor,
          action: 'STATUS_TRANSITIONED',
          entityType: 'TICKET',
          entityId: existingTicket.id,
          entityKey: existingTicket.key,
          metadata: { reason: 'Recurrence detected by scanner ingestion', scanner: payload.scannerSource },
        });

        db.persist();
        return { action: 'REOPENED', ticket: existingTicket };
      } else {
        // Active finding -> increment observation count
        if (existingTicket.findingDetails) {
          existingTicket.findingDetails.lastDetectedAt = now;
          existingTicket.findingDetails.observationCount = (existingTicket.findingDetails.observationCount || 1) + 1;
        }
        existingTicket.updatedAt = now;
        db.persist();
        return { action: 'UPDATED', ticket: existingTicket };
      }
    }

    // Create brand-new ticket
    const count = db.data.tickets.length + 1;
    const projectCode = payload.applicationId ? 'APPSEC' : 'VM';
    const key = `${projectCode}-2026-${String(count).padStart(4, '0')}`;

    const newTicket: Ticket = {
      id: `tick-${Date.now()}`,
      key,
      projectCode,
      ticketTypeId: 'type-vuln',
      ticketTypeName: 'Vulnerability Finding',
      category: 'VULNERABILITY',
      securityDomain: payload.applicationId ? 'APPSEC' : 'VULNERABILITY_MGMT',
      title: payload.title,
      description: payload.description,
      statusId: 'VULN_OPEN',
      statusName: 'Open / Ingested',
      statusCategory: 'TO_DO',
      workflowId: 'wf-vuln-std',
      workflowVersion: 1,
      technicalSeverity: payload.cvssScore && payload.cvssScore >= 9.0 ? 'CRITICAL' : payload.cvssScore && payload.cvssScore >= 7.0 ? 'HIGH' : 'MEDIUM',
      businessPriority: payload.cvssScore && payload.cvssScore >= 9.0 ? 'P1_URGENT' : 'P2_HIGH',
      businessImpact: 'SIGNIFICANT',
      inherentRisk: 'HIGH',
      residualRisk: 'MEDIUM',
      riskScore: Math.round((payload.cvssScore || 5.0) * 10),
      cvssScore: payload.cvssScore,
      cvssVector: payload.cvssVector,
      confidentiality: 'INTERNAL',
      reporterId: actor.id,
      applicationId: payload.applicationId,
      assetId: payload.assetId,
      watcherIds: [actor.id],
      findingDetails: {
        vulnerabilityTitle: payload.title,
        cweId: payload.cweId,
        cweName: payload.cweName,
        cveId: payload.cveId,
        cvssScore: payload.cvssScore,
        cvssVector: payload.cvssVector,
        owaspCategory: payload.owaspCategory,
        endpoint: payload.endpoint,
        httpParameter: payload.httpParameter,
        filePath: payload.filePath,
        codeLine: payload.codeLine,
        packageName: payload.packageName,
        installedVersion: payload.installedVersion,
        fixedVersion: payload.fixedVersion,
        proofOfConcept: payload.proofOfConcept,
        remediationRecommendation: payload.remediationRecommendation,
        scannerSource: payload.scannerSource,
        findingFingerprint: fingerprint,
        observationCount: 1,
        firstDetectedAt: now,
        lastDetectedAt: now,
      },
      createdAt: now,
      updatedAt: now,
      detectedAt: now,
      dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
      remediationDeadline: new Date(Date.now() + 86400000 * 2).toISOString(),
      slaPolicyId: 'sla-tier1-banking',
      slaState: 'SAFE',
      version: 1,
      tags: ['Scanner-Ingested', payload.scannerSource || 'API'],
    };

    db.data.tickets.unshift(newTicket);
    
    AuditService.log({
      actor,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newTicket.id,
      entityKey: newTicket.key,
      metadata: { scannerSource: payload.scannerSource, fingerprint },
    });

    db.persist();
    return { action: 'CREATED', ticket: newTicket };
  }
}
