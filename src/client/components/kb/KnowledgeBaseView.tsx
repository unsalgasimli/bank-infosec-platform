import React, { useState } from 'react';
import { KBArticle } from '../../../shared/types/kb.js';
import { BookOpen, Search, ShieldCheck, Plus, Copy, Check, Printer, X, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface KnowledgeBaseViewProps {
  articles: KBArticle[];
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ articles }) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [selectedArticle, setSelectedArticle] = useState<KBArticle | null>(articles[0] || null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'INCIDENT_PLAYBOOK' | 'APPSEC_GUIDELINES' | 'COMPLIANCE_STANDARD' | 'OPERATIONAL_SOP'>('INCIDENT_PLAYBOOK');
  const [summary, setSummary] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [tags, setTags] = useState('incident, soc, triage');

  const filtered = articles.filter((a) => {
    if (categoryFilter !== 'ALL' && a.category !== categoryFilter) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        a.contentMarkdown.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopyMarkdown = () => {
    if (selectedArticle) {
      navigator.clipboard.writeText(selectedArticle.contentMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !contentMarkdown) return;

    try {
      const res = await fetchWithAuth('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          summary: summary || title,
          contentMarkdown,
          tags: tags.split(',').map((t) => t.trim()),
          authorName: currentUser?.fullName || 'Cybersecurity Lead',
          authorRole: currentUser?.roles[0] || 'SecOps Lead',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setTitle('');
        setSummary('');
        setContentMarkdown('');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex h-full bg-semantic-jira-surface overflow-hidden">
      {/* Left Article List */}
      <div className="w-80 bg-semantic-panel border-r border-semantic-jira-border flex flex-col h-full shrink-0">
        <div className="p-3.5 border-b border-semantic-jira-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-semantic-jira-brand" />
              <h2 className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
                Knowledge & Playbooks
              </h2>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1 rounded bg-semantic-jira-brand hover:bg-semantic-jira-brand-hover text-white text-xs"
              title="Create Playbook"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-semantic-jira-muted absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search playbooks, SOPs..."
              className="jira-input pl-7"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-caption">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'INCIDENT_PLAYBOOK', label: 'IR Playbooks' },
              { id: 'APPSEC_GUIDELINES', label: 'AppSec' },
              { id: 'COMPLIANCE_STANDARD', label: 'GRC SOPs' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                  categoryFilter === cat.id
                    ? 'bg-semantic-jira-brand text-white font-semibold'
                    : 'bg-semantic-panel text-semantic-jira-muted hover:text-semantic-jira-primary border border-semantic-jira-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filtered.map((art) => {
            const isSelected = selectedArticle?.id === art.id;
            return (
              <div
                key={art.id}
                onClick={() => setSelectedArticle(art)}
                className={`p-3 rounded border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-semantic-jira-brand-surface border-semantic-jira-brand text-semantic-jira-brand font-medium shadow-sm'
                    : 'bg-semantic-panel border-semantic-jira-border hover:border-semantic-jira-brand text-semantic-jira-primary'
                }`}
              >
                <div className="flex items-center justify-between text-caption font-mono text-semantic-jira-brand mb-1">
                  <span className="truncate">{art.category.replace(/_/g, ' ')}</span>
                  <span>v{art.version}</span>
                </div>
                <h4 className="font-semibold text-semantic-jira-primary line-clamp-1">{art.title}</h4>
                <p className="text-label text-semantic-jira-muted mt-0.5 line-clamp-2 leading-snug">{art.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Article Viewer */}
      <div className="flex-1 overflow-y-auto p-8 space-y-5 bg-semantic-jira-surface custom-scrollbar">
        {selectedArticle ? (
          <div className="max-w-3xl space-y-5">
            <div className="flex items-start justify-between border-b border-semantic-jira-border pb-4 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand font-mono text-xs border border-semantic-jira-info-border font-semibold">
                    {selectedArticle.category.replace(/_/g, ' ')}
                  </span>
                  {selectedArticle.approvedByCiso && (
                    <span className="flex items-center gap-1 text-semantic-success text-xs font-mono">
                      <ShieldCheck className="w-3.5 h-3.5" /> Approved Standard
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight leading-snug">
                  {selectedArticle.title}
                </h1>
                <div className="text-label text-semantic-jira-muted">
                  Author: <strong className="text-semantic-jira-primary">{selectedArticle.authorName}</strong> ({selectedArticle.authorRole}) • Version {selectedArticle.version} • Reviewed: {selectedArticle.lastReviewedAt}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyMarkdown}
                  className="jira-btn-secondary"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-semantic-success" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Content'}</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="p-1.5 rounded bg-semantic-panel hover:bg-semantic-jira-hover text-semantic-jira-primary border border-semantic-jira-border"
                  title="Print Playbook"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-6 bg-semantic-panel border border-semantic-jira-border rounded-md text-xs text-semantic-jira-primary leading-relaxed font-normal whitespace-pre-wrap font-mono shadow-sm">
              {selectedArticle.contentMarkdown}
            </div>

            {selectedArticle.tags && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-xs font-semibold text-semantic-jira-muted flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Tags:
                </span>
                {selectedArticle.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded bg-semantic-panel border border-semantic-jira-border text-semantic-jira-brand font-mono text-label">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-semantic-jira-muted text-xs">
            Select a playbook from the left sidebar to view procedures.
          </div>
        )}
      </div>

      {/* Create Playbook Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-jira-border rounded-md max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-jira-border pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-semantic-jira-brand" />
                <h3 className="text-sm font-bold text-semantic-jira-primary">Create Security Playbook / SOP</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateArticle} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Playbook Title:</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. SOC Playbook: Ransomware Host Isolation"
                    required
                    className="jira-input"
                  />
                </div>
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Category:</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="INCIDENT_PLAYBOOK">Incident Response Playbook</option>
                    <option value="APPSEC_GUIDELINES">Application Security Guidelines</option>
                    <option value="COMPLIANCE_STANDARD">Compliance Standard & Policy</option>
                    <option value="OPERATIONAL_SOP">Standard Operating Procedure (SOP)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Executive Summary:</label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief 1-sentence synopsis..."
                  className="jira-input"
                />
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Content (Markdown & Commands):</label>
                <textarea
                  value={contentMarkdown}
                  onChange={(e) => setContentMarkdown(e.target.value)}
                  placeholder="# Phase 1: Immediate Triage&#10;1. Identify infected IP address&#10;2. Execute host isolation: `az network nic update --disable-ip-forwarding`"
                  rows={6}
                  required
                  className="jira-input font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Tags (comma separated):</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="soc, ransomware, isolation"
                  className="jira-input font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-semantic-jira-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="jira-btn-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="jira-btn-primary"
                >
                  Publish Playbook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
