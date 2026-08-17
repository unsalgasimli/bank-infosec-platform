import React, { useState } from 'react';
import { TicketComment, CommentVisibility } from '../../../../shared/types/comments.js';
import { useAuth } from '../../../context/AuthContext.js';
import { Send, Lock, Globe, MessageSquare, Shield } from 'lucide-react';

interface CommentsTabProps {
  comments: TicketComment[];
  ticketId: string;
  onAddComment: (content: string, visibility: CommentVisibility) => Promise<void>;
}

export const CommentsTab: React.FC<CommentsTabProps> = ({
  comments,
  ticketId,
  onAddComment,
}) => {
  const { currentUser } = useAuth();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('PUBLIC');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddComment(content, visibility);
      setContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* New Comment Box */}
      <form onSubmit={handleSubmit} className="bg-bank-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Add Collaboration Note</span>
          </div>

          {/* Visibility Switcher */}
          <div className="flex items-center gap-1 bg-bank-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setVisibility('PUBLIC')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                visibility === 'PUBLIC' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Public</span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility('INTERNAL')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                visibility === 'INTERNAL' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Internal</span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility('SECURITY_TEAM_ONLY')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                visibility === 'SECURITY_TEAM_ONLY' ? 'bg-rose-900 text-rose-200 font-bold border border-rose-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Security Only</span>
            </button>
          </div>
        </div>

        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            visibility === 'SECURITY_TEAM_ONLY'
              ? 'Enter sensitive note (ONLY visible to InfoSec/SOC team members)...'
              : 'Add a comment or mention an analyst (@name)...'
          }
          className="w-full bg-bank-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500 font-mono">
            Posting as: <strong className="text-slate-300">{currentUser?.fullName}</strong> ({currentUser?.roles[0]})
          </span>
          <button
            type="submit"
            disabled={!content.trim() || isSubmitting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Posting...' : 'Post Comment'}</span>
          </button>
        </div>
      </form>

      {/* Comment Stream */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 bg-bank-900/40 border border-slate-800/80 rounded-xl">
            No comments yet. Start the collaboration trail above.
          </div>
        ) : (
          comments.map((comment) => {
            const isSecurityOnly = comment.visibility === 'SECURITY_TEAM_ONLY';
            return (
              <div
                key={comment.id}
                className={`p-4 rounded-xl border space-y-2 transition-all ${
                  isSecurityOnly
                    ? 'bg-rose-950/20 border-rose-900/60 shadow-sm'
                    : 'bg-bank-900 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-xs font-bold text-blue-400">
                      {comment.authorAvatar ? (
                        <img src={comment.authorAvatar} alt={comment.authorName} className="w-full h-full object-cover" />
                      ) : (
                        comment.authorName.charAt(0)
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100">{comment.authorName}</div>
                      <div className="text-[10px] text-slate-400">{comment.authorRole}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSecurityOnly && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold uppercase tracking-wide">
                        <Shield className="w-3 h-3" /> Security Only
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-slate-500">
                      {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line pt-1">
                  {comment.content}
                </div>

                {comment.reactions && comment.reactions.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {comment.reactions.map((r, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-bank-950 border border-slate-700 text-xs">
                        {r.emoji} {r.userIds.length}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
