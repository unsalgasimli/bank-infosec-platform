import React, { useState } from 'react';
import { UserCheck, Tag, ArrowRight, Download, X } from 'lucide-react';
import { BankUser } from '../../../shared/types/auth.js';
import { DirectoryAssignmentSelect } from '../common/DirectoryAssignmentSelect.js';

interface BulkActionBarProps {
  selectedCount: number;
  allUsers: BankUser[];
  onClear: () => void;
  onBulkAssign: (userId: string) => void;
  onBulkPriority: (priority: string) => void;
  onExportSelected: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  allUsers,
  onClear,
  onBulkAssign,
  onBulkPriority,
  onExportSelected,
}) => {
  const [assigneeId, setAssigneeId] = useState('');
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-dsFloating bg-semantic-panel border border-semantic-jira-border shadow-2xl rounded-md px-4 py-2 flex items-center gap-3 text-xs font-medium text-semantic-jira-primary">
      <div className="flex items-center gap-2 pr-3 border-r border-semantic-jira-border">
        <span className="w-5 h-5 rounded bg-semantic-jira-brand text-white flex items-center justify-center text-xs font-bold font-mono">
          {selectedCount}
        </span>
        <span>Selected</span>
      </div>

      {/* Bulk Assign */}
      <div className="flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5 text-semantic-jira-muted" />
        <DirectoryAssignmentSelect
          kind="user"
          value={assigneeId}
          onChange={(value) => {
            setAssigneeId(value);
            if (value) onBulkAssign(value);
          }}
          placeholder="Assign to…"
          searchPlaceholder="Search employee…"
          size="sm"
        />
      </div>

      {/* Bulk Priority */}
      <div className="flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-semantic-jira-muted" />
        <select
          onChange={(e) => {
            if (e.target.value) onBulkPriority(e.target.value);
          }}
          defaultValue=""
          className="jira-input py-1 text-xs"
        >
          <option value="" disabled>Set Priority...</option>
          <option value="P1_URGENT">P1_URGENT</option>
          <option value="P2_HIGH">P2_HIGH</option>
          <option value="P3_MEDIUM">P3_MEDIUM</option>
          <option value="P4_LOW">P4_LOW</option>
        </select>
      </div>

      {/* Export CSV */}
      <button
        onClick={onExportSelected}
        className="jira-btn-secondary py-1"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Export</span>
      </button>

      {/* Clear Selection */}
      <button
        onClick={onClear}
        className="p-1 text-semantic-jira-muted hover:text-semantic-jira-primary rounded hover:bg-semantic-jira-hover transition-colors ml-1"
        title="Clear Selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
