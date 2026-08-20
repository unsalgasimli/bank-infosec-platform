import React, { useState } from 'react';
import { TicketApprovalChain, ApprovalStep, ApprovalDecision } from '../../../../shared/types/approval.js';
import { useAuth } from '../../../context/AuthContext.js';
import { CheckCircle2, XCircle, Clock, Shield, AlertTriangle, User, KeyRound, Loader2 } from 'lucide-react';
import { Badge } from '../../common/Badge.js';

interface ApprovalsTabProps {
  approvalChain?: TicketApprovalChain;
  ticketId: string;
  onDecision: (stepId: string, decision: ApprovalDecision, comments: string) => Promise<void>;
}

export const ApprovalsTab: React.FC<ApprovalsTabProps> = ({
  approvalChain,
  ticketId,
  onDecision,
}) => {
  const { currentUser } = useAuth();
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const [decision, setDecision] = useState<ApprovalDecision>('APPROVED');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!approvalChain || approvalChain.steps.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
        <KeyRound className="w-6 h-6 text-slate-400 mx-auto mb-2" />
        <h4 className="font-semibold text-slate-700">No Sign-off Gates Required</h4>
        <p className="text-[11px] text-slate-400 mt-0.5">No formal governance sign-off or dual-control approval gate required for this ticket type.</p>
      </div>
    );
  }

  const handleDecisionSubmit = async () => {
    if (!selectedStep || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onDecision(selectedStep.id, decision, comments);
      setSelectedStep(null);
      setComments('');
    } catch (cause: any) {
      setError(cause.message || 'Approval decision could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Chain Status Header */}
      <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-xs flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0052CC]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Governance & Dual-Control Sign-Off Gates
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Cryptographically logged dual-control authorization chain required for high-risk exception & retest gates.
          </p>
        </div>
        <Badge type="SEVERITY" value={approvalChain.status === 'APPROVED' ? 'LOW' : approvalChain.status === 'REJECTED' ? 'CRITICAL' : 'HIGH'} />
      </div>

      {/* Steps Pipeline */}
      <div className="space-y-3.5">
        {approvalChain.steps.map((step) => {
          const isPending = step.status === 'PENDING';
          const isApproved = step.status === 'APPROVED';
          const isRejected = step.status === 'REJECTED';
          const canCurrentUserAct = isPending && ((step.requiredRole && currentUser?.roles.includes(step.requiredRole)) || currentUser?.roles.includes('CISO'));

          return (
            <div
              key={step.id}
              className={`p-4 bg-white border rounded-xl space-y-3 transition-all shadow-xs ${
                isPending
                  ? 'border-slate-200'
                  : isApproved
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : 'border-rose-200 bg-rose-50/20'
              }`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-bold text-xs text-slate-800 shadow-xs">
                    {step.stepNumber}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{step.name}</div>
                    <div className="text-[11px] text-slate-500">Required Role: <strong className="text-slate-800 font-semibold">{step.requiredRole || 'Designated Signer'}</strong></div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isApproved && (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}
                  {isRejected && (
                    <span className="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 text-xs font-bold">
                      <XCircle className="w-3.5 h-3.5" /> Rejected
                    </span>
                  )}
                  {isPending && (
                    <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5" /> Awaiting Sign-Off
                    </span>
                  )}

                  {canCurrentUserAct && (
                    <button
                      onClick={() => {
                        setSelectedStep(step);
                        setDecision('APPROVED');
                      }}
                      className="jira-btn-primary py-1"
                    >
                      Sign / Decide
                    </button>
                  )}
                </div>
              </div>

              {/* Decided Info */}
              {step.decisionAt && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono flex-wrap gap-2">
                  <span>Decided by User: <strong className="text-slate-800 font-semibold">{step.decisionByUserName || step.decisionByUserId}</strong></span>
                  <span>{new Date(step.decisionAt).toLocaleString()}</span>
                </div>
              )}

              {step.comments && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800">
                  <span className="text-slate-500 font-semibold">Comments: </span>
                  {step.comments}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Decision Modal */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Sign Approval: {selectedStep.name}
              </h3>
              <button onClick={() => setSelectedStep(null)} className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">✕</button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wider">Decision</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVED')}
                    className={`py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                      decision === 'APPROVED'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-400/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('REJECTED')}
                    className={`py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                      decision === 'REJECTED'
                        ? 'bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-400/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-rose-600" /> Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Governance Review Comments (Audit Logged)
                </label>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="State rationales, compensating control validations, or rejection causes..."
                  className="jira-input font-normal"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setSelectedStep(null)}
                className="jira-btn-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={isSubmitting || (decision === 'REJECTED' && !comments.trim())}
                className="jira-btn-primary disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isSubmitting ? 'Signing...' : 'Submit Decision'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

