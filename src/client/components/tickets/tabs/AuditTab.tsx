import React from 'react';
import { AuditEvent } from '../../../../shared/types/audit.js';
import { ShieldCheck, History, ArrowRight, User, Terminal, Network } from 'lucide-react';

interface AuditTabProps {
  auditEvents: AuditEvent[];
}

export const AuditTab: React.FC<AuditTabProps> = ({ auditEvents }) => {
  return (
    <div className="space-y-6">
      <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-xs flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Immutable Audit Log
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Append-only chronological log of all state transitions, approvals, field changes, and access records.
          </p>
        </div>
        <span className="text-[11px] font-mono font-bold bg-white px-3 py-1 rounded-full border border-slate-200 text-slate-700 shadow-xs">
          {auditEvents.length} Events
        </span>
      </div>

      <div className="space-y-3.5">
        {auditEvents.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
            No audit events are available for this ticket yet.
          </div>
        )}
        {auditEvents.map((evt) => (
          <div
            key={evt.id}
            className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 text-xs shadow-xs"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase font-mono">
                  {evt.action.replace(/_/g, ' ')}
                </span>
                <span className="font-bold text-slate-900">{evt.actorName}</span>
                <span className="text-slate-500 text-[11px]">({evt.actorRole})</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {new Date(evt.timestamp).toLocaleString()}
              </span>
            </div>

            {/* Field changes / diffs */}
            {evt.fieldChanges && evt.fieldChanges.length > 0 && (
              <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200 space-y-1.5">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Field Changes:</div>
                {evt.fieldChanges.map((ch, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs font-mono flex-wrap">
                    <span className="text-slate-600 font-semibold">{ch.field}:</span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 line-through border border-rose-200">{String(ch.oldValue || 'null')}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">{String(ch.newValue)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Metadata / Signatures */}
            {evt.metadata && Object.keys(evt.metadata).length > 0 && (
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-600 truncate">
                <span className="font-semibold text-slate-500">Metadata: </span>{JSON.stringify(evt.metadata)}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100 font-mono flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Network className="w-3 h-3 text-slate-400" />
                <span>IP: {evt.ipAddress} | UA: {evt.userAgent}</span>
              </div>
              <div>ID: {evt.correlationId}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

