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
import { LifecycleTab } from './tabs/LifecycleTab.js';
import { TicketLifecycleBundle } from '../../../shared/types/itsm.js';
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
  Loader2,
  UserPlus,
  FileText,
  Clock,
  History,
  MessageSquare,
  Paperclip,
  KeyRound,
  ShieldCheck,
  Tag,
  Flame,
  Hash,
  Copy,
  Check,
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
  lifecycle?: TicketLifecycleBundle;
  cmdb?: Array<{ ci: any; relationship: string; impact: any }>;
  onBack: () => void;
  onTransition: (transitionId: string, comment?: string, requiredFieldUpdates?: Record<string, any>) => Promise<void>;
  onAddComment: (content: string, visibility: CommentVisibility) => Promise<void>;
  onApprovalDecision: (stepId: string, decision: ApprovalDecision, comments: string) => Promise<void>;
  onUpdateTicket: (updates: Partial<Ticket>) => Promise<void>;
  onRefresh: () => Promise<void> | void;
  onNavigateToTicket?: (ticketId: string) => void;
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
  lifecycle,
  cmdb,
  onBack,
  onTransition,
  onAddComment,
  onApprovalDecision,
  onUpdateTicket,
  onRefresh,
  onNavigateToTicket,
}) => {
  const { allUsers, currentUser, fetchWithAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LIFECYCLE' | 'ACTIVITY' | 'COMMENTS' | 'EVIDENCE' | 'APPROVALS' | 'AUDIT'>('OVERVIEW');
  const [transitionComment, setTransitionComment] = useState('');
  const [selectedTransition, setSelectedTransition] = useState<WorkflowTransition | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [resolutionCode, setResolutionCode] = useState('FIXED');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);
  const reporter = allUsers.find((u) => u.id === ticket.reporterId);
  const securityOwner = allUsers.find((u) => u.id === ticket.securityOwnerId);
  const canClaim = Boolean(
    currentUser &&
      !ticket.assigneeId &&
      ticket.statusCategory !== 'DONE' &&
      ticket.statusCategory !== 'CANCELLED' &&
      ((ticket.targetDepartmentId && ticket.targetDepartmentId === currentUser.departmentId) ||
        (!ticket.targetDepartmentId && ticket.departmentId && ticket.departmentId === currentUser.departmentId) ||
        ticket.participatingDepartmentIds?.includes(currentUser.departmentId || '') ||
        Boolean(ticket.assignmentGroupId && currentUser.teamIds?.includes(ticket.assignmentGroupId)) ||
        currentUser.roles.some((r) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(r)))
  );

  const handleCopyKey = () => {
    navigator.clipboard.writeText(ticket.key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    setClaimError('');
    try {
      const response = await fetchWithAuth(`/api/tickets/${ticket.id}/claim`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Task could not be claimed.');
      await onRefresh();
    } catch (error: any) {
      setClaimError(error.message || 'Task could not be claimed.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleTransitionClick = (trans: WorkflowTransition) => {
    if (trans.requireComment || trans.requireEvidence || (trans.requiredFields?.length || 0) > 0) {
      setSelectedTransition(trans);
    } else {
      onTransition(trans.id);
    }
  };

  const handleConfirmTransition = async () => {
    if (!selectedTransition) return;
    setIsTransitioning(true);
    try {
      const requiredFieldUpdates: Record<string, any> = {};
      if (selectedTransition.requiredFields?.includes('resolutionCode')) requiredFieldUpdates.resolutionCode = resolutionCode;
      if (selectedTransition.requiredFields?.includes('resolutionSummary')) requiredFieldUpdates.resolutionSummary = resolutionSummary;
      await onTransition(selectedTransition.id, transitionComment, requiredFieldUpdates);
      setSelectedTransition(null);
      setTransitionComment('');
      setResolutionSummary('');
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

  const tabsConfig = [
    { id: 'OVERVIEW', label: 'Overview & Technical Details', icon: FileText, count: null },
    { id: 'LIFECYCLE', label: 'Lifecycle', icon: Clock, count: null },
    { id: 'ACTIVITY', label: 'Activity Timeline', icon: History, count: null },
    { id: 'COMMENTS', label: 'Comments', icon: MessageSquare, count: comments.length },
    { id: 'EVIDENCE', label: 'Evidence', icon: Paperclip, count: attachments.length },
    { id: 'APPROVALS', label: 'Approvals Gate', icon: KeyRound, count: approvalChain?.steps?.length || null },
    { id: 'AUDIT', label: 'Audit Diff Log', icon: ShieldCheck, count: null },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page overflow-hidden">
      {/* Top Action Header Bar */}
      <div className="bg-white border-b border-semantic-border px-6 py-3 flex items-center justify-between z-dsContent shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-semibold transition-all shadow-xs"
            title="Back to Tickets"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          
          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <Badge type="PROJECT" value={ticket.projectCode} size="sm" />
            <button
              onClick={handleCopyKey}
              className="group flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-800 transition-colors"
              title="Click to copy ticket key"
            >
              <span>{ticket.key}</span>
              {copiedKey ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
              )}
            </button>
            <Badge type="CONFIDENTIALITY" value={ticket.confidentiality} size="sm" />
          </div>
        </div>

        {/* Workflow State Transitions Action Bar */}
        <div className="flex items-center gap-2">
          {claimError && <span className="text-xs font-medium text-rose-600 mr-2">{claimError}</span>}
          {canClaim && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={isClaiming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-60"
            >
              {isClaiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              <span>{isClaiming ? 'Claiming...' : 'Take this task'}</span>
            </button>
          )}
          {transitions.map((trans) => (
            <button
              key={trans.id}
              onClick={() => handleTransitionClick(trans)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-semantic-jira-brand hover:bg-semantic-jira-brand-hover active:bg-semantic-jira-brand-active text-white text-xs font-semibold shadow-xs transition-all"
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Ticket Title & Status Header */}
          <div className="space-y-3 bg-white p-5 rounded-xl border border-semantic-border shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`jira-lozenge ${getStatusLozengeClass(ticket.statusCategory)}`}>
                {ticket.statusName}
              </span>
              <Badge type="SEVERITY" value={ticket.technicalSeverity} />
              <Badge type="PRIORITY" value={ticket.businessPriority} />
              {ticket.cvssScore && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-mono font-bold">
                  <Flame className="w-3 h-3 text-amber-600" />
                  CVSS {ticket.cvssScore}
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">
              {ticket.title}
            </h1>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto custom-scrollbar bg-white px-3 pt-2 rounded-t-lg border-t border-x">
            {tabsConfig.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-all relative border-b-2 whitespace-nowrap ${
                    isActive
                      ? 'border-semantic-jira-brand text-semantic-jira-brand'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-md'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-semantic-jira-brand' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-caption font-bold ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tab Component Container */}
          <div className="bg-white rounded-b-lg border-x border-b border-slate-200 p-5 shadow-xs -mt-6">
            {activeTab === 'OVERVIEW' && (
              <OverviewTab
                ticket={ticket}
                application={application}
                asset={asset}
                cmdb={cmdb}
              />
            )}

            {activeTab === 'ACTIVITY' && (
              <ActivityTab comments={comments} auditEvents={auditEvents} />
            )}

            {activeTab === 'LIFECYCLE' && (
              <LifecycleTab
                ticket={ticket}
                lifecycle={lifecycle}
                onRefresh={onRefresh}
                onNavigateToTicket={onNavigateToTicket}
              />
            )}

            {activeTab === 'COMMENTS' && (
              <CommentsTab
                comments={comments}
                ticketId={ticket.id}
                onAddComment={onAddComment}
              />
            )}

            {activeTab === 'EVIDENCE' && (
              <EvidenceTab attachments={attachments} ticketId={ticket.id} onRefresh={onRefresh} />
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
        </div>

        {/* Right Info Sidebar Panel */}
        <div className="w-80 bg-white border-l border-semantic-border overflow-y-auto p-5 space-y-5 shrink-0 text-xs custom-scrollbar">
          {/* SLA Card */}
          <SLARing
            remainingMinutes={ticket.slaRemainingMinutes}
            state={ticket.slaState}
            deadline={ticket.remediationDeadline}
            pausedReason={ticket.slaPausedReason}
          />

          {/* People / Ownership Section */}
          <div className="space-y-3 p-4 rounded-lg bg-slate-50/70 border border-slate-200">
            <h4 className="text-label font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>People & Ownership</span>
            </h4>

            {/* Assignee */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Assignee:</span>
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-right truncate">
                {assignee ? (
                  <>
                    <div className="w-5 h-5 rounded-full bg-semantic-jira-brand text-white flex items-center justify-center text-caption font-bold shrink-0">
                      {assignee.fullName.charAt(0)}
                    </div>
                    <span className="truncate">{assignee.fullName}</span>
                  </>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-semantic-info-soft border border-semantic-info-soft-border text-semantic-info-strong font-mono text-label font-bold inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-semantic-info-strong animate-pulse shrink-0" />
                    {ticket.targetDepartmentId || ticket.departmentId ? 'Departament Növbəsi' : 'Təyin edilməyib'}
                  </span>
                )}
              </div>
            </div>

            {/* Security Owner */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Security Lead:</span>
              <div className="flex items-center gap-1 font-semibold text-slate-800 text-right truncate">
                <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{securityOwner?.fullName || 'InfoSec Pool'}</span>
              </div>
            </div>

            {/* Reporter */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Reporter:</span>
              <span className="text-slate-700 font-medium text-right truncate">{reporter?.fullName || 'Automated Scanner'}</span>
            </div>
          </div>

          {/* Request Classification */}
          <div className="space-y-3 p-4 rounded-lg bg-slate-50/70 border border-slate-200">
            <h4 className="text-label font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Request Classification</span>
            </h4>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Type:</span>
              <span className="font-semibold text-slate-800 capitalize">{(ticket.type || ticket.category).replaceAll('_', ' ').toLowerCase()}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Request:</span>
              <span className="max-w-40 truncate font-semibold text-slate-800">{ticket.requestTypeName || ticket.ticketTypeName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Urgency:</span>
              <span className="font-mono font-bold text-slate-800">{ticket.urgency || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium">Channel:</span>
              <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 text-label">{ticket.intakeChannel || 'LEGACY'}</span>
            </div>
          </div>

          {/* Risk Metrics Section */}
          <div className="space-y-3 p-4 rounded-lg bg-slate-50/70 border border-slate-200">
            <h4 className="text-label font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Risk & Severity Ratings</span>
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Inherent Risk:</span>
              <Badge type="SEVERITY" value={ticket.inherentRisk} size="sm" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Residual Risk:</span>
              <Badge type="SEVERITY" value={ticket.residualRisk} size="sm" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Calculated Risk:</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ticket.riskScore >= 80 ? 'bg-rose-500' : ticket.riskScore >= 50 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${ticket.riskScore}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-800">{ticket.riskScore}/100</span>
              </div>
            </div>
          </div>

          {/* Dates & SLA Milestones */}
          <div className="space-y-3 p-4 rounded-lg bg-slate-50/70 border border-slate-200">
            <h4 className="text-label font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Dates & Deadlines</span>
            </h4>

            <div className="flex items-center justify-between text-label">
              <span className="text-slate-500 font-medium">Created:</span>
              <span className="font-mono text-slate-800">{new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-between text-label">
              <span className="text-slate-500 font-medium">Remediation SLA:</span>
              <span className="font-mono text-amber-600 font-bold">{new Date(ticket.remediationDeadline).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center justify-between text-label">
              <span className="text-slate-500 font-medium">Hard Due Date:</span>
              <span className="font-mono text-slate-800 font-semibold">{new Date(ticket.dueDate).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <div className="space-y-2 p-4 rounded-lg bg-slate-50/70 border border-slate-200">
              <h4 className="text-label font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Tags & Compliance</span>
              </h4>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ticket.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white text-blue-700 border border-blue-200 text-caption font-mono font-medium shadow-xs"
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
        <div className="fixed inset-0 z-dsOverlay flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Transition to: {selectedTransition.name}
              </h3>
              <button
                onClick={() => setSelectedTransition(null)}
                className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {selectedTransition.requireEvidence && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Notice: Evidence attachments are required before submitting for retest.</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-800">
                Transition Justification Comment {selectedTransition.requireComment && <span className="text-rose-500">(Mandatory)</span>}
              </label>
              <textarea
                rows={3}
                required={selectedTransition.requireComment}
                value={transitionComment}
                onChange={(e) => setTransitionComment(e.target.value)}
                placeholder="Enter justification for workflow state change..."
                className="jira-input font-normal"
              />
            </div>

            {selectedTransition.requiredFields?.includes('resolutionCode') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Resolution Code</label>
                <select value={resolutionCode} onChange={(event) => setResolutionCode(event.target.value)} className="jira-input">
                  {['FIXED', 'WORKAROUND', 'DUPLICATE', 'FALSE_POSITIVE', 'USER_ERROR', 'KNOWN_ISSUE', 'REJECTED', 'CANCELLED', 'NO_ACTION_REQUIRED', 'MITIGATED', 'RISK_ACCEPTED'].map((code) => (
                    <option key={code} value={code}>{code.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedTransition.requiredFields?.includes('resolutionSummary') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Resolution Summary</label>
                <textarea
                  rows={3}
                  value={resolutionSummary}
                  onChange={(event) => setResolutionSummary(event.target.value)}
                  placeholder="Describe the outcome, evidence, and any remaining risk..."
                  className="jira-input font-normal"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setSelectedTransition(null)}
                className="jira-btn-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTransition}
                disabled={
                  isTransitioning ||
                  (selectedTransition.requireComment && !transitionComment.trim()) ||
                  (selectedTransition.requiredFields?.includes('resolutionSummary') && !resolutionSummary.trim())
                }
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
