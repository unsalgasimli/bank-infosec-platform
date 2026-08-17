import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { useAuth } from '../../context/AuthContext.js';
import { CheckCircle2, Clock, Eye, AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';

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

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Personal Security Workspace ({currentUser?.fullName})
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Role: <strong className="text-slate-300">{currentUser?.roles[0]}</strong> • Department: {currentUser?.departmentId} • Clearance: {currentUser?.securityClearance}
          </p>
        </div>
      </div>

      {/* Actionable Alerts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* SLA Approaching */}
        <div className="bg-bank-900 border border-amber-900/60 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> SLA Approaching
            </span>
            <span className="font-mono text-base font-bold text-amber-400">{slaApproaching.length}</span>
          </div>
          <p className="text-[11px] text-slate-400">Assigned tickets requiring turnaround before breach.</p>
        </div>

        {/* Pending Approvals */}
        <div className="bg-bank-900 border border-purple-900/60 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> My Pending Approvals
            </span>
            <span className="font-mono text-base font-bold text-purple-400">{myApprovals.length}</span>
          </div>
          <p className="text-[11px] text-slate-400">Action required on risk exceptions & remediation gates.</p>
        </div>

        {/* Watched Cases */}
        <div className="bg-bank-900 border border-slate-800 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-slate-400" /> Watched Tickets
            </span>
            <span className="font-mono text-base font-bold text-slate-200">{watchedTickets.length}</span>
          </div>
          <p className="text-[11px] text-slate-400">Tickets you are actively monitoring across other squads.</p>
        </div>
      </div>

      {/* My Assigned Tickets Table */}
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            My Assigned Queue ({myTickets.length})
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">Sorted by urgency</span>
        </div>

        {myTickets.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-bank-950 rounded border border-slate-800">
            No active tickets assigned to you.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 text-xs">
            {myTickets.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 px-2 rounded transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-semibold text-blue-400">{t.key}</span>
                  <span className="text-slate-200 font-medium truncate max-w-md">{t.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge type="SEVERITY" value={t.technicalSeverity} />
                  <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

