import React, { useEffect } from 'react';
import {
  X,
  Server,
  Shield,
  Activity,
  Layers,
  ExternalLink,
  Plus,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { BankAsset, BankApplication } from '../../../../shared/types/asset.js';
import { useI18n } from '../../../context/I18nContext.js';

interface AliveAssetInspectorProps {
  item: BankAsset | BankApplication;
  onClose: () => void;
  onCreateTicketForAsset?: (assetName: string) => void;
}

export const AliveAssetInspector: React.FC<AliveAssetInspectorProps> = ({
  item,
  onClose,
  onCreateTicketForAsset,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isApplication = 'code' in item;
  const status = item.environment || 'PRODUCTION';

  return (
    <aside
      aria-label="Asset Inspector"
      className="alive-inspector-panel w-full sm:w-[460px] bg-semantic-panel h-full flex flex-col shrink-0 select-none z-dsSticky border-l border-semantic-border"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-semantic-border bg-semantic-subtle/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00F576]/15 text-[#00F576] border border-[#00F576]/30 flex items-center justify-center">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="text-caption font-mono uppercase font-bold text-semantic-muted">
              {isApplication ? t('Application CI') : t('Infrastructure Asset')}
            </div>
            <div className="font-bold text-sm text-semantic-primary truncate max-w-[240px]">
              {item.name}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-semantic-muted hover:text-semantic-primary rounded-lg hover:bg-semantic-hover transition-colors"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-b border-semantic-border flex items-center gap-2">
        {onCreateTicketForAsset && (
          <button
            type="button"
            onClick={() => onCreateTicketForAsset(item.name)}
            className="alive-btn-primary text-xs py-1.5 px-3 flex-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('Log Issue on this CI')}</span>
          </button>
        )}
      </div>

      {/* Details Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs custom-scrollbar">
        {/* Status Indicator */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-semantic-subtle/50 border border-semantic-border">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00F576] animate-pulse" />
            <span className="font-bold text-semantic-primary">{t('Operational Status')}</span>
          </div>
          <span className="font-mono font-bold text-[#00F576] text-caption uppercase">
            {status}
          </span>
        </div>

        {/* Metadata Grid */}
        <div className="space-y-2.5">
          <div className="p-3 bg-semantic-subtle/30 rounded-xl border border-semantic-border">
            <div className="text-caption font-mono uppercase font-bold text-semantic-muted mb-1">
              {t('Asset Identifier / Code')}
            </div>
            <div className="font-mono text-sm font-semibold text-semantic-primary">
              {item.id}
            </div>
          </div>

          {'code' in item && item.code && (
            <div className="p-3 bg-semantic-subtle/30 rounded-xl border border-semantic-border">
              <div className="text-caption font-mono uppercase font-bold text-semantic-muted mb-1">
                {t('Application Code')}
              </div>
              <div className="font-semibold text-semantic-primary font-mono">
                {item.code}
              </div>
            </div>
          )}

          {'ipAddress' in item && item.ipAddress && (
            <div className="p-3 bg-semantic-subtle/30 rounded-xl border border-semantic-border">
              <div className="text-caption font-mono uppercase font-bold text-semantic-muted mb-1">
                {t('IP Address')}
              </div>
              <div className="font-mono font-semibold text-semantic-primary">
                {item.ipAddress}
              </div>
            </div>
          )}

          {Boolean(item.criticality) && (
            <div className="p-3 bg-semantic-subtle/30 rounded-xl border border-semantic-border">
              <div className="text-caption font-mono uppercase font-bold text-semantic-muted mb-1">
                {t('Business Criticality')}
              </div>
              <div className="font-semibold text-semantic-primary">
                {String(item.criticality)}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
