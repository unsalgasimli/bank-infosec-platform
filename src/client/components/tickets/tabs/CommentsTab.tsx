import React, { useState } from 'react';
import { TicketComment, CommentVisibility } from '../../../../shared/types/comments.js';
import { useAuth } from '../../../context/AuthContext.js';
import { Send, Lock, Globe, Shield, MessageSquare, User, Loader2 } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onAddComment(content, visibility);
      setContent('');
    } catch (cause: any) {
      setError(cause.message || 'Comment could not be posted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800">
          {error}
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-3.5">
        {comments.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-semibold text-slate-700">No notes or comments yet</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Start the conversation by adding an internal or team-only note below.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const isSecurityOnly = comment.visibility === 'SECURITY_TEAM_ONLY' || (comment.visibility as any) === 'RESTRICTED_SECURITY_ONLY';
            const isPublic = comment.visibility === 'PUBLIC';

            return (
              <div
                key={comment.id}
                className={`p-4 rounded-xl border text-xs space-y-2.5 shadow-xs transition-all ${
                  isSecurityOnly
                    ? 'bg-purple-50/50 border-purple-200'
                    : isPublic
                    ? 'bg-blue-50/50 border-blue-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#0052CC] text-white flex items-center justify-center font-bold text-[11px] shadow-xs">
                      {comment.authorAvatar ? (
                        <img src={comment.authorAvatar} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        comment.authorName?.charAt(0) || 'U'
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-800">{comment.authorName || 'Security Analyst'}</span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                        {comment.authorRole || 'ANALYST'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSecurityOnly ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                        <Lock className="w-3 h-3" /> Security Only
                      </span>
                    ) : isPublic ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                        <Globe className="w-3 h-3" /> Public
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        <Shield className="w-3 h-3" /> Internal
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="text-slate-800 whitespace-pre-line leading-relaxed pl-8 text-xs font-normal">
                  {comment.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Composer */}
      <form onSubmit={handleSubmit} className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <MessageSquare className="w-4 h-4 text-[#0052CC]" />
            <span>Add Note / Comment</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[11px] font-medium">Visibility:</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
              className="jira-input py-1 text-xs max-w-44 bg-white"
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
          className="jira-input font-normal bg-white"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500">
            Posting as: <strong className="text-slate-800 font-semibold">{currentUser?.fullName}</strong>
          </span>
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className="jira-btn-primary"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{isSubmitting ? 'Posting...' : 'Post Comment'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

