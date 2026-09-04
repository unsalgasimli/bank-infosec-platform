import { db } from '../db/database.js';
import { pgClient } from '../db/postgres/client.js';
import { AutomationService } from './automation.service.js';
import { logger } from './logger.service.js';
import { NotificationService } from './notification.service.js';
import type { OutboxEvent } from './outbox.service.js';
import { WorkflowTriggerService } from './workflow-trigger.service.js';
import { RetryableWorkerError } from './queue.service.js';
import { MalwareScanService } from './malware-scan.service.js';
import { storageService } from './storage.service.js';
import { AuditService } from './audit.service.js';
import { SLAService } from './sla.service.js';
import { TicketLifecycleService } from './ticket-lifecycle.service.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';
import { LDAPSchedulerService } from './ldap-scheduler.service.js';
import { withTelemetrySpan } from './telemetry.service.js';
import { v4 as uuidv4 } from 'uuid';
import type { Ticket } from '../../shared/types/ticket.js';
import type { BankUser } from '../../shared/types/auth.js';
import { ThreatModelService } from './threat-model.service.js';
import { VCenterInventorySyncService } from './vcenter-inventory-sync.service.js';
import { ActiveDirectoryInventorySyncService } from './active-directory-inventory-sync.service.js';
import { CortexInventorySyncService } from './cortex-inventory-sync.service.js';
import { SmbPrinterInventorySyncService } from './smb-printer-inventory-sync.service.js';

const CONSUMER_NAME = 'aegissec-general-worker-v1';

export class WorkerEventService {
  /**
   * Recover commands that were never delivered, or a run whose owning worker
   * disappeared. A RUNNING row retains a five-minute lease so a healthy long
   * inventory job is never executed twice by the recovery loop.
   */
  public static async recoverQueuedDiscoveryRuns(limit = 100): Promise<void> {
    const runs = await pgClient.query<{ id: string; connector_type_id: string; correlation_id: string | null }>(`
      SELECT r.id,c.connector_type_id,r.correlation_id
      FROM cmdb_discovery_sync_runs r
      JOIN cmdb_discovery_connectors c ON c.id=r.connector_id
      WHERE c.deleted_at IS NULL
        AND (
          r.state = 'QUEUED'
          OR (r.state = 'RUNNING' AND r.updated_at < NOW() - INTERVAL '5 minutes')
        )
      ORDER BY r.queued_at
      LIMIT $1`, [limit]);
    for (const run of runs.rows) {
      try {
        if (run.connector_type_id === 'ACTIVE_DIRECTORY') await ActiveDirectoryInventorySyncService.runQueued(run.id);
        else if (run.connector_type_id === 'CORTEX') await CortexInventorySyncService.runQueued(run.id, { correlationId: run.correlation_id || undefined });
        else if (run.connector_type_id === 'VCENTER') await VCenterInventorySyncService.runQueued(run.id, { correlationId: run.correlation_id || undefined });
        else if (run.connector_type_id === 'SMB_PRINTER') await SmbPrinterInventorySyncService.runQueued(run.id);
      } catch (error) {
        logger.error({ error, runId: run.id, connectorType: run.connector_type_id }, 'Queued discovery run recovery failed');
      }
    }
  }

  public static async process(event: OutboxEvent): Promise<void> {
    return withTelemetrySpan('outbox.process', {
      'messaging.system': 'rabbitmq',
      'messaging.operation': 'process',
      'messaging.message.id': event.id,
      'messaging.destination.name': event.topic,
      'aegissec.correlation_id': event.correlationId || '',
    }, async () => this.processCommittedEvent(event));
  }

