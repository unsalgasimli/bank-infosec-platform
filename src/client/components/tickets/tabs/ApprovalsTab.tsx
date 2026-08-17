import React, { useState } from 'react';
import { TicketApprovalChain, ApprovalStep, ApprovalDecision } from '../../../../shared/types/approval.js';
import { useAuth } from '../../../context/AuthContext.js';
import { CheckCircle2, XCircle, Clock, Shield, AlertTriangle, User, KeyRound } from 'lucide-react';
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

  if (!approvalChain || approvalChain.steps.length === 0) {
    return (
      <div className="p-8 text-center bg-bank-900 border border-slate-800 rounded-lg text-xs text-slate-400">
        No formal governance sign-off or dual-control approval gate required for this ticket type.
      </div>
    );
  }

  const handleDecisionSubmit = async () => {
    if (!selectedStep || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onDecision(selectedStep.id, decision, comments);
      setSelectedStep(null);
      setComments('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Chain Status Header */}
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Governance & Dual-Control Sign-Off Gates
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Cryptographically signed dual-control authorization chain required for high-risk exception & retest gates.
          </p>
        </div>
        <Badge type="SEVERITY" value={approvalChain.status === 'APPROVED' ? 'LOW' : approvalChain.status === 'REJECTED' ? 'CRITICAL' : 'HIGH'} />
      </div>

      {/* Steps Pipeline */}
      <div className="space-y-3">
        {approvalChain.steps.map((step) => {
          const isPending = step.status === 'PENDING';
          const isApproved = step.status === 'APPROVED';
          const isRejected = step.status === 'REJECTED';
          const canCurrentUserAct = isPending && ((step.requiredRole && currentUser?.roles.includes(step.requiredRole)) || currentUser?.roles.includes('CISO'));

          return (
            <div
              key={step.id}
              className={`p-4 bg-bank-900 border rounded-lg space-y-3 transition-colors ${
                isPending
                  ? 'border-slate-700'
                  : isApproved
                  ? 'border-emerald-900/60'
                  : 'border-red-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-bank-950 border border-slate-700 flex items-center justify-center font-mono font-semibold text-xs text-slate-300">
                    {step.stepNumber}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs">{step.name}</div>
                    <div className="text-[11px] text-slate-400">Required Role: <strong className="text-slate-300">{step.requiredRole || 'Designated Signer'}</strong></div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isApproved && (
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}
                  {isRejected && (
                    <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                      <XCircle className="w-3.5 h-3.5" /> Rejected
                    </span>
                  )}
                  {isPending && (
                    <span className="flex items-center gap-1 text-amber-400 text-xs font-medium">
                      <Clock className="w-3.5 h-3.5" /> Awaiting Sign-Off
                    </span>
                  )}

                  {canCurrentUserAct && (
                    <button
                      onClick={() => {
                        setSelectedStep(step);
                        setDecision('APPROVED');
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                    >
                      Sign / Decide
                    </button>
                  )}
                </div>
              </div>

              {/* Decided Info */}
              {step.decisionAt && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Decided by User: <strong className="text-slate-200">{step.decisionByUserName || step.decisionByUserId}</strong></span>
                  <span>{new Date(step.decisionAt).toLocaleString()}</span>
                </div>
              )}

              {step.comments && (
                <div className="p-2.5 bg-bank-950 rounded border border-slate-800 text-xs text-slate-300">
                  <span className="text-slate-500 font-medium">Comments: </span>
                  {step.comments}
                </div>
              )}
            </div>
          );
        })}
      </div>


      {/* Decision Modal */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md bg-bank-900 border border-slate-700 rounded-lg p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Sign Approval: {selectedStep.name}
              </h3>
              <button onClick={() => setSelectedStep(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Decision</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVED')}
                    className={`py-2 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      decision === 'APPROVED'
                        ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                        : 'bg-bank-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('REJECTED')}
                    className={`py-2 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      decision === 'REJECTED'
                        ? 'bg-red-950 border-red-600 text-red-300'
                        : 'bg-bank-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Governance Review Comments (Audit logged)
                </label>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="State rationales, compensating control validations, or rejection causes..."
                  className="w-full bg-bank-950 border border-slate-800 rounded p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedStep(null)}
                className="px-3.5 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Signing...' : 'Submit Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
