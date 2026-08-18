import React from 'react';
import { UserCheck, Tag, ArrowRight, Download, X } from 'lucide-react';
import { BankUser } from '../../../shared/types/auth.js';

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
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#FFFFFF] border border-[#DFE1E6] shadow-2xl rounded-md px-4 py-2 flex items-center gap-3 text-xs font-medium text-[#172B4D]">
      <div className="flex items-center gap-2 pr-3 border-r border-[#DFE1E6]">
        <span className="w-5 h-5 rounded bg-[#0052CC] text-white flex items-center justify-center text-xs font-bold font-mono">
          {selectedCount}
        </span>
        <span>Selected</span>
      </div>

      {/* Bulk Assign */}
      <div className="flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5 text-[#5E6C84]" />
        <select
          onChange={(e) => {
            if (e.target.value) onBulkAssign(e.target.value);
          }}
          defaultValue=""
          className="jira-input py-1 text-xs"
        >
          <option value="" disabled>Assign To...</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({u.roles[0]})
            </option>
          ))}
        </select>
      </div>

      {/* Bulk Priority */}
      <div className="flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-[#5E6C84]" />
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
        className="p-1 text-[#5E6C84] hover:text-[#172B4D] rounded hover:bg-[#EBECF0] transition-colors ml-1"
        title="Clear Selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