  private static async processCommittedEvent(event: OutboxEvent): Promise<void> {
    const receipt = await pgClient.query<{ event_id: string }>(
      'SELECT event_id FROM event_consumer_receipts WHERE consumer_name=$1 AND event_id=$2',
      [CONSUMER_NAME, event.id]
    );
    if (receipt.rowCount) return;

    // Each event is based on the committed PostgreSQL projection. Reloading
    // here prevents a long-lived worker from operating on an old in-memory
    // compatibility projection after an API replica handles another request.
    await db.initialize();

    if (event.topic === 'ticket.created') {
      await this.ticketCreated(event);
    } else if (event.topic === 'threat-control.created') {
      await this.createThreatRemediationTicket(event);
    } else if (event.topic === 'threat-model.created') {
      await this.notifyThreatModelEvent(event, 'Threat Model created', 'A Threat Model was created and requires architecture and security review.');
      await this.createThreatModelLifecycleTickets(event, ['ARCHITECTURE_REVIEW', 'THREAT_MODEL_WORKSHOP']);
    } else if (event.topic === 'threat-model.review.submitted') {
      await this.createThreatModelLifecycleTickets(event, ['APPSEC_THREAT_MODEL_REVIEW', 'SECURITY_ARCHITECTURE_APPROVAL']);
    } else if (event.topic === 'threat-model.high-risk-threat.created') {
      await this.notifyThreatModelEvent(event, 'High-risk threat identified', 'A high or critical threat requires mitigation and independent AppSec verification.', true);
      await this.createThreatModelLifecycleTickets(event, ['HIGH_RISK_SECURITY_TEST']);
    } else if (event.topic === 'threat-control.verification.required') {
      await this.createThreatModelLifecycleTickets(event, ['SECURITY_VERIFICATION']);
    } else if (event.topic === 'threat-control.verification.failed') {
      await this.reopenFailedThreatControl(event);
    } else if (event.topic === 'project.created' || event.topic === 'cmdb.ci.created') {
      await this.createSecurityScreening(event);
    } else if (event.topic === 'project.material-change') {
      await ThreatModelService.markReviewRequiredForMaterialChange({ projectId: String(event.payload.projectId || event.aggregateId) }, this.eventActor(event));
    } else if (event.topic === 'cmdb.ci.material-change') {
      const ciId = String(event.payload.ciId || event.aggregateId);
      await ThreatModelService.markReviewRequiredForMaterialChange({ assetId: ciId, serviceId: ciId }, this.eventActor(event));
    } else if (event.topic === 'attachment.scan.requested') {
      await this.scanAttachment(event);
    } else if (event.topic === 'sla.tick') {
      SLAService.refreshAllTicketSLAs();
    } else if (event.topic === 'workflow.schedule.tick') {
      WorkflowTriggerService.processScheduled(new Date(String(event.payload.scheduledAt || event.occurredAt)));
    } else if (event.topic === 'workflow.runtime.tick') {
      WorkflowRuntimeService.resumeDueInstances(new Date(String(event.payload.scheduledAt || event.occurredAt)));
    } else if (event.topic === 'ldap.sync.requested') {
      await this.syncLdapDirectory(event);
    } else if (event.topic === 'cmdb.discovery.sync.requested') {
      try {
        const runId = String(event.payload.runId || event.aggregateId);
        if (event.payload.connectorType === 'ACTIVE_DIRECTORY') await ActiveDirectoryInventorySyncService.runQueued(runId);
        else if (event.payload.connectorType === 'CORTEX') await CortexInventorySyncService.runQueued(runId, { correlationId: event.correlationId });
        else if (event.payload.connectorType === 'SMB_PRINTER') await SmbPrinterInventorySyncService.runQueued(runId);
        else await VCenterInventorySyncService.runQueued(runId, { correlationId: event.correlationId });
      } catch (error: any) {
        if (error?.retryable === true) throw new RetryableWorkerError(String(error?.message || 'vCenter discovery source is temporarily unavailable.'));
        throw error;
      }
    } else if (event.topic === 'discovery.run.completed') {
      // Discovery ingestion already committed the authoritative PostgreSQL
      // state. This notification only needs a consumer receipt.
    } else if (event.topic.startsWith('asset.')) {
      // Asset discovery already committed the authoritative CMDB projection.
      // These events are intentionally receipt-only for the general worker;
      // asset-specific consumers can be added without treating valid AD or
      // vCenter ingestion events as unsupported failures.
    } else if (event.topic === 'ai.analysis.requested') {
      await this.analyzeTicket(event);
    } else {
      logger.warn({ eventId: event.id, topic: event.topic }, 'Ignoring unsupported outbox event topic');
    }

    // Discovery ingestion is authoritative in PostgreSQL and does not mutate
    // the legacy in-memory projection. Flushing it here can fail on unrelated
    // compatibility records after the discovery run has already succeeded,
    // leaving the durable outbox event stuck in retry forever.
    if (event.topic !== 'cmdb.discovery.sync.requested' && event.topic !== 'discovery.run.completed' && event.topic !== 'ldap.sync.requested') {
      await db.persistAsync();
    }
    await pgClient.query(
      'INSERT INTO event_consumer_receipts(consumer_name,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [CONSUMER_NAME, event.id]
    );
  }

  private static async ticketCreated(event: OutboxEvent): Promise<void> {
    const ticketId = String(event.payload.ticketId || event.aggregateId);
    const actorId = String(event.payload.actorId || '');
    const ticket = db.data.tickets.find((candidate) => candidate.id === ticketId);
    const actor = db.data.users.find((user) => user.id === actorId) || db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
    if (!ticket || !actor) {
      throw new Error(`Ticket-created event ${event.id} cannot resolve its ticket or actor.`);
    }

    // Both services have their own idempotency/guardrails. The workflow trigger
    // receipt key is stable across broker redelivery.
    AutomationService.triggerEvent('TICKET_CREATED', ticket, actor);
    WorkflowTriggerService.emit({
      idempotencyKey: `outbox:${event.id}`,
      triggerType: 'RECORD_EVENT',
      eventName: 'TICKET_CREATED',
      recordType: 'TICKET',
      source: 'transactional-outbox',
      context: { ticketId: ticket.id, ticketKey: ticket.key, requesterId: ticket.requesterId || ticket.reporterId, departmentId: ticket.departmentId },
    }, actor);

    if (ticket.assigneeId) {
      NotificationService.create({
        id: `notif-${event.id}`,
        userId: ticket.assigneeId,
        title: `New assigned ticket: ${ticket.key}`,
        message: `You were assigned "${ticket.title}".`,
        type: 'ASSIGNMENT',
        severity: ticket.technicalSeverity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        ticketId: ticket.id,
        ticketKey: ticket.key,
      }, false);
    }
    if (ticket.category === 'CHANGE_REQUEST') await this.createChangeSecurityScreening(ticket, actor, event);
  }

  private static eventActor(event: OutboxEvent) {
    return db.data.users.find((user) => user.id === String(event.payload.actorId || event.payload.createdBy || '')) || db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
  }

