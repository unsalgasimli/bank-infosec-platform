import React, { useState } from 'react';
import { TicketComment, CommentVisibility } from '../../../../shared/types/comments.js';
import { useAuth } from '../../../context/AuthContext.js';
import { Send, Lock, Globe, Shield, MessageSquare } from 'lucide-react';

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
  const [visibility, setVisibility] = useState<CommentVisibility>('INTERNAL');
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
    <div className="space-y-5">
      {/* Comments List */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-bank-900 border border-slate-800 rounded-lg">
            No comments recorded on this ticket yet.
          </div>
        ) : (
          comments.map((comment) => {
            const isSecurityOnly = comment.visibility === 'SECURITY_TEAM_ONLY' || (comment.visibility as any) === 'RESTRICTED_SECURITY_ONLY';
            const isPublic = comment.visibility === 'PUBLIC';

            return (
              <div
                key={comment.id}
                className={`p-4 rounded-lg border text-xs space-y-2 ${
                  isSecurityOnly
                    ? 'bg-purple-950/20 border-purple-900/60'
                    : isPublic
                    ? 'bg-blue-950/20 border-blue-900/60'
                    : 'bg-bank-900 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-semibold text-[10px] text-slate-200">
                      {comment.authorAvatar ? (
                        <img src={comment.authorAvatar} alt="" className="w-full h-full object-cover rounded" />
                      ) : (
                        comment.authorName?.charAt(0) || 'U'
                      )}
                    </div>
                    <span className="font-semibold text-white">{comment.authorName || 'Security Analyst'}</span>
                    <span className="text-slate-500 font-mono text-[10px]">({comment.authorRole || 'ANALYST'})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSecurityOnly ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                        <Lock className="w-3 h-3" /> Security Only
                      </span>
                    ) : isPublic ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                        <Globe className="w-3 h-3" /> Public
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-bank-950 px-2 py-0.5 rounded border border-slate-800">
                        <Shield className="w-3 h-3" /> Internal
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="text-slate-200 whitespace-pre-line leading-relaxed pl-7">
                  {comment.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Composer */}
      <form onSubmit={handleSubmit} className="bg-bank-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Note / Comment</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px]">Visibility:</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
              className="bg-bank-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
            >
              <option value="INTERNAL">Internal Bank</option>
              <option value="SECURITY_TEAM_ONLY">Security Team Only</option>
              <option value="PUBLIC">Public</option>
            </select>
          </div>
        </div>

        <textarea
          rows={3}
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add findings analysis, remediation updates, or test notes..."
          className="w-full bg-bank-950 border border-slate-800 rounded p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-normal"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500">
            Posting as: <strong className="text-slate-300">{currentUser?.fullName}</strong>
          </span>
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Post Comment</span>
          </button>
        </div>
      </form>
    </div>
  );
};

