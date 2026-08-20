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
    { label: 'Projects & Tasks (Spreadsheet / Kanban / Gantt)', view: 'projects-tasks', icon: Layers },
    { label: 'Workflows & Orchestration Pipelines', view: 'workflows', icon: Layers },
    { label: 'Risk Management (5×5 Matrix)', view: 'risk-management', icon: FileText },
    { label: 'Audit & Regulatory Compliance', view: 'audit-compliance', icon: CheckCircle2 },
    { label: 'CMDB Relationship Map', view: 'relationship-map', icon: Layers },
    { label: 'Executive Analytics & CISO Dashboard', view: 'executive-analytics', icon: Shield },
    { label: 'SOPs & Security Knowledge Base', view: 'knowledge-base', icon: FileText },
    { label: 'Space Settings & Configuration', view: 'admin-settings', icon: FileText },
  ].filter((v) => v.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-[#FFFFFF] border border-[#DFE1E6] rounded-md shadow-2xl overflow-hidden z-10">
        <div className="flex items-center px-4 py-3 border-b border-[#DFE1E6] bg-[#FFFFFF]">
          <Search className="w-4 h-4 text-[#5E6C84] mr-2.5" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or ticket key (e.g. APPSEC-2026-0001)..."
            className="w-full bg-transparent text-[#172B4D] placeholder-[#5E6C84] focus:outline-none text-xs font-medium"
          />
          <span className="text-[10px] font-mono bg-[#FFFFFF] text-[#5E6C84] px-1.5 py-0.5 rounded border border-[#DFE1E6]">
            ESC
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3 text-xs custom-scrollbar">
          {/* Quick Views */}
          {quickViews.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-[#5E6C84] text-[10px]">
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
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-[#172B4D] hover:bg-[#EBECF0] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-[#5E6C84]" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-[#5E6C84]" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matched Tickets */}
          {filteredTickets.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-[#5E6C84] text-[10px]">
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-[#172B4D] hover:bg-[#EBECF0] transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-semibold text-[#0052CC] text-xs">{t.key}</span>
                      <span className="truncate text-[#172B4D]">{t.title}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-[#5E6C84] ml-2">{t.technicalSeverity}</span>
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
