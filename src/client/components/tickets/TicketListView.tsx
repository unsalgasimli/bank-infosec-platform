import React, { useState, useMemo } from 'react';
import { Ticket, TechnicalSeverity, BusinessPriority } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { BulkActionBar } from './BulkActionBar.js';
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
  const { allUsers, fetchWithAuth } = useAuth();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'key' | 'severity' | 'updatedAt' | 'sla'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
    const exported = filteredTickets.filter((t) => selectedIds.includes(t.id));
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
    link.setAttribute('download', `AegisSec_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bank-950 overflow-hidden">
      {/* Control Header: JQL Bar & Quick Filter Pills */}
      <div className="p-3.5 bg-bank-900 border-b border-slate-800 space-y-2.5 shrink-0">
        {/* JQL Query Input */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 bg-bank-950 border border-slate-700 rounded text-xs font-mono font-semibold text-slate-300 shrink-0">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>JQL</span>
          </div>
          <input
            type="text"
            value={jqlQuery}
            onChange={(e) => onJqlChange(e.target.value)}
            placeholder="e.g. project = APPSEC AND severity IN (CRITICAL, HIGH) AND status != CLOSED"
            className="flex-1 bg-bank-950 border border-slate-700/80 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
          />
          {jqlQuery && (
            <button
              onClick={() => onJqlChange('')}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white rounded bg-slate-800 border border-slate-700"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-bank-950 p-0.5 rounded border border-slate-800">
              <span className="text-[11px] text-slate-500 px-1.5 font-semibold uppercase">Severity:</span>
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    severityFilter === sev ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-bank-950 p-0.5 rounded border border-slate-800">
              <span className="text-[11px] text-slate-500 px-1.5 font-semibold uppercase">Domain:</span>
              {['ALL', 'APPSEC', 'SOC', 'VULNERABILITY_MGMT', 'GRC', 'DLP'].map((dom) => (
                <button
                  key={dom}
                  onClick={() => setDomainFilter(dom)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    domainFilter === dom ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {dom.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            Showing <strong className="text-white">{filteredTickets.length}</strong> of {tickets.length} tickets
          </div>
        </div>
      </div>

      {/* Enterprise Data Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-bank-900 sticky top-0 z-20 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
            <tr>
              <th className="w-10 px-3 py-2.5 text-center">
                <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white">
                  {selectedIds.length === filteredTickets.length && filteredTickets.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => { setSortField('key'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center gap-1">Key <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-3 py-2.5">Summary & Finding Details</th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => { setSortField('severity'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center gap-1">Severity <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => { setSortField('sla'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center gap-1">SLA Countdown <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-3 py-2.5">Assignee</th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white text-right" onClick={() => { setSortField('updatedAt'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                <div className="flex items-center justify-end gap-1">Updated <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="w-8 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16 text-slate-500 text-xs">
                  No tickets matched your query or filters.
                </td>
              </tr>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedIds.includes(ticket.id);
                const assignee = allUsers.find((u) => u.id === ticket.assigneeId);
                const app = applications.find((a) => a.id === ticket.applicationId);

                return (
                  <tr
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                      isSelected ? 'bg-slate-800/60' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center" onClick={(e) => toggleSelectTicket(ticket.id, e)}>
                      <button className="text-slate-400 hover:text-white">
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-blue-400 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Badge type="PROJECT" value={ticket.projectCode} size="sm" />
                        <span>{ticket.key}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-white truncate max-w-md">
                        {ticket.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                        {app && <span className="text-slate-300">App: {app.code}</span>}
                        {ticket.findingDetails?.cweId && (
                          <span className="font-mono text-blue-400">{ticket.findingDetails.cweId}</span>
                        )}
                        {ticket.findingDetails?.cveId && (
                          <span className="font-mono text-red-400">{ticket.findingDetails.cveId}</span>
                        )}
                        <Badge type="CONFIDENTIALITY" value={ticket.confidentiality} size="sm" />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded bg-bank-900 border border-slate-700 text-slate-200 text-xs font-medium">
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
                            <div className="w-5 h-5 rounded bg-slate-800 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-slate-300 shrink-0">
                              {assignee.avatarUrl ? (
                                <img src={assignee.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                assignee.fullName.charAt(0)
                              )}
                            </div>
                            <span className="text-slate-200 truncate">{assignee.fullName}</span>
                          </>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 text-right">
                      {new Date(ticket.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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

