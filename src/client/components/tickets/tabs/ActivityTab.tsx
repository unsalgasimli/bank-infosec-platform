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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-slate-400" />
          <span>Unified Ticket Activity Stream</span>
        </div>
        <span className="font-mono text-label font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
          {timeline.length} Events
        </span>
      </div>

      <div className="relative border-l-2 border-slate-200 ml-4 space-y-4 py-2">
        {timeline.length === 0 && (
          <div className="ml-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
            No activity has been recorded for this ticket yet.
          </div>
        )}
        {timeline.map((item) => (
          <div key={item.id} className="relative pl-6">
            {/* Timeline node icon */}
            <div className="absolute -left-[17px] top-1 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-xs shadow-xs">
              {item.type === 'COMMENT' ? (
                <MessageSquare className="w-3.5 h-3.5 text-semantic-jira-brand" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              )}
            </div>

            <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 space-y-2 text-xs shadow-xs">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{item.actorName}</span>
                  <span className="text-slate-500 text-label">({item.actorRole})</span>
                  {item.type === 'AUDIT' && (
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-caption uppercase font-mono font-bold border border-blue-200">
                      {item.action?.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <span className="text-label text-slate-400 font-mono">
                  {new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>

              {item.type === 'COMMENT' ? (
                <div className="text-slate-800 leading-relaxed whitespace-pre-line pt-1 bg-white p-3 rounded-lg border border-slate-200">
                  {item.content}
                </div>
              ) : (
                item.fieldChanges && item.fieldChanges.length > 0 && (
                  <div className="space-y-1.5 pt-1 font-mono text-label bg-white p-3 rounded-lg border border-slate-200">
                    {item.fieldChanges.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-500 font-semibold">{ch.field}:</span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 line-through border border-rose-200">{String(ch.oldValue || 'none')}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">{String(ch.newValue)}</span>
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

