import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Shield,
  Layers,
  ArrowRight,
  Server,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Workflow,
  Sparkles,
  Command,
  CornerDownLeft,
  X,
} from 'lucide-react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../../shared/types/asset.js';
import { useUIExperience } from '../../../context/UIExperienceContext.js';
import { useI18n } from '../../../context/I18nContext.js';

interface AliveCommandLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, ticketId?: string) => void;
  onOpenCreate?: () => void;
  tickets?: Ticket[];
  applications?: BankApplication[];
  assets?: BankAsset[];
}

export const AliveCommandLauncher: React.FC<AliveCommandLauncherProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenCreate,
  tickets = [],
  applications = [],
  assets = [],
}) => {
  const { t, language, setLanguage } = useI18n();
  const { toggleExperience } = useUIExperience();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened & reset selection
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global ESC & Arrow Navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build searchable items
  const quickDestinations = [
    { id: 'my-work-overview', title: t('My Work Overview'), category: 'Navigation', icon: CheckCircle2, shortcut: 'G O' },
    { id: 'my-tasks', title: t('My Assigned Tasks'), category: 'Navigation', icon: CheckCircle2, shortcut: 'G T' },
    { id: 'approvals', title: t('Dual-Control Approvals'), category: 'Navigation', icon: Shield, shortcut: 'G A' },
    { id: 'service-incidents', title: t('Service Incidents & Outages'), category: 'Navigation', icon: AlertTriangle, shortcut: 'G I' },
    { id: 'service-requests', title: t('Service & Access Requests'), category: 'Navigation', icon: Layers, shortcut: 'G R' },
    { id: 'configuration-items', title: t('CMDB Registry'), category: 'Navigation', icon: Server, shortcut: 'G C' },
    { id: 'vulnerabilities', title: t('Vulnerability Management'), category: 'Navigation', icon: Shield, shortcut: 'G V' },
    { id: 'risk-management', title: t('Risk Register Matrix'), category: 'Navigation', icon: FileText, shortcut: 'G K' },
    { id: 'threat-modeling', title: t('Threat Modeling Studio'), category: 'Navigation', icon: Shield, shortcut: 'G S' },
    { id: 'executive-analytics', title: t('CISO Executive Dashboard'), category: 'Navigation', icon: Shield, shortcut: 'G E' },
    { id: 'knowledge-base', title: t('Knowledge Base & SOPs'), category: 'Navigation', icon: FileText, shortcut: 'G B' },
  ];

  const quickActions = [
    {
      id: 'action-new-ticket',
      title: t('Create New Security Task or Incident'),
      category: 'Actions',
      icon: Sparkles,
      action: () => {
        onClose();
        onOpenCreate?.();
      },
    },
    {
      id: 'action-switch-experience',
      title: t('Switch to Classic Experience Mode'),
      category: 'Actions',
      icon: Layers,
      action: () => {
        toggleExperience();
        onClose();
      },
    },
    {
      id: 'action-toggle-lang',
      title: language === 'az' ? 'Switch Language to English' : 'Dili Azərbaycan dilinə dəyiş',
      category: 'Actions',
      icon: FileText,
      action: () => {
        setLanguage(language === 'az' ? 'en' : 'az');
        onClose();
      },
    },
  ];

  const filteredNav = quickDestinations.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase())
  );

  const filteredActions = quickActions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTickets = tickets
    .filter(
      (t) =>
        t.key.toLowerCase().includes(query.toLowerCase()) ||
        t.title.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 5)
    .map((t) => ({
      id: `ticket-${t.id}`,
      title: `${t.key} — ${t.title}`,
      subtitle: `${t.statusName} • ${t.technicalSeverity}`,
      category: 'Tickets',
      icon: FileText,
      action: () => {
        onNavigate('projects-tasks', t.id);
        onClose();
      },
    }));

  const filteredAssets = [...applications, ...assets]
    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4)
    .map((a) => ({
      id: `asset-${a.id}`,
      title: a.name,
      subtitle: `${a.criticality || 'TIER_1'} • ${a.environment || 'PRODUCTION'}`,
      category: 'Assets & CMDB',
      icon: Server,
      action: () => {
        onNavigate('configuration-items');
        onClose();
      },
    }));

  // Flatten searchable list for keyboard up/down selection
  const flatItems: Array<{
    id: string;
    title: string;
    subtitle?: string;
    category: string;
    icon: React.ComponentType<{ className?: string }>;
    shortcut?: string;
    action: () => void;
  }> = [
    ...filteredActions,
    ...filteredNav.map((n) => ({
      ...n,
      action: () => {
        onNavigate(n.id);
        onClose();
      },
    })),
    ...filteredTickets,
    ...filteredAssets,
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < flatItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) {
        flatItems[selectedIndex].action();
      }
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-dsDialog flex items-start justify-center pt-24 p-4">
      {/* Dimmed backdrop with micro-blur */}
      <div
        className="fixed inset-0 bg-semantic-modal-tint/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Command dialog container */}
      <div
        className="relative w-full max-w-2xl bg-semantic-panel border border-semantic-border-strong rounded-2xl shadow-2xl overflow-hidden z-dsContent flex flex-col max-h-[75vh]"
        style={{ animation: 'alive-command-enter 160ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-semantic-border bg-semantic-subtle/50">
          <Search className="w-5 h-5 text-[#00F576] mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('Type a command, search tickets, assets, or routes...')}
            className="w-full bg-transparent text-semantic-primary placeholder-semantic-muted focus:outline-none text-sm font-medium tracking-wide"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-semantic-muted hover:text-semantic-primary rounded"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-caption font-mono bg-semantic-panel text-semantic-muted px-2 py-0.5 rounded border border-semantic-border shadow-xs">
              ESC
            </span>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4 text-xs custom-scrollbar">
          {flatItems.length === 0 ? (
            <div className="py-12 text-center text-semantic-muted">
              <Command className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div className="font-semibold text-sm text-semantic-strong">{t('No results found')}</div>
              <div className="text-xs text-semantic-muted mt-1">
                {t('Try searching for a ticket key, asset name, or action.')}
              </div>
            </div>
          ) : (
            <>
              {/* Group items by category */}
              {['Actions', 'Navigation', 'Tickets', 'Assets & CMDB'].map((cat) => {
                const groupItems = flatItems.filter((item) => item.category === cat);
                if (groupItems.length === 0) return null;

                return (
                  <div key={cat} className="space-y-1">
                    <div className="px-3 py-1 font-mono text-label uppercase font-bold text-semantic-muted tracking-wider">
                      {cat}
                    </div>
                    {groupItems.map((item) => {
                      const itemIndex = flatItems.indexOf(item);
                      const isSelected = itemIndex === selectedIndex;
                      const IconComp = item.icon;

                      return (
                        <button
                          key={item.id}
                          onClick={item.action}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                            isSelected
                              ? 'bg-semantic-hover text-semantic-primary border border-semantic-border-strong shadow-xs translate-x-0.5'
                              : 'text-semantic-secondary hover:text-semantic-primary hover:bg-semantic-subtle/50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-[#00F576]/15 text-[#00F576] border border-[#00F576]/30'
                                  : 'bg-semantic-panel text-semantic-muted border border-semantic-border'
                              }`}
                            >
                              <IconComp className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate text-semantic-primary">
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div className="text-xs text-semantic-muted truncate">
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {item.shortcut && (
                              <span className="font-mono text-caption text-semantic-muted px-1.5 py-0.5 rounded bg-semantic-panel border border-semantic-border">
                                {item.shortcut}
                              </span>
                            )}
                            {isSelected && (
                              <CornerDownLeft className="w-3.5 h-3.5 text-[#00F576]" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Keyboard Navigation Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-semantic-border bg-semantic-subtle/70 text-caption text-semantic-muted select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-semantic-panel border border-semantic-border rounded font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-semantic-panel border border-semantic-border rounded font-mono">↓</kbd>
              <span>{t('navigate')}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-semantic-panel border border-semantic-border rounded font-mono">↵</kbd>
              <span>{t('select')}</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[#00F576] animate-pulse mr-1" />
            <span className="font-mono">{t('Alive Command Studio')}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
