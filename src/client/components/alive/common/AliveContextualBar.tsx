import React from 'react';
import {
  CheckCircle2,
  UserCheck,
  ArrowRight,
  Download,
  X,
  ShieldAlert,
} from 'lucide-react';
import { useI18n } from '../../../context/I18nContext.js';

interface AliveContextualBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onClaimSelected?: () => void;
  onBulkResolve?: () => void;
  onExportSelected?: () => void;
}

export const AliveContextualBar: React.FC<AliveContextualBarProps> = ({
  selectedCount,
  onClearSelection,
  onClaimSelected,
  onBulkResolve,
  onExportSelected,
}) => {
  const { t } = useI18n();

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-dsFloating transition-all duration-200 ease-out">
      <div className="alive-dock flex items-center gap-3 px-4 py-2 text-xs font-semibold text-semantic-primary select-none">
        {/* Count Badge */}
        <div className="flex items-center gap-2 pr-2 border-r border-semantic-border-strong">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#00F576] text-[#041407] font-bold font-mono text-caption shadow-[0_0_8px_rgba(0,245,118,0.4)]">
            {selectedCount}
          </span>
          <span className="text-semantic-strong font-medium">
            {selectedCount === 1 ? t('item selected') : t('items selected')}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {onClaimSelected && (
            <button
              type="button"
              onClick={onClaimSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-semantic-panel hover:bg-semantic-hover border border-semantic-border text-semantic-primary transition-all hover:border-[#00F576]/50"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#00F576]" />
              <span>{t('Claim')}</span>
            </button>
          )}

          {onBulkResolve && (
            <button
              type="button"
              onClick={onBulkResolve}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00F576]/15 hover:bg-[#00F576]/25 border border-[#00F576]/40 text-[#00F576] transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00F576]" />
              <span>{t('Resolve')}</span>
            </button>
          )}

          {onExportSelected && (
            <button
              type="button"
              onClick={onExportSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-semantic-panel hover:bg-semantic-hover border border-semantic-border text-semantic-secondary hover:text-semantic-primary transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('Export')}</span>
            </button>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onClearSelection}
          className="p-1 text-semantic-muted hover:text-semantic-primary hover:bg-semantic-hover rounded-full transition-colors ml-1"
          title="Clear selection (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