  /** Every newly registered project/CI receives an auditable security-screening ticket; qualifying scope also gets its draft model. */
  private static async createSecurityScreening(event: OutboxEvent): Promise<void> {
    const actor = this.eventActor(event);
    if (!actor) throw new Error('No system actor is available for security screening automation.');
    const project = event.topic === 'project.created' ? db.data.projects.find((item) => item.id === String(event.payload.projectId || event.aggregateId)) : undefined;
    const ci = event.topic === 'cmdb.ci.created' ? db.data.configurationItems.find((item) => item.id === String(event.payload.ciId || event.aggregateId)) : undefined;
    if (!project && !ci) throw new Error(`Security-screening event ${event.id} cannot resolve its source record.`);
    const criticality = String(project?.businessCriticality || project?.priority || ci?.criticality || 'MEDIUM');
    const securityRelevant = ['CRITICAL', 'HIGH'].includes(criticality) || project?.category === 'SOFTWARE_DEVELOPMENT' || project?.category === 'INFORMATION_SECURITY' || Boolean((ci?.details as any)?.internetExposure) || Boolean((ci?.details as any)?.dataClassification && (ci?.details as any).dataClassification !== 'INTERNAL');
    let modelId: string | undefined;
    if (securityRelevant) {
      const existing = project
        ? await pgClient.query<{ id: string }>('SELECT id FROM threat_models WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1', [project.id])
        : await pgClient.query<{ id: string }>('SELECT id FROM threat_models WHERE asset_id=$1 OR service_id=$1 ORDER BY created_at DESC LIMIT 1', [ci!.id]);
      modelId = existing.rows[0]?.id;
      if (!modelId) {
        const created = await ThreatModelService.create({ title: `${project?.name || ci?.name} Threat Model`, description: 'Automatically created by mandatory security screening.', projectId: project?.id, assetId: ci?.id, serviceId: ci?.typeId === 'business_service' ? ci.id : undefined, criticality: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(criticality) ? criticality : 'HIGH', dataClassification: (ci?.details as any)?.dataClassification || 'CONFIDENTIAL_SECURITY_ONLY', businessOwnerId: project?.ownerId || ci?.businessOwnerUserId || actor.id, technicalOwnerId: project?.managerId || ci?.technicalOwnerUserId || actor.id, departmentId: project?.departmentId || ci?.departmentId }, actor, { correlationId: event.correlationId });
        modelId = (created.model as { id?: string } | undefined)?.id;
      }
      const assessed = modelId ? await pgClient.query('SELECT 1 FROM threat_model_applicability WHERE threat_model_id=$1 LIMIT 1', [modelId]) : undefined;
      if (modelId && !assessed?.rowCount) await ThreatModelService.assessApplicability({ threatModelId: modelId, projectId: project?.id, assetId: ci?.id, serviceId: ci?.typeId === 'business_service' ? ci.id : undefined, answers: { highCriticalAsset: ['CRITICAL', 'HIGH'].includes(criticality), internetExposed: Boolean((ci?.details as any)?.internetExposure), materialArchitectureChange: project?.category === 'SOFTWARE_DEVELOPMENT' }, decision: 'REQUIRED' }, actor, { correlationId: event.correlationId });
    }
    const sourceId = project?.id || ci!.id;
    if (db.data.tickets.some((ticket) => ticket.customFields?.some((field) => field.name === 'securityScreeningSourceId' && field.value === sourceId))) return;
    const workflow = db.data.workflows.find((candidate) => candidate.id === 'wf-secops-default') || db.data.workflows[0];
    const initial = workflow?.states?.find((state) => state.category === 'TO_DO') || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
    const year = new Date().getUTCFullYear(); const sequence = db.data.tickets.reduce((maximum, ticket) => Math.max(maximum, Number(ticket.key.match(new RegExp(`^SEC-${year}-(\\d+)$`))?.[1] || 0)), 0) + 1;
    const ticket: Ticket = { id: `tick-${uuidv4().slice(0, 8)}`, key: `SEC-${year}-${String(sequence).padStart(4, '0')}`, projectCode: 'SEC', ticketTypeId: 'SECURITY_SCREENING', ticketTypeName: 'Security Screening', type: 'SERVICE_REQUEST', category: 'SECURITY_REVIEW', securityDomain: 'APPSEC', title: `Security screening: ${project?.name || ci?.name}`, description: 'Complete the applicability questionnaire. Security-sensitive changes require the linked Threat Model before release.', statusId: initial.id, statusName: initial.name, statusCategory: initial.category as Ticket['statusCategory'], workflowId: workflow?.id || 'wf-secops-default', workflowVersion: workflow?.version || 1, technicalSeverity: ['CRITICAL', 'HIGH'].includes(criticality) ? criticality as Ticket['technicalSeverity'] : 'MEDIUM', businessPriority: ['CRITICAL', 'HIGH'].includes(criticality) ? criticality === 'CRITICAL' ? 'P1_URGENT' : 'P2_HIGH' : 'P3_MEDIUM', businessImpact: ['CRITICAL', 'HIGH'].includes(criticality) ? 'SIGNIFICANT' : 'MODERATE', urgency: ['CRITICAL', 'HIGH'].includes(criticality) ? 'HIGH' : 'MEDIUM', inherentRisk: ['CRITICAL', 'HIGH'].includes(criticality) ? criticality as any : 'MEDIUM', residualRisk: ['CRITICAL', 'HIGH'].includes(criticality) ? criticality as any : 'MEDIUM', riskScore: ['CRITICAL', 'HIGH'].includes(criticality) ? 70 : 40, confidentiality: 'CONFIDENTIAL_SECURITY_ONLY', reporterId: actor.id, requesterId: actor.id, ownerId: actor.id, securityOwnerId: actor.id, departmentId: project?.departmentId || ci?.departmentId || actor.departmentId, projectId: project?.id, assetId: ci?.id, watcherIds: [actor.id], participantIds: [actor.id], customFields: [{ fieldId: 'source', name: 'source', type: 'TEXT', value: 'THREAT_MODEL_SCREENING' }, { fieldId: 'securityScreeningSourceId', name: 'securityScreeningSourceId', type: 'TEXT', value: sourceId }, { fieldId: 'threatModelId', name: 'threatModelId', type: 'TEXT', value: modelId || '' }, { fieldId: 'threatModelRequired', name: 'threatModelRequired', type: 'BOOLEAN', value: securityRelevant }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), remediationDeadline: new Date(Date.now() + 5 * 86400000).toISOString(), slaState: 'SAFE', version: 1, tags: ['SECURITY_SCREENING', securityRelevant ? 'THREAT_MODEL_REQUIRED' : 'SECURITY_REVIEW_REQUIRED'] };
    db.data.tickets.unshift(ticket);
    AuditService.log({ actor, action: 'TICKET_CREATED', entityType: 'TICKET', entityId: ticket.id, entityKey: ticket.key, metadata: { source: 'THREAT_MODEL_SCREENING', sourceId, threatModelId: modelId, securityRelevant }, persist: false });
  }

