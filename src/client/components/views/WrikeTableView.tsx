import React, { useState, useMemo } from 'react';
import {
  Table as TableIcon,
  Search,
  Plus,
  Download,
  Clock,
  User,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { Ticket } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { Badge } from '../common/Badge.js';

interface WrikeTableViewProps {
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreate: () => void;
}

export const WrikeTableView: React.FC<WrikeTableViewProps> = ({
  tickets,
  applications,
  assets,
  onSelectTicket,
  onOpenCreate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState('ALL');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);

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
    const headers = ['Key', 'Title', 'Status', 'Severity', 'Priority', 'SLA State', 'Assignee', 'Created At'];
    const rows = filteredTickets.map((t) => [
      t.key,
      `"${t.title.replace(/"/g, '""')}"`,
      t.statusName,
      t.technicalSeverity,
      t.businessPriority,
      t.slaState || 'N/A',
      t.assigneeId || 'Unassigned',
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
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] overflow-hidden select-none">
      {/* Clean Single-Row View Header Toolbar */}
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        {/* Left: View Title, Counter & Segmented Status Filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#162136]">Spreadsheet Tasks</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] font-mono text-xs font-bold border border-[#E2E8F0]">
              {filteredTickets.length}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-[#E2E8F0] mx-1 hidden sm:block" />

          {/* Clean Segmented Filter */}
          <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-0.5 text-xs">
            {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatusFilter(st)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  selectedStatusFilter === st
                    ? 'bg-[#00B259] text-white shadow-xs'
                    : 'text-[#5A6A85] hover:text-[#162136]'
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
            <Search className="w-4 h-4 absolute left-3 text-[#8D99AE] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter this view..."
              className="bg-[#FFFFFF] border border-[#E2E8F0] focus:border-[#00B259] focus:ring-2 focus:ring-[#00B259]/15 rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#162136] outline-none w-56 transition-all"
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

      {/* Floating Bulk Action Bar */}
      {selectedTicketIds.length > 0 && (
        <div className="bg-[#162136] text-white px-6 py-2.5 flex items-center justify-between z-20 shrink-0 shadow-md text-xs">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-[#00B259] text-white font-bold flex items-center justify-center text-xs">
              {selectedTicketIds.length}
            </span>
            <span className="font-semibold text-sm">{selectedTicketIds.length} tasks selected</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => alert(`Bulk updated ${selectedTicketIds.length} tasks`)}
              className="px-3.5 py-1.5 rounded-lg bg-[#00B259] hover:bg-[#00964B] text-white font-bold transition-colors"
            >
              Mark Resolved
            </button>
            <button
              onClick={() => setSelectedTicketIds([])}
              className="px-3 py-1.5 rounded-lg bg-[#2B3A57] hover:bg-[#40516E] text-[#BFC7D9] transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="wrike-table">
          <thead className="sticky top-0 z-10 shadow-xs">
            <tr>
              <th className="w-12 text-center">
                <input
                  type="checkbox"
                  checked={filteredTickets.length > 0 && selectedTicketIds.length === filteredTickets.length}
                  onChange={toggleSelectAll}
                  className="rounded border-[#CBD5E1] text-[#00B259] focus:ring-[#00B259] cursor-pointer w-4 h-4"
                />
              </th>
              <th className="w-28">Key</th>
              <th className="min-w-[320px]">Task Summary</th>
              <th className="w-36">Status</th>
              <th className="w-36">Severity</th>
              <th className="w-32">Priority</th>
              <th className="w-36">SLA Countdown</th>
              <th className="w-40">Assignee</th>
              <th className="w-36">Target System</th>
              <th className="w-32">Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-16 text-center text-[#5A6A85] text-sm">
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
                      isSelected ? 'bg-[#E6F7EF]/50' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="text-center" onClick={(e) => toggleSelectTicket(ticket.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-[#CBD5E1] text-[#00B259] focus:ring-[#00B259] cursor-pointer w-4 h-4"
                      />
                    </td>

                    {/* Key */}
                    <td className="font-mono font-bold text-[#0073D3] text-xs">
                      {ticket.key}
                    </td>

                    {/* Title */}
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#162136] hover:text-[#00B259] transition-colors truncate text-sm">
                          {ticket.title}
                        </span>
                        {ticket.tags && ticket.tags.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-mono text-[#5A6A85]">
                            #{ticket.tags[0]}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td>{getStatusPill(ticket)}</td>

                    {/* Severity */}
                    <td>
                      <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                    </td>

                    {/* Priority */}
                    <td>
                      <Badge type="PRIORITY" value={ticket.businessPriority} />
                    </td>

                    {/* SLA Status */}
                    <td>
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <Clock className="w-3.5 h-3.5 text-[#00B259]" />
                        <Badge type="SLA" value={ticket.slaState || 'SAFE'} />
                      </div>
                    </td>

                    {/* Assignee */}
                    <td>
                      <div className="flex items-center gap-2 text-xs text-[#2B3A57]">
                        <div className="w-6 h-6 rounded-full bg-[#00B259] text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                          {ticket.assigneeId ? ticket.assigneeId.slice(4, 6).toUpperCase() : 'UG'}
                        </div>
                        <span className="truncate max-w-[110px] font-semibold">{ticket.assigneeId || 'Unassigned'}</span>
                      </div>
                    </td>

                    {/* Target Asset */}
                    <td>
                      <span className="font-mono text-xs text-[#5A6A85]">
                        {ticket.assetId || ticket.applicationId || 'Core Platform'}
                      </span>
                    </td>

                    {/* Created Date */}
                    <td className="text-xs text-[#5A6A85] font-mono">
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
      <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-6 py-2.5 flex items-center justify-between text-xs text-[#5A6A85] shrink-0 font-medium">
        <div>
          Showing <span className="font-bold text-[#162136]">{filteredTickets.length}</span> total tasks
        </div>
        <div className="flex items-center gap-5 text-xs">
          <span>Critical: <b className="text-[#E51739]">{filteredTickets.filter((t) => t.technicalSeverity === 'CRITICAL').length}</b></span>
          <span>In Progress: <b className="text-[#0073D3]">{filteredTickets.filter((t) => t.statusCategory === 'IN_PROGRESS').length}</b></span>
          <span>Resolved: <b className="text-[#007860]">{filteredTickets.filter((t) => t.statusCategory === 'DONE').length}</b></span>
        </div>
      </div>
    </div>
  );
};
