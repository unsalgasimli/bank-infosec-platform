import React, { useState } from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  CheckCircle2,
  Clock,
  Eye,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  Search,
  Layers,
  Inbox,
  FileSignature,
  Filter,
} from 'lucide-react';

interface AnalystDashboardProps {
  myTickets: Ticket[];
  myApprovals: any[];
  watchedTickets: Ticket[];
  slaApproaching: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const AnalystDashboard: React.FC<AnalystDashboardProps> = ({
  myTickets,
  myApprovals,
  watchedTickets,
  slaApproaching,
  onSelectTicket,
}) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'ASSIGNED' | 'APPROVALS' | 'WATCHED' | 'SLA_URGENT'>('ASSIGNED');
  const [search, setSearch] = useState('');

  const currentList =
    activeTab === 'ASSIGNED'
      ? myTickets
      : activeTab === 'APPROVALS'
      ? myApprovals
      : activeTab === 'WATCHED'
      ? watchedTickets
      : slaApproaching;

  const filteredTickets = activeTab === 'APPROVALS'
    ? currentList
    : (currentList as Ticket[]).filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.key.toLowerCase().includes(search.toLowerCase()) ||
          t.statusName.toLowerCase().includes(search.toLowerCase())
      );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#0052CC]" />
            <span className="text-[11px] font-mono text-[#5E6C84] uppercase tracking-wider">
              Atlassian Jira • Personal Workspace
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight mt-1">
            Personal Security Workspace ({currentUser?.fullName})
          </h1>
          <p className="text-xs text-[#5E6C84] mt-0.5">
            Role: <strong className="text-[#172B4D]">{currentUser?.roles[0]}</strong> • Department: {currentUser?.departmentId} • Security Clearance: <strong className="text-[#0052CC]">{currentUser?.securityClearance}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-2.5 px-3 rounded bg-[#FFFFFF] border border-[#DFE1E6] text-right">
            <div className="text-[10px] text-[#5E6C84] font-bold uppercase">My Open Load</div>
            <div className="text-lg font-mono font-bold text-[#0052CC]">{myTickets.length} Issues</div>
          </div>
          <div className="p-2.5 px-3 rounded bg-[#FFFFFF] border border-[#DFE1E6] text-right">
            <div className="text-[10px] text-[#5E6C84] font-bold uppercase">SLA Urgent</div>
            <div className="text-lg font-mono font-bold text-[#FF8B00]">{slaApproaching.length}</div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <button
          onClick={() => setActiveTab('ASSIGNED')}
          className={`p-4 rounded-md border text-left transition-colors shadow-sm ${
            activeTab === 'ASSIGNED'
              ? 'bg-[#DEEBFF] border-[#0052CC]'
              : 'bg-[#FFFFFF] border-[#DFE1E6] hover:bg-[#EBECF0]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#172B4D] flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-[#0052CC]" /> Assigned to Me
            </span>
            <span className="font-mono text-lg font-bold text-[#172B4D]">{myTickets.length}</span>
          </div>
          <p className="text-[11px] text-[#5E6C84] mt-1">Issues currently waiting on your action.</p>
        </button>

        <button
          onClick={() => setActiveTab('APPROVALS')}
          className={`p-4 rounded-md border text-left transition-colors shadow-sm ${
            activeTab === 'APPROVALS'
              ? 'bg-[#DEEBFF] border-[#0052CC]'
              : 'bg-[#FFFFFF] border-[#DFE1E6] hover:bg-[#EBECF0]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#172B4D] flex items-center gap-1.5">
              <FileSignature className="w-4 h-4 text-[#0052CC]" /> Pending My Sign-off
            </span>
            <span className="font-mono text-lg font-bold text-[#172B4D]">{myApprovals.length}</span>
          </div>
          <p className="text-[11px] text-[#5E6C84] mt-1">Governance & exception gates requiring approval.</p>
        </button>

        <button
          onClick={() => setActiveTab('SLA_URGENT')}
          className={`p-4 rounded-md border text-left transition-colors shadow-sm ${
            activeTab === 'SLA_URGENT'
              ? 'bg-[#FFFAE6] border-[#FF8B00]'
              : 'bg-[#FFFFFF] border-[#DFE1E6] hover:bg-[#EBECF0]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#FF8B00] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#FF8B00]" /> SLA Approaching
            </span>
            <span className="font-mono text-lg font-bold text-[#FF8B00]">{slaApproaching.length}</span>
          </div>
          <p className="text-[11px] text-[#5E6C84] mt-1">Tickets near breach needing fast turnaround.</p>
        </button>
      </div>

      {/* Main Workspace Table & Search */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              {activeTab === 'ASSIGNED'
                ? `My Assigned Issues (${myTickets.length})`
                : activeTab === 'APPROVALS'
                ? `Pending Sign-off Queue (${myApprovals.length})`
                : activeTab === 'WATCHED'
                ? `Watched Tickets (${watchedTickets.length})`
                : `SLA Approaching Breaches (${slaApproaching.length})`}
            </h3>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-[#5E6C84] absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in your workspace..."
              className="jira-input pl-8"
            />
          </div>
        </div>

        {/* List of items */}
        {activeTab === 'APPROVALS' ? (
          myApprovals.length === 0 ? (
            <div className="p-8 text-center text-[#5E6C84] text-xs italic bg-[#FFFFFF] rounded border border-[#DFE1E6]">
              No pending approval requests requiring your sign-off.
            </div>
          ) : (
            <div className="divide-y divide-[#DFE1E6] text-xs">
              {myApprovals.map((chain: any) => (
                <div
                  key={chain.id}
                  onClick={() => onSelectTicket({ id: chain.ticketId } as any)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-[#EBECF0] px-2 rounded transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[#172B4D] text-xs">{chain.title}</div>
                    <div className="text-[11px] text-[#5E6C84]">
                      Dual-control approval gate • Stage {chain.currentStepIndex + 1}
                    </div>
                  </div>
                  <span className="text-[#0052CC] flex items-center gap-1 font-medium hover:underline">
                    Review & Sign <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (filteredTickets as Ticket[]).length === 0 ? (
          <div className="p-8 text-center text-[#5E6C84] text-xs italic bg-[#FFFFFF] rounded border border-[#DFE1E6]">
            No issues found in this workspace filter.
          </div>
        ) : (
          <div className="divide-y divide-[#DFE1E6] text-xs">
            {(filteredTickets as Ticket[]).map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-[#EBECF0] px-2 rounded transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-semibold text-[#0052CC] group-hover:underline">{t.key}</span>
                  <span className="text-[#172B4D] font-medium truncate max-w-md">{t.title}</span>
                  <span className="jira-lozenge jira-lozenge-inprogress text-[10px]">
                    {t.statusName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge type="SEVERITY" value={t.technicalSeverity} />
                  <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                  <ArrowRight className="w-3.5 h-3.5 text-[#5E6C84] group-hover:text-[#0052CC] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};



