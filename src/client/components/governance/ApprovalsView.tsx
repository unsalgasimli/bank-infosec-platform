import React from 'react';
import { TicketApprovalChain, ApprovalStep } from '../../../shared/types/approval.js';
import { FileSignature, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

interface ApprovalsViewProps {
  pendingApprovals: { chain: TicketApprovalChain; step: ApprovalStep }[];
  onOpenTicket: (ticketId: string) => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  pendingApprovals,
  onOpenTicket,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-blue-400 border border-slate-800">
            <FileSignature className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              My Pending Approvals & Sign-off Inbox
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Dual-control authorization gates for policy exceptions, risk acceptances, and remediation retests.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-bank-950 text-amber-300 border border-slate-800 rounded font-mono text-xs font-semibold">
          {pendingApprovals.length} Pending
        </span>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="p-12 text-center bg-bank-900 border border-slate-800 rounded-lg space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-semibold text-white">All Approval Queues Clear</h3>
          <p className="text-xs text-slate-400">You have no outstanding approval actions requiring your decision.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingApprovals.map(({ chain, step }) => (
            <div
              key={chain.id}
              onClick={() => onOpenTicket(chain.ticketId)}
              className="p-4 bg-bank-900 border border-slate-800 hover:border-slate-700 rounded-lg cursor-pointer transition-colors space-y-2.5 group"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white text-xs group-hover:text-blue-400 transition-colors">
                  {chain.title}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-850 text-amber-300 border border-slate-700 text-[11px] font-mono">
                  Step {step.stepNumber}: {step.name}
                </span>
              </div>

              <div className="text-xs text-slate-400">
                Required Endorsement Role: <strong className="text-slate-200">{step.requiredRole || 'Designated Signer'}</strong>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                <span className="text-slate-500 font-mono text-[11px]">Created: {new Date(chain.createdAt).toLocaleDateString()}</span>
                <span className="text-blue-400 font-medium flex items-center gap-1 group-hover:underline">
                  Open Ticket & Sign <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

