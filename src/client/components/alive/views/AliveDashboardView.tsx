import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  ArrowRight,
  UserCheck,
  Activity,
  Plus,
  Server,
  Zap,
  Flame,
  FileText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { useAuth } from '../../../context/AuthContext.js';
import { useI18n } from '../../../context/I18nContext.js';
import { Badge } from '../../common/Badge.js';

interface AliveDashboardViewProps {
  tickets: Ticket[];
  pendingApprovalsCount: number;
  onSelectTicket: (ticket: Ticket) => void;
  onNavigate: (destination: string) => void;
  onOpenCreate: () => void;
}

export const AliveDashboardView: React.FC<AliveDashboardViewProps> = ({
  tickets,
  pendingApprovalsCount,
  onSelectTicket,
  onNavigate,
  onOpenCreate,
}) => {
  const { currentUser } = useAuth();
  const { t } = useI18n();

  // 1. WHAT NEEDS ME NOW (Directly actionable items)
  const slaRisks = tickets.filter(
    (t) => (t.slaState === 'BREACHED' || t.slaState === 'AT_RISK') && t.statusCategory !== 'DONE'
  );

  const criticalIssues = tickets.filter(
    (t) => t.technicalSeverity === 'CRITICAL' && t.statusCategory !== 'DONE'
  );

  const myAssignedOpen = tickets.filter(
    (t) => t.assigneeId === currentUser?.id && t.statusCategory !== 'DONE'
  );

  const unassignedDeptTasks = tickets.filter(
    (t) =>
      !t.assigneeId &&
      t.statusCategory !== 'DONE' &&
      ((t.targetDepartmentId && t.targetDepartmentId === currentUser?.departmentId) ||
        (t.departmentId && t.departmentId === currentUser?.departmentId))
  );

  // 2. REAL ACTIVITY STREAM (Generated from genuine ticket modifications)
  const realRecentActivities = [...tickets]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 6);

  // SLA Compliance calculation
  const totalClosedOrActive = tickets.length || 1;
  const compliantCount = tickets.filter((t) => t.slaState !== 'BREACHED').length;
  const slaRate = Math.round((compliantCount / totalClosedOrActive) * 100);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full custom-scrollbar select-none">
      {/* Welcome & Command Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00F576] alive-status-pulse" />
            <h1 className="text-xl sm:text-2xl font-bold text-semantic-strongest tracking-tight">
              {t('Alive Command Studio')}
            </h1>
          </div>
          <p className="text-xs text-semantic-secondary mt-1">
            {t('Real-time operational posture & immediate action items for')} <span className="font-semibold text-[#00F576]">{currentUser?.fullName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCreate}
            className="alive-btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span>{t('New Security Task')}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: WHAT NEEDS IMMEDIATE ATTENTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-mono text-label uppercase font-bold text-semantic-muted tracking-wider">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>{t('Immediate Attention Queue')}</span>
          </div>
          <span className="text-caption font-mono text-semantic-muted">
            {slaRisks.length + pendingApprovalsCount + criticalIssues.length} {t('actionable alerts')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* SLA At Risk / Breached */}
          <div className="alive-card p-4 flex flex-col justify-between border-rose-500/20 bg-gradient-to-br from-semantic-panel to-rose-950/10">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono text-label font-bold text-rose-400 uppercase">{t('SLA At Risk')}</span>
                <Clock className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold text-semantic-strongest font-mono">
                {slaRisks.length}
              </div>
              <p className="text-caption text-semantic-secondary mt-1">
                {slaRisks.length > 0 ? t('Tickets requiring urgent triage to meet banking SLA.') : t('All active tickets within compliance SLA.')}
              </p>
            </div>
            {slaRisks.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectTicket(slaRisks[0])}
                className="mt-3 flex items-center justify-between text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors pt-2 border-t border-rose-500/20"
              >
                <span>{t('Triage Next')} ({slaRisks[0].key})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Pending Dual-Control Approvals */}
          <div className="alive-card p-4 flex flex-col justify-between border-amber-500/20 bg-gradient-to-br from-semantic-panel to-amber-950/10">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono text-label font-bold text-amber-400 uppercase">{t('Maker-Checker Queue')}</span>
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-semantic-strongest font-mono">
                {pendingApprovalsCount}
              </div>
              <p className="text-caption text-semantic-secondary mt-1">
                {pendingApprovalsCount > 0 ? t('Cryptographic sign-offs waiting for your review.') : t('No pending approvals assigned to you.')}
              </p>
            </div>
            {pendingApprovalsCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="mt-3 flex items-center justify-between text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors pt-2 border-t border-amber-500/20"
              >
                <span>{t('Review Approvals')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Critical Severity Incidents */}
          <div className="alive-card p-4 flex flex-col justify-between border-red-500/20 bg-gradient-to-br from-semantic-panel to-red-950/10">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono text-label font-bold text-red-400 uppercase">{t('Critical CVEs / SecOps')}</span>
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-2xl font-bold text-semantic-strongest font-mono">
                {criticalIssues.length}
              </div>
              <p className="text-caption text-semantic-secondary mt-1">
                {criticalIssues.length > 0 ? t('Active P1 critical security events.') : t('Zero active critical vulnerabilities.')}
              </p>
            </div>
            {criticalIssues.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectTicket(criticalIssues[0])}
                className="mt-3 flex items-center justify-between text-xs font-semibold text-red-400 hover:text-red-300 transition-colors pt-2 border-t border-red-500/20"
              >
                <span>{t('Inspect')} ({criticalIssues[0].key})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department Queue to Claim */}
          <div className="alive-card p-4 flex flex-col justify-between border-[#00F576]/20 bg-gradient-to-br from-semantic-panel to-emerald-950/15">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono text-label font-bold text-[#00F576] uppercase">{t('Unassigned Queue')}</span>
                <UserCheck className="w-4 h-4 text-[#00F576]" />
              </div>
              <div className="text-2xl font-bold text-semantic-strongest font-mono">
                {unassignedDeptTasks.length}
              </div>
              <p className="text-caption text-semantic-secondary mt-1">
                {unassignedDeptTasks.length > 0 ? t('Department items available to claim.') : t('All department items currently assigned.')}
              </p>
            </div>
            {unassignedDeptTasks.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectTicket(unassignedDeptTasks[0])}
                className="mt-3 flex items-center justify-between text-xs font-semibold text-[#00F576] hover:text-[#00DC6A] transition-colors pt-2 border-t border-[#00F576]/20"
              >
                <span>{t('Claim First')} ({unassignedDeptTasks[0].key})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: WORK DISTRIBUTION & LIVE REAL ACTIVITY STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: My Active Tasks Table preview */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-label uppercase font-bold text-semantic-muted tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00F576]" />
              <span>{t('My Active Work Items')} ({myAssignedOpen.length})</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('my-tasks')}
              className="text-xs text-[#00F576] hover:underline font-semibold flex items-center gap-1"
            >
              <span>{t('View all tasks')}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="alive-card overflow-hidden divide-y divide-semantic-border">
            {myAssignedOpen.length === 0 ? (
              <div className="py-10 text-center text-semantic-muted text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[#00F576] opacity-75" />
                <div className="font-semibold text-sm text-semantic-primary">{t('You are all caught up!')}</div>
                <div className="mt-0.5">{t('No active tasks currently assigned to your account.')}</div>
              </div>
            ) : (
              myAssignedOpen.slice(0, 5).map((tkt) => (
                <div
                  key={tkt.id}
                  onClick={() => onSelectTicket(tkt)}
                  className="alive-interactive-row p-3.5 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-xs text-[#00F576] shrink-0">
                      {tkt.key}
                    </span>
                    <span className="font-semibold text-xs text-semantic-primary truncate">
                      {tkt.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Badge type="SEVERITY" value={tkt.technicalSeverity} />
                    <span className="px-2 py-0.5 rounded-full text-caption font-bold bg-semantic-subtle text-semantic-secondary border border-semantic-border">
                      {tkt.statusName}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-semantic-muted" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Col: Live Real Event Stream */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-label uppercase font-bold text-semantic-muted tracking-wider flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('Live Event Stream')}</span>
            </div>
            <span className="text-caption font-mono text-[#00F576] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F576] animate-pulse" />
              {t('Streaming')}
            </span>
          </div>

          <div className="alive-card p-3 space-y-2">
            {realRecentActivities.length === 0 ? (
              <div className="py-6 text-center text-semantic-muted text-xs">
                {t('No operational activity recorded yet.')}
              </div>
            ) : (
              realRecentActivities.map((act) => (
                <div
                  key={act.id}
                  onClick={() => onSelectTicket(act)}
                  className="p-2.5 rounded-xl hover:bg-semantic-hover cursor-pointer transition-colors border border-transparent hover:border-semantic-border"
                >
                  <div className="flex items-center justify-between gap-2 text-micro font-mono text-semantic-muted mb-0.5">
                    <span className="text-[#00F576] font-bold">{act.key}</span>
                    <span>{new Date(act.updatedAt || act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-xs font-semibold text-semantic-primary truncate">
                    {act.title}
                  </div>
                  <div className="text-caption text-semantic-secondary mt-0.5">
                    {t('Status')}: <span className="font-semibold text-semantic-strong">{act.statusName}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
