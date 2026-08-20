import React from 'react';
import {
  Table as TableIcon,
  Layers,
  Calendar as CalendarIcon,
  CalendarRange,
  Users,
  Search,
  Download,
  Plus,
  Filter,
} from 'lucide-react';
import { ViewMode } from '../../../shared/types/navigation.js';

interface DestinationViewHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  itemCount: number;
  activeViewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedStatusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onExportCSV?: () => void;
  onOpenCreate?: () => void;
  createButtonLabel?: string;
  supportsViewSwitcher?: boolean;
}

export const DestinationViewHeader: React.FC<DestinationViewHeaderProps> = ({
  title,
  description,
  icon,
  itemCount,
  activeViewMode,
  onSelectViewMode,
  searchQuery,
  onSearchChange,
  selectedStatusFilter,
  onStatusFilterChange,
  onExportCSV,
  onOpenCreate,
  createButtonLabel = 'New Task',
  supportsViewSwitcher = true,
}) => {
  const viewModes: { id: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'spreadsheet', label: 'Spreadsheet', icon: TableIcon },
    { id: 'kanban', label: 'Kanban', icon: Layers },
    { id: 'gantt', label: 'Gantt', icon: CalendarRange },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'capacity', label: 'Capacity', icon: Users },
  ];

  return (
    <div className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-6 py-3 shrink-0 select-none shadow-xs">
      {/* Top Row: Title, Icon, Badge, Description & View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-9 h-9 rounded-lg bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] flex items-center justify-center font-bold shrink-0">
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-[#162136] tracking-tight">{title}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] font-mono text-xs font-bold border border-[#E2E8F0]">
                {itemCount}
              </span>
            </div>
            {description && <p className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{description}</p>}
          </div>
        </div>

        {/* Page-Level View Switcher */}
        {supportsViewSwitcher && (
          <div className="flex items-center bg-[#F1F5F9] border border-[#CBD5E1] p-1 rounded-xl shadow-2xs self-start lg:self-auto">
            {viewModes.map((vm) => {
              const IconComp = vm.icon;
              const isActive = activeViewMode === vm.id;
              return (
                <button
                  key={vm.id}
                  onClick={() => onSelectViewMode(vm.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#FFFFFF] text-[#007860] shadow-sm border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#FFFFFF]/50'
                  }`}
                  title={`Switch to ${vm.label} view`}
                >
                  <IconComp className={`w-3.5 h-3.5 ${isActive ? 'text-[#00B259]' : 'text-[#64748B]'}`} />
                  <span>{vm.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Row: Status Segmented Filter, Search, CSV Export, CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
        {/* Left: Status Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-0.5 text-xs">
            {[
              { id: 'ALL', label: 'All Items' },
              { id: 'OPEN', label: 'Active' },
              { id: 'RESOLVED', label: 'Completed' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => onStatusFilterChange(st.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  selectedStatusFilter === st.id
                    ? 'bg-[#00B259] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#162136]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Search + Export + Create */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-[#94A3B8] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter tasks in this view..."
              className="bg-[#FFFFFF] border border-[#CBD5E1] focus:border-[#00B259] focus:ring-2 focus:ring-[#00B259]/15 rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#162136] outline-none w-52 transition-all placeholder:text-[#94A3B8]"
            />
          </div>

          {onExportCSV && (
            <button
              onClick={onExportCSV}
              className="wrike-btn-secondary text-xs py-1.5 px-3"
              title="Export current filtered view to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          )}

          {onOpenCreate && (
            <button
              onClick={onOpenCreate}
              className="wrike-btn-primary text-xs py-1.5 px-3.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{createButtonLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
