import React, { useState, useEffect } from 'react';
import {
  X,
  Maximize2,
  Copy,
  Check,
  Clock,
  User,
  Shield,
  Send,
  UserCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Activity,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { WorkflowTransition } from '../../../../shared/types/workflow.js';
import { useAuth } from '../../../context/AuthContext.js';
import { useI18n } from '../../../context/I18nContext.js';
import { Badge } from '../../common/Badge.js';
import { SLARing } from '../../common/SLARing.js';

interface AliveTicketInspectorProps {
  ticket: Ticket;
  transitions?: WorkflowTransition[];
  onClose: () => void;
  onExpandFull?: (ticket: Ticket) => void;
  onTransition?: (transitionId: string) => Promise<void>;
  onAddComment?: (content: string) => Promise<void>;
  onClaim?: () => Promise<void>;
}

export const AliveTicketInspector: React.FC<AliveTicketInspectorProps> = ({
  ticket,
  transitions = [],
  onClose,
  onExpandFull,
  onTransition,
  onAddComment,
  onClaim,
}) => {
  const { currentUser, allUsers } = useAuth();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'comments' | 'activity'>('overview');
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(ticket.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !onAddComment) return;
    setIsSubmitting(true);
    try {
      await onAddComment(commentText.trim());
      setCommentText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransitionClick = async (transitionId: string) => {
    if (!onTransition || isTransitioning) return;
    setIsTransitioning(true);
    try {
      await onTransition(transitionId);
    } finally {
      setIsTransitioning(false);
    }
  };

  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);
  const reporter = allUsers.find((u) => u.id === ticket.reporterId);
  const canClaim = !ticket.assigneeId && ticket.statusCategory !== 'DONE' && onClaim;

  return (
    <aside
      aria-label="Ticket Inspector"
      className="alive-inspector-panel w-full sm:w-[480px] lg:w-[520px] bg-semantic-panel h-full flex flex-col shrink-0 select-none z-dsSticky border-l border-semantic-border"
      style={{ animation: 'alive-panel-slide 240ms cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-semantic-border bg-semantic-subtle/40">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopyKey}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-semantic-panel border border-semantic-border hover:border-[#00F576]/50 text-xs font-mono font-bold text-[#00F576] transition-colors"
            title={t('Click to copy key')}
          >
            <span>{ticket.key}</span>
            {copied ? <Check className="w-3 h-3 text-[#00F576]" /> : <Copy className="w-3 h-3 opacity-60" />}
          </button>

          <span
            className={`px-2.5 py-0.5 rounded-full text-caption font-bold border ${
              ticket.statusCategory === 'DONE'
                ? 'bg-[#00F576]/10 text-[#00F576] border-[#00F576]/30'
                : ticket.statusCategory === 'IN_PROGRESS'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
            }`}
          >
            {ticket.statusName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onExpandFull && (
            <button
              type="button"
              onClick={() => onExpandFull(ticket)}
              className="p-1.5 text-semantic-muted hover:text-semantic-primary rounded-lg hover:bg-semantic-subtle transition-colors"
              title={t('Open full ticket')}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-semantic-muted hover:text-semantic-primary rounded-lg hover:bg-semantic-subtle transition-colors"
            title={t('Close inspector (Esc)')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Title & Quick Actions */}
      <div className="p-5 border-b border-semantic-border bg-semantic-panel">
        <h2 className="text-base font-bold text-semantic-strongest leading-snug tracking-tight mb-3">
          {ticket.title}
        </h2>

        {/* Action Button Strip */}
        <div className="flex flex-wrap items-center gap-2">
          {canClaim && (
            <button
              type="button"
              onClick={onClaim}
              className="alive-btn-primary text-xs py-1.5 px-3"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('Claim to Myself')}</span>
            </button>
          )}

          {transitions.slice(0, 2).map((tr) => (
            <button
              key={tr.id}
              type="button"
              disabled={isTransitioning}
              onClick={() => handleTransitionClick(tr.id)}
              className="alive-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              <span>{tr.name}</span>
              <ArrowRight className="w-3 h-3 text-[#00F576]" />
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-semantic-border px-5 bg-semantic-subtle/30">
        {(['overview', 'comments', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all capitalize ${
              activeTab === tab
                ? 'border-[#00F576] text-[#00F576]'
                : 'border-transparent text-semantic-muted hover:text-semantic-primary'
            }`}
          >
            {t(tab)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        {activeTab === 'overview' && (
          <>
            {/* Description Card */}
            <div className="bg-semantic-subtle/50 p-3.5 rounded-xl border border-semantic-border">
              <div className="text-caption font-mono uppercase font-bold text-semantic-muted mb-1.5">
                {t('Description')}
              </div>
              <p className="text-xs text-semantic-secondary leading-relaxed whitespace-pre-wrap">
                {ticket.description || t('No description provided for this work item.')}
              </p>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-semantic-subtle/40 rounded-xl border border-semantic-border">
                <div className="text-caption text-semantic-muted font-mono uppercase font-bold mb-1">
                  {t('Severity')}
                </div>
                <div className="font-semibold text-semantic-primary flex items-center gap-1.5">
                  <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                </div>
              </div>

              <div className="p-3 bg-semantic-subtle/40 rounded-xl border border-semantic-border">
                <div className="text-caption text-semantic-muted font-mono uppercase font-bold mb-1">
                  {t('SLA Status')}
                </div>
                <div className="font-semibold text-semantic-primary flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00F576] animate-pulse" />
                  <span>{ticket.slaState || 'WITHIN_SLA'}</span>
                </div>
              </div>

              <div className="p-3 bg-semantic-subtle/40 rounded-xl border border-semantic-border">
                <div className="text-caption text-semantic-muted font-mono uppercase font-bold mb-1">
                  {t('Assignee')}
                </div>
                <div className="font-semibold text-semantic-primary truncate">
                  {assignee ? assignee.fullName : t('Unassigned')}
                </div>
              </div>

              <div className="p-3 bg-semantic-subtle/40 rounded-xl border border-semantic-border">
                <div className="text-caption text-semantic-muted font-mono uppercase font-bold mb-1">
                  {t('Reporter')}
                </div>
                <div className="font-semibold text-semantic-primary truncate">
                  {reporter ? reporter.fullName : t('System')}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'comments' && (
          <div className="flex flex-col h-full space-y-3">
            <div className="flex-1 text-xs text-semantic-muted py-6 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div>{t('No comments yet on this record.')}</div>
            </div>

            {/* Quick Comment Composer */}
            <form onSubmit={handleCommentSubmit} className="relative mt-auto">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('Add an operational comment...')}
                className="w-full bg-semantic-subtle border border-semantic-border rounded-xl px-3.5 py-2.5 text-xs text-semantic-primary placeholder-semantic-muted focus:outline-none focus:border-[#00F576] pr-10"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || isSubmitting}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#00F576] hover:text-[#00DC6A] disabled:opacity-30 rounded-lg"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3 p-3 bg-semantic-subtle/40 rounded-xl border border-semantic-border">
              <Clock className="w-4 h-4 text-[#00F576] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-semantic-primary">{t('Work item created')}</div>
                <div className="text-caption text-semantic-muted font-mono">
                  {new Date(ticket.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
            {ticket.updatedAt && ticket.updatedAt !== ticket.createdAt && (
              <div className="flex items-start gap-3 p-3 bg-semantic-subtle/40 rounded-xl border border-semantic-border">
                <Activity className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-semantic-primary">{t('Status updated')}</div>
                  <div className="text-caption text-semantic-muted font-mono">
                    {new Date(ticket.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
