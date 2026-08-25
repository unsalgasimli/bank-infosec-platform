import React, { useState, useEffect } from 'react';
import {
  Lightbulb,
  Plus,
  ArrowRight,
  CheckCircle2,
  Share2,
  Download,
  Trash2,
  Layers,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Palette,
  Move,
  Tag,
  Shield,
  Lock,
  Flame,
  AlertTriangle,
  FolderGit2,
  FileText,
  User,
  Clock,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { IdeaNode } from '../../../shared/types/ideate.js';

interface IdeateCanvasViewProps {
  onNavigate: (view: string, id?: string) => void;
  onRefreshTickets?: () => void;
}

export const IdeateCanvasView: React.FC<IdeateCanvasViewProps> = ({ onNavigate, onRefreshTickets }) => {
  const { fetchWithAuth, currentUser } = useAuth();

  const [ideas, setIdeas] = useState<IdeaNode[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAddingIdea, setIsAddingIdea] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState<'green' | 'blue' | 'amber' | 'coral' | 'purple'>('green');
  const [newCategory, setNewCategory] = useState<'THREAT_VECTOR' | 'ZERO_TRUST' | 'COMPLIANCE' | 'INCIDENT_IR' | 'DEVSECOPS' | 'GENERAL'>('ZERO_TRUST');

  const loadIdeas = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth('/api/ideate');
      const data = await res.json();
      if (data.success && data.ideas) {
        setIdeas(data.ideas);
        if (data.ideas.length > 0 && !selectedNodeId) {
          setSelectedNodeId(data.ideas[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load ideas from backend', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIdeas();
  }, []);

  const handleAddIdea = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetchWithAuth('/api/ideate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || 'No additional details provided.',
          category: newCategory,
          color: newColor,
          x: 100 + Math.random() * 200,
          y: 100 + Math.random() * 150,
          priority: 'P2_HIGH',
          assignee: currentUser?.fullName || 'Unassigned',
          tags: ['IDEATION', newCategory],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIdeas((prev) => [...prev, data.idea]);
        setSelectedNodeId(data.idea.id);
        setNewTitle('');
        setNewDesc('');
        setIsAddingIdea(false);
      }
    } catch (err) {
      console.error('Failed to create idea node on backend', err);
    }
  };

  const handleConvertIdea = async (node: IdeaNode) => {
    try {
      const res = await fetchWithAuth(`/api/ideate/${node.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setIdeas((prev) =>
          prev.map((item) => (item.id === node.id ? data.idea : item))
        );
        if (onRefreshTickets) {
          onRefreshTickets();
        }
      }
    } catch (err) {
      console.error('Failed to convert idea node on backend', err);
    }
  };

  const handleDeleteIdea = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetchWithAuth(`/api/ideate/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setIdeas((prev) => prev.filter((item) => item.id !== id));
        if (selectedNodeId === id) {
          setSelectedNodeId(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete idea on backend', err);
    }
  };

  const selectedNode = ideas.find((i) => i.id === selectedNodeId);

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return {
          card: 'border-semantic-success-border bg-semantic-success-card hover:border-semantic-brand',
          badge: 'bg-semantic-success-surface text-semantic-success border-semantic-success-border',
          bar: 'bg-semantic-brand',
        };
      case 'blue':
        return {
          card: 'border-semantic-info-border bg-semantic-info-canvas hover:border-semantic-info',
          badge: 'bg-semantic-info-surface text-semantic-info border-semantic-info-border',
          bar: 'bg-semantic-info',
        };
      case 'amber':
        return {
          card: 'border-semantic-warning-border bg-semantic-warning-card hover:border-semantic-warning-bright',
          badge: 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border',
          bar: 'bg-semantic-warning-bright',
        };
      case 'coral':
        return {
          card: 'border-semantic-danger-border bg-semantic-danger-card hover:border-semantic-brand-danger',
          badge: 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border',
          bar: 'bg-semantic-brand-danger',
        };
      case 'purple':
      default:
        return {
          card: 'border-semantic-purple-border bg-semantic-purple-surface hover:border-semantic-purple',
          badge: 'bg-semantic-purple-soft text-semantic-purple-strong border-semantic-purple-border',
          bar: 'bg-semantic-purple',
        };
    }
  };

  const filteredIdeas = selectedCategory === 'ALL' ? ideas : ideas.filter((i) => i.category === selectedCategory);

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page-muted overflow-hidden select-none">
      {/* Wrike Ideate Top Bar */}
      <div className="bg-semantic-panel border-b border-semantic-surface-alt px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-success border border-semantic-success-border flex items-center justify-center shadow-sm">
            <Lightbulb className="w-4 h-4 text-semantic-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-semantic-primary">
                Wrike Ideate: Cyber Threat & Strategy Canvas
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                Real-Time Backend Synced
              </span>
            </div>
            <p className="text-label text-semantic-jira-muted-alt">
              Brainstorm cyber defense initiatives, model attack vectors, and persist real ideas with 1-click task creation.
            </p>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center bg-semantic-subtle border border-semantic-surface-alt rounded-md p-0.5 text-xs">
            {['ALL', 'THREAT_VECTOR', 'ZERO_TRUST', 'COMPLIANCE', 'DEVSECOPS'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded text-label font-medium transition-colors ${
                  selectedCategory === cat ? 'bg-semantic-brand text-white font-semibold shadow-sm' : 'text-semantic-jira-muted-alt hover:text-semantic-primary'
                }`}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsAddingIdea(true)}
            className="wrike-btn-primary text-xs py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Sticky Note</span>
          </button>

          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-semantic-panel border border-semantic-surface-alt rounded-md text-xs">
            <button
              onClick={() => setZoomLevel(Math.max(60, zoomLevel - 10))}
              className="p-1.5 hover:bg-semantic-subtle text-semantic-jira-muted-alt hover:text-semantic-primary border-r border-semantic-surface-alt"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-label text-semantic-brand-ink">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(140, zoomLevel + 10))}
              className="p-1.5 hover:bg-semantic-subtle text-semantic-jira-muted-alt hover:text-semantic-primary"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Infinite Grid Background */}
        <div
          className="flex-1 wrike-canvas-grid overflow-auto p-8 relative custom-scrollbar origin-top-left"
          style={{ transform: `scale(${zoomLevel / 100})` }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-xs text-semantic-jira-muted-alt">
              Loading ideas from database...
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <Lightbulb className="w-10 h-10 text-semantic-dark-muted mb-3" />
              <h3 className="font-bold text-sm text-semantic-primary">No sticky notes in this category</h3>
              <p className="text-xs text-semantic-jira-muted-alt mt-1 max-w-sm">
                Click "+ Add Sticky Note" to brainstorm a new threat defense strategy or security architectural initiative.
              </p>
              <button
                onClick={() => setIsAddingIdea(true)}
                className="wrike-btn-primary text-xs py-1.5 px-4 mt-4"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Note</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-6xl pb-20">
              {filteredIdeas.map((node) => {
                const styles = getColorClasses(node.color);
                const isSelected = selectedNodeId === node.id;

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`relative p-4 rounded-xl border-2 shadow-wrike-sm transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[220px] ${styles.card} ${
                      isSelected ? 'ring-2 ring-semantic-brand shadow-wrike-md scale-[1.01]' : ''
                    }`}
                  >
                    {/* Top Bar Accent */}
                    <div className={`absolute top-0 left-4 right-4 h-1 rounded-b-full ${styles.bar}`} />

                    <div>
                      {/* Header: Category & Delete */}
                      <div className="flex items-center justify-between gap-2 mb-2.5 pt-1">
                        <span className={`px-2 py-0.5 rounded-full font-mono text-caption font-bold border ${styles.badge}`}>
                          {node.category.replace('_', ' ')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-caption font-bold px-2 py-0.5 rounded bg-semantic-panel border border-semantic-surface-alt text-semantic-brand-ink">
                            {node.priority}
                          </span>
                          <button
                            onClick={(e) => handleDeleteIdea(node.id, e)}
                            className="p-1 rounded text-semantic-muted-alt hover:text-semantic-brand-danger hover:bg-semantic-danger-surface transition-colors"
                            title="Delete sticky note"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="font-bold text-semantic-primary text-sm leading-snug mb-1.5">
                        {node.title}
                      </h3>

                      {/* Description */}
                      <p className="text-xs text-semantic-jira-muted-alt line-clamp-3 leading-relaxed mb-3">
                        {node.description}
                      </p>
                    </div>

                    <div>
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {node.tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.2 rounded bg-semantic-panel/80 border border-semantic-surface-alt text-semantic-brand-ink text-micro font-mono">
                            #{t}
                          </span>
                        ))}
                      </div>

                      {/* Footer: Assignee & 1-Click Action */}
                      <div className="pt-2 border-t border-semantic-surface-alt flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-label text-semantic-jira-muted-alt">
                          <User className="w-3 h-3 text-semantic-brand" />
                          <span className="truncate max-w-dsTruncateCompact">{node.assignee}</span>
                        </div>

                        {node.status === 'CONVERTED' ? (
                          <span className="flex items-center gap-1 text-semantic-success bg-semantic-success-surface border border-semantic-success-border px-2 py-0.5 rounded-full text-caption font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{node.convertedTicketKey}</span>
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConvertIdea(node);
                            }}
                            className="wrike-btn-primary text-label py-1 px-2.5 shadow-sm"
                            title="Convert this idea into a real Wrike Task"
                          >
                            <span>Convert to Task</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Inspector Drawer */}
        {selectedNode && (
          <div className="w-80 bg-semantic-panel border-l border-semantic-surface-alt p-4 flex flex-col justify-between shrink-0 shadow-wrike-lg z-dsContent overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-semantic-surface-alt pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-semantic-primary">
                  <Sparkles className="w-3.5 h-3.5 text-semantic-brand" />
                  <span>Ideate Inspector</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-caption font-bold border ${getColorClasses(selectedNode.color).badge}`}>
                  {selectedNode.status}
                </span>
              </div>

              <div>
                <label className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-alt">Idea Title</label>
                <div className="text-xs font-bold text-semantic-primary mt-0.5 leading-snug">
                  {selectedNode.title}
                </div>
              </div>

              <div>
                <label className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-alt">Brainstorming Notes</label>
                <p className="text-xs text-semantic-brand-ink mt-1 bg-semantic-subtle p-2.5 rounded-md border border-semantic-surface-alt leading-relaxed">
                  {selectedNode.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-semantic-subtle rounded border border-semantic-surface-alt">
                  <span className="text-caption text-semantic-jira-muted-alt block">Domain Category</span>
                  <span className="font-semibold text-semantic-primary text-label">{selectedNode.category}</span>
                </div>
                <div className="p-2 bg-semantic-subtle rounded border border-semantic-surface-alt">
                  <span className="text-caption text-semantic-jira-muted-alt block">Business Priority</span>
                  <span className="font-semibold text-semantic-brand-danger text-label">{selectedNode.priority}</span>
                </div>
              </div>

              <div>
                <label className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-alt mb-1.5 block">Idea Tags</label>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-semantic-info-surface text-semantic-info border border-semantic-info-border text-caption font-mono">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-semantic-success-surface border border-semantic-success-border rounded-lg text-xs text-semantic-success space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Wrike Work Intelligence</span>
                </div>
                <p className="text-label leading-snug">
                  Converting this idea writes directly to the backend database, schedules SLA timers, and initializes workflows.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-semantic-surface-alt space-y-2">
              {selectedNode.status === 'CONVERTED' ? (
                <button
                  onClick={() => onNavigate('table')}
                  className="w-full wrike-btn-secondary text-xs py-2 justify-center"
                >
                  <span>View Converted Task ({selectedNode.convertedTicketKey})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => handleConvertIdea(selectedNode)}
                  className="w-full wrike-btn-primary text-xs py-2 justify-center"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>1-Click Convert to Real Task</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Idea Modal */}
      {isAddingIdea && (
        <div className="fixed inset-0 bg-semantic-primary/50 backdrop-blur-sm flex items-center justify-center z-dsOverlay p-4">
          <div className="w-full max-w-md bg-semantic-panel rounded-xl border border-semantic-surface-alt shadow-wrike-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-semantic-surface-alt pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-semantic-success-surface text-semantic-brand flex items-center justify-center font-bold text-xs">
                  💡
                </div>
                <h3 className="font-bold text-sm text-semantic-primary">Add Ideate Sticky Note</h3>
              </div>
              <button
                onClick={() => setIsAddingIdea(false)}
                className="text-semantic-jira-muted-alt hover:text-semantic-primary p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-semantic-brand-ink mb-1 block">Idea Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Implement Hardware FIDO2 Security Keys on Jump Hosts"
                  className="wrike-input"
                  autoFocus
                />
              </div>

              <div>
                <label className="font-bold text-semantic-brand-ink mb-1 block">Description & Scope</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describe the initiative, threat model, or architectural change..."
                  className="wrike-input h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-semantic-brand-ink mb-1 block">Domain Category</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="wrike-input"
                  >
                    <option value="ZERO_TRUST">Zero Trust Architecture</option>
                    <option value="THREAT_VECTOR">Threat Vector Defense</option>
                    <option value="COMPLIANCE">Regulatory Compliance</option>
                    <option value="INCIDENT_IR">Incident Response</option>
                    <option value="DEVSECOPS">DevSecOps Pipeline</option>
                    <option value="GENERAL">General Security</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-semantic-brand-ink mb-1 block">Sticky Color</label>
                  <select
                    value={newColor}
                    onChange={(e: any) => setNewColor(e.target.value)}
                    className="wrike-input"
                  >
                    <option value="green">Emerald Green (Strategic)</option>
                    <option value="blue">Wrike Blue (Architecture)</option>
                    <option value="amber">Amber (Compliance/Audit)</option>
                    <option value="coral">Coral Red (High Threat/IR)</option>
                    <option value="purple">Purple (DevSecOps)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-semantic-surface-alt">
              <button
                onClick={() => setIsAddingIdea(false)}
                className="wrike-btn-secondary py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleAddIdea}
                disabled={!newTitle.trim()}
                className="wrike-btn-primary py-1.5 px-4 disabled:opacity-50"
              >
                Create Idea Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
