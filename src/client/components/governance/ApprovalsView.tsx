import React, { useState } from 'react';
import { TicketApprovalChain, ApprovalStep } from '../../../shared/types/approval.js';
import {
  FileSignature,
  CheckCircle2,
  Clock,
  ArrowRight,
  XCircle,
  ShieldCheck,
  UserCheck,
  Check,
  X,
  Lock,
  FileText,
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  UserRound,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

type ApprovalQueueItem = {
  chain: TicketApprovalChain;
  step: ApprovalStep;
  work?: {
    kind: 'TICKET' | 'WORKFLOW';
    key: string;
    title: string;
    requesterName?: string;
    workflowInstanceId?: string;
    currentStage?: string;
    startedAt?: string;
    dueAt?: string;
  };
};

interface ApprovalsViewProps {
  pendingApprovals: ApprovalQueueItem[];
  onOpenTicket: (ticketId: string) => void;
  onRefresh?: () => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  pendingApprovals,
  onOpenTicket,
  onRefresh,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [actingItem, setActingItem] = useState<ApprovalQueueItem | null>(null);
  const [modalMode, setModalMode] = useState<'VIEW' | 'DECIDE'>('DECIDE');
  const [workflowExecution, setWorkflowExecution] = useState<any>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formatDate = (value?: string) => value
    ? new Intl.DateTimeFormat('az-AZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Müddət təyin edilməyib';

  const openWorkflowReview = async (item: ApprovalQueueItem, mode: 'VIEW' | 'DECIDE') => {
    setActingItem(item);
    setModalMode(mode);
    setWorkflowExecution(null);
    setDecisionNotes('');
    setReviewConfirmed(false);

    if (!item.chain.workflowInstanceId) return;
    try {
      setIsLoadingReview(true);
      const response = await fetchWithAuth(`/api/orchestration/instances/${item.chain.workflowInstanceId}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setWorkflowExecution(data.execution);
      } else {
        setStatusMessage(data.error || 'İş axınının detalları yüklənmədi.');
      }
    } catch (error) {
      console.error('Workflow review request failed', error);
      setStatusMessage('İş axınının detalları yüklənmədi.');
    } finally {
      setIsLoadingReview(false);
    }
  };

  const closeModal = (force = false) => {
    if (isSubmitting && !force) return;
    setActingItem(null);
    setWorkflowExecution(null);
    setDecisionNotes('');
    setReviewConfirmed(false);
  };

  const handleOpenWork = (item: ApprovalQueueItem) => {
    if (item.chain.workflowInstanceId) {
      void openWorkflowReview(item, 'VIEW');
      return;
    }
    onOpenTicket(item.chain.ticketId);
  };

  const handleDecision = async (chain: TicketApprovalChain, step: ApprovalStep, approved: boolean) => {
    try {
      setIsSubmitting(true);
      setStatusMessage('Submitting cryptographic sign-off and state machine progression...');

      const endpoint = chain.workflowInstanceId
        ? `/api/orchestration/instances/${chain.workflowInstanceId}/approvals/${chain.id}/decision`
        : `/api/approvals/${chain.id}/steps/${step.id}/decision`;
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Workflow approval decisions use the chain id in the URL, but the
          // runtime also needs the exact pending step to authorize and record.
          stepId: step.id,
          decision: approved ? 'APPROVED' : 'REJECTED',
          comments: decisionNotes || (approved ? 'Approved by designated executive authority.' : 'Rejected upon risk review.'),
        }),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (data.success) {
        setStatusMessage(`Təsdiq qərarı qeydə alındı: ${approved ? 'təsdiqləndi' : 'rədd edildi'}.`);
        closeModal(true);
        if (onRefresh) onRefresh();
      } else {
        setStatusMessage(data.error || 'Təsdiq qərarı qeydə alına bilmədi.');
      }
    } catch (err) {
      setIsSubmitting(false);
      console.error(err);
      setStatusMessage('Approval submission failed.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-semantic-subtle custom-scrollbar select-none">
      {/* Header Banner */}
      <div className="wrike-card p-6 bg-gradient-to-r from-semantic-panel via-semantic-subtle to-semantic-success-surface/30 border border-semantic-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-semantic-success text-white flex items-center justify-center font-bold shadow-md">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-primary">
              Dual-Control Approvals & Governance Gates
            </h1>
            <p className="text-xs text-semantic-muted mt-0.5">
              Cryptographic 4-eyes authorization gates for high-risk exceptions, production changes, and CAB releases.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono border flex items-center gap-1.5 ${
              pendingApprovals.length > 0
                ? 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border'
                : 'bg-semantic-success-surface text-semantic-success border-semantic-success-border'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{pendingApprovals.length} Pending Authorizations</span>
          </span>
        </div>
      </div>

      {/* Real-time Status Alert */}
      {statusMessage && (
        <div className="p-3.5 bg-semantic-success-surface border border-semantic-success-border text-semantic-success rounded-xl text-xs font-mono flex items-center gap-2 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-semantic-brand shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Approvals List */}
      <div className="space-y-4">
        {pendingApprovals.length === 0 ? (
          <div className="wrike-card p-12 text-center space-y-3 bg-semantic-panel border border-semantic-border shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-semantic-success-surface text-semantic-success flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-semantic-brand" />
            </div>
            <h3 className="text-base font-bold text-semantic-primary">All Approval Queues Clear</h3>
            <p className="text-xs text-semantic-muted max-w-md mx-auto">
              You have zero outstanding governance gates or dual-control authorizations requiring your decision.
            </p>
          </div>
        ) : (
          pendingApprovals.map((item) => {
            const { chain, step, work } = item;
            return (
            <div
              key={`${chain.id}-${step.id}`}
              className="wrike-card p-5 space-y-4 bg-semantic-panel border border-semantic-border hover:border-semantic-success transition-all shadow-xs"
            >
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-border pb-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-semantic-warning-surface text-semantic-warning border border-semantic-warning-border font-mono text-xs font-bold">
                    STEP {step.stepNumber} PENDING
                  </span>
                  <div>
                    <h3 className="font-bold text-sm text-semantic-primary">{chain.title || 'Governance Sign-Off'}</h3>
                    <p className="text-xs text-semantic-muted mt-0.5 font-mono">
                      Gate: <strong>{step.name}</strong> • Required Role:{' '}
                      <span className="text-semantic-info font-bold">[{step.requiredRole || 'EXECUTIVE_APPROVER'}]</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenWork(item)}
                    className="wrike-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    {work?.kind === 'WORKFLOW' ? <ExternalLink className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    <span>{work?.kind === 'WORKFLOW' ? 'Tapşırığa bax' : 'Tapşırığı aç'}</span>
                  </button>

                  <button
                    onClick={() => void openWorkflowReview(item, 'DECIDE')}
                    className="wrike-btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 shadow-sm"
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    <span>Review & Authorize</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-semantic-border bg-semantic-subtle px-3 py-2">
                  <div className="text-label font-bold uppercase tracking-wide text-semantic-muted">Tapşırıq</div>
                  <div className="mt-0.5 truncate text-xs font-bold text-semantic-primary" title={work?.title || chain.title}>{work?.key ? `${work.key} · ` : ''}{work?.title || chain.title}</div>
                </div>
                <div className="rounded-lg border border-semantic-border bg-semantic-subtle px-3 py-2">
                  <div className="flex items-center gap-1 text-label font-bold uppercase tracking-wide text-semantic-muted"><UserRound className="h-3 w-3" /> Tələb edən</div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-semantic-primary">{work?.requesterName || 'Məlumat yoxdur'}</div>
                </div>
                <div className="rounded-lg border border-semantic-border bg-semantic-subtle px-3 py-2">
                  <div className="flex items-center gap-1 text-label font-bold uppercase tracking-wide text-semantic-muted"><CalendarClock className="h-3 w-3" /> Son tarix</div>
                  <div className="mt-0.5 text-xs font-semibold text-semantic-primary">{formatDate(step.deadlineAt || work?.dueAt)}</div>
                </div>
                <div className="rounded-lg border border-semantic-border bg-semantic-subtle px-3 py-2">
                  <div className="flex items-center gap-1 text-label font-bold uppercase tracking-wide text-semantic-muted"><Workflow className="h-3 w-3" /> Nəzarət</div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-semantic-primary">{chain.mode || 'SEQUENTIAL'} · {chain.steps.length} addım</div>
                </div>
              </div>

              {/* Step Sequence Bar */}
              <div className="p-3 rounded-lg bg-semantic-subtle border border-semantic-border flex items-center gap-3 overflow-x-auto text-xs font-mono">
                {chain.steps.map((st, i) => (
                  <React.Fragment key={st.id}>
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                        st.status === 'APPROVED'
                          ? 'bg-semantic-success-surface text-semantic-success border-semantic-success-border font-bold'
                          : st.status === 'PENDING'
                          ? 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border font-bold'
                          : 'bg-semantic-panel text-semantic-muted border-semantic-border'
                      }`}
                    >
                      {st.status === 'APPROVED' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-semantic-brand" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {st.stepNumber}. {st.name} ({st.status})
                      </span>
                    </div>
                    {i < chain.steps.length - 1 && <ArrowRight className="w-4 h-4 text-semantic-placeholder shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Review & Authorize Modal */}
      {actingItem && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="approval-review-title" className="bg-semantic-panel border border-semantic-border-strong rounded-2xl max-w-3xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-semantic-success text-white flex items-center justify-center font-bold">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="approval-review-title" className="text-sm font-bold text-semantic-primary">{modalMode === 'DECIDE' ? 'Təsdiq qərarından əvvəl baxış' : 'Tapşırıq və təsdiq icmalı'}</h3>
                  <p className="text-label text-semantic-muted font-mono">
                    Qərar verən: {currentUser?.fullName} ({currentUser?.roles.join(', ')})
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="text-semantic-muted hover:text-semantic-primary p-1 rounded-lg hover:bg-semantic-neutral-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl border border-semantic-border bg-semantic-subtle p-4 text-xs">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-label font-bold uppercase tracking-wide text-semantic-muted">Təsdiq əhatəsi</div>
                  <div className="mt-1 font-bold text-semantic-primary">{actingItem.chain.title}</div>
                </div>
                <span className="rounded-full border border-semantic-warning-border bg-semantic-warning-surface px-2.5 py-1 font-mono text-label font-bold text-semantic-warning">ADDIM {actingItem.step.stepNumber}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div><span className="text-semantic-muted">Tapşırıq:</span><div className="mt-0.5 font-semibold text-semantic-primary">{actingItem.work?.key || 'İş axını'} · {actingItem.work?.title || actingItem.chain.title}</div></div>
                <div><span className="text-semantic-muted">Tələb edən:</span><div className="mt-0.5 font-semibold text-semantic-primary">{actingItem.work?.requesterName || workflowExecution?.instance?.requesterName || 'Məlumat yoxdur'}</div></div>
                <div><span className="text-semantic-muted">Son tarix:</span><div className="mt-0.5 font-semibold text-semantic-primary">{formatDate(actingItem.step.deadlineAt || actingItem.work?.dueAt)}</div></div>
              </div>
            </div>

            {isLoadingReview ? (
              <div className="flex items-center gap-2 rounded-xl border border-semantic-info-border bg-semantic-info-surface p-3 text-xs text-semantic-info"><Loader2 className="h-4 w-4 animate-spin" /> İş axınının cari məlumatları yüklənir…</div>
            ) : workflowExecution && (
              <div className="rounded-xl border border-semantic-border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><div className="text-label font-bold uppercase tracking-wide text-semantic-muted">Cari vəziyyət</div><div className="mt-0.5 text-xs font-bold text-semantic-primary">{workflowExecution.instance?.key} · {workflowExecution.currentStage?.title || 'Cari mərhələ'}</div></div>
                  <span className="rounded-full bg-semantic-success-surface px-2.5 py-1 text-label font-bold text-semantic-success">{workflowExecution.progress?.completed || 0} / {workflowExecution.progress?.total || 0} tamamlanıb</span>
                </div>
                {workflowExecution.instance?.context && Object.keys(workflowExecution.instance.context).length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(workflowExecution.instance.context).filter(([key]) => !['currentStageId', 'activeNodeIds'].includes(key)).slice(0, 6).map(([key, value]) => (
                      <div key={key} className="rounded-lg bg-semantic-subtle px-3 py-2"><div className="text-label font-bold uppercase tracking-wide text-semantic-muted">{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</div><div className="mt-0.5 truncate text-xs font-semibold text-semantic-primary" title={typeof value === 'object' ? JSON.stringify(value) : String(value)}>{typeof value === 'object' ? JSON.stringify(value) : String(value || '—')}</div></div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {modalMode === 'DECIDE' && <div className="space-y-1.5 text-xs">
              <label className="font-bold text-semantic-primary block">
                Qərarın əsası və uyğunluq qeydləri
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Təsdiq üçün əsaslandırma və ya riskin azaldılması şərtlərini qeyd edin…"
                className="w-full h-24 p-3 bg-semantic-panel border border-semantic-border-strong rounded-xl text-xs text-semantic-primary outline-none focus:border-semantic-brand focus:ring-2 focus:ring-semantic-brand/15 resize-none"
              />
              {actingItem.chain.commentsMandatoryOnReject && <p className="flex items-center gap-1.5 text-label text-semantic-warning"><AlertTriangle className="h-3.5 w-3.5" /> Rədd qərarı üçün qeydin daxil edilməsi məcburidir.</p>}
            </div>}

            {modalMode === 'DECIDE' && <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-semantic-border bg-semantic-subtle p-3 text-xs text-semantic-secondary"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-semantic-border text-semantic-brand focus:ring-semantic-brand" /><span><strong className="text-semantic-primary">Məlumatları nəzərdən keçirdim.</strong> Bu qərarın iş axınının növbəti mərhələsinə təsirini anlayıram.</span></label>}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-semantic-border">
              <button
                disabled={isSubmitting}
                onClick={closeModal}
                className="wrike-btn-secondary text-xs py-2 px-4"
              >
                Cancel
              </button>

              {modalMode === 'VIEW' ? <button onClick={() => setModalMode('DECIDE')} disabled={isLoadingReview} className="wrike-btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-sm"><ClipboardCheck className="w-4 h-4" /><span>Təsdiq qərarına keç</span></button> : <>
              <button
                disabled={isSubmitting || (actingItem.chain.commentsMandatoryOnReject === true && !decisionNotes.trim())}
                onClick={() => handleDecision(actingItem.chain, actingItem.step, false)}
                className="px-4 py-2 rounded-lg bg-semantic-danger-surface text-semantic-danger hover:bg-semantic-danger-surface font-bold text-xs border border-semantic-danger-border transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Rədd et</span>
              </button>

              <button
                disabled={isSubmitting || isLoadingReview || !reviewConfirmed}
                onClick={() => handleDecision(actingItem.chain, actingItem.step, true)}
                className="wrike-btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Təsdiqlə</span>
              </button>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