  /** Change requests are a first-class screening source even though this product represents changes as governed tickets. */
  private static async createChangeSecurityScreening(change: Ticket, actor: BankUser, event: OutboxEvent): Promise<void> {
    if (db.data.tickets.some((ticket) => ticket.parentTicketId === change.id && ticket.customFields?.some((field) => field.name === 'source' && field.value === 'THREAT_MODEL_CHANGE_SCREENING'))) return;
    const answers = Object.fromEntries((change.customFields || []).filter((field) => typeof field.name === 'string').map((field) => [field.name, field.value === true || field.value === 'true']));
    const highCritical = ['HIGH', 'CRITICAL'].includes(change.technicalSeverity);
    const securityRelevant = highCritical || ['internetExposed', 'customerData', 'confidentialData', 'financialTransactions', 'authenticationChange', 'authorizationChange', 'privilegedCapability', 'externalApi', 'trustBoundary', 'thirdPartyIntegration', 'cloudDeployment', 'newDataStore', 'cryptography', 'secretsHandling', 'materialArchitectureChange'].some((name) => answers[name]);
    let modelId: string | undefined;
    if (securityRelevant) {
      const existing = await pgClient.query<{ id: string }>('SELECT id FROM threat_models WHERE change_id=$1 ORDER BY created_at DESC LIMIT 1', [change.id]);
      modelId = existing.rows[0]?.id;
      if (!modelId) {
        const created = await ThreatModelService.create({ title: `${change.key} Threat Model`, description: `Automatically created from change request ${change.key}.`, changeId: change.id, serviceId: change.applicationId, assetId: change.assetId, criticality: highCritical ? change.technicalSeverity : 'HIGH', dataClassification: change.confidentiality, businessOwnerId: change.requesterId || change.reporterId || actor.id, technicalOwnerId: change.assigneeId || change.ownerId || actor.id, departmentId: change.departmentId }, actor, { correlationId: event.correlationId });
        modelId = (created.model as { id?: string } | undefined)?.id;
      }
      const assessed = modelId ? await pgClient.query('SELECT 1 FROM threat_model_applicability WHERE threat_model_id=$1 LIMIT 1', [modelId]) : undefined;
      if (modelId && !assessed?.rowCount) await ThreatModelService.assessApplicability({ threatModelId: modelId, changeId: change.id, serviceId: change.applicationId, assetId: change.assetId, answers: { ...answers, highCriticalAsset: highCritical }, decision: 'REQUIRED' }, actor, { correlationId: event.correlationId });
    }
    const workflow = db.data.workflows.find((candidate) => candidate.id === 'wf-secops-default') || db.data.workflows[0];
    const initial = workflow?.states?.find((state) => state.category === 'TO_DO') || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
    const year = new Date().getUTCFullYear(); const sequence = db.data.tickets.reduce((maximum, ticket) => Math.max(maximum, Number(ticket.key.match(new RegExp(`^SEC-${year}-(\\d+)$`))?.[1] || 0)), 0) + 1;
    const screening: Ticket = { id: `tick-${uuidv4().slice(0, 8)}`, key: `SEC-${year}-${String(sequence).padStart(4, '0')}`, projectCode: 'SEC', ticketTypeId: 'SECURITY_SCREENING', ticketTypeName: 'Security Screening', type: 'SERVICE_REQUEST', category: 'SECURITY_REVIEW', securityDomain: 'APPSEC', title: `Security screening: ${change.key}`, description: `Mandatory applicability screening for change ${change.key}. ${securityRelevant ? 'An approved Threat Model is required before production release.' : 'Document the security-review decision before continuing.'}`, statusId: initial.id, statusName: initial.name, statusCategory: initial.category as Ticket['statusCategory'], workflowId: workflow?.id || 'wf-secops-default', workflowVersion: workflow?.version || 1, technicalSeverity: highCritical ? change.technicalSeverity : 'MEDIUM', businessPriority: highCritical ? 'P2_HIGH' : 'P3_MEDIUM', businessImpact: highCritical ? 'SIGNIFICANT' : 'MODERATE', urgency: highCritical ? 'HIGH' : 'MEDIUM', inherentRisk: highCritical ? change.technicalSeverity as any : 'MEDIUM', residualRisk: highCritical ? change.technicalSeverity as any : 'MEDIUM', riskScore: highCritical ? 70 : 40, confidentiality: 'CONFIDENTIAL_SECURITY_ONLY', reporterId: actor.id, requesterId: change.requesterId || actor.id, ownerId: actor.id, securityOwnerId: actor.id, departmentId: change.departmentId || actor.departmentId, parentTicketId: change.id, applicationId: change.applicationId, assetId: change.assetId, watcherIds: [actor.id, change.reporterId].filter(Boolean) as string[], participantIds: [actor.id], customFields: [{ fieldId: 'source', name: 'source', type: 'TEXT', value: 'THREAT_MODEL_CHANGE_SCREENING' }, { fieldId: 'changeId', name: 'changeId', type: 'TEXT', value: change.id }, { fieldId: 'threatModelId', name: 'threatModelId', type: 'TEXT', value: modelId || '' }, { fieldId: 'threatModelRequired', name: 'threatModelRequired', type: 'BOOLEAN', value: securityRelevant }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), remediationDeadline: new Date(Date.now() + 5 * 86400000).toISOString(), slaState: 'SAFE', version: 1, tags: ['SECURITY_SCREENING', 'CHANGE_REQUEST', securityRelevant ? 'THREAT_MODEL_REQUIRED' : 'SECURITY_REVIEW_REQUIRED'] };
    db.data.tickets.unshift(screening);
    AuditService.log({ actor, action: 'TICKET_CREATED', entityType: 'TICKET', entityId: screening.id, entityKey: screening.key, metadata: { source: 'THREAT_MODEL_CHANGE_SCREENING', changeId: change.id, threatModelId: modelId, securityRelevant }, persist: false });
  }

