import React, { useState } from 'react';
import { KBArticle } from '../../../shared/types/kb.js';
import { BookOpen, Search, ShieldCheck } from 'lucide-react';

interface KnowledgeBaseViewProps {
  articles: KBArticle[];
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ articles }) => {
  const [selectedArticle, setSelectedArticle] = useState<KBArticle | null>(articles[0] || null);
  const [search, setSearch] = useState('');

  const filtered = articles.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.summary.toLowerCase().includes(search.toLowerCase()) ||
      a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex-1 flex h-full bg-bank-950 overflow-hidden">
      {/* Left Article List */}
      <div className="w-80 bg-bank-900 border-r border-slate-800 flex flex-col h-full shrink-0">
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Playbooks & Standards
            </h2>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search playbooks, SOPs..."
              className="w-full bg-bank-950 border border-slate-700 rounded pl-7 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map((art) => {
            const isSelected = selectedArticle?.id === art.id;
            return (
              <div
                key={art.id}
                onClick={() => setSelectedArticle(art)}
                className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-slate-800 border-blue-500 text-white font-medium'
                    : 'bg-bank-900 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-blue-400 mb-0.5">
                  <span>{art.category.replace(/_/g, ' ')}</span>
                  <span>v{art.version}</span>
                </div>
                <h4 className="font-semibold text-slate-100 line-clamp-1">{art.title}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{art.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Article Viewer */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {selectedArticle ? (
          <div className="max-w-3xl space-y-5">
            <div className="space-y-1.5 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-bank-950 text-blue-300 font-mono text-xs border border-slate-750 font-medium">
                  {selectedArticle.category.replace(/_/g, ' ')}
                </span>
                {selectedArticle.approvedByCiso && (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs font-mono">
                    <ShieldCheck className="w-3.5 h-3.5" /> Approved Standard
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-snug">
                {selectedArticle.title}
              </h1>
              <div className="text-[11px] text-slate-400">
                Author: <strong className="text-slate-200">{selectedArticle.authorName}</strong> ({selectedArticle.authorRole}) • Last Reviewed: {selectedArticle.lastReviewedAt}
              </div>
            </div>

            <div className="p-4 bg-bank-900 border border-slate-800 rounded-lg text-xs text-slate-200 leading-relaxed font-normal whitespace-pre-wrap font-sans">
              {selectedArticle.contentMarkdown}
            </div>

            {selectedArticle.tags && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-slate-400">Tags:</span>
                {selectedArticle.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded bg-bank-900 border border-slate-700 text-slate-300 font-mono text-[11px]">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-slate-500 text-xs">
            Select a playbook from the sidebar to view full details.
          </div>
        )}
      </div>
    </div>
  );
};

