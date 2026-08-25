import type { BusinessCalendar, ConditionClause, ConditionGroup, WorkflowInstance } from '../../shared/types/orchestration.js';

export class OrchestrationExpressionService {
  public static getPath(source: unknown, path?: string): unknown {
    if (!path) return source;
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current == null || typeof current !== 'object') return undefined;
      if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
      return (current as Record<string, unknown>)[segment];
    }, source);
  }

  public static resolveOperand(
    operand: ConditionClause['left'] | ConditionClause['right'] | undefined,
    context: Record<string, unknown>,
    nodeOutputs: Record<string, Record<string, unknown>> = {}
  ): unknown {
    if (!operand) return undefined;
    if (operand.source === 'LITERAL') return operand.value;
    if (operand.source === 'NODE_OUTPUT') return this.getPath(nodeOutputs[operand.nodeId || ''], operand.path);
    return this.getPath(context, operand.path);
  }

  public static evaluateClause(
    clause: ConditionClause,
    context: Record<string, unknown>,
    nodeOutputs: Record<string, Record<string, unknown>> = {}
  ): boolean {
    const left = this.resolveOperand(clause.left, context, nodeOutputs);
    const right = this.resolveOperand(clause.right, context, nodeOutputs);
    switch (clause.operator) {
      case 'EQUALS': return left === right;
      case 'NOT_EQUALS': return left !== right;
      case 'EXISTS': return left !== undefined && left !== null && left !== '';
      case 'IN': return Array.isArray(right) && right.includes(left);
      case 'NOT_IN': return Array.isArray(right) && !right.includes(left);
      case 'CONTAINS': return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
      case 'NOT_CONTAINS': return Array.isArray(left) ? !left.includes(right) : !String(left ?? '').includes(String(right ?? ''));
      case 'GREATER_THAN': return Number(left) > Number(right);
      case 'GREATER_THAN_OR_EQUAL': return Number(left) >= Number(right);
      case 'LESS_THAN': return Number(left) < Number(right);
      case 'LESS_THAN_OR_EQUAL': return Number(left) <= Number(right);
      case 'NOT_EXISTS': return left === undefined || left === null || left === '';
      case 'IS_TRUE': return left === true;
      case 'IS_FALSE': return left === false;
      default: return false;
    }
  }

  public static evaluate(
    group: ConditionGroup | undefined,
    context: Record<string, unknown>,
    nodeOutputs: Record<string, Record<string, unknown>> = {}
  ): boolean {
    if (!group) return true;
    const values = group.clauses.map((clause) => 'clauses' in clause
      ? this.evaluate(clause, context, nodeOutputs)
      : this.evaluateClause(clause, context, nodeOutputs));
    return group.combinator === 'ALL' ? values.every(Boolean) : values.some(Boolean);
  }

  public static mapInputs(
    mapping: Record<string, string> | undefined,
    instance: Pick<WorkflowInstance, 'context' | 'nodeOutputs' | 'id' | 'key'>
  ): Record<string, unknown> {
    if (!mapping) return {};
    return Object.fromEntries(Object.entries(mapping).map(([target, source]) => {
      if (source === '{{instance.id}}') return [target, instance.id];
      if (source === '{{instance.key}}') return [target, instance.key];
      if (source.startsWith('nodeOutputs.')) return [target, this.getPath(instance.nodeOutputs, source.slice('nodeOutputs.'.length))];
      return [target, this.getPath(instance.context, source)];
    }));
  }
}

export class BusinessCalendarService {
  private static zonedParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
    return { weekday, date: `${value('year')}-${value('month')}-${value('day')}`, minutes: Number(value('hour')) * 60 + Number(value('minute')) };
  }

  private static minuteOfDay(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  public static isBusinessMinute(date: Date, calendar: BusinessCalendar): boolean {
    if (calendar.is24x7) return true;
    const parts = this.zonedParts(date, calendar.timezone);
    return calendar.workdays.includes(parts.weekday)
      && !calendar.holidays.includes(parts.date)
      && parts.minutes >= this.minuteOfDay(calendar.businessStart)
      && parts.minutes < this.minuteOfDay(calendar.businessEnd);
  }

  public static addBusinessMinutes(start: Date, minutes: number, calendar: BusinessCalendar): Date {
    if (calendar.is24x7) return new Date(start.getTime() + minutes * 60_000);
    const direction = minutes >= 0 ? 1 : -1;
    let remaining = Math.abs(Math.trunc(minutes));
    const cursor = new Date(start);
    while (remaining > 0) {
      cursor.setTime(cursor.getTime() + direction * 60_000);
      if (this.isBusinessMinute(cursor, calendar)) remaining -= 1;
    }
    return cursor;
  }

  public static addBusinessHours(start: Date, hours: number, calendar: BusinessCalendar): Date {
    return this.addBusinessMinutes(start, Math.round(hours * 60), calendar);
  }

  public static subtractBusinessDays(start: Date, days: number, calendar: BusinessCalendar): Date {
    const dailyMinutes = Math.max(1, this.minuteOfDay(calendar.businessEnd) - this.minuteOfDay(calendar.businessStart));
    return this.addBusinessMinutes(start, -Math.round(days * dailyMinutes), calendar);
  }

  public static nextBusinessDay(start: Date, calendar: BusinessCalendar): Date {
    const cursor = new Date(start);
    for (let index = 0; index < 60 * 24 * 14; index += 1) {
      cursor.setTime(cursor.getTime() + 60_000);
      if (this.isBusinessMinute(cursor, calendar)) return cursor;
    }
    throw new Error(`No business time found within two weeks for calendar ${calendar.id}.`);
  }
}
