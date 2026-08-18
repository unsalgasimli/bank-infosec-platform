import React, { useState } from 'react';
import { TicketApprovalChain, ApprovalStep } from '../../../shared/types/approval.js';
import { FileSignature, CheckCircle2, Clock, ArrowRight, XCircle, ShieldCheck, UserCheck, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface ApprovalsViewProps {
  pendingApprovals: { chain: TicketApprovalChain; step: ApprovalStep }[];
  onOpenTicket: (ticketId: string) => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  pendingApprovals,
  onOpenTicket,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [actingStepId, setActingStepId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleDecision = async (chain: TicketApprovalChain, step: ApprovalStep, approved: boolean) => {
    try {
      setStatusMessage('Submitting cryptographic sign-off...');
      const res = await fetchWithAuth(`/api/approvals/${chain.ticketId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: step.id,
          approved,
          notes: decisionNotes || (approved ? 'Approved by designated authority.' : 'Rejected upon risk review.'),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage(`Sign-off recorded: ${approved ? 'APPROVED' : 'REJECTED'}.`);
        setActingStepId(null);
        setDecisionNotes('');
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Approval submission failed.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
            <FileSignature className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
              Dual-Control Approvals & Executive Sign-off Inbox
            </h1>
            <p className="text-xs text-[#5E6C84] mt-0.5">
              Multi-signature authorization gates for high-risk exceptions, production changes, and remediation closure.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-[#FFFAE6] text-[#FF8B00] border border-[#FFE380] rounded font-mono text-xs font-bold">
          {pendingApprovals.length} Pending Sign-offs
        </span>
      </div>

      {statusMessage && (
        <div className="p-3 bg-[#FFFFFF] border border-[#B3D4FF] text-[#0052CC] rounded text-xs font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0052CC]" />
          <span>{statusMessage}</span>
        </div>
      )}

      {pendingApprovals.length === 0 ? (
        <div className="p-16 text-center bg-[#FFFFFF] border border-[#DFE1E6] rounded-md space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[#FFFFFF] border border-[#ABF5D1] flex items-center justify-center text-[#006644] mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#172B4D] uppercase tracking-wide">All Approval Queues Clear</h3>
          <p className="text-xs text-[#5E6C84] max-w-sm mx-auto">
            You have no outstanding governance gates requiring your executive or technical sign-off.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {pendingApprovals.map(({ chain, step }) => {
            const isInteracting = actingStepId === step.id;

            return (
              <div
                key={chain.id}
                className="p-5 bg-[#FFFFFF] border border-[#DFE1E6] rounded-md space-y-3.5 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DFE1E6] pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-[#172B4D]">{chain.title}</h3>
                    <div className="text-xs text-[#5E6C84] mt-0.5">
                      Required Endorsement: <strong className="text-[#0052CC]">{step.requiredRole || 'Designated Signer'}</strong> • Step {step.stepNumber} of {chain.steps?.length || 2}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-[#FFFFFF] text-[#FF8B00] border border-[#FFE380] text-xs font-mono font-semibold self-start sm:self-auto">
                    Awaiting: {step.name}
                  </span>
                </div>

                {/* Step timeline */}
                <div className="flex items-center gap-2 text-xs py-1 flex-wrap">
                  {chain.steps?.map((s, idx) => (
                    <React.Fragment key={s.id}>
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono ${
                          s.status === 'APPROVED'
                            ? 'bg-[#FFFFFF] border border-[#ABF5D1] text-[#006644]'
                            : s.status === 'PENDING'
                            ? 'bg-[#FFFAE6] border border-[#FFE380] text-[#FF8B00] font-bold'
                            : 'bg-[#FFFFFF] border border-[#DFE1E6] text-[#7A869A]'
                        }`}
                      >
                        {s.status === 'APPROVED' ? (
                          <Check className="w-3 h-3 text-[#006644]" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>Stage {s.stepNumber}: {s.name}</span>
                      </div>
                      {idx < (chain.steps?.length || 0) - 1 && (
                        <ArrowRight className="w-3 h-3 text-[#7A869A] shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Inline Decision Form */}
                {isInteracting ? (
                  <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-2.5">
                    <label className="block text-xs text-[#172B4D] font-semibold">
                      Reason / Attestation Notes:
                    </label>
                    <input
                      type="text"
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      placeholder="e.g. Compensating firewall rules verified by Network SecOps."
                      className="jira-input"
                    />
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setActingStepId(null)}
                        className="jira-btn-subtle"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDecision(chain, step, false)}
                        className="flex items-center gap-1 px-3 py-1 rounded bg-[#DE350B] hover:bg-[#BF2600] text-white text-xs font-semibold"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => handleDecision(chain, step, true)}
                        className="flex items-center gap-1 px-3 py-1 rounded bg-[#ABF5D1] hover:bg-[#2A855D] text-white text-xs font-semibold"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Sign</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      onClick={() => onOpenTicket(chain.ticketId)}
                      className="text-[#0052CC] hover:underline flex items-center gap-1 font-medium"
                    >
                      Inspect Full Ticket Context <ArrowRight className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => setActingStepId(step.id)}
                      className="jira-btn-primary"
                    >
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>Make Sign-off Decision</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


