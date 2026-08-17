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
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Unified Ticket Activity Stream ({timeline.length} Events)
      </div>

      <div className="relative border-l-2 border-slate-800 ml-4 space-y-6 py-2">
        {timeline.map((item) => (
          <div key={item.id} className="relative pl-6">
            {/* Timeline node icon */}
            <div className="absolute -left-[17px] top-0.5 w-8 h-8 rounded-full bg-bank-950 border border-slate-700 flex items-center justify-center text-xs">
              {item.type === 'COMMENT' ? (
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>

            <div className="bg-bank-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100">{item.actorName}</span>
                  <span className="text-slate-500 text-[11px]">({item.actorRole})</span>
                  {item.type === 'AUDIT' && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-blue-300 text-[10px] uppercase font-mono">
                      {item.action?.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>

              {item.type === 'COMMENT' ? (
                <div className="text-slate-300 leading-relaxed whitespace-pre-line pt-1">
                  {item.content}
                </div>
              ) : (
                item.fieldChanges && item.fieldChanges.length > 0 && (
                  <div className="space-y-1 pt-1 font-mono text-[11px]">
                    {item.fieldChanges.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-slate-400">{ch.field}:</span>
                        <span className="text-red-400 line-through">{String(ch.oldValue || 'none')}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-emerald-400 font-bold">{String(ch.newValue)}</span>
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
