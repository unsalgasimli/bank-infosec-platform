import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { Flame, ShieldAlert, Terminal, Clock, ArrowRight } from 'lucide-react';

interface IncidentCaseViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const IncidentCaseView: React.FC<IncidentCaseViewProps> = ({ tickets, onSelectTicket }) => {
  const incidentTickets = tickets.filter((t) => t.category === 'INCIDENT' || t.projectCode === 'SOC');

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      {/* Header */}
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-red-400 border border-slate-800">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              SOC Security Incident Case Management
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              NIST SP 800-61 / ISO 27035 incident triage, threat containment, and regulatory notification tracking.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-bank-950 text-red-300 border border-slate-800 rounded font-mono text-xs font-semibold">
          {incidentTickets.length} Cases
        </span>
      </div>

      {/* Cases List */}
      <div className="space-y-3">
        {incidentTickets.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectTicket(t)}
            className="p-4 bg-bank-900 border border-slate-800 hover:border-slate-700 rounded-lg cursor-pointer transition-colors space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge type="PROJECT" value={t.projectCode} />
                <span className="font-mono font-semibold text-white text-xs">{t.key}</span>
                <span className="px-2 py-0.5 rounded bg-bank-950 text-slate-300 font-mono text-[11px] border border-slate-750">
                  {t.statusName}
                </span>
                <Badge type="CONFIDENTIALITY" value={t.confidentiality} />
              </div>
              <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
            </div>

            <h3 className="text-xs font-semibold text-slate-100">{t.title}</h3>
            <p className="text-[11px] text-slate-400 line-clamp-2">{t.description}</p>

            {/* MITRE ATT&CK Preview */}
            {t.incidentDetails?.mitreAttack && t.incidentDetails.mitreAttack.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">MITRE TTPs:</span>
                {t.incidentDetails.mitreAttack.map((m, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-bank-950 border border-slate-800 text-red-400 font-mono text-[10px]">
                    {m.techniqueId} - {m.techniqueName}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

