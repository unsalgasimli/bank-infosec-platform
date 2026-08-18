import React, { useState } from 'react';
import { X, MessageSquare, Send, CheckCircle2, Star, ThumbsUp, Sparkles } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const [feedbackType, setFeedbackType] = useState<string>('Navigation & UI');
  const [rating, setRating] = useState<number>(5);
  const [comments, setComments] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setComments('');
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#DFE1E6] flex items-center justify-between bg-[#F4F5F7]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172B4D]">Give feedback on Jira Navigation</h2>
              <p className="text-[11px] text-[#5E6C84]">Help us improve your workspace experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#EBECF0] text-[#5E6C84] hover:text-[#172B4D] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#E3FCEF] text-[#006644] border border-[#ABF5D1] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-[#172B4D]">Thank you for your feedback!</h3>
            <p className="text-xs text-[#5E6C84]">
              Your input has been recorded and helps shape future Atlassian Jira platform updates.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
            {/* Feedback Category */}
            <div>
              <label className="block font-medium text-[#172B4D] mb-1.5">What is your feedback about?</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Navigation & UI',
                  'Sidebar Customization',
                  'Search & Filters',
                  'SecOps & Dashboards',
                ].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFeedbackType(type)}
                    className={`px-2.5 py-1.5 rounded border text-left transition-colors ${
                      feedbackType === type
                        ? 'bg-[#DEEBFF] border-[#0052CC] text-[#0052CC] font-semibold'
                        : 'bg-[#FFFFFF] border-[#DFE1E6] text-[#172B4D] hover:bg-[#EBECF0]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Satisfaction Rating */}
            <div>
              <label className="block font-medium text-[#172B4D] mb-1.5">Overall Satisfaction</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`p-1.5 rounded transition-colors ${
                      star <= rating ? 'text-[#FF8B00]' : 'text-[#7A869A] hover:text-[#5E6C84]'
                    }`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
                <span className="text-[11px] text-[#5E6C84] ml-2 font-medium">
                  {rating === 5 ? 'Excellent' : rating === 4 ? 'Good' : rating === 3 ? 'Average' : 'Needs Work'}
                </span>
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="block font-medium text-[#172B4D] mb-1.5">
                Describe in detail the feedback you have for us
              </label>
              <textarea
                required
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="What did you like or what can we improve in the new Jira layout?"
                className="w-full bg-[#FFFFFF] border border-[#DFE1E6] rounded p-2 text-xs text-[#172B4D] placeholder-[#7A869A] focus:outline-none focus:border-[#0052CC]"
              />
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[#DFE1E6] flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="jira-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" className="jira-btn-primary text-xs flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" />
                <span>Send feedback</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
