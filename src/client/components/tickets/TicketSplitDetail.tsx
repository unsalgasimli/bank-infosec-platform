import React, { useState } from 'react';
import { Ticket, TechnicalSeverity, BusinessPriority } from '../../../shared/types/ticket.js';
import { WorkflowTransition } from '../../../shared/types/workflow.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { TicketApprovalChain, ApprovalDecision } from '../../../shared/types/approval.js';
import { TicketComment, CommentVisibility } from '../../../shared/types/comments.js';
import { TicketAttachment } from '../../../shared/types/attachment.js';
import { AuditEvent } from '../../../shared/types/audit.js';
import { useAuth } from '../../context/AuthContext.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { CommentsTab } from './tabs/CommentsTab.js';
import { EvidenceTab } from './tabs/EvidenceTab.js';
import { ApprovalsTab } from './tabs/ApprovalsTab.js';
import { AuditTab } from './tabs/AuditTab.js';
import { ActivityTab } from './tabs/ActivityTab.js';
import {
  ArrowLeft,
  Share2,
  Lock,
  Calendar,
  User,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface TicketSplitDetailProps {
  ticket: Ticket;
  transitions: WorkflowTransition[];
  comments: TicketComment[];
  attachments: TicketAttachment[];
  auditEvents: AuditEvent[];
  approvalChain?: TicketApprovalChain;
  application?: BankApplication;
  asset?: BankAsset;
  onBack: () => void;
  onTransition: (transitionId: string, comment?: string) => Promise<void>;
  onAddComment: (content: string, visibility: CommentVisibility) => Promise<void>;
  onApprovalDecision: (stepId: string, decision: ApprovalDecision, comments: string) => Promise<void>;
  onUpdateTicket: (updates: Partial<Ticket>) => Promise<void>;
}

export const TicketSplitDetail: React.FC<TicketSplitDetailProps> = ({
  ticket,
  transitions,
  comments,
  attachments,
  auditEvents,
  approvalChain,
  application,
  asset,
  onBack,
  onTransition,
  onAddComment,
  onApprovalDecision,
  onUpdateTicket,
}) => {
  const { allUsers, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ACTIVITY' | 'COMMENTS' | 'EVIDENCE' | 'APPROVALS' | 'AUDIT'>('OVERVIEW');
  const [transitionComment, setTransitionComment] = useState('');
  const [selectedTransition, setSelectedTransition] = useState<WorkflowTransition | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);
  const reporter = allUsers.find((u) => u.id === ticket.reporterId);
  const securityOwner = allUsers.find((u) => u.id === ticket.securityOwnerId);

  const handleTransitionClick = (trans: WorkflowTransition) => {
    if (trans.requireComment || trans.requireEvidence) {
      setSelectedTransition(trans);
    } else {
      onTransition(trans.id);
    }
  };

  const handleConfirmTransition = async () => {
    if (!selectedTransition) return;
    setIsTransitioning(true);
    try {
      await onTransition(selectedTransition.id, transitionComment);
      setSelectedTransition(null);
      setTransitionComment('');
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bank-950 overflow-hidden">
      {/* Top Action Header */}
      <div className="bg-bank-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg bg-bank-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Badge type="PROJECT" value={ticket.projectCode} />
            <span className="text-base font-mono font-bold text-white tracking-tight">{ticket.key}</span>
            <Badge type="CONFIDENTIALITY" value={ticket.confidentiality} />
          </div>
        </div>

        {/* Workflow State Transitions Action Bar */}
        <div className="flex items-center gap-2">
          {transitions.map((trans) => (
            <button
              key={trans.id}
              onClick={() => handleTransitionClick(trans)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-700 to-navy-600 hover:from-blue-600 hover:to-navy-500 text-white text-xs font-bold shadow-md border border-blue-500/30 transition-all hover:scale-105 active:scale-95"
            >
              <span>{trans.name}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Ticket Title & Status Header */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-blue-950/80 text-blue-300 border border-blue-800 text-xs font-bold font-mono">
                {ticket.statusName}
              </span>
              <Badge type="SEVERITY" value={ticket.technicalSeverity} />
              <Badge type="PRIORITY" value={ticket.businessPriority} />
              {ticket.cvssScore && (
                <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-xs font-mono font-bold">
                  CVSS {ticket.cvssScore}
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-white tracking-tight leading-snug">
              {ticket.title}
            </h1>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-slate-800 flex items-center gap-6 text-xs font-bold uppercase tracking-wider">
            {[
              { id: 'OVERVIEW', label: 'Overview & Technical Details' },
              { id: 'ACTIVITY', label: 'Activity Timeline' },
              { id: 'COMMENTS', label: `Comments (${comments.length})` },
              { id: 'EVIDENCE', label: `Evidence (${attachments.length})` },
              { id: 'APPROVALS', label: 'Approvals Gate' },
              { id: 'AUDIT', label: 'Audit Diff Log' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-blue-400 font-extrabold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Active Tab Component */}
          {activeTab === 'OVERVIEW' && (
            <OverviewTab
              ticket={ticket}
              application={application}
              asset={asset}
            />
          )}

          {activeTab === 'ACTIVITY' && (
            <ActivityTab comments={comments} auditEvents={auditEvents} />
          )}

          {activeTab === 'COMMENTS' && (
            <CommentsTab
              comments={comments}
              ticketId={ticket.id}
              onAddComment={onAddComment}
            />
          )}

          {activeTab === 'EVIDENCE' && (
            <EvidenceTab attachments={attachments} ticketId={ticket.id} />
          )}

          {activeTab === 'APPROVALS' && (
            <ApprovalsTab
              approvalChain={approvalChain}
              ticketId={ticket.id}
              onDecision={onApprovalDecision}
            />
          )}

          {activeTab === 'AUDIT' && <AuditTab auditEvents={auditEvents} />}
        </div>

        {/* Right Info Sidebar Panel */}
        <div className="w-80 bg-bank-900 border-l border-slate-800 overflow-y-auto p-5 space-y-6 shrink-0 text-xs">
          {/* SLA Card */}
          <SLARing
            remainingMinutes={ticket.slaRemainingMinutes}
            state={ticket.slaState}
            deadline={ticket.remediationDeadline}
            pausedReason={ticket.slaPausedReason}
          />

          {/* People / Ownership Section */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
              People & Ownership
            </h4>

            {/* Assignee */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Assignee:</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                {assignee ? (
                  <>
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>{assignee.fullName}</span>
                  </>
                ) : (
                  <span className="text-slate-500 italic">Unassigned</span>
                )}
              </div>
            </div>

            {/* Security Owner */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Security Lead:</span>
              <span className="font-bold text-slate-200">{securityOwner?.fullName || 'InfoSec Pool'}</span>
            </div>

            {/* Reporter */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Reporter:</span>
              <span className="text-slate-300">{reporter?.fullName || 'Automated Scanner'}</span>
            </div>
          </div>

          {/* Risk Metrics Section */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
              Risk & Severity Ratings
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Inherent Risk:</span>
              <Badge type="SEVERITY" value={ticket.inherentRisk} size="sm" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Residual Risk:</span>
              <Badge type="SEVERITY" value={ticket.residualRisk} size="sm" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Calculated Risk Score:</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-bank-950 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className={`h-full ${
                      ticket.riskScore >= 80 ? 'bg-red-500' : ticket.riskScore >= 50 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${ticket.riskScore}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-white">{ticket.riskScore}/100</span>
              </div>
            </div>
          </div>

          {/* Dates & SLA Milestones */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
              Dates & Banking Deadlines
            </h4>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Created:</span>
              <span className="font-mono text-slate-300">{new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Remediation SLA:</span>
              <span className="font-mono text-amber-300 font-bold">{new Date(ticket.remediationDeadline).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Hard Due Date:</span>
              <span className="font-mono text-slate-300">{new Date(ticket.dueDate).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
                Tags & Compliance Controls
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-bank-950 text-slate-300 border border-slate-700 text-[10px] font-mono"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transition Comment Modal */}
      {selectedTransition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bank-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-bank-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Transition to: {selectedTransition.name}
              </h3>
              <button onClick={() => setSelectedTransition(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {selectedTransition.requireEvidence && (
              <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0" />
                <span>Notice: Evidence attachments are required before submitting for retest.</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">
                Transition Justification Comment {selectedTransition.requireComment && '(Mandatory)'}
              </label>
              <textarea
                rows={3}
                required={selectedTransition.requireComment}
                value={transitionComment}
                onChange={(e) => setTransitionComment(e.target.value)}
                placeholder="Enter justification for workflow state change..."
                className="w-full bg-bank-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedTransition(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTransition}
                disabled={isTransitioning || (selectedTransition.requireComment && !transitionComment.trim())}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md disabled:opacity-50"
              >
                {isTransitioning ? 'Transitioning...' : 'Execute Transition'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
