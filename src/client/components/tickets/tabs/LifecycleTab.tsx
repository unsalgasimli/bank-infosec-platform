import React, { useState } from 'react';
import { Clock3, Link2, ListChecks, Plus, Sparkles, TimerReset, Star, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { TicketLifecycleBundle, TicketRelationshipType, TicketTaskStatus } from '../../../../shared/types/itsm.js';
import { useAuth } from '../../../context/AuthContext.js';

interface LifecycleTabProps {
  ticket: Ticket;
  lifecycle?: TicketLifecycleBundle;
  onRefresh: () => Promise<void> | void;
}

const SLA_COLORS: Record<string, string> = {
  RUNNING: 'text-blue-700 bg-blue-50 border-blue-200',
  AT_RISK: 'text-amber-700 bg-amber-50 border-amber-200',
  PAUSED: 'text-purple-700 bg-purple-50 border-purple-200',
  BREACHED: 'text-rose-700 bg-rose-50 border-rose-200',
  MET: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  CANCELLED: 'text-slate-600 bg-slate-100 border-slate-200',
};

export const LifecycleTab: React.FC<LifecycleTabProps> = ({ ticket, lifecycle, onRefresh }) => {
  const { fetchWithAuth, currentUser } = useAuth();
  const [taskTitle, setTaskTitle] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [relatedTicketId, setRelatedTicketId] = useState('');
  const [relationshipType, setRelationshipType] = useState<TicketRelationshipType>('RELATES_TO');
  const [relationshipNote, setRelationshipNote] = useState('');
  const [satisfactionScore, setSatisfactionScore] = useState(5);
  const [satisfactionComment, setSatisfactionComment] = useState('');
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

  const addRelationship = async () => {
    if (!relatedTicketId.trim()) return;
    const result = await call(`/api/tickets/${ticket.id}/relationships`, 'POST', {
      targetTicketId: relatedTicketId.trim(), type: relationshipType, note: relationshipNote.trim() || undefined,
    });
    if (result) {
      setRelatedTicketId('');
      setRelationshipNote('');
    }
  };

  const submitSatisfaction = async () => {
    const result = await call(`/api/tickets/${ticket.id}/satisfaction`, 'POST', {
      score: satisfactionScore,
      comment: satisfactionComment.trim() || undefined,
    });
    if (result) setSatisfactionComment('');
  };

  const latestRecommendation = lifecycle?.aiRecommendations?.[0];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Independent SLA Timers Card */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs">
        <div className="mb-3.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TimerReset className="h-4 w-4 text-[#0052CC]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Independent SLA Timers</h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Policy clocks pause and complete independently</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(lifecycle?.slaMetrics || []).map((metric) => (
            <div key={metric.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">{metric.metric.replaceAll('_', ' ')}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SLA_COLORS[metric.state] || SLA_COLORS.RUNNING}`}>{metric.state}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{metric.elapsedMinutes}m elapsed</span>
                <span className="font-mono font-semibold text-slate-700">{metric.remainingMinutes}m remaining</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${metric.state === 'BREACHED' ? 'bg-rose-500' : metric.state === 'AT_RISK' ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, Math.max(2, (metric.elapsedMinutes / Math.max(1, metric.targetMinutes)) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Implementation Tasks */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[#0052CC]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Tasks</h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">{(lifecycle?.tasks || []).length} Items</span>
            </div>
            <div className="space-y-2.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
              {(lifecycle?.tasks || []).map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-800">{task.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{task.status.replaceAll('_', ' ')}</div>
                  </div>
                  <select
                    value={task.status}
                    disabled={busy}
                    onChange={(event) => updateTask(task.id, event.target.value as TicketTaskStatus)}
                    className="jira-input py-1 text-xs max-w-32 bg-slate-50 font-medium"
                  >
                    {['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
              ))}
              {(lifecycle?.tasks || []).length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No implementation tasks created yet.</p>}
            </div>
          </div>

          <div className="mt-4 flex gap-2 border-t border-slate-200 pt-3">
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add new task title..." className="jira-input flex-1 bg-white" />
            <button onClick={addTask} disabled={busy || !taskTitle.trim()} className="jira-btn-primary shrink-0"><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
        </section>

        {/* Worklog */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[#0052CC]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Worklog</h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">{(lifecycle?.worklogs || []).length} Entries</span>
            </div>
            <div className="max-h-52 space-y-2.5 overflow-y-auto custom-scrollbar pr-1">
              {(lifecycle?.worklogs || []).map((worklog) => (
                <div key={worklog.id} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-slate-800 truncate">{worklog.description}</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">{worklog.durationMinutes}m</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">{worklog.activityType.replaceAll('_', ' ')} · {new Date(worklog.startedAt).toLocaleString()}</div>
                </div>
              ))}
              {(lifecycle?.worklogs || []).length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center">No time logged on this ticket yet.</p>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_80px_auto] gap-2 border-t border-slate-200 pt-3">
            <input value={workDescription} onChange={(event) => setWorkDescription(event.target.value)} placeholder="Investigation activity..." className="jira-input bg-white" />
            <input type="number" min={1} max={1440} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="jira-input bg-white text-center font-mono" />
            <button onClick={addWorklog} disabled={busy || !workDescription.trim()} className="jira-btn-primary shrink-0">Log</button>
          </div>
        </section>
      </div>

      {/* Relationships */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs">
        <div className="mb-3.5 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[#0052CC]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Relationships & Links</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(lifecycle?.relationships || []).map((relationship) => (
            <span key={relationship.id} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs flex items-center gap-1.5">
              <strong className="text-blue-700 font-bold">{relationship.type.replaceAll('_', ' ')}</strong> · <span className="font-mono font-semibold">{relationship.relatedTicket?.key || 'Unavailable'}</span> — <span className="text-slate-600 truncate max-w-xs">{relationship.relatedTicket?.title}</span>
            </span>
          ))}
          {(lifecycle?.relationships || []).length === 0 && <p className="text-xs text-slate-400 italic">No related incidents, problems, changes, or duplicates linked.</p>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 md:grid-cols-[1fr_180px_auto]">
          <input value={relatedTicketId} onChange={(event) => setRelatedTicketId(event.target.value)} placeholder="Ticket key or ID (e.g. SEC-2026-0002)" className="jira-input bg-white" />
          <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as TicketRelationshipType)} className="jira-input text-xs bg-white font-medium">
            {['RELATES_TO', 'BLOCKS', 'DUPLICATES', 'CAUSED_BY', 'PARENT_OF', 'PROBLEM_FOR', 'INCIDENT_OF', 'CHANGE_CAUSED', 'SECURITY_CASE_FOR'].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
          </select>
          <button type="button" disabled={busy || !relatedTicketId.trim()} onClick={addRelationship} className="jira-btn-primary disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Link</button>
        </div>
        <input value={relationshipNote} onChange={(event) => setRelationshipNote(event.target.value)} placeholder="Optional relationship note or justification..." className="jira-input mt-2 w-full bg-white" />
      </section>

      {/* Satisfaction Survey */}
      {(currentUser?.id === (ticket.requesterId || ticket.reporterId) || currentUser?.roles.includes('PLATFORM_ADMIN')) && (
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Requester Satisfaction</h3>
          </div>
          {lifecycle?.satisfaction ? (
            <div className="text-xs text-slate-800 bg-white p-3.5 rounded-lg border border-slate-200">
              Submitted score: <strong className="text-amber-600 font-bold">{lifecycle.satisfaction.score}/5</strong>
              {lifecycle.satisfaction.comment && <span className="ml-2 text-slate-600">— {lifecycle.satisfaction.comment}</span>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr_auto]">
              <select value={satisfactionScore} onChange={(event) => setSatisfactionScore(Number(event.target.value))} className="jira-input text-xs bg-white font-medium">
                {[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>⭐ {score} / 5</option>)}
              </select>
              <input value={satisfactionComment} onChange={(event) => setSatisfactionComment(event.target.value)} placeholder="Optional feedback comments..." className="jira-input bg-white" />
              <button type="button" disabled={busy} onClick={submitSatisfaction} className="jira-btn-primary disabled:opacity-50">Submit</button>
            </div>
          )}
        </section>
      )}

      {/* Advisory AI Analysis */}
      <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Advisory AI Analysis</h3>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">Recommendations are evidence-backed and never mutate the ticket without explicit human confirmation.</p>
          </div>
          <button disabled={busy} onClick={() => call(`/api/tickets/${ticket.id}/ai-analysis`, 'POST', {})} className="jira-btn-primary">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Analyze</span>
          </button>
        </div>
        {latestRecommendation && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4 text-xs shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <strong className="text-slate-900 font-bold">{latestRecommendation.summary}</strong>
              <span className="font-mono text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 text-[11px]">{Math.round(latestRecommendation.confidence * 100)}% confidence</span>
            </div>
            <div className="text-[11px] text-slate-600"><strong>Evidence:</strong> {latestRecommendation.evidence.join(' ')}</div>
            {latestRecommendation.riskSignals.length > 0 && <div className="text-[11px] text-rose-700 font-medium"><strong>Risk:</strong> {latestRecommendation.riskSignals.join(' ')}</div>}
            {latestRecommendation.missingFields.length > 0 && <div className="text-[11px] text-amber-700 font-medium"><strong>Missing:</strong> {latestRecommendation.missingFields.join(', ')}</div>}
            {latestRecommendation.status === 'PENDING_REVIEW' && (
              <button
                disabled={busy}
                onClick={() => call(`/api/tickets/${ticket.id}/ai-recommendations/${latestRecommendation.id}/apply`, 'POST', { confirmed: true })}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm and apply recommendation</span>
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

