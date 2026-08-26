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

const CONSUMER_NAME = 'aegissec-general-worker-v1';

export class WorkerEventService {
  public static async process(event: OutboxEvent): Promise<void> {
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
    } else if (event.topic === 'attachment.scan.requested') {
      await this.scanAttachment(event);
    } else if (event.topic === 'sla.tick') {
      SLAService.refreshAllTicketSLAs();
    } else if (event.topic === 'ai.analysis.requested') {
      await this.analyzeTicket(event);
    } else {
      logger.warn({ eventId: event.id, topic: event.topic }, 'Ignoring unsupported outbox event topic');
    }

    await db.persistAsync();
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
}
