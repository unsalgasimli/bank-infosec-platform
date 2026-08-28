import React, { useState } from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
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
  const { t } = useI18n();
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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-semantic-jira-brand" />
            <span className="text-label font-mono text-semantic-jira-muted uppercase tracking-wider">
              Atlassian Jira • Personal Workspace
            </span>
          </div>
          <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight mt-1">
            Personal Security Workspace ({currentUser?.fullName})
          </h1>
          <p className="text-xs text-semantic-jira-muted mt-0.5">
            Role: <strong className="text-semantic-jira-primary">{currentUser?.roles[0]}</strong> • Department: {currentUser?.departmentId} • Security Clearance: <strong className="text-semantic-jira-brand">{currentUser?.securityClearance}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-2.5 px-3 rounded bg-semantic-panel border border-semantic-jira-border text-right">
            <div className="text-caption text-semantic-jira-muted font-bold uppercase">My Open Load</div>
            <div className="text-lg font-mono font-bold text-semantic-jira-brand">{myTickets.length} Issues</div>
          </div>
          <div className="p-2.5 px-3 rounded bg-semantic-panel border border-semantic-jira-border text-right">
            <div className="text-caption text-semantic-jira-muted font-bold uppercase">SLA Urgent</div>
            <div className="text-lg font-mono font-bold text-semantic-warning-bright">{slaApproaching.length}</div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <button
          onClick={() => setActiveTab('ASSIGNED')}
          className={`p-4 rounded-md border text-left transition-colors shadow-sm ${
            activeTab === 'ASSIGNED'
              ? 'bg-semantic-jira-brand-surface border-semantic-jira-brand'
              : 'bg-semantic-panel border-semantic-jira-border hover:bg-semantic-jira-hover'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-semantic-jira-primary flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-semantic-jira-brand" /> Assigned to Me
            </span>
            <span className="font-mono text-lg font-bold text-semantic-jira-primary">{myTickets.length}</span>
          </div>
          <p className="text-label text-semantic-jira-muted mt-1">Issues currently waiting on your action.</p>
        </button>

        <button
          onClick={() => setActiveTab('APPROVALS')}
          className={`p-4 rounded-md border text-left transition-colors shadow-sm ${
            activeTab === 'APPROVALS'
              ? 'bg-semantic-jira-brand-surface border-semantic-jira-brand'
              : 'bg-semantic-panel border-semantic-jira-border hover:bg-semantic-jira-hover'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-semantic-jira-primary flex items-center gap-1.5">
              <FileSignature className="w-4 h-4 text-semantic-jira-brand" /> Pending My Sign-off
            </span>
            <span className="font-mono text-lg font-bold text-semantic-jira-primary">{myApprovals.length}</span>
          </div>
          <p className="text-label text-semantic-jira-muted mt-1">Governance & exception gates requiring approval.</p>
        </button>

        <button
          onClick={() => setActiveTab('SLA_URGENT')}
          className={`p-4 rounded-md border text-left transition-colors shadow-sm ${
            activeTab === 'SLA_URGENT'
              ? 'bg-semantic-warning-soft border-semantic-warning-bright'
              : 'bg-semantic-panel border-semantic-jira-border hover:bg-semantic-jira-hover'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-semantic-warning-bright flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-semantic-warning-bright" /> SLA Approaching
            </span>
            <span className="font-mono text-lg font-bold text-semantic-warning-bright">{slaApproaching.length}</span>
          </div>
          <p className="text-label text-semantic-jira-muted mt-1">Tickets near breach needing fast turnaround.</p>
        </button>
      </div>

      {/* Main Workspace Table & Search */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
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
            <Search className="w-3.5 h-3.5 text-semantic-jira-muted absolute left-2.5 top-2" />
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
            <div className="p-8 text-center text-semantic-jira-muted text-xs italic bg-semantic-panel rounded border border-semantic-jira-border">
              No pending approval requests requiring your sign-off.
            </div>
          ) : (
            <div className="divide-y divide-semantic-jira-border text-xs">
              {myApprovals.map((chain: any) => (
                <div
                  key={chain.id}
                  onClick={() => onSelectTicket({ id: chain.ticketId } as any)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-semantic-jira-hover px-2 rounded transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-semantic-jira-primary text-xs">{chain.title}</div>
                    <div className="text-label text-semantic-jira-muted">
                      Dual-control approval gate • Stage {chain.currentStepIndex + 1}
                    </div>
                  </div>
                  <span className="text-semantic-jira-brand flex items-center gap-1 font-medium hover:underline">
                    Review & Sign <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (filteredTickets as Ticket[]).length === 0 ? (
          <div className="p-8 text-center text-semantic-jira-muted text-xs italic bg-semantic-panel rounded border border-semantic-jira-border">
            No issues found in this workspace filter.
          </div>
        ) : (
          <div className="divide-y divide-semantic-jira-border text-xs">
            {(filteredTickets as Ticket[]).map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-semantic-jira-hover px-2 rounded transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-semibold text-semantic-jira-brand group-hover:underline">{t.key}</span>
                  <span className="text-semantic-jira-primary font-medium truncate max-w-md">{t.title}</span>
                  <span className="jira-lozenge jira-lozenge-inprogress text-caption">
                    {t.statusName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge type="SEVERITY" value={t.technicalSeverity} />
                  <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                  <ArrowRight className="w-3.5 h-3.5 text-semantic-jira-muted group-hover:text-semantic-jira-brand transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};



