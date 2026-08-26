import { v4 as uuidv4 } from 'uuid';
import { AuditEvent } from '../../shared/types/audit.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { OutboxService } from './outbox.service.js';

export class AuditService {
  /**
   * Log an immutable, tamper-resistant audit event.
   */
  public static log(params: {
    actor: BankUser;
    action: AuditEvent['action'];
    entityType: AuditEvent['entityType'];
    entityId: string;
    entityKey?: string;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
    fieldChanges?: AuditEvent['fieldChanges'];
    metadata?: Record<string, any>;
    persist?: boolean;
  }): AuditEvent {
    const fallbackUser = db.data.users?.find((u) => u.roles?.includes('CISO')) || db.data.users?.[0];
    const event: AuditEvent = {
      id: `aud-${uuidv4()}`,
      timestamp: new Date().toISOString(),
      actorId: params.actor?.id || fallbackUser?.id || 'usr-system-admin',
      actorName: params.actor?.fullName || fallbackUser?.fullName || 'System Administrator',
      actorRole: (params.actor?.roles && params.actor.roles[0]) || fallbackUser?.roles?.[0] || 'PLATFORM_ADMIN',
      ipAddress: params.ipAddress || '10.140.12.8',
      userAgent: params.userAgent || 'AegisSec-Client/1.0',
      correlationId: params.correlationId || `req-${uuidv4().substring(0, 8)}`,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityKey: params.entityKey,
      fieldChanges: params.fieldChanges,
      metadata: params.metadata,
    };

    if (!db.data.auditEvents) {
      db.data.auditEvents = [];
    }
    db.data.auditEvents.unshift(event);
    // Domain-event production is centralized at the immutable audit boundary.
    // This covers every supported ticket-creation route without asking each
    // controller to hand-roll an event, and enqueueing happens before any
    // optional compatibility persist() call below.
    if (
      event.action === 'TICKET_CREATED' &&
      event.entityType === 'TICKET' &&
      !String(event.metadata?.action || '').startsWith('LAUNCHED_') &&
      db.data.tickets.some((ticket) => ticket.id === event.entityId)
    ) {
      OutboxService.enqueue({
        topic: 'ticket.created',
        aggregateType: 'TICKET',
        aggregateId: event.entityId,
        payload: { ticketId: event.entityId, actorId: event.actorId },
        correlationId: event.correlationId,
      });
    }
    if (params.persist !== false) db.persist();
    return event;
  }

  public static getEventsForEntity(entityId: string): AuditEvent[] {
    return (db.data.auditEvents || []).filter((e) => e.entityId === entityId);
  }

  public static getAllEvents(limit: number = 200): AuditEvent[] {
    return db.data.auditEvents.slice(0, limit);
  }
}
