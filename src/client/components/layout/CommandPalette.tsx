import React, { useState, useEffect } from 'react';
import { Search, Shield, AlertCircle, FileText, CheckCircle2, User, Layers, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
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
  const { allUsers, switchUser } = useAuth();

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
    { label: 'CISO Executive Dashboard', view: 'ciso-dash', icon: Shield },
    { label: 'Security Operations (SOC Incidents)', view: 'soc-incidents', icon: AlertCircle },
    { label: 'Vulnerability Management', view: 'vulnerabilities', icon: Layers },
    { label: 'Enterprise Risk Register (5x5 Matrix)', view: 'risk-register', icon: FileText },
    { label: 'Security Policy Exceptions', view: 'security-exceptions', icon: CheckCircle2 },
    { label: 'Security Playbooks & Knowledge Base', view: 'knowledge-base', icon: FileText },
  ].filter((v) => v.label.toLowerCase().includes(query.toLowerCase()));

  const matchedUsers = allUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-bank-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-10">
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-bank-850">
          <Search className="w-4 h-4 text-slate-400 mr-2.5" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, ticket key (e.g. APPSEC-2026-0001), or persona name..."
            className="w-full bg-transparent text-white placeholder-slate-400 focus:outline-none text-xs font-medium"
          />
          <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
            ESC
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3 text-xs">
          {/* Quick Views */}
          {quickViews.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-slate-500 text-[10px]">
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
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matched Tickets */}
          {filteredTickets.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-slate-500 text-[10px]">
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-semibold text-blue-400 text-xs">{t.key}</span>
                      <span className="truncate text-slate-200">{t.title}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 ml-2">{t.technicalSeverity}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Persona Switcher */}
          {matchedUsers.length > 0 && (
            <div>
              <div className="px-2.5 py-1 font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                Switch Persona
              </div>
              <div className="space-y-0.5">
                {matchedUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      switchUser(u.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <div className="text-left">
                        <div className="font-semibold text-slate-100">{u.fullName}</div>
                        <div className="text-[10px] text-slate-400">{u.title} ({u.roles[0]})</div>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                      {u.securityClearance}
                    </span>
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

