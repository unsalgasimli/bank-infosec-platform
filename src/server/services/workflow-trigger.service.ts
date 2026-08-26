import { v4 as uuidv4 } from 'uuid';
import type { BankUser } from '../../shared/types/auth.js';
import type { ConditionGroup, TriggerReceipt, TriggerType, WorkflowTriggerDefinition } from '../../shared/types/orchestration.js';
import { db } from '../db/database.js';
import { OrchestrationExpressionService } from './orchestration-expression.service.js';
import { OrchestrationError } from './workflow-orchestration.service.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';

type EventTriggerType = Exclude<TriggerType, 'MANUAL'>;

export class WorkflowTriggerService {
  public static emit(input: {
    idempotencyKey: string;
    triggerType: EventTriggerType;
    eventName: string;
    recordType?: string;
    source: string;
    context: Record<string, unknown>;
  }, actor: BankUser) {
    if (!input.idempotencyKey?.trim()) throw new OrchestrationError('Trigger idempotency key is required.', 400);
    const replay = db.data.triggerReceipts.find((receipt) => receipt.idempotencyKey === input.idempotencyKey && receipt.source === input.source);
    if (replay) return { receipt: replay, replayed: true, instances: replay.launchedWorkflowInstanceIds.map((id) => db.data.workflowInstances.find((instance) => instance.id === id)).filter(Boolean) };
    const now = new Date().toISOString();
    const receipt: TriggerReceipt = {
      id: `trigger-${uuidv4().slice(0, 8)}`,
      idempotencyKey: input.idempotencyKey,
      triggerType: input.triggerType,
      eventName: input.eventName,
      recordType: input.recordType,
      source: input.source,
      context: input.context,
      receivedAt: now,
      launchedWorkflowInstanceIds: [],
    };
    const matches: Array<{ definitionId: string; version: number; trigger: WorkflowTriggerDefinition }> = [];
    for (const version of db.data.workflowVersions.filter((candidate) => candidate.status === 'PUBLISHED')) {
      const definition = db.data.workflowDefinitions.find((candidate) => candidate.id === version.workflowDefinitionId && candidate.lifecycle === 'PUBLISHED');
      if (!definition || definition.latestVersion !== version.version) continue;
      for (const trigger of version.triggers.filter((candidate) => candidate.enabled)) {
        if (this.matches(trigger, input.triggerType, input.eventName, input.recordType, input.context)) matches.push({ definitionId: definition.id, version: version.version, trigger });
      }
    }
    db.transaction(() => {
      db.data.triggerReceipts.push(receipt);
      for (const match of matches) {
        const launched = WorkflowRuntimeService.launch({
          workflowDefinitionId: match.definitionId,
          workflowVersion: match.version,
          context: { ...input.context, requesterId: input.context.requesterId || actor.id },
          actor,
          idempotencyKey: `trigger:${receipt.id}:${match.trigger.id}`,
          triggerType: input.triggerType,
          triggerEventId: receipt.id,
        });
        receipt.launchedWorkflowInstanceIds.push(launched.instance.id);
      }
      receipt.processedAt = new Date().toISOString();
    });
    return { receipt, replayed: false, instances: receipt.launchedWorkflowInstanceIds.map((id) => db.data.workflowInstances.find((instance) => instance.id === id)).filter(Boolean) };
  }

  public static processScheduled(now = new Date(), actor?: BankUser) {
    const systemActor = actor || db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
    if (!systemActor) return [];
    const bucket = now.toISOString().slice(0, 16);
    const due = db.data.workflowVersions.flatMap((version) => version.triggers
      .filter((trigger) => trigger.enabled && trigger.type === 'SCHEDULE' && this.cronMatches(trigger.schedule, now))
      .map((trigger) => ({ version, trigger })));
    const results = [];
    for (const { version, trigger } of due) {
      const eventName = trigger.eventName || trigger.schedule || trigger.dateExpression || 'scheduled';
      results.push(this.emit({ idempotencyKey: `scheduler:${version.id}:${trigger.id}:${bucket}`, triggerType: trigger.type as EventTriggerType, eventName, recordType: trigger.recordType, source: 'workflow-scheduler', context: { summary: `Scheduled ${eventName}`, scheduledAt: now.toISOString(), requesterId: systemActor.id } }, systemActor));
    }
    return results;
  }

  private static matches(trigger: WorkflowTriggerDefinition, type: EventTriggerType, eventName: string, recordType: string | undefined, context: Record<string, unknown>) {
    if (trigger.type !== type) return false;
    if (trigger.eventName && trigger.eventName !== eventName) return false;
    if (trigger.recordType && trigger.recordType !== recordType) return false;
    return !trigger.condition || OrchestrationExpressionService.evaluate(trigger.condition as ConditionGroup, context, {});
  }

  private static cronMatches(schedule: string | undefined, now: Date) {
    if (!schedule) return false;
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const matchesPart = (part: string, value: number) => {
      if (part === '*') return true;
      return part.split(',').some((token) => {
        if (token.includes('-')) {
          const [start, end] = token.split('-').map(Number);
          return value >= start && value <= end;
        }
        if (token.startsWith('*/')) return value % Number(token.slice(2)) === 0;
        return Number(token) === value;
      });
    };
    return matchesPart(parts[0], now.getMinutes()) && matchesPart(parts[1], now.getHours()) && matchesPart(parts[2], now.getDate()) && matchesPart(parts[3], now.getMonth() + 1) && matchesPart(parts[4], now.getDay());
  }
}
