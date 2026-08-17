import React from 'react';
import { AuditEvent } from '../../../../shared/types/audit.js';
import { ShieldCheck, History, ArrowRight, User } from 'lucide-react';

interface AuditTabProps {
  auditEvents: AuditEvent[];
}

export const AuditTab: React.FC<AuditTabProps> = ({ auditEvents }) => {
  return (
    <div className="space-y-4">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Immutable Audit Log
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Append-only chronological log of all state transitions, approvals, field changes, and access records.
          </p>
        </div>
        <span className="text-[11px] font-mono bg-bank-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
          {auditEvents.length} Events
        </span>
      </div>

      <div className="space-y-2.5">
        {auditEvents.map((evt) => (
          <div
            key={evt.id}
            className="p-3.5 bg-bank-900 border border-slate-800 rounded-lg space-y-2 text-xs font-mono"
          >
            <div className="flex items-center justify-between font-sans">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700 text-[10px] font-semibold uppercase">
                  {evt.action.replace(/_/g, ' ')}
                </span>
                <span className="font-semibold text-slate-200">{evt.actorName}</span>
                <span className="text-slate-500 text-[11px]">({evt.actorRole})</span>
              </div>
              <span className="text-[11px] text-slate-400">
                {new Date(evt.timestamp).toLocaleString()}
              </span>
            </div>

            {/* Field changes / diffs */}
            {evt.fieldChanges && evt.fieldChanges.length > 0 && (
              <div className="p-2 bg-bank-950 rounded border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Field Changes:</div>
                {evt.fieldChanges.map((ch, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-medium">{ch.field}:</span>
                    <span className="text-red-400 line-through">{String(ch.oldValue || 'null')}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-emerald-400 font-semibold">{String(ch.newValue)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Metadata / Signatures */}
            {evt.metadata && Object.keys(evt.metadata).length > 0 && (
              <div className="p-1.5 bg-bank-950 rounded border border-slate-800 text-[10px] text-slate-400 truncate">
                Metadata: {JSON.stringify(evt.metadata)}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-800">
              <div>IP: {evt.ipAddress} | UA: {evt.userAgent}</div>
              <div>Correlation ID: {evt.correlationId}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

