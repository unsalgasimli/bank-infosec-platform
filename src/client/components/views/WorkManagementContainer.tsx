import React, { useState, useMemo } from 'react';
import { DestinationViewHeader } from '../layout/DestinationViewHeader.js';
import { WrikeTableView } from './WrikeTableView.js';
import { TicketKanbanBoard } from '../tickets/TicketKanbanBoard.js';
import { WrikeGanttView } from './WrikeGanttView.js';
import { WrikeCalendarView } from './WrikeCalendarView.js';
import { WrikeWorkloadView } from './WrikeWorkloadView.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { BankDepartment } from '../../../shared/types/auth.js';
import { ViewMode } from '../../../shared/types/navigation.js';

interface WorkManagementContainerProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tickets: Ticket[];
  applications: BankApplication[];
  assets: BankAsset[];
  departments?: BankDepartment[];
  activeViewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreate: () => void;
  onRefreshTickets?: () => void;
  createButtonLabel?: string;
  supportsViewSwitcher?: boolean;
  dataScope?: 'authorized' | 'assigned' | 'reported';
  allowedViewModes?: ViewMode[];
}

export const WorkManagementContainer: React.FC<WorkManagementContainerProps> = ({
  title,
  description,
  icon,
  tickets,
  applications,
  assets,
  departments,
  activeViewMode,
  onSelectViewMode,
  onSelectTicket,
  onOpenCreate,
  onRefreshTickets,
  createButtonLabel = 'New Task',
  supportsViewSwitcher = true,
  dataScope = 'authorized',
  allowedViewModes = ['spreadsheet', 'kanban', 'gantt', 'calendar'],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  const effectiveViewMode = useMemo(() => {
    if (allowedViewModes.includes(activeViewMode)) {
      return activeViewMode;
    }
    return allowedViewModes[0] || 'spreadsheet';
  }, [activeViewMode, allowedViewModes]);

  // Filter tickets based on status and search query
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
        (selectedStatusFilter === 'RESOLVED' && t.statusCategory === 'DONE');

      return matchesSearch && matchesStatus;
    });
  }, [tickets, searchQuery, selectedStatusFilter]);

  const handleExportCSV = () => {
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
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-panel overflow-hidden">
      {/* Top Destination Header Toolbar with View Switcher */}
      <DestinationViewHeader
        title={title}
        description={description}
        icon={icon}
        itemCount={filteredTickets.length}
        activeViewMode={effectiveViewMode}
        onSelectViewMode={onSelectViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedStatusFilter={selectedStatusFilter}
        onStatusFilterChange={setSelectedStatusFilter}
        onExportCSV={handleExportCSV}
        onOpenCreate={onOpenCreate}
        createButtonLabel={createButtonLabel}
        supportsViewSwitcher={supportsViewSwitcher}
        allowedViewModes={allowedViewModes}
      />

      {/* Render Active View Mode */}
      <div className="flex-1 flex overflow-hidden">
        {effectiveViewMode === 'spreadsheet' && (
          <WrikeTableView
            tickets={filteredTickets}
            applications={applications}
            assets={assets}
            departments={departments}
            onSelectTicket={onSelectTicket}
            onOpenCreate={onOpenCreate}
            onRefreshTickets={onRefreshTickets}
            hideHeader={true}
          />
        )}

        {effectiveViewMode === 'kanban' && (
          <TicketKanbanBoard
            tickets={filteredTickets}
            onSelectTicket={onSelectTicket}
          />
        )}

        {effectiveViewMode === 'gantt' && (
          <WrikeGanttView
            tickets={filteredTickets}
            onSelectTicket={onSelectTicket}
            onOpenCreate={onOpenCreate}
            dataScope={dataScope}
          />
        )}

        {effectiveViewMode === 'calendar' && (
          <WrikeCalendarView
            tickets={filteredTickets}
            onSelectTicket={onSelectTicket}
          />
        )}

        {effectiveViewMode === 'capacity' && (
          <WrikeWorkloadView
            tickets={filteredTickets}
            onSelectTicket={onSelectTicket}
            onRefreshTickets={onRefreshTickets}
            dataScope={dataScope}
          />
        )}
      </div>
    </div>
  );
};
