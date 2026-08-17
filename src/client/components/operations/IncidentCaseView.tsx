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
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      {/* Header */}
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-red-950 text-red-400 border border-red-800">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              SOC Security Incident Case Management
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              NIST SP 800-61 / ISO 27035 incident triage, threat containment, and central bank regulatory notification tracking.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-red-950 text-red-300 border border-red-800 rounded-full text-xs font-mono font-bold">
          {incidentTickets.length} Total Cases
        </span>
      </div>

      {/* Cases List */}
      <div className="space-y-3">
        {incidentTickets.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectTicket(t)}
            className="p-5 bg-bank-900 border border-slate-800 hover:border-blue-500/80 rounded-xl cursor-pointer transition-all space-y-3 shadow-md hover:scale-[1.005]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge type="PROJECT" value={t.projectCode} />
                <span className="font-mono font-bold text-white text-sm">{t.key}</span>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-xs border border-blue-800">
                  {t.statusName}
                </span>
                <Badge type="CONFIDENTIALITY" value={t.confidentiality} />
              </div>
              <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
            </div>

            <h3 className="text-sm font-bold text-slate-100">{t.title}</h3>
            <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>

            {/* MITRE ATT&CK Preview */}
            {t.incidentDetails?.mitreAttack && t.incidentDetails.mitreAttack.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">MITRE TTPs:</span>
                {t.incidentDetails.mitreAttack.map((m, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-bank-950 border border-slate-700 text-red-400 font-mono text-[10px]">
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
