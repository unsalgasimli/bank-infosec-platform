import type { BusinessCalendar } from '../../shared/types/orchestration.js';

/** Calendar dates, not elapsed weekdays in the server timezone. Holidays come from the bank calendar. */
export function emergencyDeadline(start: Date, days: number, calendar: BusinessCalendar): string {
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(days) || days < 1 || days > 5) throw new Error('Invalid emergency deadline.');
  if (calendar.is24x7 || !calendar.workdays.length || calendar.workdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Emergency governance requires a valid bank business-day calendar.');
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: calendar.timezone, year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23' });
  const minutes = (parts:Intl.DateTimeFormatPart[]) => Number(parts.find(value=>value.type==='hour')?.value)*60 + Number(parts.find(value=>value.type==='minute')?.value);
  const localMinutes = minutes(formatter.formatToParts(start));
  const cursor = new Date(start);
  let remaining = days;
  // Bound malformed calendars rather than let an invalid holiday configuration hang a worker.
  for (let attempts = 0; attempts < 370; attempts++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    let parts = formatter.formatToParts(cursor);
    // Preserve local wall-clock time across DST; a missing spring-forward time resolves earlier, never later.
    let offset = minutes(parts) - localMinutes;
    if (offset > 720) offset -= 1440;
    if (offset < -720) offset += 1440;
    if (offset) { cursor.setTime(cursor.getTime()-offset*60_000); parts=formatter.formatToParts(cursor); }
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday') || '');
    if (calendar.workdays.includes(weekday) && !calendar.holidays.includes(date) && --remaining === 0) return cursor.toISOString();
  }
  throw new Error('Bank calendar cannot produce an emergency SLA deadline.');
}

export function emergencySlaState(record: { review_due_at?: string | Date; model_update_due_at?: string | Date; reviewed_at?: string | Date; model_updated_at?: string | Date; review_breached_at?: string | Date; model_update_breached_at?: string | Date }, now = new Date()) {
  const late = (due?: string | Date, completed?: string | Date) => Boolean(due && new Date(completed || now).getTime() > new Date(due).getTime());
  return { reviewBreached: Boolean(record.review_breached_at) || late(record.review_due_at, record.reviewed_at), modelUpdateBreached: Boolean(record.model_update_breached_at) || late(record.model_update_due_at, record.model_updated_at) };
}
