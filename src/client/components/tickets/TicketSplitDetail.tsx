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
  ExternalLink,
  CheckCircle2,
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

  const getStatusLozengeClass = (category: string) => {
    switch (category) {
      case 'DONE':
        return 'jira-lozenge-done';
      case 'IN_PROGRESS':
        return 'jira-lozenge-inprogress';
      case 'UNDER_REVIEW':
        return 'jira-lozenge-review';
      case 'BLOCKED':
        return 'jira-lozenge-blocked';
      default:
        return 'jira-lozenge-todo';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F5F7] overflow-hidden">
      {/* Top Action Header */}
      <div className="bg-[#FFFFFF] border-b border-[#DFE1E6] px-6 py-2.5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 rounded bg-[#FFFFFF] hover:bg-[#EBECF0] text-[#5E6C84] hover:text-[#172B4D] border border-[#DFE1E6] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Badge type="PROJECT" value={ticket.projectCode} />
            <span className="text-sm font-mono font-bold text-[#172B4D] tracking-wide">{ticket.key}</span>
            <Badge type="CONFIDENTIALITY" value={ticket.confidentiality} />
          </div>
        </div>

        {/* Workflow State Transitions Action Bar */}
        <div className="flex items-center gap-2">
          {transitions.map((trans) => (
            <button
              key={trans.id}
              onClick={() => handleTransitionClick(trans)}
              className="jira-btn-primary"
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Ticket Title & Status Header */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`jira-lozenge ${getStatusLozengeClass(ticket.statusCategory)} text-xs`}>
                {ticket.statusName}
              </span>
              <Badge type="SEVERITY" value={ticket.technicalSeverity} />
              <Badge type="PRIORITY" value={ticket.businessPriority} />
              {ticket.cvssScore && (
                <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#FF8B00] border border-[#DFE1E6] text-xs font-mono font-bold">
                  CVSS {ticket.cvssScore}
                </span>
              )}
            </div>

            <h1 className="text-lg font-bold text-[#172B4D] tracking-tight leading-snug">
              {ticket.title}
            </h1>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-[#DFE1E6] flex items-center gap-6 text-xs font-semibold uppercase tracking-wider">
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
                className={`pb-2.5 transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-[#0052CC] font-bold'
                    : 'text-[#5E6C84] hover:text-[#172B4D]'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0052CC] rounded-t" />
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
        <div className="w-80 bg-[#FFFFFF] border-l border-[#DFE1E6] overflow-y-auto p-5 space-y-5 shrink-0 text-xs shadow-inner custom-scrollbar">
          {/* SLA Card */}
          <SLARing
            remainingMinutes={ticket.slaRemainingMinutes}
            state={ticket.slaState}
            deadline={ticket.remediationDeadline}
            pausedReason={ticket.slaPausedReason}
          />

          {/* People / Ownership Section */}
          <div className="space-y-2.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#5E6C84] border-b border-[#DFE1E6] pb-1">
              People & Ownership
            </h4>

            {/* Assignee */}
            <div className="flex items-center justify-between">
              <span className="text-[#5E6C84]">Assignee:</span>
              <div className="flex items-center gap-1.5 font-medium text-[#172B4D]">
                {assignee ? (
                  <>
                    <User className="w-3.5 h-3.5 text-[#5E6C84]" />
                    <span>{assignee.fullName}</span>
                  </>
                ) : (
                  <span className="text-[#7A869A] italic">Unassigned</span>
                )}
              </div>
            </div>

            {/* Security Owner */}
            <div className="flex items-center justify-between">
              <span className="text-[#5E6C84]">Security Lead:</span>
              <span className="font-medium text-[#172B4D]">{securityOwner?.fullName || 'InfoSec Pool'}</span>
            </div>

            {/* Reporter */}
            <div className="flex items-center justify-between">
              <span className="text-[#5E6C84]">Reporter:</span>
              <span className="text-[#172B4D]">{reporter?.fullName || 'Automated Scanner'}</span>
            </div>
          </div>

          {/* Risk Metrics Section */}
          <div className="space-y-2.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#5E6C84] border-b border-[#DFE1E6] pb-1">
              Risk & Severity Ratings
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-[#5E6C84]">Inherent Risk:</span>
              <Badge type="SEVERITY" value={ticket.inherentRisk} size="sm" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#5E6C84]">Residual Risk:</span>
              <Badge type="SEVERITY" value={ticket.residualRisk} size="sm" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#5E6C84]">Calculated Risk:</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-[#FFFFFF] rounded-full overflow-hidden border border-[#DFE1E6]">
                  <div
                    className={`h-full ${
                      ticket.riskScore >= 80 ? 'bg-[#DE350B]' : ticket.riskScore >= 50 ? 'bg-[#FF8B00]' : 'bg-[#0052CC]'
                    }`}
                    style={{ width: `${ticket.riskScore}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-[#172B4D]">{ticket.riskScore}/100</span>
              </div>
            </div>
          </div>

          {/* Dates & SLA Milestones */}
          <div className="space-y-2.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#5E6C84] border-b border-[#DFE1E6] pb-1">
              Dates & Deadlines
            </h4>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5E6C84]">Created:</span>
              <span className="font-mono text-[#172B4D]">{new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5E6C84]">Remediation SLA:</span>
              <span className="font-mono text-[#FF8B00] font-semibold">{new Date(ticket.remediationDeadline).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5E6C84]">Hard Due Date:</span>
              <span className="font-mono text-[#172B4D]">{new Date(ticket.dueDate).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#5E6C84] border-b border-[#DFE1E6] pb-1">
                Tags & Compliance
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] border border-[#DFE1E6] text-[10px] font-mono"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-2.5">
              <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
                Transition to: {selectedTransition.name}
              </h3>
              <button onClick={() => setSelectedTransition(null)} className="text-[#5E6C84] hover:text-[#172B4D]">✕</button>
            </div>

            {selectedTransition.requireEvidence && (
              <div className="p-2.5 bg-[#FFFAE6] border border-[#FFE380] rounded text-xs text-[#FF8B00] flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0" />
                <span>Notice: Evidence attachments are required before submitting for retest.</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#172B4D]">
                Transition Justification Comment {selectedTransition.requireComment && '(Mandatory)'}
              </label>
              <textarea
                rows={3}
                required={selectedTransition.requireComment}
                value={transitionComment}
                onChange={(e) => setTransitionComment(e.target.value)}
                placeholder="Enter justification for workflow state change..."
                className="jira-input font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE1E6]">
              <button
                onClick={() => setSelectedTransition(null)}
                className="jira-btn-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTransition}
                disabled={isTransitioning || (selectedTransition.requireComment && !transitionComment.trim())}
                className="jira-btn-primary"
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


