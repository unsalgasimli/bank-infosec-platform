import React, { useState, useMemo, useEffect } from 'react';
import {
  Table as TableIcon,
  Search,
  Plus,
  Download,
  Clock,
  User,
  CheckCircle2,
  Filter,
  Archive,
  X,
  Loader2,
} from 'lucide-react';
import { Ticket } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { BankDepartment } from '../../../shared/types/auth.js';
import { Badge } from '../common/Badge.js';
import { useAuth } from '../../context/AuthContext.js';

interface WrikeTableViewProps {
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  departments?: BankDepartment[];
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreate: () => void;
  onRefreshTickets?: () => void;
  hideHeader?: boolean;
}

export const WrikeTableView: React.FC<WrikeTableViewProps> = ({
  tickets,
  applications,
  assets,
  departments,
  onSelectTicket,
  onOpenCreate,
  onRefreshTickets,
  hideHeader = false,
}) => {
  const { allUsers, fetchWithAuth } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState('ALL');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archivedTickets, setArchivedTickets] = useState<Ticket[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  useEffect(() => {
    if (!isArchiveOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsArchiveOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isArchiveOpen]);

  const openArchive = async () => {
    setIsArchiveOpen(true);
    setIsLoadingArchive(true);
    try {
      const response = await fetchWithAuth('/api/tickets?archived=true');
      const data = await response.json();
      setArchivedTickets(data.success && Array.isArray(data.tickets) ? data.tickets : []);
    } catch {
      setArchivedTickets([]);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  // Filter tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch =
        searchQuery === '' ||
        t.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesStatus =
        selectedStatusFilter === 'ALL' ||
        (selectedStatusFilter === 'OPEN' && t.statusCategory !== 'DONE') ||
        (selectedStatusFilter === 'RESOLVED' && t.statusCategory === 'DONE') ||
        t.statusId === selectedStatusFilter;

      const matchesSeverity = selectedSeverityFilter === 'ALL' || t.technicalSeverity === selectedSeverityFilter;

      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [tickets, searchQuery, selectedStatusFilter, selectedSeverityFilter]);

  const toggleSelectAll = () => {
    if (selectedTicketIds.length === filteredTickets.length) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(filteredTickets.map((t) => t.id));
    }
  };

  const toggleSelectTicket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedTicketIds.includes(id)) {
      setSelectedTicketIds(selectedTicketIds.filter((item) => item !== id));
    } else {
      setSelectedTicketIds([...selectedTicketIds, id]);
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedTicketIds.includes(id)) {
      setSelectedTicketIds(selectedTicketIds.filter((tId) => tId !== id));
    } else {
      setSelectedTicketIds([...selectedTicketIds, id]);
    }
  };

  const getApplication = (appId?: string) => {
    return applications.find((a) => a.id === appId);
  };

  const getStatusPill = (ticket: Ticket) => {
    switch (ticket.statusCategory) {
      case 'DONE':
        return <span className="wrike-pill wrike-pill-green">{ticket.statusName}</span>;
      case 'IN_PROGRESS':
        return <span className="wrike-pill wrike-pill-blue">{ticket.statusName}</span>;
      case 'IN_REVIEW':
        return <span className="wrike-pill wrike-pill-amber">{ticket.statusName}</span>;
      case 'TO_DO':
      default:
        return <span className="wrike-pill wrike-pill-gray">{ticket.statusName}</span>;
    }
  };

  const exportToCSV = () => {
    const headers = ['Key', 'Title', 'Status', 'Severity', 'Priority', 'SLA State', 'Assignee', 'Application', 'Created'];
    const rows = filteredTickets.map((t) => [
      t.key,
      `"${t.title.replace(/"/g, '""')}"`,
      t.statusName,
      t.technicalSeverity,
      t.businessPriority,
      t.slaState || 'N/A',
      t.assigneeId || 'Unassigned',
      getApplication(t.applicationId)?.name || 'N/A',
      t.createdAt,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `wrike_secops_table_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative flex-1 flex flex-col h-full bg-semantic-panel overflow-hidden select-none">
      {/* Clean Single-Row View Header Toolbar (Hidden when wrapped in WorkManagementContainer) */}
      {!hideHeader && (
        <div className="bg-semantic-panel border-b border-semantic-border px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          {/* Left: View Title, Counter & Segmented Status Filter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-semantic-primary">Spreadsheet Tasks</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-neutral-surface text-semantic-secondary font-mono text-xs font-bold border border-semantic-border">
                {filteredTickets.length}
              </span>
            </div>

            <div className="h-4 w-[1px] bg-semantic-border mx-1 hidden sm:block" />

            {/* Clean Segmented Filter */}
            <div className="flex items-center bg-semantic-subtle border border-semantic-border rounded-lg p-0.5 text-xs">
              {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatusFilter(st)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedStatusFilter === st
                      ? 'bg-semantic-brand text-white shadow-xs'
                      : 'text-semantic-jira-muted-strong hover:text-semantic-primary'
                  }`}
                >
                  {st === 'ALL' ? 'All Tasks' : st === 'OPEN' ? 'Active' : 'Completed'}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Search Filter + CSV Export + Primary CTA */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-semantic-jira-icon pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter this view..."
                className="bg-semantic-panel border border-semantic-border focus:border-semantic-brand focus:ring-2 focus:ring-semantic-brand/15 rounded-lg pl-9 pr-3 py-1.5 text-xs text-semantic-primary outline-none w-56 transition-all"
              />
            </div>

            <button
              onClick={exportToCSV}
              className="wrike-btn-secondary text-xs py-1.5 px-3"
              title="Export spreadsheet to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            <button
              onClick={onOpenCreate}
              className="wrike-btn-primary text-xs py-1.5 px-3.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Task</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedTicketIds.length > 0 && (
        <div className="bg-semantic-primary text-white px-6 py-2.5 flex items-center justify-between z-dsSticky shrink-0 shadow-md text-xs">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-semantic-brand text-white font-bold flex items-center justify-center text-xs">
              {selectedTicketIds.length}
            </span>
            <span className="font-semibold text-sm">{selectedTicketIds.length} tasks selected</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              disabled={isResolving}
              onClick={async () => {
                if (selectedTicketIds.length === 0 || isResolving) return;
                setIsResolving(true);
                try {
                  const response = await fetchWithAuth('/api/tickets/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ticketIds: selectedTicketIds,
                      action: 'RESOLVE',
                      value: 'Marked resolved via bulk action',
                    }),
                  });
                  const data = await response.json();
                  if (data.success) {
                    setSelectedTicketIds([]);
                    if (onRefreshTickets) onRefreshTickets();
                  } else {
                    alert(data.error || 'Failed to resolve tickets.');
                  }
                } catch (err: any) {
                  alert(err.message || 'Error occurred while resolving tickets.');
                } finally {
                  setIsResolving(false);
                }
              }}
              className="px-3.5 py-1.5 rounded-lg bg-semantic-brand hover:bg-semantic-brandHover disabled:opacity-50 text-white font-bold transition-colors flex items-center gap-1.5"
            >
              {isResolving ? 'Resolving...' : 'Mark Resolved'}
            </button>
            <button
              onClick={() => setSelectedTicketIds([])}
              className="px-3 py-1.5 rounded-lg bg-semantic-brand-ink hover:bg-semantic-brand-ink-hover text-semantic-dark-muted transition-colors"
            >
              Seçimi ləğv et
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <table className="wrike-table wrike-table-responsive w-full table-fixed">
          <thead className="sticky top-0 z-dsContent shadow-xs">
            <tr>
              <th className="w-12 text-center">
                <input
                  type="checkbox"
                  checked={filteredTickets.length > 0 && selectedTicketIds.length === filteredTickets.length}
                  onChange={toggleSelectAll}
                  className="rounded border-semantic-border-strong text-semantic-brand focus:ring-semantic-brand cursor-pointer w-4 h-4"
                />
              </th>
              <th className="w-24">Key</th>
              <th className="w-[28%]">Task Summary</th>
              <th className="w-24">Status</th>
              <th className="hidden w-28 lg:table-cell">Severity</th>
              <th className="hidden w-28 xl:table-cell">Priority</th>
              <th className="w-28">SLA Countdown</th>
              <th className="w-40">Assignee</th>
              <th className="hidden w-28 2xl:table-cell">Target System</th>
              <th className="hidden w-24 2xl:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-16 text-center text-semantic-jira-muted-strong text-sm">
                  No matching tasks found.
                </td>
              </tr>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicketIds.includes(ticket.id);
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-semantic-success-surface/50' : 'hover:bg-semantic-subtle'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="text-center" onClick={(e) => toggleSelectTicket(ticket.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-semantic-border-strong text-semantic-brand focus:ring-semantic-brand cursor-pointer w-4 h-4"
                      />
                    </td>

                    {/* Key */}
                    <td className="font-mono font-bold text-semantic-info text-xs overflow-hidden">
                      {ticket.key}
                    </td>

                    {/* Title */}
                    <td className="min-w-0 overflow-hidden">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="block min-w-0 truncate font-bold text-semantic-primary hover:text-semantic-brand transition-colors text-sm">
                          {ticket.title}
                        </span>
                        {ticket.tags && ticket.tags.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-semantic-neutral-surface border border-semantic-border text-label font-mono text-semantic-jira-muted-strong">
                            #{ticket.tags[0]}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="overflow-hidden whitespace-nowrap">{getStatusPill(ticket)}</td>

                    {/* Severity */}
                    <td className="hidden overflow-hidden lg:table-cell">
                      <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                    </td>

                    {/* Priority */}
                    <td className="hidden overflow-hidden xl:table-cell">
                      <Badge type="PRIORITY" value={ticket.businessPriority} />
                    </td>

                    {/* SLA Status */}
                    <td className="overflow-hidden whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <Clock className="w-3.5 h-3.5 text-semantic-brand" />
                        <Badge type="SLA" value={ticket.slaState || 'SAFE'} />
                      </div>
                    </td>

                    {/* Assignee / Department Queue */}
                    <td className="overflow-hidden">
                      {ticket.assigneeId ? (
                        (() => {
                          const assignedUser = allUsers.find((u) => u.id === ticket.assigneeId);
                          return (
                            <div className="flex items-center gap-2 text-xs text-semantic-brand-ink">
                              <div className="w-6 h-6 rounded-full bg-semantic-jira-brand text-white flex items-center justify-center text-caption font-bold shadow-sm shrink-0">
                                {assignedUser ? assignedUser.fullName.charAt(0).toUpperCase() : ticket.assigneeId.slice(4, 6).toUpperCase()}
                              </div>
                              <span className="truncate max-w-dsTruncateCompact font-semibold">
                                {assignedUser?.fullName || ticket.assigneeId}
                              </span>
                            </div>
                          );
                        })()
                      ) : (
                        (() => {
                          const dept = departments?.find((d) => d.id === (ticket.targetDepartmentId || ticket.departmentId));
                          return (
                            <div className="flex items-center gap-1.5 text-xs text-semantic-info-strong">
                              <span
                                className="px-2.5 py-0.5 rounded-full bg-semantic-info-soft border border-semantic-info-soft-border text-label font-bold tracking-tight flex items-center gap-1.5"
                                title={dept ? `${dept.name} Növbəsi - Götürülməyi gözləyir` : 'Şöbə Növbəsi'}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-semantic-info-strong animate-pulse shrink-0" />
                              <span className="truncate max-w-dsTruncateCompact">
                                  {dept?.name || (ticket.targetDepartmentId ? 'Şöbə Növbəsi' : 'Təyin edilməyib')}
                                </span>
                              </span>
                            </div>
                          );
                        })()
                      )}
                    </td>

                    {/* Target Asset */}
                    <td className="hidden overflow-hidden 2xl:table-cell">
                      <span className="font-mono text-xs text-semantic-jira-muted-strong">
                        {ticket.assetId || ticket.applicationId || 'Core Platform'}
                      </span>
                    </td>

                    {/* Created Date */}
                    <td className="hidden text-xs text-semantic-jira-muted-strong font-mono 2xl:table-cell">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="bg-semantic-subtle border-t border-semantic-border px-6 py-2.5 flex items-center justify-between text-xs text-semantic-jira-muted-strong shrink-0 font-medium">
        <div>
          Showing <span className="font-bold text-semantic-primary">{filteredTickets.length}</span> total tasks
        </div>
        <div className="flex items-center gap-5 text-xs">
          <span>Critical: <b className="text-semantic-brand-danger">{filteredTickets.filter((t) => t.technicalSeverity === 'CRITICAL').length}</b></span>
          <span>In Progress: <b className="text-semantic-info">{filteredTickets.filter((t) => t.statusCategory === 'IN_PROGRESS').length}</b></span>
          <span>Resolved: <b className="text-semantic-success">{filteredTickets.filter((t) => t.statusCategory === 'DONE').length}</b></span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void openArchive()}
        className="fixed bottom-5 right-5 z-dsOverlay inline-flex items-center gap-2 rounded-full border border-semantic-border-strong bg-semantic-panel px-4 py-2.5 text-xs font-bold text-semantic-primary shadow-lg transition hover:-translate-y-0.5 hover:border-semantic-brand hover:text-semantic-brand"
        title="View completed lifecycle archive"
      >
        <Archive className="h-4 w-4" />
        <span>Archive</span>
      </button>

      {isArchiveOpen && (
        <div
          className="absolute inset-0 z-dsDialog flex items-center justify-center bg-slate-950/20 p-4"
          role="presentation"
          onClick={() => setIsArchiveOpen(false)}
        >
          <section
            className="flex max-h-[min(70vh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-semantic-border-strong bg-semantic-panel shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-archive-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-semantic-border px-5 py-4">
              <div>
                <h2 id="ticket-archive-title" className="flex items-center gap-2 text-sm font-bold text-semantic-primary">
                  <Archive className="h-4 w-4 text-semantic-brand" />
                  Completed lifecycle archive
                </h2>
                <p className="mt-1 text-xs text-semantic-muted">Only tickets whose final workflow node completed appear here.</p>
              </div>
              <button type="button" onClick={() => setIsArchiveOpen(false)} className="rounded-lg p-2 text-semantic-muted hover:bg-semantic-subtle hover:text-semantic-primary" aria-label="Close archive">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-28 flex-1 overflow-y-auto p-3">
              {isLoadingArchive ? (
                <div className="flex items-center justify-center gap-2 p-8 text-xs text-semantic-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading archive…</div>
              ) : archivedTickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-semantic-muted">No completed lifecycle cases in the archive.</div>
              ) : (
                <div className="space-y-2">
                  {archivedTickets.map((ticket) => (
                    <button
                      type="button"
                      key={ticket.id}
                      onClick={() => { setIsArchiveOpen(false); onSelectTicket(ticket); }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-semantic-border p-3 text-left transition hover:border-semantic-brand hover:bg-semantic-subtle"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-bold text-semantic-info">{ticket.key}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-semantic-primary">{ticket.title}</span>
                      </span>
                      <span className="shrink-0 text-right text-label text-semantic-muted">
                        <span className="block">{ticket.statusName}</span>
                        <span className="block">{ticket.archivedAt ? new Date(ticket.archivedAt).toLocaleDateString() : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
