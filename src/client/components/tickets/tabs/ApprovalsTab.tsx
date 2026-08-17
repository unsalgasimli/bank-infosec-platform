import React, { useState } from 'react';
import { TicketApprovalChain, ApprovalStep, ApprovalDecision } from '../../../../shared/types/approval.js';
import { useAuth } from '../../../context/AuthContext.js';
import { CheckCircle2, XCircle, Clock, ShieldCheck, UserCheck, ArrowRight, FileSignature } from 'lucide-react';

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

  if (!approvalChain) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 bg-bank-900 border border-slate-800 rounded-xl">
        No formal multi-stage approval chain required for this ticket type.
      </div>
    );
  }

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{approvalChain.title}</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Immutable multi-stage authorization workflow requiring formal cryptographic endorsement.
          </p>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
            approvalChain.status === 'APPROVED'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
              : approvalChain.status === 'REJECTED'
              ? 'bg-red-950/80 text-red-300 border-red-700'
              : 'bg-amber-950/80 text-amber-300 border-amber-700 animate-pulse-subtle'
          }`}
        >
          {approvalChain.status}
        </span>
      </div>

      {/* Approval Steps Progression */}
      <div className="space-y-4">
        {approvalChain.steps.map((step, idx) => {
          const isPending = step.status === 'PENDING';
          const isApproved = step.status === 'APPROVED';
          const isRejected = step.status === 'REJECTED';

          const canSign =
            isPending &&
            (step.assignedApproverId === currentUser?.id ||
              (step.requiredRole && currentUser?.roles.includes(step.requiredRole)) ||
              currentUser?.roles.includes('CISO') ||
              currentUser?.roles.includes('PLATFORM_ADMIN'));

          return (
            <div
              key={step.id}
              className={`p-4 rounded-xl border transition-all ${
                isApproved
                  ? 'bg-emerald-950/10 border-emerald-900/40'
                  : isRejected
                  ? 'bg-red-950/10 border-red-900/40'
                  : 'bg-bank-900 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 border ${
                      isApproved
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : isRejected
                        ? 'bg-red-950 text-red-400 border-red-800'
                        : 'bg-amber-950 text-amber-400 border-amber-800'
                    }`}
                  >
                    {isApproved ? <CheckCircle2 className="w-4 h-4" /> : isRejected ? <XCircle className="w-4 h-4" /> : step.stepNumber}
                  </div>

                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{step.name}</span>
                      {step.requiredRole && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
                          Role: {step.requiredRole}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Assigned to: <strong className="text-slate-300">{step.assignedApproverName || 'Designated Role'}</strong>
                    </div>

                    {step.decisionAt && (
                      <div className="text-[11px] text-slate-400 mt-1">
                        Decided by <strong className="text-slate-200">{step.decisionByUserName}</strong> on {new Date(step.decisionAt).toLocaleString()}
                      </div>
                    )}

                    {step.comments && (
                      <div className="p-2 bg-bank-950 rounded-lg border border-slate-800 text-xs text-slate-300 italic mt-2">
                        "{step.comments}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Action button if authorized */}
                {canSign && (
                  <button
                    onClick={() => setSelectedStep(step)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Sign Decision</span>
                  </button>
                )}
              </div>

              {/* Cryptographic Signature Verification */}
              {step.immutableSignatureHash && (
                <div className="mt-3 p-2 bg-bank-950 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Cryptographically Signed</span>
                  </div>
                  <div className="truncate max-w-md text-slate-500">
                    Hash: {step.immutableSignatureHash}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sign Decision Modal / Form */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bank-950/80 backdrop-blur-md">
          <form
            onSubmit={handleDecisionSubmit}
            className="w-full max-w-lg bg-bank-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Sign Formal Approval: {selectedStep.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Decision</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDecision('APPROVED')}
                  className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    decision === 'APPROVED'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-bank-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>APPROVE</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('REJECTED')}
                  className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    decision === 'REJECTED'
                      ? 'bg-red-950 border-red-500 text-red-300'
                      : 'bg-bank-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span>REJECT</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Auditable Decision Justification (Mandatory)</label>
              <textarea
                rows={3}
                required
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter mandatory justification comments that will be cryptographically bound to this signature..."
                className="w-full bg-bank-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !comments.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md disabled:opacity-50"
              >
                {isSubmitting ? 'Recording Signature...' : 'Submit & Sign'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
