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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';

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

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-semantic-subtle custom-scrollbar select-none">
      {/* Welcome Banner */}
      <div className="wrike-card p-6 md:p-7 bg-gradient-to-r from-semantic-panel via-semantic-subtle to-semantic-success-surface/40 border border-semantic-border rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-semantic-brand text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
            {currentUser?.fullName.split(' ').map((n) => n[0]).join('') || '?'}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-semantic-primary">
                Welcome back{currentUser?.fullName ? `, ${currentUser.fullName}` : ''}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success border border-semantic-success-border text-xs font-bold font-mono">
                {currentUser?.roles[0] || 'NO ROLE'}
              </span>
            </div>
            <p className="text-xs text-semantic-muted mt-1">
              {currentUser?.departmentId || 'No department assigned'} • Security Clearance: <strong className="text-semantic-success">{currentUser?.securityClearance || 'Not assigned'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('risk-management')}
            className="wrike-btn-secondary text-xs py-2 px-3.5 flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4 text-semantic-success" />
            <span>Risk Management</span>
          </button>
          <button
            onClick={() => onNavigate('workflows')}
            className="wrike-btn-secondary text-xs py-2 px-3.5 flex items-center gap-2"
          >
            <Workflow className="w-4 h-4 text-semantic-success" />
            <span>Workflow kataloqu</span>
          </button>
          <button
            onClick={onOpenCreate}
            className="wrike-btn-primary text-xs py-2 px-4 shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* 4 Core Summary Metric KPI Cards with Generous Internal Padding & Spacing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: My Open Tasks */}
        <div
          onClick={() => onNavigate('my-tasks')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-semantic-brand hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-semantic-panel flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-semantic-muted">My Active Tasks</span>
              <div className="p-2.5 rounded-xl bg-semantic-success-surface text-semantic-success border border-semantic-success-border group-hover:scale-105 transition-transform">
                <CheckSquare className="w-4.5 h-4.5 text-semantic-brand" />
              </div>
            </div>
            <div className="text-3xl font-black text-semantic-primary font-mono tracking-tight my-1">
              {myOpenTickets.length}
            </div>
          </div>

          <div className="text-xs text-semantic-muted mt-4 pt-3 border-t border-semantic-neutral-surface flex items-center justify-between">
            <span>{myCompletedTickets.length} completed tasks</span>
            <span className="text-semantic-brand font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              View →
            </span>
          </div>
        </div>

        {/* Card 2: Pending Approvals */}
        <div
          onClick={() => onNavigate('approvals')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-semantic-warning hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-semantic-panel flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-semantic-muted">Maker-Checker Approvals</span>
              <div className="p-2.5 rounded-xl bg-semantic-warning-surface text-semantic-warning border border-semantic-warning-border group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4.5 h-4.5 text-semantic-warning-bright" />
              </div>
            </div>
            <div className="text-3xl font-black text-semantic-warning font-mono tracking-tight my-1">
              {pendingApprovalsCount}
            </div>
          </div>

          <div className="text-xs text-semantic-muted mt-4 pt-3 border-t border-semantic-neutral-surface flex items-center justify-between">
            <span>Dual-control sign-offs</span>
            <span className="text-semantic-warning font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Review →
            </span>
          </div>
        </div>

        {/* Card 3: My Requests */}
        <div
          onClick={() => onNavigate('my-requests')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-semantic-info hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-semantic-panel flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-semantic-muted">My Requests</span>
              <div className="p-2.5 rounded-xl bg-semantic-info-surface text-semantic-info border border-semantic-info-border group-hover:scale-105 transition-transform">
                <Inbox className="w-4.5 h-4.5 text-semantic-info" />
              </div>
            </div>
            <div className="text-3xl font-black text-semantic-info font-mono tracking-tight my-1">
              {myRequests.length}
            </div>
          </div>

          <div className="text-xs text-semantic-muted mt-4 pt-3 border-t border-semantic-neutral-surface flex items-center justify-between">
            <span>Submitted by you</span>
            <span className="text-semantic-info font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Track →
            </span>
          </div>
        </div>

        {/* Card 4: SLA Critical / At-Risk */}
        <div
          onClick={() => onNavigate('my-tasks')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-semantic-danger hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-semantic-panel flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-semantic-muted">Urgent / SLA At-Risk</span>
              <div className="p-2.5 rounded-xl bg-semantic-danger-surface text-semantic-danger border border-semantic-danger-border group-hover:scale-105 transition-transform">
                <Clock className="w-4.5 h-4.5 text-semantic-danger" />
              </div>
            </div>
            <div className="text-3xl font-black text-semantic-danger font-mono tracking-tight my-1">
              {urgentSlaTickets.length}
            </div>
          </div>

          <div className="text-xs text-semantic-muted mt-4 pt-3 border-t border-semantic-neutral-surface flex items-center justify-between">
            <span>Immediate attention</span>
            <span className="text-semantic-danger font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Prioritize →
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Panels: Priority Tasks & Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: My Top Action Items */}
        <div className="lg:col-span-2 wrike-card p-6 rounded-2xl space-y-4 shadow-xs bg-semantic-panel">
          <div className="flex items-center justify-between border-b border-semantic-border pb-3.5">
            <div className="flex items-center gap-2.5">
              <CheckSquare className="w-5 h-5 text-semantic-brand" />
              <h2 className="font-bold text-sm text-semantic-primary">High-Priority Work Assigned to You</h2>
            </div>
            <button
              onClick={() => onNavigate('my-tasks')}
              className="text-xs font-bold text-semantic-info hover:underline flex items-center gap-1"
            >
              View All Tasks ({myOpenTickets.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {myOpenTickets.length === 0 ? (
              <div className="py-12 text-center text-semantic-muted">
                <div className="w-12 h-12 rounded-2xl bg-semantic-success-surface text-semantic-success flex items-center justify-center mx-auto mb-3 text-base font-bold">
                  ✓
                </div>
                <div className="font-bold text-sm text-semantic-primary">No pending tasks!</div>
                <div className="text-xs text-semantic-muted mt-1">You have zero outstanding tickets on your queue.</div>
              </div>
            ) : (
              myOpenTickets.slice(0, 5).map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => onSelectTicket(ticket)}
                  className="p-4 rounded-xl border border-semantic-border hover:border-semantic-brand bg-semantic-panel hover:bg-semantic-subtle transition-all cursor-pointer flex items-center justify-between gap-4 shadow-2xs group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="font-mono text-xs font-bold text-semantic-info bg-semantic-info-surface px-2 py-0.5 rounded border border-semantic-info-border shrink-0">
                      {ticket.key}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-semantic-primary group-hover:text-semantic-brand transition-colors truncate">
                        {ticket.title}
                      </div>
                      <div className="text-label text-semantic-muted flex items-center gap-2 mt-1">
                        <span>{ticket.ticketTypeName || ticket.category}</span>
                        <span>•</span>
                        <span>{ticket.statusName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Badge type="SEVERITY" value={ticket.technicalSeverity} size="sm" />
                    <Badge type="SLA" value={ticket.slaState || 'SAFE'} size="sm" />
                    <ArrowRight className="w-4 h-4 text-semantic-placeholder group-hover:text-semantic-primary transition-colors ml-1" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Links & Pending Approvals Snapshot */}
        <div className="space-y-6">
          {/* Approvals Snapshot */}
          <div className="wrike-card p-6 rounded-2xl space-y-4 shadow-xs bg-semantic-panel">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 text-semantic-warning" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-semantic-primary">
                  Approvals (Maker-Checker)
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-semantic-warning bg-semantic-warning-surface px-2.5 py-0.5 rounded-full border border-semantic-warning-border">
                {pendingApprovalsCount} Pending
              </span>
            </div>

            <p className="text-xs text-semantic-muted leading-relaxed">
              Pending approvals returned by the authorized approval workflow.
            </p>

            <button
              onClick={() => onNavigate('approvals')}
              className="w-full py-2.5 rounded-xl bg-semantic-warning-surface hover:bg-semantic-warning-border text-semantic-warning font-bold text-xs border border-semantic-warning-border transition-colors flex items-center justify-center gap-2 shadow-2xs"
            >
              <span>Open Approval Center</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="wrike-card p-6 rounded-2xl space-y-3.5 shadow-xs bg-semantic-panel">
            <h3 className="font-bold text-xs uppercase tracking-wider text-semantic-muted border-b border-semantic-border pb-2.5">
              Quick Shortcuts
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('audit-compliance')}
                className="w-full text-left p-3 rounded-xl hover:bg-semantic-subtle border border-transparent hover:border-semantic-border transition-colors flex items-center justify-between text-xs font-semibold text-semantic-primary group"
              >
                <span>Audit & Regulatory Compliance</span>
                <span className="text-semantic-info font-bold group-hover:translate-x-0.5 transition-transform">Audit Posture →</span>
              </button>
              <button
                onClick={() => onNavigate('knowledge-base')}
                className="w-full text-left p-3 rounded-xl hover:bg-semantic-subtle border border-transparent hover:border-semantic-border transition-colors flex items-center justify-between text-xs font-semibold text-semantic-primary group"
              >
                <span>Read SOPs & Playbooks</span>
                <span className="text-semantic-info font-bold group-hover:translate-x-0.5 transition-transform">Search →</span>
              </button>
              <button
                onClick={() => onNavigate('risk-management')}
                className="w-full text-left p-3 rounded-xl hover:bg-semantic-subtle border border-transparent hover:border-semantic-border transition-colors flex items-center justify-between text-xs font-semibold text-semantic-primary group"
              >
                <span>Risk Management (5×5 Matrix)</span>
                <span className="text-semantic-info font-bold group-hover:translate-x-0.5 transition-transform">View Matrix →</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
