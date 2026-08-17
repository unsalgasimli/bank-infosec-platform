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
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              My Pending Approvals & Sign-off Inbox
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Formal cryptographic endorsement gates for policy exceptions, risk acceptances, and production deployments.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-amber-950 text-amber-300 border border-amber-800 rounded-full text-xs font-mono font-bold">
          {pendingApprovals.length} Awaiting My Sign-off
        </span>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="p-16 text-center bg-bank-900 border border-slate-800 rounded-xl space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">All Approval Queues Clear</h3>
          <p className="text-xs text-slate-400">You have no outstanding approval actions requiring your decision.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingApprovals.map(({ chain, step }) => (
            <div
              key={chain.id}
              onClick={() => onOpenTicket(chain.ticketId)}
              className="p-5 bg-bank-900 border border-slate-800 hover:border-blue-500 rounded-xl cursor-pointer transition-all space-y-3 shadow-md group"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">
                  {chain.title}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-xs font-mono font-bold">
                  Step {step.stepNumber}: {step.name}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Required Endorsement Role: <strong className="text-slate-200">{step.requiredRole || 'Designated Signer'}</strong>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                <span className="text-slate-500">Created: {new Date(chain.createdAt).toLocaleDateString()}</span>
                <span className="text-blue-400 font-bold flex items-center gap-1">
                  Open Ticket & Sign <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
