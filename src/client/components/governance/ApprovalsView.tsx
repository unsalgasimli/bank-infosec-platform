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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface ApprovalsViewProps {
  pendingApprovals: { chain: TicketApprovalChain; step: ApprovalStep }[];
  onOpenTicket: (ticketId: string) => void;
  onRefresh?: () => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  pendingApprovals,
  onOpenTicket,
  onRefresh,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [actingItem, setActingItem] = useState<{ chain: TicketApprovalChain; step: ApprovalStep } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleDecision = async (chain: TicketApprovalChain, step: ApprovalStep, approved: boolean) => {
    try {
      setIsSubmitting(true);
      setStatusMessage('Submitting cryptographic sign-off and state machine progression...');

      const res = await fetchWithAuth(`/api/approvals/${chain.id}/steps/${step.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: approved ? 'APPROVED' : 'REJECTED',
          comments: decisionNotes || (approved ? 'Approved by designated executive authority.' : 'Rejected upon risk review.'),
        }),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (data.success) {
        setStatusMessage(`Cryptographic sign-off recorded: ${approved ? 'APPROVED' : 'REJECTED'}.`);
        setActingItem(null);
        setDecisionNotes('');
        if (onRefresh) onRefresh();
      } else {
        alert(`Sign-off Failed: ${data.error || 'Unknown error'}`);
        setStatusMessage(null);
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
          pendingApprovals.map(({ chain, step }) => (
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
                    onClick={() => onOpenTicket(chain.ticketId)}
                    className="wrike-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Ticket</span>
                  </button>

                  <button
                    onClick={() => setActingItem({ chain, step })}
                    className="wrike-btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 shadow-sm"
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    <span>Review & Authorize</span>
                  </button>
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
          ))
        )}
      </div>

      {/* Review & Authorize Modal */}
      {actingItem && (
        <div className="fixed inset-0 z-dsOverlay flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-semantic-panel border border-semantic-border-strong rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-semantic-success text-white flex items-center justify-center font-bold">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-semantic-primary">Cryptographic Dual-Control Sign-off</h3>
                  <p className="text-label text-semantic-muted font-mono">
                    Signatory: {currentUser?.fullName} ({currentUser?.roles.join(', ')})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActingItem(null)}
                className="text-semantic-muted hover:text-semantic-primary p-1 rounded-lg hover:bg-semantic-neutral-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-semantic-subtle border border-semantic-border space-y-2 text-xs">
              <div className="text-semantic-muted">Authorization Scope:</div>
              <div className="font-bold text-semantic-primary">{actingItem.chain.title}</div>
              <div className="text-label text-semantic-secondary">
                Step {actingItem.step.stepNumber}: <strong>{actingItem.step.name}</strong>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-semantic-primary block">
                Executive Decision Rationale & Compliance Notes:
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Enter mandatory decision comments or risk remediation conditions..."
                className="w-full h-24 p-3 bg-semantic-panel border border-semantic-border-strong rounded-xl text-xs text-semantic-primary outline-none focus:border-semantic-brand focus:ring-2 focus:ring-semantic-brand/15 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-semantic-border">
              <button
                disabled={isSubmitting}
                onClick={() => setActingItem(null)}
                className="wrike-btn-secondary text-xs py-2 px-4"
              >
                Cancel
              </button>

              <button
                disabled={isSubmitting}
                onClick={() => handleDecision(actingItem.chain, actingItem.step, false)}
                className="px-4 py-2 rounded-lg bg-semantic-danger-surface text-semantic-danger hover:bg-semantic-danger-surface font-bold text-xs border border-semantic-danger-border transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject Gate</span>
              </button>

              <button
                disabled={isSubmitting}
                onClick={() => handleDecision(actingItem.chain, actingItem.step, true)}
                className="wrike-btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Sign & Authorize</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