  /**
   * Each lifecycle task is a real ticket with a source relationship, not a
   * notification or a status shortcut. The idempotency key survives outbox
   * redelivery and groups every task beneath the originating screening ticket
   * when one exists.
   */
  private static async createThreatModelLifecycleTickets(event: OutboxEvent, kinds: string[]): Promise<void> {
    const modelId = String(event.payload.threatModelId || event.aggregateId || '');
    if (!modelId) throw new Error(`Threat Model lifecycle event ${event.id} has no Threat Model id.`);
    const modelResult = await pgClient.query<{ id: string; key: string; title: string; criticality: Ticket['technicalSeverity']; organization_id: string; department_id: string | null; business_owner_id: string; technical_owner_id: string; security_owner_id: string | null; project_id: string | null; service_id: string | null; asset_id: string | null }>('SELECT id,key,title,criticality,organization_id,department_id,business_owner_id,technical_owner_id,security_owner_id,project_id,service_id,asset_id FROM threat_models WHERE id=$1', [modelId]);
    const model = modelResult.rows[0]; if (!model) throw new Error(`Threat Model ${modelId} does not exist.`);
    const actor = this.eventActor(event); if (!actor) throw new Error('No system actor is available for Threat Model lifecycle automation.');
    const workflow = db.data.workflows.find((candidate) => candidate.id === 'wf-secops-default') || db.data.workflows[0];
    const initial = workflow?.states?.find((state) => state.category === 'TO_DO') || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
    const parent = db.data.tickets.find((ticket) => ticket.customFields?.some((field) => field.name === 'threatModelId' && field.value === modelId) && ticket.customFields?.some((field) => field.name === 'source' && ['THREAT_MODEL_SCREENING', 'THREAT_MODEL_CHANGE_SCREENING'].includes(String(field.value))));
    const ownerFor = (kind: string) => ['ARCHITECTURE_REVIEW', 'THREAT_MODEL_WORKSHOP'].includes(kind) ? model.technical_owner_id : model.security_owner_id || db.data.users.find((user) => user.roles.includes('APPSEC_ANALYST'))?.id || actor.id;
    const titleFor: Record<string, string> = {
      ARCHITECTURE_REVIEW: 'Architecture Review', THREAT_MODEL_WORKSHOP: 'Threat Modeling Workshop', APPSEC_THREAT_MODEL_REVIEW: 'AppSec Threat Model Review', SECURITY_ARCHITECTURE_APPROVAL: 'Security Architecture Approval', HIGH_RISK_SECURITY_TEST: 'High-Risk Security Test', SECURITY_VERIFICATION: 'Security Verification',
    };
    for (const kind of kinds) {
      if (db.data.tickets.some((ticket) => ticket.customFields?.some((field) => field.name === 'threatModelLifecycleKey' && field.value === `${modelId}:${kind}:${String(event.payload.revisionId || '')}:${String(event.payload.controlId || '')}`))) continue;
      const year = new Date().getUTCFullYear(); const sequence = db.data.tickets.reduce((maximum, ticket) => Math.max(maximum, Number(ticket.key.match(new RegExp(`^SEC-${year}-(\\d+)$`))?.[1] || 0)), 0) + 1;
      const ownerId = ownerFor(kind); const severity = model.criticality; const riskSeverity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity) ? severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' : 'MEDIUM'; const deadline = await ThreatModelService.remediationDueDate(model.organization_id, riskSeverity);
      const ticket: Ticket = {
        id: `tick-${uuidv4().slice(0, 8)}`, key: `SEC-${year}-${String(sequence).padStart(4, '0')}`, projectCode: 'SEC', ticketTypeId: kind, ticketTypeName: titleFor[kind] || kind, type: 'SERVICE_REQUEST', category: 'SECURITY_REVIEW', securityDomain: 'APPSEC', title: `${titleFor[kind] || kind}: ${model.key} ${model.title}`,
        description: `${titleFor[kind] || kind} generated from ${model.key}. Complete this governed security step; completion does not bypass Threat Model approval, verification, risk acceptance, or the server release gate.`, statusId: initial.id, statusName: initial.name, statusCategory: initial.category as Ticket['statusCategory'], workflowId: workflow?.id || 'wf-secops-default', workflowVersion: workflow?.version || 1,
        technicalSeverity: severity, businessPriority: severity === 'CRITICAL' ? 'P1_URGENT' : severity === 'HIGH' ? 'P2_HIGH' : 'P3_MEDIUM', businessImpact: severity === 'CRITICAL' ? 'CATASTROPHIC' : severity === 'HIGH' ? 'SIGNIFICANT' : 'MODERATE', urgency: severity === 'CRITICAL' ? 'CRITICAL' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM', inherentRisk: riskSeverity, residualRisk: riskSeverity, riskScore: severity === 'CRITICAL' ? 20 : severity === 'HIGH' ? 12 : 6,
        confidentiality: 'CONFIDENTIAL_SECURITY_ONLY', reporterId: actor.id, requesterId: model.business_owner_id, assigneeId: ownerId, ownerId, securityOwnerId: model.security_owner_id || ownerId, departmentId: model.department_id || actor.departmentId, projectId: model.project_id || undefined, applicationId: model.service_id || undefined, assetId: model.asset_id || undefined, parentTicketId: parent?.id,
        watcherIds: [...new Set([actor.id, model.business_owner_id, model.technical_owner_id, model.security_owner_id].filter(Boolean) as string[])], participantIds: [...new Set([actor.id, ownerId])], customFields: [
          { fieldId: 'source', name: 'source', type: 'TEXT', value: 'THREAT_MODEL' }, { fieldId: 'threatModelId', name: 'threatModelId', type: 'TEXT', value: modelId }, { fieldId: 'threatModelRevisionId', name: 'threatModelRevisionId', type: 'TEXT', value: String(event.payload.revisionId || '') }, { fieldId: 'threatId', name: 'threatId', type: 'TEXT', value: String(event.payload.threatId || '') }, { fieldId: 'controlId', name: 'controlId', type: 'TEXT', value: String(event.payload.controlId || '') }, { fieldId: 'threatModelLifecycleKey', name: 'threatModelLifecycleKey', type: 'TEXT', value: `${modelId}:${kind}:${String(event.payload.revisionId || '')}:${String(event.payload.controlId || '')}` },
        ], acceptanceCriteria: 'Record the result and required evidence in the Threat Model workspace. The release gate remains server-enforced.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dueDate: deadline, remediationDeadline: deadline, slaState: 'SAFE', version: 1, tags: ['THREAT_MODEL', 'LIFECYCLE_TASK', kind, model.key],
      };
      db.data.tickets.unshift(ticket);
      AuditService.log({ actor, action: 'TICKET_CREATED', entityType: 'TICKET', entityId: ticket.id, entityKey: ticket.key, metadata: { source: 'THREAT_MODEL', lifecycleTask: kind, threatModelId: modelId, revisionId: event.payload.revisionId, controlId: event.payload.controlId }, persist: false });
    }
  }

  /** Creates exactly one linked remediation ticket. A completed ticket only moves the control to verification-required. */
  private static async createThreatRemediationTicket(event: OutboxEvent): Promise<void> {
    const controlId = String(event.payload.controlId || event.aggregateId);
    const record = await pgClient.query<{
      control_id: string; control_title: string; control_description: string; required_before_release: boolean; due_date: string | null; implementation_owner_id: string | null;
      threat_id: string; threat_key: string; threat_title: string; inherent_score: number; revision_id: string; threat_model_id: string; model_key: string; organization_id: string; project_id: string | null; service_id: string | null; asset_id: string | null; department_id: string | null;
    }>(`SELECT c.id AS control_id,c.title AS control_title,c.description AS control_description,c.required_before_release,c.due_date,c.implementation_owner_id,t.id AS threat_id,t.key AS threat_key,t.title AS threat_title,t.inherent_score,t.revision_id,r.threat_model_id,tm.key AS model_key,tm.organization_id,tm.project_id,tm.service_id,tm.asset_id,tm.department_id
          FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.id=r.threat_model_id WHERE c.id=$1`, [controlId]);
    const control = record.rows[0];
    if (!control) throw new Error(`Threat control ${controlId} does not exist.`);
    const alreadyLinked = await pgClient.query<{ implementation_ticket_id: string | null }>('SELECT implementation_ticket_id FROM threat_controls WHERE id=$1', [controlId]);
    if (alreadyLinked.rows[0]?.implementation_ticket_id) return;
    const actor = db.data.users.find((user) => user.id === String(event.payload.createdBy || '')) || db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
    if (!actor) throw new Error('No system actor is available for Threat Model remediation automation.');
    const workflow = db.data.workflows.find((candidate) => candidate.id === 'wf-secops-default') || db.data.workflows[0];
    const initial = workflow?.states?.find((state) => state.category === 'TO_DO') || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
    const year = new Date().getUTCFullYear();
    const max = db.data.tickets.reduce((current, ticket) => Math.max(current, Number(ticket.key.match(new RegExp(`^SEC-${year}-(\\d+)$`))?.[1] || 0)), 0);
    const severity = control.inherent_score >= 16 ? 'CRITICAL' : control.inherent_score >= 10 ? 'HIGH' : control.inherent_score >= 5 ? 'MEDIUM' : 'LOW';
    const policyDueDate = await ThreatModelService.remediationDueDate(control.organization_id, severity);
    const ticket: Ticket = {
      id: `tick-${uuidv4().slice(0, 8)}`, key: `SEC-${year}-${String(max + 1).padStart(4, '0')}`, projectCode: 'SEC', ticketTypeId: 'SECURITY_REMEDIATION', ticketTypeName: 'Security Remediation', type: 'SECURITY_REMEDIATION' as any,
      category: 'SECURITY_REVIEW', securityDomain: 'APPSEC', title: `${control.threat_key}: ${control.control_title}`, description: `${control.control_description}\n\nSource Threat: ${control.threat_key} — ${control.threat_title}\nAcceptance criteria: implement the control, attach implementation evidence, and obtain independent AppSec verification.`,
      statusId: initial.id, statusName: initial.name, statusCategory: initial.category as Ticket['statusCategory'], workflowId: workflow?.id || 'wf-secops-default', workflowVersion: workflow?.version || 1,
      technicalSeverity: severity, businessPriority: severity === 'CRITICAL' ? 'P1_URGENT' : severity === 'HIGH' ? 'P2_HIGH' : 'P3_MEDIUM', businessImpact: severity === 'CRITICAL' ? 'CATASTROPHIC' : severity === 'HIGH' ? 'SIGNIFICANT' : 'MODERATE', urgency: severity === 'CRITICAL' ? 'CRITICAL' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM', inherentRisk: severity, residualRisk: severity, riskScore: control.inherent_score * 4,
      confidentiality: 'CONFIDENTIAL_SECURITY_ONLY', reporterId: actor.id, requesterId: actor.id, assigneeId: control.implementation_owner_id || undefined, ownerId: control.implementation_owner_id || actor.id, securityOwnerId: actor.id, departmentId: control.department_id || actor.departmentId, applicationId: control.service_id || undefined, assetId: control.asset_id || undefined,
      watcherIds: [actor.id], participantIds: [actor.id, ...(control.implementation_owner_id ? [control.implementation_owner_id] : [])], customFields: [
        { fieldId: 'source', name: 'source', type: 'TEXT', value: 'THREAT_MODEL' }, { fieldId: 'threatModelId', name: 'threatModelId', type: 'TEXT', value: control.threat_model_id }, { fieldId: 'threatModelRevisionId', name: 'threatModelRevisionId', type: 'TEXT', value: control.revision_id }, { fieldId: 'threatId', name: 'threatId', type: 'TEXT', value: control.threat_id }, { fieldId: 'controlId', name: 'controlId', type: 'TEXT', value: control.control_id }, { fieldId: 'securityVerificationRequired', name: 'securityVerificationRequired', type: 'BOOLEAN', value: true },
      ], acceptanceCriteria: 'Implementation evidence attached; independent AppSec verification passes; no release until the control is VERIFIED.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dueDate: control.due_date || policyDueDate, remediationDeadline: control.due_date || policyDueDate, slaState: 'SAFE', version: 1, tags: ['THREAT_MODEL', control.model_key, control.threat_key, control.required_before_release ? 'RELEASE_BLOCKING' : 'NON_BLOCKING'],
    };
    db.data.tickets.unshift(ticket);
    // The control FK is enforced by PostgreSQL. Persist the real ticket projection
    // before linking it so the outbox consumer cannot create a dangling reference.
    await db.persistAsync();
    await pgClient.query(`UPDATE threat_controls SET implementation_ticket_id=$1,status='PLANNED',updated_at=NOW() WHERE id=$2 AND implementation_ticket_id IS NULL`, [ticket.id, controlId]);
    AuditService.log({ actor, action: 'TICKET_CREATED', entityType: 'TICKET', entityId: ticket.id, entityKey: ticket.key, metadata: { source: 'THREAT_MODEL', threatModelId: control.threat_model_id, threatId: control.threat_id, controlId }, persist: false });
  }

  private static async notifyThreatModelEvent(event: OutboxEvent, title: string, message: string, escalate = false): Promise<void> {
    const modelId = String(event.payload.threatModelId || event.aggregateId);
    const result = await pgClient.query<{ business_owner_id: string; technical_owner_id: string; security_owner_id: string | null }>('SELECT business_owner_id,technical_owner_id,security_owner_id FROM threat_models WHERE id=$1', [modelId]);
    const model = result.rows[0];
    if (!model) return;
    const recipients = new Set([model.business_owner_id, model.technical_owner_id, model.security_owner_id].filter(Boolean) as string[]);
    for (const user of db.data.users) {
      if (user.roles.includes('APPSEC_ANALYST') || user.roles.includes('INFOSEC_MANAGER') || (escalate && user.roles.includes('CISO'))) recipients.add(user.id);
    }
    for (const userId of recipients) {
      NotificationService.create({ id: `notif-${event.id}-${userId}`, userId, title, message, type: 'ALERT', severity: escalate ? 'CRITICAL' : 'HIGH', actionUrl: '/security-governance/threat-modeling' }, false);
    }
  }

  /** A failed independent verification is a release blocker and reopens the real remediation work item. */
  private static async reopenFailedThreatControl(event: OutboxEvent): Promise<void> {
    const controlId = String(event.payload.controlId || event.aggregateId);
    const result = await pgClient.query<{ implementation_ticket_id: string | null; threat_model_id: string }>(`SELECT c.implementation_ticket_id,r.threat_model_id FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE c.id=$1`, [controlId]);
    const control = result.rows[0];
    if (!control) return;
    const actor = this.eventActor(event);
    const ticket = control.implementation_ticket_id ? db.data.tickets.find((candidate) => candidate.id === control.implementation_ticket_id) : undefined;
    if (ticket && ticket.statusCategory !== 'TO_DO') {
      ticket.statusId = 'REOPENED'; ticket.statusName = 'Reopened after failed AppSec verification'; ticket.statusCategory = 'TO_DO'; ticket.resolvedAt = undefined; ticket.updatedAt = new Date().toISOString(); ticket.version += 1;
      if (actor) AuditService.log({ actor, action: 'STATUS_TRANSITIONED', entityType: 'TICKET', entityId: ticket.id, entityKey: ticket.key, metadata: { source: 'THREAT_MODEL_VERIFICATION_FAILED', controlId }, persist: false });
    }
    await this.notifyThreatModelEvent(event, 'Control verification failed', 'Independent security verification failed; remediation has been reopened and the release remains blocked.', true);
  }

  private static async scanAttachment(event: OutboxEvent): Promise<void> {
    const attachmentId = String(event.payload.attachmentId || event.aggregateId);
    const attachment = db.data.attachments.find((candidate) => candidate.id === attachmentId);
    const actor = db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
    if (!attachment || !actor) throw new Error(`Attachment scan event ${event.id} cannot resolve its attachment or system actor.`);
    if (attachment.virusScanStatus === 'CLEAN' || attachment.virusScanStatus === 'QUARANTINED') return;
    if (!attachment.quarantineStorageKey) throw new Error(`Attachment ${attachment.id} has no quarantine storage key.`);

    const { buffer } = await storageService.getFileBuffer(attachment.quarantineStorageKey);
    const result = await MalwareScanService.scan(buffer);
    if (result.status === 'UNAVAILABLE') {
      throw new RetryableWorkerError(`Attachment scanner unavailable: ${result.error}`);
    }
    if (result.status === 'INFECTED') {
      attachment.virusScanStatus = 'QUARANTINED';
      AuditService.log({
        actor,
        action: 'ATTACHMENT_UPLOADED',
        entityType: 'ATTACHMENT',
        entityId: attachment.id,
        metadata: { scanStatus: 'QUARANTINED', scanner: result.engine, signature: result.signature },
        persist: false,
      });
      return;
    }

    const finalStorageKey = attachment.quarantineStorageKey.replace(/^quarantine\//, '');
    await storageService.promoteQuarantinedObject(attachment.quarantineStorageKey, finalStorageKey);
    attachment.storageKey = finalStorageKey;
    attachment.quarantineStorageKey = undefined;
    attachment.virusScanStatus = 'CLEAN';
    AuditService.log({
      actor,
      action: 'ATTACHMENT_UPLOADED',
      entityType: 'ATTACHMENT',
      entityId: attachment.id,
      metadata: { scanStatus: 'CLEAN', scanner: result.engine, sha256Checksum: attachment.sha256Checksum },
      persist: false,
    });
  }

  private static async analyzeTicket(event: OutboxEvent): Promise<void> {
    const ticketId = String(event.payload.ticketId || event.aggregateId);
    const ticket = db.data.tickets.find((candidate) => candidate.id === ticketId);
    const actor = db.data.users.find((user) => user.id === String(event.payload.actorId || '')) || db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
    if (!ticket || !actor) throw new Error(`AI analysis event ${event.id} cannot resolve its ticket or actor.`);
    const recommendation = TicketLifecycleService.analyze(ticket, event.id, false);
    AuditService.log({
      actor,
      action: 'TICKET_UPDATED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      metadata: { lifecycleAction: 'AI_RECOMMENDATION_CREATED', recommendationId: recommendation.id, outboxEventId: event.id },
      persist: false,
    });
  }

  private static async syncLdapDirectory(event: OutboxEvent): Promise<void> {
    const trigger = String(event.payload.trigger || 'SCHEDULED_DAILY_CHECK');
    if (trigger !== 'SCHEDULED_DAILY_CHECK' && trigger !== 'STARTUP_CHECK' && trigger !== 'MANUAL_TRIGGER') {
      throw new Error(`LDAP sync event ${event.id} has an unsupported trigger.`);
    }
    const actorId = typeof event.payload.actorId === 'string' ? event.payload.actorId : undefined;
    const actor = actorId ? db.data.users.find((user) => user.id === actorId) : undefined;
    await LDAPSchedulerService.executeScheduledSync(trigger, actor);
  }
}
