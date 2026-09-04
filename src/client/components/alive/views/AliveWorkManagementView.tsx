import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Plus,
  Table as TableIcon,
  Layers,
  CheckCircle2,
  Clock,
  User,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../../shared/types/asset.js';
import { BankDepartment } from '../../../../shared/types/auth.js';
import { useAuth } from '../../../context/AuthContext.js';
import { useI18n } from '../../../context/I18nContext.js';
import { Badge } from '../../common/Badge.js';
import { AliveTicketInspector } from '../inspectors/AliveTicketInspector.js';
import { AliveContextualBar } from '../common/AliveContextualBar.js';
import { TicketKanbanBoard } from '../../tickets/TicketKanbanBoard.js';

interface AliveWorkManagementViewProps {
  title: string;
  description?: string;
  tickets: Ticket[];
  applications?: BankApplication[];
  assets?: BankAsset[];
  departments?: BankDepartment[];
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreate: () => void;
  onRefreshTickets?: () => void;
  createButtonLabel?: string;
}

export const AliveWorkManagementView: React.FC<AliveWorkManagementViewProps> = ({
  title,
  description,
  tickets,
  applications = [],
  assets = [],
  departments = [],
  onSelectTicket,
  onOpenCreate,
  onRefreshTickets,
  createButtonLabel = 'New Work Item',
}) => {
  const { allUsers, fetchWithAuth } = useAuth();
  const { t } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH'>('ALL');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [inspectedTicket, setInspectedTicket] = useState<Ticket | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesSearch =
        !searchQuery ||
        ticket.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.title.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'OPEN' && ticket.statusCategory !== 'DONE') ||
        (statusFilter === 'RESOLVED' && ticket.statusCategory === 'DONE');

      const matchesSeverity =
        severityFilter === 'ALL' || ticket.technicalSeverity === severityFilter;

      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [tickets, searchQuery, statusFilter, severityFilter]);

  // Handle Multi-Select
  const toggleSelectAll = () => {
    if (selectedTicketIds.length === filteredTickets.length) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(filteredTickets.map((t) => t.id));
    }
  };

  const toggleSelectTicket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Row click opens the inline inspector
  const handleRowClick = (ticket: Ticket) => {
    setInspectedTicket(ticket);
  };

  const handleExportCSV = () => {
    const targetTickets = selectedTicketIds.length > 0
      ? tickets.filter((t) => selectedTicketIds.includes(t.id))
      : filteredTickets;

    const headers = ['Key', 'Title', 'Status', 'Severity', 'SLA', 'Created At'];
    const rows = targetTickets.map((t) => [
      t.key,
      `"${t.title.replace(/"/g, '""')}"`,
      t.statusName,
      t.technicalSeverity,
      t.slaState || 'N/A',
      t.createdAt,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClaimSelected = async () => {
    for (const id of selectedTicketIds) {
      await fetchWithAuth(`/api/tickets/${id}/claim`, { method: 'POST' }).catch(() => {});
    }
    setSelectedTicketIds([]);
    onRefreshTickets?.();
  };

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden relative">
      {/* Primary Workspace Table Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-semantic-panel select-none">
        {/* Header Toolbar */}
        <div className="px-6 py-4 border-b border-semantic-border flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-semantic-strongest tracking-tight">
                {t(title)}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-subtle text-[#00F576] font-mono text-xs font-bold border border-semantic-border">
                {filteredTickets.length}
              </span>
            </div>
            {description && (
              <p className="text-xs text-semantic-secondary mt-0.5 line-clamp-1">
                {t(description)}
              </p>
            )}
          </div>

          {/* Search, Filter & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[180px] sm:min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-semantic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Filter records...')}
                className="w-full bg-semantic-subtle border border-semantic-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-semantic-primary placeholder-semantic-muted focus:outline-none focus:border-[#00F576] transition-colors"
              />
            </div>

            {/* View Switcher: Table / Kanban */}
            <div className="flex items-center rounded-xl bg-semantic-subtle border border-semantic-border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'table' ? 'bg-semantic-panel text-[#00F576] shadow-xs' : 'text-semantic-muted hover:text-semantic-primary'
                }`}
                title={t('Spreadsheet Table')}
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'kanban' ? 'bg-semantic-panel text-[#00F576] shadow-xs' : 'text-semantic-muted hover:text-semantic-primary'
                }`}
                title={t('Kanban Board')}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Export */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="alive-btn-secondary py-1.5 px-3 text-xs"
              title={t('Export CSV')}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('Export')}</span>
            </button>

            {/* Create */}
            <button
              type="button"
              onClick={onOpenCreate}
              className="alive-btn-primary py-1.5 px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t(createButtonLabel)}</span>
            </button>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="px-6 py-2 border-b border-semantic-border bg-semantic-subtle/30 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
          <span className="text-caption font-mono uppercase font-bold text-semantic-muted mr-1">
            {t('Filters')}:
          </span>

          {/* Status filter chips */}
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 rounded-full text-caption font-semibold transition-all ${
                statusFilter === status
                  ? 'bg-[#00F576]/15 text-[#00F576] border border-[#00F576]/30 shadow-xs'
                  : 'bg-semantic-panel border border-semantic-border text-semantic-muted hover:text-semantic-primary'
              }`}
            >
              {status === 'ALL' ? t('All Status') : status === 'OPEN' ? t('Active / Open') : t('Resolved')}
            </button>
          ))}

          {/* Severity filter chips */}
          {(['ALL', 'CRITICAL', 'HIGH'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded-full text-caption font-semibold transition-all ${
                severityFilter === sev
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs'
                  : 'bg-semantic-panel border border-semantic-border text-semantic-muted hover:text-semantic-primary'
              }`}
            >
              {sev === 'ALL' ? t('All Severities') : sev}
            </button>
          ))}
        </div>

        {/* View Mode: Table or Kanban */}
        {viewMode === 'kanban' ? (
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            <TicketKanbanBoard
              tickets={filteredTickets}
              onSelectTicket={onSelectTicket}
              onRefreshTickets={onRefreshTickets}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-semantic-subtle/80 sticky top-0 z-dsContent border-b border-semantic-border backdrop-blur-xs font-mono text-label text-semantic-muted uppercase">
                <tr>
                  <th className="py-2.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedTicketIds.length > 0 && selectedTicketIds.length === filteredTickets.length}
                      onChange={toggleSelectAll}
                      className="rounded border-semantic-border-strong text-[#00F576] focus:ring-[#00F576]"
                    />
                  </th>
                  <th className="py-2.5 px-4 w-32 font-bold">{t('Key')}</th>
                  <th className="py-2.5 px-4 font-bold">{t('Title & Summary')}</th>
                  <th className="py-2.5 px-4 w-28 font-bold">{t('Status')}</th>
                  <th className="py-2.5 px-4 w-28 font-bold">{t('Severity')}</th>
                  <th className="py-2.5 px-4 w-32 font-bold">{t('SLA State')}</th>
                  <th className="py-2.5 px-4 w-36 font-bold">{t('Assignee')}</th>
                  <th className="py-2.5 px-4 w-28 font-bold">{t('Created')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-semantic-border">
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-semantic-muted">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[#00F576] opacity-75" />
                      <div className="font-semibold text-sm text-semantic-primary">{t('No work items found')}</div>
                      <div className="text-xs mt-1">{t('Try clearing filters or search query.')}</div>
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => {
                    const isSelected = selectedTicketIds.includes(ticket.id);
                    const isInspected = inspectedTicket?.id === ticket.id;
                    const assignee = allUsers.find((u) => u.id === ticket.assigneeId);

                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => handleRowClick(ticket)}
                        className={`alive-interactive-row cursor-pointer transition-colors ${
                          isInspected
                            ? 'bg-[#00F576]/10 border-l-2 border-l-[#00F576]'
                            : isSelected
                            ? 'bg-semantic-selected'
                            : 'hover:bg-semantic-hover'
                        }`}
                      >
                        <td className="py-2.5 px-4 text-center" onClick={(e) => toggleSelectTicket(ticket.id, e)}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-semantic-border-strong text-[#00F576] focus:ring-[#00F576]"
                          />
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-[#00F576] whitespace-nowrap">
                          {ticket.key}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-semantic-primary max-w-md truncate">
                          {ticket.title}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-caption font-bold border ${
                              ticket.statusCategory === 'DONE'
                                ? 'bg-[#00F576]/10 text-[#00F576] border-[#00F576]/20'
                                : ticket.statusCategory === 'IN_PROGRESS'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}
                          >
                            {ticket.statusName}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-mono text-caption">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold ${
                              ticket.slaState === 'BREACHED'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : ticket.slaState === 'AT_RISK'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'text-semantic-muted'
                            }`}
                          >
                            {ticket.slaState || 'WITHIN_SLA'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-semantic-secondary truncate max-w-[140px]">
                          {assignee ? assignee.fullName : <span className="text-semantic-muted italic">{t('Unassigned')}</span>}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-mono text-caption text-semantic-muted">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Side Inspector (Mounts beside table without replacing workspace) */}
      {inspectedTicket && (
        <AliveTicketInspector
          ticket={inspectedTicket}
          onClose={() => setInspectedTicket(null)}
          onExpandFull={(t) => onSelectTicket(t)}
          onClaim={async () => {
            await fetchWithAuth(`/api/tickets/${inspectedTicket.id}/claim`, { method: 'POST' });
            onRefreshTickets?.();
            setInspectedTicket(null);
          }}
        />
      )}

      {/* Floating Contextual Dock for Multi-Selections */}
      <AliveContextualBar
        selectedCount={selectedTicketIds.length}
        onClearSelection={() => setSelectedTicketIds([])}
        onClaimSelected={handleClaimSelected}
        onExportSelected={handleExportCSV}
      />
    </div>
  );
};
