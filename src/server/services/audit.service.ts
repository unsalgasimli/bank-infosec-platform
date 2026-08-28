import { v4 as uuidv4 } from 'uuid';
import { AuditEvent } from '../../shared/types/audit.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { OutboxService } from './outbox.service.js';
import type pg from 'pg';

const sensitiveAuditKeys = /^(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|client[_-]?secret|private[_-]?key|credential|credentials|authorization|secretReference|tlsCaReference)$/i;

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    sensitiveAuditKeys.test(key) ? '[REDACTED]' : sanitizeAuditValue(child),
  ]));
}

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
      ipAddress: params.ipAddress || 'unknown',
      userAgent: params.userAgent || 'unknown',
      correlationId: params.correlationId || `req-${uuidv4().substring(0, 8)}`,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityKey: params.entityKey,
      fieldChanges: sanitizeAuditValue(params.fieldChanges) as AuditEvent['fieldChanges'],
      metadata: sanitizeAuditValue(params.metadata) as Record<string, any> | undefined,
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

  /** Persist an audit event in the caller's PostgreSQL transaction. */
  public static async logPostgres(client: pg.PoolClient, params: {
    actor: BankUser;
    action: AuditEvent['action'];
    entityType: AuditEvent['entityType'];
    entityId: string;
    correlationId?: string;
    ipAddress?: string;
    userAgent?: string;
    before?: unknown;
    after?: unknown;
    fieldChanges?: AuditEvent['fieldChanges'];
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = `aud-${uuidv4()}`;
    const before = sanitizeAuditValue(params.before);
    const after = sanitizeAuditValue(params.after);
    const changes = sanitizeAuditValue(params.fieldChanges);
    const sourcePayload = sanitizeAuditValue(params.metadata);
    await client.query(`
      INSERT INTO audit_events(
        id,event_type,action,actor_id,actor_name,actor_role,ip_address,user_agent,
        correlation_id,entity_type,entity_id,before_state,after_state,changes,
        timestamp,source_payload
      ) VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,NOW(),$14::jsonb)`, [
      id,
      params.action,
      params.actor.id,
      params.actor.fullName,
      params.actor.roles[0] || null,
      params.ipAddress || null,
      params.userAgent || null,
      params.correlationId || null,
      params.entityType,
      params.entityId,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      changes === undefined ? null : JSON.stringify(changes),
      sourcePayload === undefined ? null : JSON.stringify(sourcePayload),
    ]);
    return id;
  }

  public static sanitize(value: unknown): unknown {
    return sanitizeAuditValue(value);
  }

  public static getEventsForEntity(entityId: string): AuditEvent[] {
    return (db.data.auditEvents || []).filter((e) => e.entityId === entityId);
  }

  public static getAllEvents(limit: number = 200): AuditEvent[] {
    return db.data.auditEvents.slice(0, limit);
  }
}
