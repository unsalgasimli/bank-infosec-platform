import React, { useState } from 'react';
import { Clock3, Link2, ListChecks, Plus, Sparkles, TimerReset } from 'lucide-react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { TicketLifecycleBundle, TicketTaskStatus } from '../../../../shared/types/itsm.js';
import { useAuth } from '../../../context/AuthContext.js';

interface LifecycleTabProps {
  ticket: Ticket;
  lifecycle?: TicketLifecycleBundle;
  onRefresh: () => Promise<void> | void;
}

const SLA_COLORS: Record<string, string> = {
  RUNNING: 'text-[#0052CC] bg-[#DEEBFF]',
  AT_RISK: 'text-[#974F0C] bg-[#FFFAE6]',
  PAUSED: 'text-[#403294] bg-[#EAE6FF]',
  BREACHED: 'text-[#AE2A19] bg-[#FFEBE6]',
  MET: 'text-[#216E4E] bg-[#E3FCEF]',
  CANCELLED: 'text-[#5E6C84] bg-[#EBECF0]',
};

export const LifecycleTab: React.FC<LifecycleTabProps> = ({ ticket, lifecycle, onRefresh }) => {
  const { fetchWithAuth } = useAuth();
  const [taskTitle, setTaskTitle] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Lifecycle operation failed.');
      await onRefresh();
      return data;
    } catch (cause: any) {
      setError(cause.message || 'Lifecycle operation failed.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    const result = await call(`/api/tickets/${ticket.id}/tasks`, 'POST', { title: taskTitle.trim() });
    if (result) setTaskTitle('');
  };

  const addWorklog = async () => {
    if (!workDescription.trim()) return;
    const result = await call(`/api/tickets/${ticket.id}/worklogs`, 'POST', {
      description: workDescription.trim(),
      durationMinutes,
      activityType: 'INVESTIGATION',
    });
    if (result) setWorkDescription('');
  };

  const updateTask = (taskId: string, status: TicketTaskStatus) =>
    call(`/api/tickets/${ticket.id}/tasks/${taskId}`, 'PATCH', { status });

  const latestRecommendation = lifecycle?.aiRecommendations?.[0];

  return (
    <div className="space-y-5">
      {error && <div className="rounded border border-[#FFBDAD] bg-[#FFEBE6] px-3 py-2 text-xs text-[#AE2A19]">{error}</div>}

      <section className="rounded-md border border-[#DFE1E6] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TimerReset className="h-4 w-4 text-[#0052CC]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">Independent SLA timers</h3>
          </div>
          <span className="text-[10px] text-[#5E6C84]">Policy clocks pause and complete independently</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(lifecycle?.slaMetrics || []).map((metric) => (
            <div key={metric.id} className="rounded border border-[#DFE1E6] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#172B4D]">{metric.metric.replaceAll('_', ' ')}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${SLA_COLORS[metric.state] || SLA_COLORS.RUNNING}`}>{metric.state}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-[#5E6C84]">
                <span>{metric.elapsedMinutes}m elapsed</span>
                <span>{metric.remainingMinutes}m remaining</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[#EBECF0]">
                <div
                  className={metric.state === 'BREACHED' ? 'h-full bg-[#DE350B]' : metric.state === 'AT_RISK' ? 'h-full bg-[#FF8B00]' : 'h-full bg-[#0052CC]'}
                  style={{ width: `${Math.min(100, Math.max(2, (metric.elapsedMinutes / Math.max(1, metric.targetMinutes)) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-md border border-[#DFE1E6] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[#0052CC]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">Tasks</h3>
          </div>
          <div className="space-y-2">
            {(lifecycle?.tasks || []).map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded border border-[#DFE1E6] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-[#172B4D]">{task.title}</div>
                  <div className="text-[10px] text-[#5E6C84]">{task.status.replaceAll('_', ' ')}</div>
                </div>
                <select
                  value={task.status}
                  disabled={busy}
                  onChange={(event) => updateTask(task.id, event.target.value as TicketTaskStatus)}
                  className="rounded border border-[#DFE1E6] bg-white px-2 py-1 text-[10px]"
                >
                  {['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            ))}
            {(lifecycle?.tasks || []).length === 0 && <p className="text-xs text-[#7A869A]">No implementation tasks yet.</p>}
          </div>
          <div className="mt-3 flex gap-2 border-t border-[#DFE1E6] pt-3">
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task title" className="jira-input flex-1" />
            <button onClick={addTask} disabled={busy || !taskTitle.trim()} className="jira-btn-primary"><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
        </section>

        <section className="rounded-md border border-[#DFE1E6] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-[#0052CC]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">Worklog</h3>
          </div>
          <div className="max-h-40 space-y-2 overflow-auto">
            {(lifecycle?.worklogs || []).map((worklog) => (
              <div key={worklog.id} className="rounded border border-[#DFE1E6] px-3 py-2 text-xs">
                <div className="flex justify-between"><span className="font-medium text-[#172B4D]">{worklog.description}</span><span className="font-mono text-[#0052CC]">{worklog.durationMinutes}m</span></div>
                <div className="mt-1 text-[10px] text-[#7A869A]">{worklog.activityType.replaceAll('_', ' ')} · {new Date(worklog.startedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_80px_auto] gap-2 border-t border-[#DFE1E6] pt-3">
            <input value={workDescription} onChange={(event) => setWorkDescription(event.target.value)} placeholder="Investigation activity" className="jira-input" />
            <input type="number" min={1} max={1440} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="jira-input" />
            <button onClick={addWorklog} disabled={busy || !workDescription.trim()} className="jira-btn-primary">Log</button>
          </div>
        </section>
      </div>

      <section className="rounded-md border border-[#DFE1E6] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-[#0052CC]" /><h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">Relationships</h3></div>
        <div className="flex flex-wrap gap-2">
          {(lifecycle?.relationships || []).map((relationship) => (
            <span key={relationship.id} className="rounded border border-[#DFE1E6] bg-[#F4F5F7] px-2.5 py-1.5 text-[11px] text-[#172B4D]">
              <strong>{relationship.type.replaceAll('_', ' ')}</strong> · {relationship.relatedTicket?.key || 'Unavailable'} — {relationship.relatedTicket?.title}
            </span>
          ))}
          {(lifecycle?.relationships || []).length === 0 && <p className="text-xs text-[#7A869A]">No related incidents, problems, changes, or duplicates.</p>}
        </div>
      </section>

      <section className="rounded-md border border-[#B3D4FF] bg-[#F4F9FF] p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#0052CC]" /><h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">Advisory AI analysis</h3></div>
            <p className="mt-1 text-[11px] text-[#5E6C84]">Recommendations are evidence-backed and never mutate the ticket without explicit human confirmation.</p>
          </div>
          <button disabled={busy} onClick={() => call(`/api/tickets/${ticket.id}/ai-analysis`, 'POST', {})} className="jira-btn-primary">Analyze</button>
        </div>
        {latestRecommendation && (
          <div className="mt-3 rounded border border-[#B3D4FF] bg-white p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-[#172B4D]">{latestRecommendation.summary}</strong>
              <span className="font-mono text-[#0052CC]">{Math.round(latestRecommendation.confidence * 100)}% confidence</span>
            </div>
            <div className="mt-2 text-[11px] text-[#5E6C84]">Evidence: {latestRecommendation.evidence.join(' ')}</div>
            {latestRecommendation.riskSignals.length > 0 && <div className="mt-1 text-[11px] text-[#AE2A19]">Risk: {latestRecommendation.riskSignals.join(' ')}</div>}
            {latestRecommendation.missingFields.length > 0 && <div className="mt-1 text-[11px] text-[#974F0C]">Missing: {latestRecommendation.missingFields.join(', ')}</div>}
            {latestRecommendation.status === 'PENDING_REVIEW' && (
              <button
                disabled={busy}
                onClick={() => call(`/api/tickets/${ticket.id}/ai-recommendations/${latestRecommendation.id}/apply`, 'POST', { confirmed: true })}
                className="mt-3 rounded bg-[#E3FCEF] px-3 py-1.5 text-[11px] font-bold text-[#216E4E] hover:bg-[#ABF5D1]"
              >
                Confirm and apply recommendation
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
