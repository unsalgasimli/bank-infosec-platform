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
      <div className="p-8 text-center bg-[#FFFFFF] border border-[#DFE1E6] rounded-md text-xs text-[#5E6C84]">
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
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-4 flex items-center justify-between shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0052CC]" />
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              Governance & Dual-Control Sign-Off Gates
            </h3>
          </div>
          <p className="text-[11px] text-[#5E6C84] mt-0.5">
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
              className={`p-4 bg-[#FFFFFF] border rounded-md space-y-3 transition-colors shadow-sm ${
                isPending
                  ? 'border-[#DFE1E6]'
                  : isApproved
                  ? 'border-[#ABF5D1]'
                  : 'border-[#FFBDAD]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-[#FFFFFF] border border-[#DFE1E6] flex items-center justify-center font-mono font-semibold text-xs text-[#172B4D]">
                    {step.stepNumber}
                  </div>
                  <div>
                    <div className="font-semibold text-[#172B4D] text-xs">{step.name}</div>
                    <div className="text-[11px] text-[#5E6C84]">Required Role: <strong className="text-[#172B4D]">{step.requiredRole || 'Designated Signer'}</strong></div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isApproved && (
                    <span className="flex items-center gap-1 text-[#006644] text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}
                  {isRejected && (
                    <span className="flex items-center gap-1 text-[#DE350B] text-xs font-semibold">
                      <XCircle className="w-3.5 h-3.5" /> Rejected
                    </span>
                  )}
                  {isPending && (
                    <span className="flex items-center gap-1 text-[#FF8B00] text-xs font-medium">
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
                <div className="pt-2 border-t border-[#DFE1E6] flex items-center justify-between text-[11px] text-[#5E6C84] font-mono">
                  <span>Decided by User: <strong className="text-[#172B4D]">{step.decisionByUserName || step.decisionByUserId}</strong></span>
                  <span>{new Date(step.decisionAt).toLocaleString()}</span>
                </div>
              )}

              {step.comments && (
                <div className="p-2.5 bg-[#FFFFFF] rounded border border-[#DFE1E6] text-xs text-[#172B4D]">
                  <span className="text-[#5E6C84] font-medium">Comments: </span>
                  {step.comments}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Decision Modal */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-2.5">
              <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
                Sign Approval: {selectedStep.name}
              </h3>
              <button onClick={() => setSelectedStep(null)} className="text-[#5E6C84] hover:text-[#172B4D]">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#172B4D] mb-1.5">Decision</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVED')}
                    className={`py-2 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      decision === 'APPROVED'
                        ? 'bg-[#E3FCEF] border-[#ABF5D1] text-[#006644]'
                        : 'bg-[#FFFFFF] border-[#DFE1E6] text-[#5E6C84] hover:text-[#172B4D]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('REJECTED')}
                    className={`py-2 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      decision === 'REJECTED'
                        ? 'bg-[#FFEBE6] border-[#FFBDAD] text-[#DE350B]'
                        : 'bg-[#FFFFFF] border-[#DFE1E6] text-[#5E6C84] hover:text-[#172B4D]'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172B4D] mb-1">
                  Governance Review Comments (Audit logged)
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

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE1E6]">
              <button
                onClick={() => setSelectedStep(null)}
                className="jira-btn-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={isSubmitting}
                className="jira-btn-primary disabled:opacity-50"
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
