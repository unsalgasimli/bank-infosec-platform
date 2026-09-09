import React from 'react';
import {
  CheckSquare,
  CheckCircle2,
  Inbox,
  Clock,
  ArrowRight,
  Shield,
  AlertTriangle,
  User,
  Plus,
  TrendingUp,
  Workflow,
  FilePlus2,
  ListChecks,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import {
  formatDepartmentName,
  formatSecurityClearance,
  formatRoleTitle,
} from '../../utils/formatters.js';

const ELEVATED_WORKSPACE_ROLES = [
  'PLATFORM_ADMIN',
  'DEPARTMENT_ADMIN',
  'INFOSEC_ADMIN',
  'IT_ADMIN',
  'HR_ADMIN',
  'CORE_BANK_ADMIN',
  'LEGAL_ADMIN',
  'CISO',
  'INFOSEC_MANAGER',
  'TEAM_LEAD',
  'SECURITY_ANALYST',
  'SOC_ANALYST',
  'GRC_ANALYST',
  'APPSEC_ANALYST',
  'DLP_ANALYST',
  'VULN_ANALYST',
  'AUDITOR',
  'DEPARTMENT_MANAGER',
  'RISK_OWNER',
  'APPLICATION_OWNER',
  'ASSET_OWNER',
] as const;

interface MyWorkOverviewViewProps {
  tickets: Ticket[];
  pendingApprovalsCount: number;
  onSelectTicket: (ticket: Ticket) => void;
  onNavigate: (destination: string) => void;
  onOpenCreate: () => void;
}

export const MyWorkOverviewView: React.FC<MyWorkOverviewViewProps> = ({
  tickets,
  pendingApprovalsCount,
  onSelectTicket,
  onNavigate,
  onOpenCreate,
}) => {
  const { currentUser } = useAuth();
  const { t, language } = useI18n();

  const isSimpleUser = Boolean(
    currentUser &&
      !currentUser.roles.some((role) =>
        ELEVATED_WORKSPACE_ROLES.includes(role as (typeof ELEVATED_WORKSPACE_ROLES)[number])
      )
  );

  const myAssignedTickets = tickets.filter(
    (t) =>
      t.assigneeId === currentUser?.id ||
      (!t.assigneeId && (
        (t.targetDepartmentId && t.targetDepartmentId === currentUser?.departmentId) ||
        (t.departmentId && t.departmentId === currentUser?.departmentId) ||
        (t.assignmentGroupId && currentUser?.teamIds?.includes(t.assignmentGroupId)) ||
        t.participatingDepartmentIds?.includes(currentUser?.departmentId || '')
      ))
  );

  const myOpenTickets = myAssignedTickets.filter((t) => t.statusCategory !== 'DONE');
  const myCompletedTickets = myAssignedTickets.filter((t) => t.statusCategory === 'DONE');

  const myRequests = tickets.filter(
    (t) => t.reporterId === currentUser?.id
  );

  const urgentSlaTickets = myOpenTickets.filter(
    (t) => t.slaState === 'BREACHED' || t.slaState === 'AT_RISK' || t.technicalSeverity === 'CRITICAL'
  );

  const clearance = formatSecurityClearance(currentUser?.securityClearance, language);
  const formattedDept = formatDepartmentName(currentUser?.departmentId, language);
  const formattedRole = formatRoleTitle(currentUser?.roles?.[0], language);

  if (isSimpleUser) {
    return (
      <SimpleUserOverview
        currentUser={currentUser}
        myOpenTickets={myOpenTickets}
        myRequests={myRequests}
        pendingApprovalsCount={pendingApprovalsCount}
        urgentSlaTickets={urgentSlaTickets}
        onSelectTicket={onSelectTicket}
        onNavigate={onNavigate}
        onOpenCreate={onOpenCreate}
        t={t}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-7 space-y-5 bg-semantic-subtle custom-scrollbar select-none">
      {/* Integrated Executive Command Banner */}
      <div className="wrike-card p-5 md:p-6 bg-gradient-to-r from-semantic-panel via-semantic-panel to-semantic-subtle/80 border border-semantic-border rounded-2xl shadow-xs space-y-4">
        {/* Top Tier: Identity & Primary Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg md:text-xl font-bold text-semantic-primary tracking-tight truncate">{currentUser?.fullName ? `${t('Welcome back')}, ${currentUser.fullName}` : t('Welcome back')}</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success border border-semantic-success-border text-xs font-bold font-mono">
                  {formattedRole}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-semantic-muted mt-1 flex-wrap">
                <span>{formattedDept}</span>
                <span>•</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${clearance.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${clearance.dotClass}`} />
                  {clearance.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => onNavigate('risk-management')}
              className="wrike-btn-secondary text-xs py-2 px-3 flex items-center gap-2 hover:bg-semantic-subtle transition-colors"
            >
              <TrendingUp className="w-4 h-4 text-semantic-success" />
              <span>{t('Risk Management')}</span>
            </button>
            <button
              onClick={() => onNavigate('workflows')}
              className="wrike-btn-secondary text-xs py-2 px-3 flex items-center gap-2 hover:bg-semantic-subtle transition-colors"
            >
              <Workflow className="w-4 h-4 text-semantic-success" />
              <span>{t('Workflow Directory')}</span>
            </button>
            <button
              onClick={onOpenCreate}
              className="wrike-btn-primary text-xs py-2 px-4 shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{t('New Request')}</span>
            </button>
          </div>
        </div>

        {/* Integrated KPI Metric Dock (Compact, High-Density, Interactive) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3.5 border-t border-semantic-border/50">
          {/* Tile 1: My Active Tasks */}
          <div
            onClick={() => onNavigate('my-tasks')}
            className="group flex items-center justify-between p-3 px-3.5 rounded-xl bg-semantic-subtle/50 hover:bg-semantic-panel border border-semantic-border hover:border-semantic-brand transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate('my-tasks')}
            title={t('My Active Tasks')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-semantic-success-surface text-semantic-success border border-semantic-success-border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CheckSquare className="w-4.5 h-4.5 text-semantic-brand" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-semantic-muted group-hover:text-semantic-primary transition-colors truncate">
                  {t('My Active Tasks')}
                </div>
                <div className="text-xs text-semantic-muted/80 truncate">
                  {myCompletedTickets.length} {t('completed tasks')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <span className="text-2xl font-black font-mono text-semantic-primary group-hover:text-semantic-brand transition-colors">
                {myOpenTickets.length}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-semantic-placeholder group-hover:text-semantic-brand group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          {/* Tile 2: Approvals (Maker-Checker) */}
          <div
            onClick={() => onNavigate('approvals')}
            className="group flex items-center justify-between p-3 px-3.5 rounded-xl bg-semantic-subtle/50 hover:bg-semantic-panel border border-semantic-border hover:border-semantic-warning transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate('approvals')}
            title={t('Approvals')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-semantic-warning-surface text-semantic-warning border border-semantic-warning-border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4.5 h-4.5 text-semantic-warning-bright" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-semantic-muted group-hover:text-semantic-primary transition-colors truncate">
                  {t('Approvals')}
                </div>
                <div className="text-xs text-semantic-muted/80 truncate">
                  {pendingApprovalsCount > 0 ? `${pendingApprovalsCount} ${t('Pending')}` : t('Dual-control sign-offs')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <span className={`text-2xl font-black font-mono ${pendingApprovalsCount > 0 ? 'text-semantic-warning' : 'text-semantic-primary'} group-hover:text-semantic-warning transition-colors`}>
                {pendingApprovalsCount}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-semantic-placeholder group-hover:text-semantic-warning group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          {/* Tile 3: My Requests */}
          <div
            onClick={() => onNavigate('my-requests')}
            className="group flex items-center justify-between p-3 px-3.5 rounded-xl bg-semantic-subtle/50 hover:bg-semantic-panel border border-semantic-border hover:border-semantic-info transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate('my-requests')}
            title={t('My Requests')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-semantic-info-surface text-semantic-info border border-semantic-info-border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Inbox className="w-4.5 h-4.5 text-semantic-info" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-semantic-muted group-hover:text-semantic-primary transition-colors truncate">
                  {t('My Requests')}
                </div>
                <div className="text-xs text-semantic-muted/80 truncate">
                  {t('Submitted by you')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <span className="text-2xl font-black font-mono text-semantic-primary group-hover:text-semantic-info transition-colors">
                {myRequests.length}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-semantic-placeholder group-hover:text-semantic-info group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          {/* Tile 4: Urgent / SLA At-Risk */}
          <div
            onClick={() => onNavigate('my-tasks')}
            className={`group flex items-center justify-between p-3 px-3.5 rounded-xl bg-semantic-subtle/50 hover:bg-semantic-panel border ${
              urgentSlaTickets.length > 0 ? 'border-semantic-danger/60 bg-semantic-danger-surface/20' : 'border-semantic-border'
            } hover:border-semantic-danger transition-all cursor-pointer shadow-2xs hover:shadow-xs`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate('my-tasks')}
            title={t('Urgent / SLA At-Risk')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-lg ${
                urgentSlaTickets.length > 0 ? 'bg-semantic-danger-surface text-semantic-danger border border-semantic-danger-border animate-pulse' : 'bg-semantic-danger-surface/50 text-semantic-danger border border-semantic-danger-border/60'
              } flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                <Clock className="w-4.5 h-4.5 text-semantic-danger" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-semantic-muted group-hover:text-semantic-primary transition-colors truncate">
                  {t('Urgent / SLA At-Risk')}
                </div>
                <div className="text-xs text-semantic-muted/80 truncate">
                  {urgentSlaTickets.length > 0 ? t('Immediate attention') : t('All SLAs Healthy')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <span className={`text-2xl font-black font-mono ${urgentSlaTickets.length > 0 ? 'text-semantic-danger' : 'text-semantic-primary'} group-hover:text-semantic-danger transition-colors`}>
                {urgentSlaTickets.length}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-semantic-placeholder group-hover:text-semantic-danger group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* Primary Priority Tasks Section (Full Width) */}
      <div className="wrike-card p-6 rounded-2xl space-y-4 shadow-xs bg-semantic-panel">
        <div className="flex items-center justify-between border-b border-semantic-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <CheckSquare className="w-5 h-5 text-semantic-brand" />
            <h2 className="font-bold text-sm text-semantic-primary">{t('High-Priority Work Assigned to You')}</h2>
          </div>
          <button
            onClick={() => onNavigate('my-tasks')}
            className="text-xs font-bold text-semantic-info hover:underline flex items-center gap-1"
          >
            {t('View All Tasks')} ({myOpenTickets.length}) →
          </button>
        </div>

        <div className="space-y-3">
          {myOpenTickets.length === 0 ? (
            <div className="py-12 text-center text-semantic-muted">
              <div className="w-12 h-12 rounded-2xl bg-semantic-success-surface text-semantic-success flex items-center justify-center mx-auto mb-3 text-base font-bold">
                ✓
              </div>
              <div className="font-bold text-sm text-semantic-primary">{t('No pending tasks!')}</div>
              <div className="text-xs text-semantic-muted mt-1">{t('You have zero outstanding tickets on your queue.')}</div>
            </div>
          ) : (
            myOpenTickets.slice(0, 8).map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className="p-4 rounded-xl border border-semantic-border hover:border-semantic-brand bg-semantic-panel hover:bg-semantic-subtle transition-all cursor-pointer flex items-center justify-between gap-4 shadow-2xs group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="font-mono text-xs font-bold text-semantic-info bg-semantic-info-surface px-2.5 py-1 rounded border border-semantic-info-border shrink-0">
                    {ticket.key}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-semantic-primary group-hover:text-semantic-brand transition-colors truncate">
                      {ticket.title}
                    </div>
                    <div className="text-label text-semantic-muted flex items-center gap-2 mt-1">
                      <span>{t(ticket.ticketTypeName || ticket.category)}</span>
                      <span>•</span>
                      <span>{t(ticket.statusName)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge type="SEVERITY" value={ticket.technicalSeverity} size="sm" />
                  <Badge type="SLA" value={ticket.slaState || 'SAFE'} size="sm" />
                  <ArrowRight className="w-4 h-4 text-semantic-placeholder group-hover:text-semantic-primary transition-colors ml-1" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface SimpleUserOverviewProps {
  currentUser: ReturnType<typeof useAuth>['currentUser'];
  myOpenTickets: Ticket[];
  myRequests: Ticket[];
  pendingApprovalsCount: number;
  urgentSlaTickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onNavigate: (destination: string) => void;
  onOpenCreate: () => void;
  t: (text: string) => string;
}

const SimpleUserOverview: React.FC<SimpleUserOverviewProps> = ({
  currentUser,
  myOpenTickets,
  myRequests,
  pendingApprovalsCount,
  urgentSlaTickets,
  onSelectTicket,
  onNavigate,
  onOpenCreate,
  t,
}) => {
  const recentRequests = [...myRequests]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, 4);

  return (
    <div className="flex-1 overflow-y-auto bg-semantic-subtle custom-scrollbar">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-5 md:p-8">
        <section className="wrike-card flex flex-col gap-5 rounded-2xl border border-semantic-border bg-semantic-panel p-6 shadow-sm md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-semantic-brand text-xl font-black text-white shadow-md">
              {currentUser?.fullName.split(' ').map((name) => name[0]).join('') || '?'}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-semantic-muted">Mənim iş sahəm</p>
              <h1 className="text-2xl font-bold tracking-tight text-semantic-primary">
                Salam, {currentUser?.fullName || 'istifadəçi'}
              </h1>
              <p className="mt-1 text-sm text-semantic-muted">Burada sizin üçün vacib olan işlər görünür.</p>
            </div>
          </div>
          <button
            onClick={onOpenCreate}
            className="wrike-btn-primary flex min-h-11 items-center justify-center gap-2 px-5 text-sm shadow-sm"
          >
            <FilePlus2 className="h-4 w-4" />
            <span>{t('New Request')}</span>
          </button>
        </section>

        <section aria-labelledby="simple-user-actions-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="simple-user-actions-title" className="text-lg font-bold text-semantic-primary">Nə etmək istəyirsiniz?</h2>
              <p className="mt-1 text-sm text-semantic-muted">Ən çox istifadə olunan keçidlər</p>
            </div>
            {urgentSlaTickets.length > 0 && (
              <button
                onClick={() => onNavigate('my-tasks')}
                className="flex items-center gap-1.5 rounded-full border border-semantic-danger-border bg-semantic-danger-surface px-3 py-1.5 text-xs font-bold text-semantic-danger"
              >
                <Clock className="h-3.5 w-3.5" />
                {urgentSlaTickets.length} təcili iş
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              onClick={() => onNavigate('my-requests')}
              className="group rounded-2xl border border-semantic-border bg-semantic-panel p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-semantic-info hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-semantic-info-surface text-semantic-info">
                  <Inbox className="h-5 w-5" />
                </div>
                <span className="text-3xl font-black tracking-tight text-semantic-primary">{myRequests.length}</span>
              </div>
              <h3 className="mt-5 text-base font-bold text-semantic-primary">{t('My Requests')}</h3>
              <p className="mt-1 text-sm text-semantic-muted">Açdığınız və izlədiyiniz müraciətlər</p>
              <span className="mt-5 flex items-center gap-1 text-sm font-bold text-semantic-info">
                Müraciətlərə bax <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </button>

            <button
              onClick={() => onNavigate('my-tasks')}
              className="group rounded-2xl border border-semantic-border bg-semantic-panel p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-semantic-brand hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-semantic-success-surface text-semantic-brand">
                  <ListChecks className="h-5 w-5" />
                </div>
                <span className="text-3xl font-black tracking-tight text-semantic-primary">{myOpenTickets.length}</span>
              </div>
              <h3 className="mt-5 text-base font-bold text-semantic-primary">Sizə təyin olunanlar</h3>
              <p className="mt-1 text-sm text-semantic-muted">Cavab və ya icra gözləyən tapşırıqlar</p>
              <span className="mt-5 flex items-center gap-1 text-sm font-bold text-semantic-brand">
                Tapşırıqlara bax <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          </div>
        </section>

        {pendingApprovalsCount > 0 && (
          <button
            onClick={() => onNavigate('approvals')}
            className="flex flex-col gap-3 rounded-2xl border border-semantic-warning-border bg-semantic-warning-surface p-4 text-left transition hover:border-semantic-warning md:flex-row md:items-center md:justify-between md:p-5"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" />
              <div>
                <p className="text-sm font-bold text-semantic-primary">Sizin təsdiqinizi gözləyən iş var</p>
                <p className="mt-0.5 text-sm text-semantic-muted">{pendingApprovalsCount} müraciət növbəti addım üçün təsdiqinizi gözləyir.</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-sm font-bold text-semantic-warning md:shrink-0">
              {t('Open Approval Center')} <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        )}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
          <div className="wrike-card rounded-2xl border border-semantic-border bg-semantic-panel p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-semantic-border pb-4">
              <div>
                <h2 className="text-base font-bold text-semantic-primary">Sizə təyin olunan tapşırıqlar</h2>
                <p className="mt-1 text-sm text-semantic-muted">Növbəti addımı tələb edən işlər</p>
              </div>
              <button onClick={() => onNavigate('my-tasks')} className="text-sm font-bold text-semantic-info hover:underline">
                Hamısına bax
              </button>
            </div>
            {myOpenTickets.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-success-surface text-lg font-bold text-semantic-success">✓</div>
                <p className="text-sm font-bold text-semantic-primary">Hazırda açıq tapşırığınız yoxdur</p>
                <p className="mt-1 text-sm text-semantic-muted">Yeni iş təyin olunanda burada görünəcək.</p>
              </div>
            ) : (
              <div className="divide-y divide-semantic-border">
                {myOpenTickets.slice(0, 5).map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className="group flex w-full items-center justify-between gap-4 py-4 text-left first:pt-5 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded border border-semantic-info-border bg-semantic-info-surface px-2 py-0.5 font-mono text-xs font-bold text-semantic-info">{ticket.key}</span>
                        <span className="truncate text-sm font-semibold text-semantic-primary group-hover:text-semantic-brand">{ticket.title}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-semantic-muted">{ticket.ticketTypeName || ticket.category} · {ticket.statusName}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-semantic-placeholder transition group-hover:translate-x-1 group-hover:text-semantic-primary" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="wrike-card rounded-2xl border border-semantic-border bg-semantic-panel p-5 shadow-sm md:p-6">
            <div className="border-b border-semantic-border pb-4">
              <h2 className="text-base font-bold text-semantic-primary">Faydalı keçidlər</h2>
              <p className="mt-1 text-sm text-semantic-muted">Tez-tez istifadə olunan bölmələr</p>
            </div>
            <div className="mt-2 divide-y divide-semantic-border">
              <button onClick={onOpenCreate} className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-semantic-primary hover:text-semantic-brand">
                <span className="flex items-center gap-3"><FilePlus2 className="h-4 w-4 text-semantic-brand" />Yeni müraciət yarat</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => onNavigate('my-requests')} className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-semantic-primary hover:text-semantic-brand">
                <span className="flex items-center gap-3"><Inbox className="h-4 w-4 text-semantic-info" />{t('My Requests')}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => onNavigate('knowledge-base')} className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-semantic-primary hover:text-semantic-brand">
                <span className="flex items-center gap-3"><BookOpen className="h-4 w-4 text-semantic-warning" />{t('Knowledge Base')}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {recentRequests.length > 0 && (
          <section className="wrike-card rounded-2xl border border-semantic-border bg-semantic-panel p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-semantic-primary">Son müraciətləriniz</h2>
                <p className="mt-1 text-sm text-semantic-muted">Açdığınız müraciətlərin son vəziyyəti</p>
              </div>
              <button onClick={() => onNavigate('my-requests')} className="text-sm font-bold text-semantic-info hover:underline">Hamısına bax</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {recentRequests.map((ticket) => (
                <button key={ticket.id} onClick={() => onSelectTicket(ticket)} className="flex items-center justify-between gap-3 rounded-xl border border-semantic-border p-3 text-left transition hover:border-semantic-info hover:bg-semantic-subtle">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-semantic-info">{ticket.key}</span>
                    <p className="mt-1 truncate text-sm font-semibold text-semantic-primary">{ticket.title}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-semantic-subtle px-2.5 py-1 text-xs font-semibold text-semantic-muted">{ticket.statusName}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
