import React, { useState, useEffect } from 'react';
import {
  Clock3,
  Link2,
  ListChecks,
  Plus,
  Sparkles,
  TimerReset,
  Star,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  GitBranch,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  X,
  FileText,
  Tag,
  Check,
  Edit2,
  CornerDownRight,
  Workflow,
} from 'lucide-react';
import { Ticket, TicketCategory, TechnicalSeverity } from '../../../../shared/types/ticket.js';
import { TicketLifecycleBundle, TicketRelationshipType, TicketTaskStatus, TicketUrgency } from '../../../../shared/types/itsm.js';
import { useAuth } from '../../../context/AuthContext.js';
import { Badge } from '../../common/Badge.js';
import { SelectField } from '../TicketCreateModal.js';

interface LifecycleTabProps {
  ticket: Ticket;
  lifecycle?: TicketLifecycleBundle;
  onRefresh: () => Promise<void> | void;
  onNavigateToTicket?: (ticketId: string) => void;
}

const SLA_COLORS: Record<string, string> = {
  RUNNING: 'text-blue-700 bg-blue-50 border-blue-200',
  AT_RISK: 'text-amber-700 bg-amber-50 border-amber-200',
  PAUSED: 'text-purple-700 bg-purple-50 border-purple-200',
  BREACHED: 'text-rose-700 bg-rose-50 border-rose-200',
  MET: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  CANCELLED: 'text-slate-600 bg-slate-100 border-slate-200',
};

