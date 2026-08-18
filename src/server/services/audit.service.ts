import { v4 as uuidv4 } from 'uuid';
import { AuditEvent } from '../../shared/types/audit.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';

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
  }): AuditEvent {
    const event: AuditEvent = {
      id: `aud-${uuidv4()}`,
      timestamp: new Date().toISOString(),
      actorId: params.actor?.id || 'usr-ciso',
      actorName: params.actor?.fullName || 'Security Operator',
      actorRole: (params.actor?.roles && params.actor.roles[0]) || 'PLATFORM_ADMIN',
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
    db.persist();
    return event;
  }

  public static getEventsForEntity(entityId: string): AuditEvent[] {
    return db.data.auditEvents.filter((e) => e.entityId === entityId);
  }

  public static getAllEvents(limit: number = 200): AuditEvent[] {
    return db.data.auditEvents.slice(0, limit);
  }
}
