import { v4 as uuidv4 } from 'uuid';

export type OutboxEvent = {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  occurredAt: string;
};

/**
 * A per-process staging area. Database.persist() drains this list inside the
 * same PostgreSQL transaction that writes the domain projection. It is not a
 * queue and must never be used as durable state.
 */
export class OutboxService {
  private static pendingEvents = new Map<string, OutboxEvent>();

  public static enqueue(input: Omit<OutboxEvent, 'id' | 'occurredAt'>): OutboxEvent {
    const event: OutboxEvent = {
      id: `out-${uuidv4()}`,
      occurredAt: new Date().toISOString(),
      ...input,
    };
    this.pendingEvents.set(event.id, event);
    return event;
  }

  public static pending(): OutboxEvent[] {
    return [...this.pendingEvents.values()];
  }

  public static checkpoint(): Set<string> {
    return new Set(this.pendingEvents.keys());
  }

  public static rollbackTo(checkpoint: Set<string>): void {
    for (const id of this.pendingEvents.keys()) {
      if (!checkpoint.has(id)) this.pendingEvents.delete(id);
    }
  }

  public static markCommitted(ids: Iterable<string>): void {
    for (const id of ids) this.pendingEvents.delete(id);
  }

  /** Isolated tests must not leak pending events into the next fixture. */
  public static clearForTests(): void {
    this.pendingEvents.clear();
  }
}