const getStatusBadge = (statusCategory?: string, statusName?: string) => {
  switch (statusCategory) {
    case 'DONE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'IN_PROGRESS':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CANCELLED':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const LifecycleTab: React.FC<LifecycleTabProps> = ({
  ticket,
  lifecycle,
  onRefresh,
  onNavigateToTicket,
}) => {
  const { fetchWithAuth, currentUser, allUsers } = useAuth();

  // Task state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskUpdateNote, setTaskUpdateNote] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskNoteInput, setTaskNoteInput] = useState('');

  // Sub-ticket modal/inline state
  const [isCreatingSubTicket, setIsCreatingSubTicket] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [subDescription, setSubDescription] = useState('');
  const [subDepartmentId, setSubDepartmentId] = useState('');
  const [subAssigneeId, setSubAssigneeId] = useState('');
  const [subCategory, setSubCategory] = useState<TicketCategory>('GENERAL_TASK');
  const [subSeverity, setSubSeverity] = useState<TechnicalSeverity>('MEDIUM');
  const [subIntake, setSubIntake] = useState<{
    directory: { ready: boolean; message?: string };
    departments: Array<{ id: string; name: string; code: string }>;
    teams: Array<{ id: string; departmentId: string; name: string; code: string }>;
    assignees: Array<{ id: string; fullName: string; title: string; departmentId: string; sectionId?: string; sectionName?: string; sectionCode?: string; teamIds: string[] }>;
    categories: Array<{ code: TicketCategory; label: string; description?: string }>;
  } | null>(null);
  const [loadingSubIntake, setLoadingSubIntake] = useState(false);
  const [loadingSubAssignees, setLoadingSubAssignees] = useState(false);

  // Worklog state
  const [workDescription, setWorkDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);

  // Relationship state
  const [relatedTicketId, setRelatedTicketId] = useState('');
  const [relationshipType, setRelationshipType] = useState<TicketRelationshipType>('RELATES_TO');
  const [relationshipNote, setRelationshipNote] = useState('');

  // Satisfaction state
  const [satisfactionScore, setSatisfactionScore] = useState(5);
  const [satisfactionComment, setSatisfactionComment] = useState('');

  const [busy, setBusy] = useState(false);
  const [aiQueued, setAiQueued] = useState(false);
  const [submittingSubTicket, setSubmittingSubTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the same server-authenticated routing choices used by the new-ticket modal.
  useEffect(() => {
    if (!isCreatingSubTicket) return;
    const controller = new AbortController();
    setLoadingSubIntake(true);
    setError(null);
    fetchWithAuth('/api/tickets/intake-options', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) throw new Error(data?.error || 'Yönləndirmə məlumatları yüklənmədi.');
        return data.intake;
      })
      .then((intake) => { if (!controller.signal.aborted) setSubIntake(intake); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Yönləndirmə məlumatları yüklənmədi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSubIntake(false); });
    return () => controller.abort();
  }, [fetchWithAuth, isCreatingSubTicket]);

  useEffect(() => {
    if (!isCreatingSubTicket || !subDepartmentId) return;
    const controller = new AbortController();
    setLoadingSubAssignees(true);
    fetchWithAuth(`/api/tickets/intake-options?targetId=${encodeURIComponent(subDepartmentId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) throw new Error(data?.error || 'İcraçı siyahısı yüklənmədi.');
        return data.intake;
      })
      .then((intake) => { if (!controller.signal.aborted) setSubIntake(intake); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'İcraçı siyahısı yüklənmədi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSubAssignees(false); });
    return () => controller.abort();
  }, [fetchWithAuth, isCreatingSubTicket, subDepartmentId]);

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
    const result = await call(`/api/tickets/${ticket.id}/tasks`, 'POST', {
      title: taskTitle.trim(),
      description: taskUpdateNote.trim() || undefined,
    });
    if (result) {
      setTaskTitle('');
      setTaskUpdateNote('');
    }
  };

  const updateTaskStatus = (taskId: string, status: TicketTaskStatus) =>
    call(`/api/tickets/${ticket.id}/tasks/${taskId}`, 'PATCH', { status });

  const appendTaskNote = async (taskId: string) => {
    if (!taskNoteInput.trim()) return;
    const result = await call(`/api/tickets/${ticket.id}/tasks/${taskId}`, 'PATCH', {
      updateNote: taskNoteInput.trim(),
    });
    if (result) {
      setEditingTaskId(null);
      setTaskNoteInput('');
    }
  };

  const handleCreateSubTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle.trim()) return;
    setSubmittingSubTicket(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`/api/tickets/${ticket.id}/sub-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: subTitle.trim(),
          description: subDescription.trim() || subTitle.trim(),
          targetDepartmentId: subDepartmentId || undefined,
          assigneeId: subAssigneeId || undefined,
          category: subCategory,
          technicalSeverity: subSeverity,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create sub-ticket.');
      }
      setSubTitle('');
      setSubDescription('');
      setSubDepartmentId('');
      setSubAssigneeId('');
      setIsCreatingSubTicket(false);
      await onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create sub-ticket.');
    } finally {
      setSubmittingSubTicket(false);
    }
  };

  const closeSubTicketForm = () => {
    setIsCreatingSubTicket(false);
    setSubTitle('');
    setSubDescription('');
    setSubDepartmentId('');
    setSubAssigneeId('');
    setSubIntake(null);
    setError(null);
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

  const addRelationship = async () => {
    if (!relatedTicketId.trim()) return;
    const result = await call(`/api/tickets/${ticket.id}/relationships`, 'POST', {
      targetTicketId: relatedTicketId.trim(),
      type: relationshipType,
      note: relationshipNote.trim() || undefined,
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
  const subTickets = lifecycle?.subTickets || [];
  const parentTicket = lifecycle?.parentTicket;
  const subTargetOptions = [
    ...(subIntake?.departments || []).map((unit) => ({ value: unit.id, label: unit.name, sublabel: `Departament · ${unit.code}` })),
    ...(subIntake?.teams || []).map((unit) => ({ value: unit.id, label: unit.name, sublabel: `Komanda · ${unit.code}` })),
  ].sort((left, right) => left.label.localeCompare(right.label, 'az'));
  const subAssigneeOptions = (subIntake?.assignees || []).map((person) => ({
    value: person.id,
    label: person.fullName,
    sublabel: [person.sectionName, person.title].filter(Boolean).join(' / '),
  }));

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Independent SLA Timers Card */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs">
        <div className="mb-3.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TimerReset className="h-4 w-4 text-semantic-jira-brand" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Müstəqil SLA Taymerləri (Independent SLA Clocks)
            </h3>
          </div>
          <span className="text-label text-slate-500 font-medium">
            Siyasət saatları müstəqil olaraq dayanır və tamamlanır
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(lifecycle?.slaMetrics || []).map((metric) => (
            <div key={metric.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">{metric.metric.replaceAll('_', ' ')}</span>
                <span className={`rounded-full border px-2 py-0.5 text-caption font-bold ${SLA_COLORS[metric.state] || SLA_COLORS.RUNNING}`}>
                  {metric.state}
                </span>
              </div>
              <div className="flex items-center justify-between text-label text-slate-500">
                <span>{metric.elapsedMinutes}m elapsed</span>
                <span className="font-mono font-semibold text-slate-700">{metric.remainingMinutes}m remaining</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    metric.state === 'BREACHED'
                      ? 'bg-rose-500'
                      : metric.state === 'AT_RISK'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(2, (metric.elapsedMinutes / Math.max(1, metric.targetMinutes)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Sub-Tickets & Delegation Chain (A -> B -> C) */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-semantic-success" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Alt Müraciətlər və Asılı Ticketlər (Sub-Tickets / Delegated Flow)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => isCreatingSubTicket ? closeSubTicketForm() : setIsCreatingSubTicket(true)}
            className="wrike-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-xs"
          >
            {isCreatingSubTicket ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isCreatingSubTicket ? 'Bağla' : '+ Alt Ticket Yarat'}</span>
          </button>
        </div>

        {/* Parent Ticket Banner if this is a sub-ticket */}
        {parentTicket && (
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <CornerDownRight className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold text-blue-950 block">Əsas Müraciət (Parent Ticket):</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono font-bold text-blue-700">{parentTicket.key}</span>
                  <span className="text-slate-700 truncate font-medium">{parentTicket.title}</span>
                </div>
              </div>
            </div>
            {onNavigateToTicket && (
              <button
                type="button"
                onClick={() => onNavigateToTicket(parentTicket.id)}
                className="px-2.5 py-1 bg-white hover:bg-blue-100 text-blue-700 font-bold border border-blue-300 rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-2xs"
              >
                <span>Əsas ticketə bax</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Inline Sub-Ticket Creation Form */}
        {isCreatingSubTicket && (
          <form onSubmit={handleCreateSubTicket} className="rounded-2xl border border-semantic-border-strong bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-semantic-border pb-3">
              <span className="flex items-center gap-2 text-sm font-bold text-semantic-primary">
                <Workflow className="h-4 w-4 text-semantic-success" /> Bu ticket daxilindən başqa şəxsə / departamentə alt ticket aç
              </span>
              <span className="hidden text-xs text-semantic-muted sm:block">A-B-C zəncirvari görünüşü təmin edilir</span>
            </div>

            {subIntake && !subIntake.directory.ready && (
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span><strong>Canlı AD sinxronizasiyası tələb olunur.</strong> {subIntake.directory.message}</span>
              </div>
            )}

            {loadingSubIntake ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-semantic-muted"><Loader2 className="h-4 w-4 animate-spin text-semantic-brand" /> Yönləndirmə məlumatları yüklənir…</div>
            ) : (
              <>
                <div className="mt-5">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-semantic-strong">Alt Tapşırığın Başlığı <span className="text-red-600">*</span></span>
                    <input type="text" required value={subTitle} onChange={(event) => setSubTitle(event.target.value)} placeholder="Məsələn: DB konfiqurasiyasının icrası…" className="h-11 w-full rounded-xl border border-semantic-border-strong px-3 text-sm font-medium outline-none transition placeholder:font-normal placeholder:text-semantic-placeholder focus:border-semantic-brand focus:ring-4 focus:ring-semantic-brand/10" />
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-semantic-strong">Tələb / Görüləcək İşin İzahı</span>
                  <textarea rows={3} value={subDescription} onChange={(event) => setSubDescription(event.target.value)} placeholder="Bu alt tapşırığın məqsədi və icraçıdan gözlənilən nəticə…" className="block min-h-[92px] w-full resize-y rounded-xl border border-semantic-border-strong px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-semantic-placeholder focus:border-semantic-brand focus:ring-4 focus:ring-semantic-brand/10" />
                </label>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Kateqoriya"
                    value={subCategory}
                    onChange={(value) => setSubCategory(value as TicketCategory)}
                    searchable
                    searchPlaceholder="Kateqoriya axtarın…"
                    placeholder="Kateqoriya seçin"
                    options={[
                      { value: '', label: 'Kateqoriya seçin' },
                      ...(subIntake?.categories || []).map((category) => ({ value: category.code, label: category.label, sublabel: category.description })),
                    ]}
                  />
                  <SelectField
                    label="Texniki prioritet"
                    value={subSeverity}
                    onChange={(value) => setSubSeverity(value as TechnicalSeverity)}
                    searchable={false}
                    placeholder="Səviyyə seçin"
                    options={[
                      { value: 'INFORMATIONAL', label: 'Məlumat xarakterli' },
                      { value: 'LOW', label: 'Aşağı' },
                      { value: 'MEDIUM', label: 'Orta' },
                      { value: 'HIGH', label: 'Yüksək' },
                      { value: 'CRITICAL', label: 'Kritik' },
                    ]}
                  />
                  <SelectField
                    label="İcraçı Departament / Şöbə"
                    value={subDepartmentId}
                    onChange={(value) => { setSubDepartmentId(value); setSubAssigneeId(''); }}
                    disabled={!subIntake?.directory.ready}
                    searchable
                    searchPlaceholder="Bölmə və ya kod axtarın…"
                    placeholder="Departament / Şöbə seçilməyib"
                    options={[{ value: '', label: 'Departament / Şöbə seçilməyib' }, ...subTargetOptions]}
                    hint={subDepartmentId ? 'Seçilmiş bölmə üzrə aktiv AD icraçıları yüklənəcək.' : undefined}
                  />
                  <SelectField
                    label="İcraçı Şəxs (Mütəxəssis - C)"
                    value={subAssigneeId}
                    onChange={setSubAssigneeId}
                    disabled={!subIntake?.directory.ready || !subDepartmentId || loadingSubAssignees}
                    searchable
                    searchPlaceholder="Ad, vəzifə və ya istifadəçi axtarın…"
                    placeholder={loadingSubAssignees ? 'İcraçılar yüklənir…' : 'Departament növbəsində saxla'}
                    hint={!subDepartmentId ? 'Əvvəlcə icraçı bölməsini seçin.' : loadingSubAssignees ? 'Seçilmiş bölmə üzrə icraçılar yüklənir…' : undefined}
                    options={[{ value: '', label: loadingSubAssignees ? 'İcraçılar yüklənir…' : 'Departament növbəsində saxla' }, ...subAssigneeOptions]}
                  />
                </div>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-semantic-border pt-4">
              <button type="button" onClick={closeSubTicketForm} className="rounded-xl border border-semantic-border-strong px-4 py-2.5 text-sm font-bold text-semantic-strong transition hover:bg-semantic-subtle focus:outline-none focus:ring-4 focus:ring-semantic-brand/10">Ləğv et</button>
              <button type="submit" disabled={submittingSubTicket || loadingSubIntake || !subIntake?.directory.ready || !subTitle.trim()} className="inline-flex items-center gap-2 rounded-xl bg-semantic-success px-4 py-2.5 text-sm font-bold text-white transition hover:bg-semantic-success-hover disabled:cursor-not-allowed disabled:opacity-50">
                {submittingSubTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span>{submittingSubTicket ? 'Yaradılır…' : 'Alt Ticket Yarat və Əlaqələndir'}</span>
              </button>
            </div>
          </form>
        )}

        {/* List of Sub-Tickets */}
        <div className="space-y-2">
          {subTickets.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2 text-center">
              Bu müraciətə bağlı heç bir alt ticket açılmayıb.
            </p>
          ) : (
            subTickets.map((st) => (
              <div
                key={st.id}
                onClick={() => onNavigateToTicket && onNavigateToTicket(st.id)}
                className="flex items-center justify-between gap-3 p-3 bg-white border border-semantic-border hover:border-semantic-brand hover:bg-slate-50/70 rounded-xl transition-all cursor-pointer shadow-2xs group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-semantic-success-surface text-semantic-success flex items-center justify-center font-bold text-xs shrink-0">
                    <GitBranch className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-semantic-jira-brand">{st.key}</span>
                      <span className="font-bold text-xs text-semantic-primary truncate">{st.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-label text-semantic-muted">
                      <span>
                        İcraçı: {allUsers.find((u) => u.id === st.assigneeId)?.fullName || 'Departament növbəsi'}
                      </span>
                      <span>·</span>
                      <span>{new Date(st.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-caption font-bold px-2 py-0.5 rounded border font-mono ${getStatusBadge(st.statusCategory, st.statusName)}`}>
                    {st.statusName}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-semantic-brand transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 3. Implementation Tasks & Progress Updates */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-semantic-jira-brand" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Görülən İşlər və Tapşırıqlar (Tasks & Progress)
                </h3>
              </div>
              <span className="text-label text-slate-500 font-medium">
                {(lifecycle?.tasks || []).length} Items
              </span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {(lifecycle?.tasks || []).map((task) => {
                const isEditingNote = editingTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800">{task.title}</div>
                      </div>
                      <select
                        value={task.status}
                        disabled={busy}
                        onChange={(event) => updateTaskStatus(task.id, event.target.value as TicketTaskStatus)}
                        className="jira-input py-1 text-xs max-w-32 bg-slate-50 font-medium shrink-0"
                      >
                        {['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((status) => (
                          <option key={status} value={status}>
                            {status.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Progress update note content */}
                    {task.description && (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-200 whitespace-pre-line leading-relaxed">
                        {task.description}
                      </div>
                    )}

                    {/* Action to append update note on what was done */}
                    {isEditingNote ? (
                      <div className="pt-1.5 space-y-1.5">
                        <textarea
                          rows={2}
                          value={taskNoteInput}
                          onChange={(e) => setTaskNoteInput(e.target.value)}
                          placeholder="Bu tapşırıq üzrə nə edildi? (Qeyd / Nəticə yazın)..."
                          className="w-full bg-white border border-semantic-border-strong rounded px-2.5 py-1 text-xs outline-none focus:border-semantic-brand resize-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTaskId(null);
                              setTaskNoteInput('');
                            }}
                            className="px-2 py-1 text-label font-semibold text-slate-600 hover:bg-slate-100 rounded"
                          >
                            Ləğv et
                          </button>
                          <button
                            type="button"
                            disabled={busy || !taskNoteInput.trim()}
                            onClick={() => appendTaskNote(task.id)}
                            className="px-2.5 py-1 text-label font-bold bg-semantic-brand text-white rounded hover:bg-semantic-brandHover disabled:opacity-50"
                          >
                            Qeydi Yadda Saxla
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTaskId(task.id);
                          setTaskNoteInput('');
                        }}
                        className="text-label text-semantic-success hover:text-semantic-brand hover:underline font-semibold flex items-center gap-1 pt-0.5"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Görülən iş qeydi / update yaz</span>
                      </button>
                    )}
                  </div>
                );
              })}

              {(lifecycle?.tasks || []).length === 0 && (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  Hələ heç bir icra tapşırığı əlavə edilməyib.
                </p>
              )}
            </div>
          </div>

          {/* Add New Task Form */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Yeni tapşırıq başlığı..."
              className="jira-input w-full bg-white"
            />
            <div className="flex gap-2">
              <input
                value={taskUpdateNote}
                onChange={(event) => setTaskUpdateNote(event.target.value)}
                placeholder="Görülən iş və ya qeyd (istəyə bağlı)..."
                className="jira-input flex-1 bg-white text-xs"
              />
              <button
                onClick={addTask}
                disabled={busy || !taskTitle.trim()}
                className="jira-btn-primary shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Əlavə et
              </button>
            </div>
          </div>
        </section>

        {/* 4. Worklog Section */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-semantic-jira-brand" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  İş Jurnalı (Worklog)
                </h3>
              </div>
              <span className="text-label text-slate-500 font-medium">
                {(lifecycle?.worklogs || []).length} Entries
              </span>
            </div>
            <div className="max-h-64 space-y-2.5 overflow-y-auto custom-scrollbar pr-1">
              {(lifecycle?.worklogs || []).map((worklog) => (
                <div key={worklog.id} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-slate-800 truncate">{worklog.description}</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-label">
                      {worklog.durationMinutes}m
                    </span>
                  </div>
                  <div className="mt-1 text-caption text-slate-400">
                    {worklog.activityType.replaceAll('_', ' ')} · {new Date(worklog.startedAt).toLocaleString()}
                  </div>
                </div>
              ))}
              {(lifecycle?.worklogs || []).length === 0 && (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  Bu tapşırıq üçün hələ vaxt qeyd olunmayıb.
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3 grid grid-cols-[1fr_80px_auto] gap-2">
            <input
              value={workDescription}
              onChange={(event) => setWorkDescription(event.target.value)}
              placeholder="Araşdırma və ya icra fəaliyyəti..."
              className="jira-input bg-white"
            />
            <input
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="jira-input bg-white text-center font-mono"
            />
            <button
              onClick={addWorklog}
              disabled={busy || !workDescription.trim()}
              className="jira-btn-primary shrink-0"
            >
              Qeyd et
            </button>
          </div>
        </section>
      </div>

      {/* 5. Relationships & Cross-links */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs">
        <div className="mb-3.5 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-semantic-jira-brand" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Əlaqələr və Keçidlər (Relationships & Links)
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(lifecycle?.relationships || []).map((relationship) => (
            <span
              key={relationship.id}
              onClick={() => relationship.relatedTicket?.id && onNavigateToTicket && onNavigateToTicket(relationship.relatedTicket.id)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs flex items-center gap-1.5 hover:border-blue-400 cursor-pointer transition-colors"
            >
              <strong className="text-blue-700 font-bold">{relationship.type.replaceAll('_', ' ')}</strong> ·{' '}
              <span className="font-mono font-semibold">{relationship.relatedTicket?.key || 'Unavailable'}</span> —{' '}
              <span className="text-slate-600 truncate max-w-xs">{relationship.relatedTicket?.title}</span>
            </span>
          ))}
          {(lifecycle?.relationships || []).length === 0 && (
            <p className="text-xs text-slate-400 italic">Əlaqəli insident, problem, dəyişiklik və ya dublikat yoxdur.</p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 md:grid-cols-[1fr_180px_auto]">
          <input
            value={relatedTicketId}
            onChange={(event) => setRelatedTicketId(event.target.value)}
            placeholder="Tapşırıq kodu və ya ID-si (məs. SEC-2026-0002)"
            className="jira-input bg-white"
          />
          <select
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value as TicketRelationshipType)}
            className="jira-input text-xs bg-white font-medium"
          >
            {['RELATES_TO', 'BLOCKS', 'DUPLICATES', 'CAUSED_BY', 'PARENT_OF', 'PROBLEM_FOR', 'INCIDENT_OF', 'CHANGE_CAUSED', 'SECURITY_CASE_FOR'].map((type) => (
              <option key={type} value={type}>
                {type.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !relatedTicketId.trim()}
            onClick={addRelationship}
            className="jira-btn-primary disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Əlaqələndir
          </button>
        </div>
        <input
          value={relationshipNote}
          onChange={(event) => setRelationshipNote(event.target.value)}
          placeholder="İstəyə bağlı əlaqə qeydi və ya əsaslandırma..."
          className="jira-input mt-2 w-full bg-white"
        />
      </section>

      {/* 6. Requester Satisfaction */}
      {(currentUser?.id === (ticket.requesterId || ticket.reporterId) || currentUser?.roles.includes('PLATFORM_ADMIN')) && (
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Müraciət Edənin Məmnuniyyəti
            </h3>
          </div>
          {lifecycle?.satisfaction ? (
            <div className="text-xs text-slate-800 bg-white p-3.5 rounded-lg border border-slate-200">
              Qiymətləndirmə: <strong className="text-amber-600 font-bold">{lifecycle.satisfaction.score}/5</strong>
              {lifecycle.satisfaction.comment && (
                <span className="ml-2 text-slate-600">— {lifecycle.satisfaction.comment}</span>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr_auto]">
              <select
                value={satisfactionScore}
                onChange={(event) => setSatisfactionScore(Number(event.target.value))}
                className="jira-input text-xs bg-white font-medium"
              >
                {[5, 4, 3, 2, 1].map((score) => (
                  <option key={score} value={score}>
                    ⭐ {score} / 5
                  </option>
                ))}
              </select>
              <input
                value={satisfactionComment}
                onChange={(event) => setSatisfactionComment(event.target.value)}
                placeholder="Rəy və təklifləriniz..."
                className="jira-input bg-white"
              />
              <button
                type="button"
                disabled={busy}
                onClick={submitSatisfaction}
                className="jira-btn-primary disabled:opacity-50"
              >
                Göndər
              </button>
            </div>
          )}
        </section>
      )}

      {/* 7. Advisory AI Analysis */}
      <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Məsləhətçi AI Analizi</h3>
            </div>
            <p className="mt-1 text-label text-slate-600">
              Süni intellekt tövsiyələri insan təsdiqi olmadan dəyişiklik tətbiq etmir.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => call(`/api/tickets/${ticket.id}/ai-analysis`, 'POST', {}).then((result) => setAiQueued(Boolean(result?.queued)))}
            className="jira-btn-primary"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Analiz et</span>
          </button>
        </div>
        {aiQueued && !latestRecommendation && (
          <p className="mt-3 text-xs text-blue-700">Analiz növbəyə alındı. Nəticə hazır olduqda səhifəni yeniləyin.</p>
        )}
        {latestRecommendation && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4 text-xs shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <strong className="text-slate-900 font-bold">{latestRecommendation.summary}</strong>
              <span className="font-mono text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 text-label">
                {Math.round(latestRecommendation.confidence * 100)}% confidence
              </span>
            </div>
            <div className="text-label text-slate-600">
              <strong>Evidence:</strong> {latestRecommendation.evidence.join(' ')}
            </div>
            {latestRecommendation.riskSignals.length > 0 && (
              <div className="text-label text-rose-700 font-medium">
                <strong>Risk:</strong> {latestRecommendation.riskSignals.join(' ')}
              </div>
            )}
            {latestRecommendation.missingFields.length > 0 && (
              <div className="text-label text-amber-700 font-medium">
                <strong>Missing:</strong> {latestRecommendation.missingFields.join(', ')}
              </div>
            )}
            {latestRecommendation.status === 'PENDING_REVIEW' && (
              <button
                disabled={busy}
                onClick={() =>
                  call(`/api/tickets/${ticket.id}/ai-recommendations/${latestRecommendation.id}/apply`, 'POST', {
                    confirmed: true,
                  })
                }
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tövsiyəni təsdiqlə və tətbiq et</span>
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
