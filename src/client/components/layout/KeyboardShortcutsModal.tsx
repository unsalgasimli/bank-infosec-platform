import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Global Actions',
      shortcuts: [
        { key: 'c', description: 'Create issue' },
        { key: '/', description: 'Focus search bar' },
        { key: 'Ctrl + [', description: 'Collapse / expand sidebar' },
        { key: '⌘K / Ctrl+K', description: 'Open Command Palette' },
        { key: '?', description: 'Open Keyboard Shortcuts guide' },
      ],
    },
    {
      title: 'Navigation Shortcuts',
      shortcuts: [
        { key: 'g then d', description: 'Go to CISO Dashboards' },
        { key: 'g then i', description: 'Go to Queues & Issues' },
        { key: 'g then b', description: 'Go to Kanban Board' },
        { key: 'g then a', description: 'Go to CMDB Assets' },
        { key: 'g then k', description: 'Go to Knowledge Base' },
        { key: 'g then s', description: 'Go to Space Settings' },
      ],
    },
    {
      title: 'Issue & Queue Operations',
      shortcuts: [
        { key: 'j / k', description: 'Next / previous issue in list' },
        { key: 'o / Enter', description: 'Open selected issue detail' },
        { key: 'e', description: 'Edit selected issue' },
        { key: 'm', description: 'Assign issue to me' },
        { key: 'Esc', description: 'Close active modal or drawer' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-dsOverlay flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-lg shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-dsModalCompact">
        {/* Header */}
        <div className="p-4 border-b border-semantic-jira-border flex items-center justify-between bg-semantic-jira-surface">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-semantic-jira-primary">Keyboard shortcuts</h2>
              <p className="text-label text-semantic-jira-muted">Jira standard keyboard hotkeys & quick navigation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-semantic-jira-hover text-semantic-jira-muted hover:text-semantic-jira-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
          {shortcutGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <div className="text-label font-bold uppercase tracking-wider text-semantic-jira-muted-light">
                {group.title}
              </div>
              <div className="bg-semantic-panel border border-semantic-jira-border rounded-md divide-y divide-semantic-jira-hover">
                {group.shortcuts.map((s) => (
                  <div key={s.key} className="flex items-center justify-between p-2">
                    <span className="text-semantic-jira-primary">{s.description}</span>
                    <kbd className="px-2 py-0.5 rounded bg-semantic-jira-hover text-semantic-jira-brand border border-semantic-jira-border font-mono text-label shadow-sm">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-semantic-jira-border bg-semantic-jira-surface flex justify-end">
          <button onClick={onClose} className="jira-btn-primary text-xs">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
