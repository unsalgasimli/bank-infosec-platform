import React, { useState, useEffect } from 'react';
import { Search, Shield, AlertCircle, FileText, CheckCircle2, Layers, ArrowRight } from 'lucide-react';
import { Ticket } from '../../../shared/types/ticket.js';


interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, ticketId?: string) => void;
  tickets: Ticket[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  tickets,
}) => {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : undefined;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTickets = tickets.filter(
    (t) =>
      t.key.toLowerCase().includes(query.toLowerCase()) ||
      t.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6);

  const quickViews = [
    { label: 'My Work Overview', view: 'my-work-overview', icon: CheckCircle2 },
    { label: 'Projects & Tasks (Spreadsheet / Kanban)', view: 'projects-tasks', icon: Layers },
    { label: 'Workflows & Orchestration Pipelines', view: 'workflows', icon: Layers },
    { label: 'Risk Management (5×5 Matrix)', view: 'risk-management', icon: FileText },
    { label: 'Audit & Regulatory Compliance', view: 'audit-compliance', icon: CheckCircle2 },
    { label: 'CMDB Relationship Map', view: 'relationship-map', icon: Layers },
    { label: 'Executive Analytics & CISO Dashboard', view: 'executive-analytics', icon: Shield },
    { label: 'SOPs & Security Knowledge Base', view: 'knowledge-base', icon: FileText },
    { label: 'Space Settings & Configuration', view: 'admin-settings', icon: FileText },
  ].filter((v) => v.label.toLowerCase().includes(query.toLowerCase()));

  return (
      <div className="fixed inset-0 z-dsDialog flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-semantic-panel border border-semantic-jira-border rounded-md shadow-2xl overflow-hidden z-dsContent">
        <div className="flex items-center px-4 py-3 border-b border-semantic-jira-border bg-semantic-panel">
          <Search className="w-4 h-4 text-semantic-jira-muted mr-2.5" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or ticket key (e.g. APPSEC-2026-0001)..."
            className="w-full bg-transparent text-semantic-jira-primary placeholder-semantic-jira-muted focus:outline-none text-xs font-medium"
          />
          <span className="text-caption font-mono bg-semantic-panel text-semantic-jira-muted px-1.5 py-0.5 rounded border border-semantic-jira-border">
            ESC
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3 text-xs custom-scrollbar">
          {/* Quick Views */}
          {quickViews.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-semantic-jira-muted text-caption">
                Navigation & Views
              </div>
              <div className="space-y-0.5">
                {quickViews.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.view}
                      onClick={() => {
                        onNavigate(item.view);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-semantic-jira-primary hover:bg-semantic-jira-hover transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-semantic-jira-muted" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-semantic-jira-muted" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matched Tickets */}
          {filteredTickets.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-semantic-jira-muted text-caption">
                Matching Tickets
              </div>
              <div className="space-y-0.5">
                {filteredTickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onNavigate('tickets', t.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-semantic-jira-primary hover:bg-semantic-jira-hover transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-semibold text-semantic-jira-brand text-xs">{t.key}</span>
                      <span className="truncate text-semantic-jira-primary">{t.title}</span>
                    </div>
                    <span className="text-caption uppercase font-semibold text-semantic-jira-muted ml-2">{t.technicalSeverity}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
