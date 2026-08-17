import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { CheckCircle2 } from 'lucide-react';

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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-amber-400 border border-slate-800">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Security Policy Exceptions & Risk Acceptances
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Time-bound policy exemptions with compensating controls and automated expiry countdown tracking.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-bank-950 text-amber-300 border border-slate-800 rounded font-mono text-xs font-semibold">
          {exceptionTickets.length} Exceptions
        </span>
      </div>

      <div className="space-y-3">
        {exceptionTickets.map((t) => {
          const exc = t.exceptionDetails;
          return (
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
                  {exc?.requestedControlId && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-850 text-slate-300 font-mono text-[10px] border border-slate-700">
                      Control: {exc.requestedControlId}
                    </span>
                  )}
                </div>
                <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
              </div>

              <h3 className="text-xs font-semibold text-slate-100">{t.title}</h3>

              {exc && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2.5 bg-bank-950 rounded border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold text-[11px]">Justification:</span>
                    <p className="text-slate-300 mt-0.5 text-[11px]">{exc.businessJustification}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold text-[11px]">Compensating Controls:</span>
                    <p className="text-slate-200 mt-0.5 text-[11px]">{exc.compensatingControls}</p>
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

