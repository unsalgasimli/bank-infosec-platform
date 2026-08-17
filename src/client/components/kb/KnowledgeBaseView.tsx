import React, { useState } from 'react';
import { KBArticle } from '../../../shared/types/kb.js';
import { BookOpen, Search, ShieldCheck, CheckCircle2, ArrowRight, FileText } from 'lucide-react';

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
      <div className="w-96 bg-bank-900 border-r border-slate-800 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Security Playbooks & Standards
            </h2>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search playbooks, CWEs, SOPs..."
              className="w-full bg-bank-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
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
                className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-950/60 border-blue-500 shadow text-white'
                    : 'bg-bank-900/60 border-slate-800/80 hover:border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-blue-400 font-bold mb-1">
                  <span>{art.category.replace(/_/g, ' ')}</span>
                  <span>v{art.version}</span>
                </div>
                <h4 className="font-bold text-slate-100 line-clamp-2">{art.title}</h4>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{art.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Article Viewer */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {selectedArticle ? (
          <div className="max-w-3xl space-y-6">
            <div className="space-y-2 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-xs font-bold border border-blue-800">
                  {selectedArticle.category.replace(/_/g, ' ')}
                </span>
                {selectedArticle.approvedByCiso && (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold font-mono">
                    <ShieldCheck className="w-3.5 h-3.5" /> Approved Standard
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-snug">
                {selectedArticle.title}
              </h1>
              <div className="text-xs text-slate-400">
                Author: <strong className="text-slate-200">{selectedArticle.authorName}</strong> ({selectedArticle.authorRole}) • Last Reviewed: {selectedArticle.lastReviewedAt}
              </div>
            </div>

            <div className="p-4 bg-bank-900 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed font-normal whitespace-pre-wrap font-sans">
              {selectedArticle.contentMarkdown}
            </div>

            {selectedArticle.tags && (
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs font-bold text-slate-400">Tags:</span>
                {selectedArticle.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded bg-bank-900 border border-slate-700 text-slate-300 font-mono text-xs">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-slate-500 text-xs">
            Select a knowledge base article from the sidebar to view full playbook.
          </div>
        )}
      </div>
    </div>
  );
};
