import React, { useState, useMemo } from 'react';
import { Ticket, TechnicalSeverity, BusinessPriority } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { BulkActionBar } from './BulkActionBar.js';
import { TicketKanbanBoard } from './TicketKanbanBoard.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  Search,
  Filter,
  ArrowUpDown,
  Download,
  CheckSquare,
  Square,
  Layers,
  ChevronRight,
  User,
  Shield,
  LayoutGrid,
  List,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface TicketListViewProps {
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  onSelectTicket: (ticket: Ticket) => void;
  onRefresh: () => void;
  jqlQuery: string;
  onJqlChange: (jql: string) => void;
}

export const TicketListView: React.FC<TicketListViewProps> = ({
  tickets,
  applications,
  assets,
  onSelectTicket,
  onRefresh,
  jqlQuery,
  onJqlChange,
}) => {
  const { currentUser, allUsers, fetchWithAuth } = useAuth();
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'key' | 'severity' | 'updatedAt' | 'sla'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Preset Filters
  const handleApplyPreset = (preset: string) => {
    if (preset === 'MY_OPEN') {
      onJqlChange(`assignee = "${currentUser?.fullName}" AND status != CLOSED`);
    } else if (preset === 'CRITICAL_HIGH') {
      onJqlChange('severity IN (CRITICAL, HIGH) AND status != CLOSED');
    } else if (preset === 'SLA_BREACHED') {
      onJqlChange('slaState IN (AT_RISK, BREACHED)');
    } else if (preset === 'INCIDENTS') {
      onJqlChange('category = INCIDENT OR project = SOC');
    } else if (preset === 'VULNS') {
      onJqlChange('category = VULNERABILITY OR project = VM');
    } else if (preset === 'ALL') {
      onJqlChange('');
      setSeverityFilter('ALL');
      setDomainFilter('ALL');
      setStatusFilter('ALL');
    }
  };

  // Multi-Filter & Sort Logic
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (severityFilter !== 'ALL' && t.technicalSeverity !== severityFilter) return false;
      if (domainFilter !== 'ALL' && t.securityDomain !== domainFilter) return false;
      if (statusFilter !== 'ALL' && t.statusCategory !== statusFilter) return false;
      return true;
    }).sort((a, b) => {
      if (sortField === 'key') {
        return sortOrder === 'asc' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
      }
      if (sortField === 'severity') {
        const ranks: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFORMATIONAL: 1 };
        const diff = (ranks[b.technicalSeverity] || 0) - (ranks[a.technicalSeverity] || 0);
        return sortOrder === 'asc' ? -diff : diff;
      }
      if (sortField === 'sla') {
        return sortOrder === 'asc'
          ? (a.slaRemainingMinutes || 99999) - (b.slaRemainingMinutes || 99999)
          : (b.slaRemainingMinutes || 99999) - (a.slaRemainingMinutes || 99999);
      }
      return sortOrder === 'asc'
        ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [tickets, severityFilter, domainFilter, statusFilter, sortField, sortOrder]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredTickets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTickets.map((t) => t.id));
    }
  };

  const toggleSelectTicket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAssign = async (userId: string) => {
    try {
      const res = await fetchWithAuth('/api/tickets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketIds: selectedIds, action: 'ASSIGN', value: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds([]);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkPriority = async (priority: string) => {
    try {
      const res = await fetchWithAuth('/api/tickets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketIds: selectedIds, action: 'SET_PRIORITY', value: priority }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds([]);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportSelected = () => {
    const exported = selectedIds.length > 0
      ? filteredTickets.filter((t) => selectedIds.includes(t.id))
      : filteredTickets;

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Key,Title,Severity,Priority,Status,SLA_State,Assignee,Created_At'].join(',') +
      '\n' +
      exported
        .map((t) => `"${t.key}","${t.title.replace(/"/g, '""')}","${t.technicalSeverity}","${t.businessPriority}","${t.statusName}","${t.slaState}","${t.assigneeId || 'Unassigned'}","${t.createdAt}"`)
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AegisSec_Jira_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-jira-surface overflow-hidden">
      {/* Top Jira Header Bar: Search, JQL, Presets & View Switcher */}
      <div className="p-3 bg-semantic-panel border-b border-semantic-jira-border space-y-2.5 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* JQL Query Bar */}
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-semantic-panel border border-semantic-jira-border rounded text-xs font-mono font-bold text-semantic-jira-brand shrink-0">
              <Filter className="w-3.5 h-3.5" />
              <span>JQL</span>
            </div>
            <input
              type="text"
              value={jqlQuery}
              onChange={(e) => onJqlChange(e.target.value)}
              placeholder="Search by JQL (e.g. project = APPSEC AND severity = CRITICAL AND status != CLOSED)"
              className="jira-input font-mono"
            />
            {jqlQuery && (
              <button
                onClick={() => onJqlChange('')}
                className="jira-btn-secondary py-1 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* View Switcher: List vs Kanban */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-semantic-panel p-0.5 rounded border border-semantic-jira-border">
              <button
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'LIST'
                    ? 'bg-semantic-jira-brand text-white font-semibold shadow-sm'
                    : 'text-semantic-jira-muted hover:text-semantic-jira-primary'
                }`}
                title="Jira Table / List View"
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
              <button
                onClick={() => setViewMode('KANBAN')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'KANBAN'
                    ? 'bg-semantic-jira-brand text-white font-semibold shadow-sm'
                    : 'text-semantic-jira-muted hover:text-semantic-jira-primary'
                }`}
                title="Jira Kanban Board View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Board</span>
              </button>
            </div>

            <button
              onClick={handleExportSelected}
              className="jira-btn-secondary py-1 text-xs"
              title="Export Issues to CSV"
            >
              <Download className="w-3.5 h-3.5 text-semantic-jira-muted" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Preset Filter Chips & Severity Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-light mr-1">Quick:</span>
            {[
              { id: 'ALL', label: 'All Issues' },
              { id: 'MY_OPEN', label: 'My Open' },
              { id: 'CRITICAL_HIGH', label: 'Critical & High' },
              { id: 'SLA_BREACHED', label: 'SLA Breached' },
              { id: 'INCIDENTS', label: 'SOC Incidents' },
              { id: 'VULNS', label: 'Vulnerabilities' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handleApplyPreset(p.id)}
                className="jira-filter-pill jira-filter-pill-inactive"
              >
                {p.label}
              </button>
            ))}
            <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

            <div className="flex items-center gap-1 bg-semantic-panel p-0.5 rounded border border-semantic-jira-border">
              <span className="text-caption text-semantic-jira-muted px-1.5 font-bold uppercase">Sev:</span>
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2 py-0.5 rounded text-caption font-medium transition-colors ${
                    severityFilter === sev
                      ? 'bg-semantic-jira-brand text-white font-semibold'
                      : 'text-semantic-jira-muted hover:text-semantic-jira-primary'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div className="text-label text-slate-400 font-mono">
            Showing <strong className="text-semantic-jira-primary">{filteredTickets.length}</strong> of {tickets.length} issues
          </div>
        </div>
      </div>

      {/* Main Content: Table View or Kanban View */}
      {viewMode === 'KANBAN' ? (
        <TicketKanbanBoard tickets={filteredTickets} onSelectTicket={onSelectTicket} onRefreshTickets={onRefresh} />
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="jira-table">
            <thead className="sticky top-0 z-dsSticky">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center">
                  <button onClick={toggleSelectAll} className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                    {selectedIds.length === filteredTickets.length && filteredTickets.length > 0 ? (
                      <CheckSquare className="w-3.5 h-3.5 text-semantic-jira-brand" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th
                  className="px-3 py-2.5 cursor-pointer hover:text-semantic-jira-primary transition-colors"
                  onClick={() => {
                    setSortField('key');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span>Key</span> <ArrowUpDown className="w-3 h-3 text-semantic-jira-muted" />
                  </div>
                </th>
                <th className="px-3 py-2.5">Summary & Details</th>
                <th
                  className="px-3 py-2.5 cursor-pointer hover:text-semantic-jira-primary transition-colors"
                  onClick={() => {
                    setSortField('severity');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span>Severity</span> <ArrowUpDown className="w-3 h-3 text-semantic-jira-muted" />
                  </div>
                </th>
                <th className="px-3 py-2.5">Status</th>
                <th
                  className="px-3 py-2.5 cursor-pointer hover:text-semantic-jira-primary transition-colors"
                  onClick={() => {
                    setSortField('sla');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span>SLA Countdown</span> <ArrowUpDown className="w-3 h-3 text-semantic-jira-muted" />
                  </div>
                </th>
                <th className="px-3 py-2.5">Assignee</th>
                <th
                  className="px-3 py-2.5 cursor-pointer hover:text-semantic-jira-primary text-right transition-colors"
                  onClick={() => {
                    setSortField('updatedAt');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Updated</span> <ArrowUpDown className="w-3 h-3 text-semantic-jira-muted" />
                  </div>
                </th>
                <th className="w-8 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-semantic-jira-muted text-xs italic">
                    No Jira issues match your query or active filters.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const isSelected = selectedIds.includes(ticket.id);
                  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);
                  const app = applications.find((a) => a.id === ticket.applicationId);

                  const getLozengeClass = (cat: string) => {
                    switch (cat) {
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
                    <tr
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-semantic-jira-hover' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center" onClick={(e) => toggleSelectTicket(ticket.id, e)}>
                        <button className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-semantic-jira-brand" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-semantic-jira-brand shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Badge type="PROJECT" value={ticket.projectCode} size="sm" />
                          <span className="hover:underline">{ticket.key}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-semantic-jira-primary truncate max-w-lg">
                          {ticket.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-label text-semantic-jira-muted">
                          {app && <span className="text-semantic-jira-primary font-mono text-caption">App: {app.code}</span>}
                          {ticket.findingDetails?.cweId && (
                            <span className="font-mono text-semantic-jira-brand text-caption">{ticket.findingDetails.cweId}</span>
                          )}
                          {ticket.findingDetails?.cveId && (
                            <span className="font-mono text-semantic-danger-strong text-caption">{ticket.findingDetails.cveId}</span>
                          )}
                          <Badge type="CONFIDENTIALITY" value={ticket.confidentiality} size="sm" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`jira-lozenge ${getLozengeClass(ticket.statusCategory)}`}>
                          {ticket.statusName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <SLARing
                          remainingMinutes={ticket.slaRemainingMinutes}
                          state={ticket.slaState}
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {assignee ? (
                            <>
                              <div className="w-5 h-5 rounded-full bg-semantic-jira-brand flex items-center justify-center text-caption font-bold text-white shrink-0">
                                {assignee.fullName.charAt(0)}
                              </div>
                              <span className="text-semantic-jira-primary truncate">{assignee.fullName}</span>
                            </>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-semantic-info-soft border border-semantic-info-soft-border text-semantic-info-strong font-mono text-label font-bold inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-semantic-info-strong animate-pulse shrink-0" />
                              {ticket.targetDepartmentId || ticket.departmentId ? 'Şöbə Növbəsi' : 'Təyin edilməyib'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-label text-semantic-jira-muted text-right">
                        {new Date(ticket.updatedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <ChevronRight className="w-3.5 h-3.5 text-semantic-jira-muted-light" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        allUsers={allUsers}
        onClear={() => setSelectedIds([])}
        onBulkAssign={handleBulkAssign}
        onBulkPriority={handleBulkPriority}
        onExportSelected={handleExportSelected}
      />
    </div>
  );
};

