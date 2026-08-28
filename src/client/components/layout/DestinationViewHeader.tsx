import React from 'react';
import {
  Table as TableIcon,
  Layers,
  Users,
  Search,
  Download,
  Plus,
  Filter,
} from 'lucide-react';
import { ViewMode } from '../../../shared/types/navigation.js';
import { useI18n } from '../../context/I18nContext.js';

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
  allowedViewModes?: ViewMode[];
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
  createButtonLabel,
  supportsViewSwitcher = true,
  allowedViewModes = ['spreadsheet', 'kanban'],
}) => {
  const { t } = useI18n();

  const allViewModes: { id: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'spreadsheet', label: t('Spreadsheet'), icon: TableIcon },
    { id: 'kanban', label: t('Kanban'), icon: Layers },
    { id: 'capacity', label: t('Capacity'), icon: Users },
  ];

  const viewModes = allViewModes.filter((vm) => allowedViewModes.includes(vm.id));

  return (
    <div className="bg-semantic-panel border-b border-semantic-border px-6 py-3 shrink-0 select-none shadow-xs">
      {/* Top Row: Title, Icon, Badge, Description & View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-9 h-9 rounded-lg bg-semantic-success-surface text-semantic-success border border-semantic-success-border flex items-center justify-center font-bold shrink-0">
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-semantic-primary tracking-tight">{t(title)}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-neutral-surface text-semantic-secondary font-mono text-xs font-bold border border-semantic-border">
                {itemCount}
              </span>
            </div>
            {description && <p className="text-xs text-semantic-muted mt-0.5 line-clamp-1">{t(description)}</p>}
          </div>
        </div>

        {/* Page-Level View Switcher */}
        {supportsViewSwitcher && (
          <div className="flex items-center bg-semantic-neutral-surface border border-semantic-border-strong p-1 rounded-xl shadow-2xs self-start lg:self-auto">
            {viewModes.map((vm) => {
              const IconComp = vm.icon;
              const isActive = activeViewMode === vm.id;
              return (
                <button
                  key={vm.id}
                  onClick={() => onSelectViewMode(vm.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-semantic-panel text-semantic-success shadow-sm border border-semantic-border'
                      : 'text-semantic-muted hover:text-semantic-strongest hover:bg-semantic-panel/50'
                  }`}
                  title={`${t('Switch to')} ${vm.label}`}
                >
                  <IconComp className={`w-3.5 h-3.5 ${isActive ? 'text-semantic-brand' : 'text-semantic-muted'}`} />
                  <span>{vm.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Row: Status Segmented Filter, Search, CSV Export, CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-semantic-neutral-surface">
        {/* Left: Status Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-semantic-subtle border border-semantic-border rounded-lg p-0.5 text-xs">
            {[
              { id: 'ALL', label: t('All Items') },
              { id: 'OPEN', label: t('Active') },
              { id: 'RESOLVED', label: t('Completed') },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => onStatusFilterChange(st.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  selectedStatusFilter === st.id
                    ? 'bg-semantic-brand text-white shadow-xs'
                    : 'text-semantic-muted hover:text-semantic-primary'
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
            <Search className="w-4 h-4 absolute left-3 text-semantic-placeholder pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('Filter tasks in this view...')}
              className="bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand focus:ring-2 focus:ring-semantic-brand/15 rounded-lg pl-9 pr-3 py-1.5 text-xs text-semantic-primary outline-none w-52 transition-all placeholder:text-semantic-placeholder"
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
