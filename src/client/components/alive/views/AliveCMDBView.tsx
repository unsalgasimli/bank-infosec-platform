import React, { useState, useMemo } from 'react';
import {
  Server,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Plus,
  ArrowRight,
  Shield,
  Download,
} from 'lucide-react';
import { BankAsset, BankApplication } from '../../../../shared/types/asset.js';
import { useI18n } from '../../../context/I18nContext.js';
import { AliveAssetInspector } from '../inspectors/AliveAssetInspector.js';

interface AliveCMDBViewProps {
  applications: BankApplication[];
  assets: BankAsset[];
  onOpenCreateTicket?: (ciName?: string) => void;
}

export const AliveCMDBView: React.FC<AliveCMDBViewProps> = ({
  applications,
  assets,
  onOpenCreateTicket,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'applications' | 'assets'>('applications');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedItem, setInspectedItem] = useState<BankAsset | BankApplication | null>(null);

  const filteredItems = useMemo(() => {
    const list = activeTab === 'applications' ? applications : assets;
    if (!searchQuery.trim()) return list;
    return list.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ('code' in item && typeof item.code === 'string' && item.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ('ipAddress' in item && typeof item.ipAddress === 'string' && item.ipAddress.includes(searchQuery))
    );
  }, [activeTab, applications, assets, searchQuery]);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden relative">
      {/* Main CMDB Explorer Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-semantic-panel select-none">
        {/* Header Toolbar */}
        <div className="px-6 py-4 border-b border-semantic-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-semantic-strongest tracking-tight">
                {t('CMDB Asset & Service Topology')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-subtle text-[#00F576] font-mono text-xs font-bold border border-semantic-border">
                {filteredItems.length}
              </span>
            </div>
            <p className="text-xs text-semantic-secondary mt-0.5">
              {t('Interactive operational catalog of tier-1 banking systems and physical infrastructure.')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-semantic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search CI or IP address...')}
                className="w-full bg-semantic-subtle border border-semantic-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-semantic-primary placeholder-semantic-muted focus:outline-none focus:border-[#00F576] transition-colors"
              />
            </div>

            {/* Scope Switcher Tabs */}
            <div className="flex items-center rounded-xl bg-semantic-subtle border border-semantic-border p-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('applications');
                  setInspectedItem(null);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'applications'
                    ? 'bg-semantic-panel text-[#00F576] shadow-xs font-bold'
                    : 'text-semantic-muted hover:text-semantic-primary'
                }`}
              >
                {t('Applications')} ({applications.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('assets');
                  setInspectedItem(null);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'assets'
                    ? 'bg-semantic-panel text-[#00F576] shadow-xs font-bold'
                    : 'text-semantic-muted hover:text-semantic-primary'
                }`}
              >
                {t('Infrastructure')} ({assets.length})
              </button>
            </div>
          </div>
        </div>

        {/* Interactive CI Object Grid */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {filteredItems.length === 0 ? (
            <div className="py-20 text-center text-semantic-muted">
              <Server className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <div className="font-semibold text-sm text-semantic-primary">{t('No assets found')}</div>
              <div className="text-xs mt-1">{t('Try adjusting your search criteria.')}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const isSelected = inspectedItem?.id === item.id;
                const isApp = 'tier' in item;

                return (
                  <div
                    key={item.id}
                    onClick={() => setInspectedItem(item)}
                    className={`alive-card p-4 flex flex-col justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#00F576]/50 bg-[#00F576]/5 shadow-md ring-1 ring-[#00F576]/30'
                        : 'hover:border-semantic-border-strong'
                    }`}
                  >
                    <div>
                      {/* Top status & category row */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-1.5 text-caption font-mono uppercase font-bold text-semantic-muted">
                          <Server className="w-3.5 h-3.5 text-[#00F576]" />
                          <span>{isApp ? t('Application CI') : t('Server Asset')}</span>
                        </div>

                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-micro font-mono font-bold bg-[#00F576]/10 text-[#00F576] border border-[#00F576]/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00F576] alive-status-pulse" />
                          <span>{item.environment || 'PRODUCTION'}</span>
                        </span>
                      </div>

                      {/* CI Name & ID */}
                      <div className="font-bold text-sm text-semantic-primary leading-tight mb-1">
                        {item.name}
                      </div>
                      <div className="text-micro font-mono text-semantic-muted mb-3">
                        {item.id}
                      </div>

                      {/* Metadata Chips */}
                      <div className="flex flex-wrap items-center gap-1.5 text-caption">
                        {isApp && 'code' in item && item.code && (
                          <span className="px-2 py-0.5 rounded-md bg-semantic-subtle border border-semantic-border text-semantic-secondary font-mono font-bold">
                            {item.code}
                          </span>
                        )}
                        {'ipAddress' in item && item.ipAddress && (
                          <span className="px-2 py-0.5 rounded-md bg-semantic-subtle border border-semantic-border text-semantic-secondary font-mono">
                            {item.ipAddress}
                          </span>
                        )}
                        {Boolean(item.criticality) && (
                          <span className="px-2 py-0.5 rounded-md bg-semantic-subtle border border-semantic-border text-semantic-secondary">
                            {String(item.criticality)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-4 pt-3 border-t border-semantic-border flex items-center justify-between text-xs text-semantic-muted">
                      <span className="text-caption font-medium">{t('Click to inspect details')}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#00F576]" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Slide-over Asset Inspector Panel */}
      {inspectedItem && (
        <AliveAssetInspector
          item={inspectedItem}
          onClose={() => setInspectedItem(null)}
          onCreateTicketForAsset={onOpenCreateTicket}
        />
      )}
    </div>
  );
};
