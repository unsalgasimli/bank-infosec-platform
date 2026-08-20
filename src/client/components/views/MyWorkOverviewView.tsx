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
    (t) => t.assigneeId === currentUser?.id
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
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-[#F8FAFC] custom-scrollbar select-none">
      {/* Welcome Banner */}
      <div className="wrike-card p-6 md:p-7 bg-gradient-to-r from-[#FFFFFF] via-[#F8FAFC] to-[#E6F7EF]/40 border border-[#E2E8F0] rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#00B259] text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
            {currentUser?.fullName.split(' ').map((n) => n[0]).join('') || '?'}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-[#162136]">
                Welcome back{currentUser?.fullName ? `, ${currentUser.fullName}` : ''}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] text-xs font-bold font-mono">
                {currentUser?.roles[0] || 'NO ROLE'}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              {currentUser?.departmentId || 'No department assigned'} • Security Clearance: <strong className="text-[#007860]">{currentUser?.securityClearance || 'Not assigned'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('risk-management')}
            className="wrike-btn-secondary text-xs py-2 px-3.5 flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4 text-[#007860]" />
            <span>Risk Management</span>
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
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-[#00B259] hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-[#FFFFFF] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">My Active Tasks</span>
              <div className="p-2.5 rounded-xl bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] group-hover:scale-105 transition-transform">
                <CheckSquare className="w-4.5 h-4.5 text-[#00B259]" />
              </div>
            </div>
            <div className="text-3xl font-black text-[#162136] font-mono tracking-tight my-1">
              {myOpenTickets.length}
            </div>
          </div>

          <div className="text-xs text-[#64748B] mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
            <span>{myCompletedTickets.length} completed tasks</span>
            <span className="text-[#00B259] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              View →
            </span>
          </div>
        </div>

        {/* Card 2: Pending Approvals */}
        <div
          onClick={() => onNavigate('approvals')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-[#D46B08] hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-[#FFFFFF] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Maker-Checker Approvals</span>
              <div className="p-2.5 rounded-xl bg-[#FFF7E6] text-[#D46B08] border border-[#FFE7BA] group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4.5 h-4.5 text-[#FA8C16]" />
              </div>
            </div>
            <div className="text-3xl font-black text-[#D46B08] font-mono tracking-tight my-1">
              {pendingApprovalsCount}
            </div>
          </div>

          <div className="text-xs text-[#64748B] mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
            <span>Dual-control sign-offs</span>
            <span className="text-[#D46B08] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Review →
            </span>
          </div>
        </div>

        {/* Card 3: My Requests */}
        <div
          onClick={() => onNavigate('my-requests')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-[#0073D3] hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-[#FFFFFF] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">My Requests</span>
              <div className="p-2.5 rounded-xl bg-[#EBF4FD] text-[#0073D3] border border-[#BAE0FD] group-hover:scale-105 transition-transform">
                <Inbox className="w-4.5 h-4.5 text-[#0073D3]" />
              </div>
            </div>
            <div className="text-3xl font-black text-[#0073D3] font-mono tracking-tight my-1">
              {myRequests.length}
            </div>
          </div>

          <div className="text-xs text-[#64748B] mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
            <span>Submitted by you</span>
            <span className="text-[#0073D3] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Track →
            </span>
          </div>
        </div>

        {/* Card 4: SLA Critical / At-Risk */}
        <div
          onClick={() => onNavigate('my-tasks')}
          className="wrike-card p-5 md:p-6 rounded-2xl cursor-pointer hover:border-[#CF1322] hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs group bg-[#FFFFFF] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Urgent / SLA At-Risk</span>
              <div className="p-2.5 rounded-xl bg-[#FDE8EB] text-[#CF1322] border border-[#FFA39E] group-hover:scale-105 transition-transform">
                <Clock className="w-4.5 h-4.5 text-[#CF1322]" />
              </div>
            </div>
            <div className="text-3xl font-black text-[#CF1322] font-mono tracking-tight my-1">
              {urgentSlaTickets.length}
            </div>
          </div>

          <div className="text-xs text-[#64748B] mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
            <span>Immediate attention</span>
            <span className="text-[#CF1322] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Prioritize →
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Panels: Priority Tasks & Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: My Top Action Items */}
        <div className="lg:col-span-2 wrike-card p-6 rounded-2xl space-y-4 shadow-xs bg-[#FFFFFF]">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
            <div className="flex items-center gap-2.5">
              <CheckSquare className="w-5 h-5 text-[#00B259]" />
              <h2 className="font-bold text-sm text-[#162136]">High-Priority Work Assigned to You</h2>
            </div>
            <button
              onClick={() => onNavigate('my-tasks')}
              className="text-xs font-bold text-[#0073D3] hover:underline flex items-center gap-1"
            >
              View All Tasks ({myOpenTickets.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {myOpenTickets.length === 0 ? (
              <div className="py-12 text-center text-[#64748B]">
                <div className="w-12 h-12 rounded-2xl bg-[#E6F7EF] text-[#007860] flex items-center justify-center mx-auto mb-3 text-base font-bold">
                  ✓
                </div>
                <div className="font-bold text-sm text-[#162136]">No pending tasks!</div>
                <div className="text-xs text-[#64748B] mt-1">You have zero outstanding tickets on your queue.</div>
              </div>
            ) : (
              myOpenTickets.slice(0, 5).map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => onSelectTicket(ticket)}
                  className="p-4 rounded-xl border border-[#E2E8F0] hover:border-[#00B259] bg-[#FFFFFF] hover:bg-[#F8FAFC] transition-all cursor-pointer flex items-center justify-between gap-4 shadow-2xs group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="font-mono text-xs font-bold text-[#0073D3] bg-[#EBF4FD] px-2 py-0.5 rounded border border-[#BAE0FD] shrink-0">
                      {ticket.key}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-[#162136] group-hover:text-[#00B259] transition-colors truncate">
                        {ticket.title}
                      </div>
                      <div className="text-[11px] text-[#64748B] flex items-center gap-2 mt-1">
                        <span>{ticket.ticketTypeName || ticket.category}</span>
                        <span>•</span>
                        <span>{ticket.statusName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Badge type="SEVERITY" value={ticket.technicalSeverity} size="sm" />
                    <Badge type="SLA" value={ticket.slaState || 'SAFE'} size="sm" />
                    <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#162136] transition-colors ml-1" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Links & Pending Approvals Snapshot */}
        <div className="space-y-6">
          {/* Approvals Snapshot */}
          <div className="wrike-card p-6 rounded-2xl space-y-4 shadow-xs bg-[#FFFFFF]">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 text-[#D46B08]" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#162136]">
                  Approvals (Maker-Checker)
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-[#D46B08] bg-[#FFF7E6] px-2.5 py-0.5 rounded-full border border-[#FFE7BA]">
                {pendingApprovalsCount} Pending
              </span>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Pending approvals returned by the authorized approval workflow.
            </p>

            <button
              onClick={() => onNavigate('approvals')}
              className="w-full py-2.5 rounded-xl bg-[#FFF7E6] hover:bg-[#FFE7BA] text-[#D46B08] font-bold text-xs border border-[#FFE7BA] transition-colors flex items-center justify-center gap-2 shadow-2xs"
            >
              <span>Open Approval Center</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="wrike-card p-6 rounded-2xl space-y-3.5 shadow-xs bg-[#FFFFFF]">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-2.5">
              Quick Shortcuts
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('audit-compliance')}
                className="w-full text-left p-3 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-colors flex items-center justify-between text-xs font-semibold text-[#162136] group"
              >
                <span>Audit & Regulatory Compliance</span>
                <span className="text-[#0073D3] font-bold group-hover:translate-x-0.5 transition-transform">Audit Posture →</span>
              </button>
              <button
                onClick={() => onNavigate('knowledge-base')}
                className="w-full text-left p-3 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-colors flex items-center justify-between text-xs font-semibold text-[#162136] group"
              >
                <span>Read SOPs & Playbooks</span>
                <span className="text-[#0073D3] font-bold group-hover:translate-x-0.5 transition-transform">Search →</span>
              </button>
              <button
                onClick={() => onNavigate('risk-management')}
                className="w-full text-left p-3 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-colors flex items-center justify-between text-xs font-semibold text-[#162136] group"
              >
                <span>Risk Management (5×5 Matrix)</span>
                <span className="text-[#0073D3] font-bold group-hover:translate-x-0.5 transition-transform">View Matrix →</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
