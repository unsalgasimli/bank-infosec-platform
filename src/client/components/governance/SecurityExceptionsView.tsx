import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { CheckCircle2, Clock, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';

interface SecurityExceptionsViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const SecurityExceptionsView: React.FC<SecurityExceptionsViewProps> = ({
  tickets,
  onSelectTicket,
}) => {
  const exceptionTickets = tickets.filter(
    (t) => t.category === 'SECURITY_EXCEPTION' || t.projectCode === 'GRC'
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-amber-950 text-amber-400 border border-amber-800">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Security Policy Exceptions & Risk Acceptances
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Time-bound policy exemptions with compensating controls and automated expiry countdown notifications.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-amber-950 text-amber-300 border border-amber-800 rounded-full text-xs font-mono font-bold">
          {exceptionTickets.length} Active Exceptions
        </span>
      </div>

      <div className="space-y-3">
        {exceptionTickets.map((t) => {
          const exc = t.exceptionDetails;
          return (
            <div
              key={t.id}
              onClick={() => onSelectTicket(t)}
              className="p-5 bg-bank-900 border border-slate-800 hover:border-amber-500/80 rounded-xl cursor-pointer transition-all space-y-3 shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-bold text-white">{t.key}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-xs border border-blue-800">
                    {t.statusName}
                  </span>
                  {exc?.requestedControlId && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700">
                      Control: {exc.requestedControlId}
                    </span>
                  )}
                </div>
                <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
              </div>

              <h3 className="text-sm font-bold text-slate-100">{t.title}</h3>

              {exc && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-bank-950 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold">Justification:</span>
                    <p className="text-slate-300 mt-0.5">{exc.businessJustification}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold">Compensating Controls:</span>
                    <p className="text-emerald-400 mt-0.5">{exc.compensatingControls}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
