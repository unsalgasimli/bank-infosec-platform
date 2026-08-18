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
          <div className="p-8 text-center text-xs text-[#5E6C84] bg-[#FFFFFF] border border-[#DFE1E6] rounded-md">
            No comments recorded on this ticket yet.
          </div>
        ) : (
          comments.map((comment) => {
            const isSecurityOnly = comment.visibility === 'SECURITY_TEAM_ONLY' || (comment.visibility as any) === 'RESTRICTED_SECURITY_ONLY';
            const isPublic = comment.visibility === 'PUBLIC';

            return (
              <div
                key={comment.id}
                className={`p-4 rounded-md border text-xs space-y-2 shadow-sm ${
                  isSecurityOnly
                    ? 'bg-[#F3F0FF] border-[#D3C7F7]/60'
                    : isPublic
                    ? 'bg-[#DEEBFF] border-[#B3D4FF]/60'
                    : 'bg-[#FFFFFF] border-[#DFE1E6]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-[#FFFFFF] flex items-center justify-center font-semibold text-[10px] text-[#172B4D]">
                      {comment.authorAvatar ? (
                        <img src={comment.authorAvatar} alt="" className="w-full h-full object-cover rounded" />
                      ) : (
                        comment.authorName?.charAt(0) || 'U'
                      )}
                    </div>
                    <span className="font-semibold text-[#172B4D]">{comment.authorName || 'Security Analyst'}</span>
                    <span className="text-[#5E6C84] font-mono text-[10px]">({comment.authorRole || 'ANALYST'})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSecurityOnly ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#5243AA] bg-[#F3F0FF] px-2 py-0.5 rounded border border-[#D3C7F7]">
                        <Lock className="w-3 h-3" /> Security Only
                      </span>
                    ) : isPublic ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#0052CC] bg-[#DEEBFF] px-2 py-0.5 rounded border border-[#B3D4FF]">
                        <Globe className="w-3 h-3" /> Public
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#5E6C84] bg-[#FFFFFF] px-2 py-0.5 rounded border border-[#DFE1E6]">
                        <Shield className="w-3 h-3" /> Internal
                      </span>
                    )}
                    <span className="text-[10px] text-[#5E6C84] font-mono">
                      {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="text-[#172B4D] whitespace-pre-line leading-relaxed pl-7">
                  {comment.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Composer */}
      <form onSubmit={handleSubmit} className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#172B4D]">
            <MessageSquare className="w-3.5 h-3.5 text-[#0052CC]" />
            <span>Add Note / Comment</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5E6C84] text-[11px]">Visibility:</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
              className="jira-input py-1 text-xs"
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
          className="jira-input font-normal"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[#5E6C84]">
            Posting as: <strong className="text-[#172B4D]">{currentUser?.fullName}</strong>
          </span>
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className="jira-btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Post Comment</span>
          </button>
        </div>
      </form>
    </div>
  );
};

