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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-bank-900 border border-slate-700 shadow-xl rounded-lg px-4 py-2 flex items-center gap-3 text-xs font-medium text-white">
      <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
        <span className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center text-xs font-bold font-mono">
          {selectedCount}
        </span>
        <span>Selected</span>
      </div>

      {/* Bulk Assign */}
      <div className="flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
        <select
          onChange={(e) => {
            if (e.target.value) onBulkAssign(e.target.value);
          }}
          defaultValue=""
          className="bg-bank-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
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
        <Tag className="w-3.5 h-3.5 text-slate-400" />
        <select
          onChange={(e) => {
            if (e.target.value) onBulkPriority(e.target.value);
          }}
          defaultValue=""
          className="bg-bank-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
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
        className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white rounded border border-slate-700 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Export</span>
      </button>

      {/* Clear Selection */}
      <button
        onClick={onClear}
        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors ml-1"
        title="Clear Selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

