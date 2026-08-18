import React from 'react';
import { TicketComment } from '../../../../shared/types/comments.js';
import { AuditEvent } from '../../../../shared/types/audit.js';
import { History, MessageSquare, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

interface ActivityTabProps {
  comments: TicketComment[];
  auditEvents: AuditEvent[];
}

export const ActivityTab: React.FC<ActivityTabProps> = ({ comments, auditEvents }) => {
  // Merge comments and audit events chronologically
  const timeline = [
    ...comments.map((c) => ({
      id: c.id,
      type: 'COMMENT' as const,
      timestamp: c.createdAt,
      actorName: c.authorName,
      actorRole: c.authorRole,
      content: c.content,
      visibility: c.visibility,
    })),
    ...auditEvents.map((a) => ({
      id: a.id,
      type: 'AUDIT' as const,
      timestamp: a.timestamp,
      actorName: a.actorName,
      actorRole: a.actorRole,
      action: a.action,
      fieldChanges: a.fieldChanges,
      metadata: a.metadata,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold uppercase tracking-wider text-[#5E6C84]">
        Unified Ticket Activity Stream ({timeline.length} Events)
      </div>

      <div className="relative border-l border-[#DFE1E6] ml-3 space-y-4 py-1">
        {timeline.map((item) => (
          <div key={item.id} className="relative pl-5">
            {/* Timeline node icon */}
            <div className="absolute -left-[13px] top-1 w-6 h-6 rounded-full bg-[#FFFFFF] border border-[#DFE1E6] flex items-center justify-center text-xs">
              {item.type === 'COMMENT' ? (
                <MessageSquare className="w-3 h-3 text-[#0052CC]" />
              ) : (
                <ShieldCheck className="w-3 h-3 text-[#006644]" />
              )}
            </div>

            <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-3.5 space-y-1.5 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#172B4D]">{item.actorName}</span>
                  <span className="text-[#5E6C84] text-[11px]">({item.actorRole})</span>
                  {item.type === 'AUDIT' && (
                    <span className="px-1.5 py-0.2 rounded bg-[#FFFFFF] text-[#0052CC] text-[10px] uppercase font-mono border border-[#DFE1E6]">
                      {item.action?.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[#5E6C84] font-mono">
                  {new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>

              {item.type === 'COMMENT' ? (
                <div className="text-[#172B4D] leading-relaxed whitespace-pre-line pt-0.5">
                  {item.content}
                </div>
              ) : (
                item.fieldChanges && item.fieldChanges.length > 0 && (
                  <div className="space-y-1 pt-1 font-mono text-[11px]">
                    {item.fieldChanges.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[#5E6C84]">{ch.field}:</span>
                        <span className="text-[#DE350B] line-through">{String(ch.oldValue || 'none')}</span>
                        <ArrowRight className="w-3 h-3 text-[#7A869A]" />
                        <span className="text-[#006644] font-semibold">{String(ch.newValue)}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

