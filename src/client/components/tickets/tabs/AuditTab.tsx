import React from 'react';
import { AuditEvent } from '../../../../shared/types/audit.js';
import { ShieldCheck, History, ArrowRight, User } from 'lucide-react';

interface AuditTabProps {
  auditEvents: AuditEvent[];
}

export const AuditTab: React.FC<AuditTabProps> = ({ auditEvents }) => {
  return (
    <div className="space-y-4">
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-4 flex items-center justify-between shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#006644]" />
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              Immutable Audit Log
            </h3>
          </div>
          <p className="text-[11px] text-[#5E6C84] mt-0.5">
            Append-only chronological log of all state transitions, approvals, field changes, and access records.
          </p>
        </div>
        <span className="text-[11px] font-mono bg-[#FFFFFF] px-2 py-0.5 rounded border border-[#DFE1E6] text-[#172B4D]">
          {auditEvents.length} Events
        </span>
      </div>

      <div className="space-y-2.5">
        {auditEvents.map((evt) => (
          <div
            key={evt.id}
            className="p-3.5 bg-[#FFFFFF] border border-[#DFE1E6] rounded-md space-y-2 text-xs font-mono shadow-sm"
          >
            <div className="flex items-center justify-between font-sans">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] border border-[#DFE1E6] text-[10px] font-semibold uppercase">
                  {evt.action.replace(/_/g, ' ')}
                </span>
                <span className="font-semibold text-[#172B4D]">{evt.actorName}</span>
                <span className="text-[#5E6C84] text-[11px]">({evt.actorRole})</span>
              </div>
              <span className="text-[11px] text-[#5E6C84]">
                {new Date(evt.timestamp).toLocaleString()}
              </span>
            </div>

            {/* Field changes / diffs */}
            {evt.fieldChanges && evt.fieldChanges.length > 0 && (
              <div className="p-2 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-1">
                <div className="text-[10px] text-[#5E6C84] uppercase font-semibold">Field Changes:</div>
                {evt.fieldChanges.map((ch, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="text-[#5E6C84] font-medium">{ch.field}:</span>
                    <span className="text-[#DE350B] line-through">{String(ch.oldValue || 'null')}</span>
                    <ArrowRight className="w-3 h-3 text-[#7A869A]" />
                    <span className="text-[#006644] font-semibold">{String(ch.newValue)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Metadata / Signatures */}
            {evt.metadata && Object.keys(evt.metadata).length > 0 && (
              <div className="p-1.5 bg-[#FFFFFF] rounded border border-[#DFE1E6] text-[10px] text-[#5E6C84] truncate">
                Metadata: {JSON.stringify(evt.metadata)}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-[#7A869A] pt-1 border-t border-[#DFE1E6]">
              <div>IP: {evt.ipAddress} | UA: {evt.userAgent}</div>
              <div>Correlation ID: {evt.correlationId}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

