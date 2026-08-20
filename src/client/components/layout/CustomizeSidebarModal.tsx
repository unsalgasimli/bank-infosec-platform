import React, { useState, useEffect } from 'react';
import { X, Check, RotateCcw, MoveUp, MoveDown, Sliders, Eye, EyeOff } from 'lucide-react';

export interface SidebarConfigItem {
  id: string;
  label: string;
  section: 'essentials' | 'space' | 'assets' | 'apps';
  visible: boolean;
}

export const DEFAULT_SIDEBAR_CONFIG: SidebarConfigItem[] = [
  // Essentials
  { id: 'analyst-dash', label: 'For you', section: 'essentials', visible: true },
  { id: 'ciso-dash', label: 'Dashboards', section: 'essentials', visible: true },
  { id: 'tickets', label: 'Filters & Search', section: 'essentials', visible: true },

  // Space Items
  { id: 'tickets-queues', label: 'Queues (All Open)', section: 'space', visible: true },
  { id: 'board', label: 'Kanban Board', section: 'space', visible: true },
  { id: 'approvals', label: 'Approvals (Dual Control)', section: 'space', visible: true },
  { id: 'risk-register', label: 'Risk Management (5×5)', section: 'space', visible: true },
  { id: 'audit-compliance', label: 'Audit & Compliance', section: 'space', visible: true },

  // Assets & Goals
  { id: 'applications', label: 'Banking Applications (CMDB)', section: 'assets', visible: true },
  { id: 'assets', label: 'Infrastructure Assets', section: 'assets', visible: true },
  { id: 'knowledge-base', label: 'Knowledge Base (SOPs)', section: 'assets', visible: true },

  // Settings & Apps
  { id: 'admin-center', label: 'Space Settings & Audit', section: 'apps', visible: true },
];

interface CustomizeSidebarModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SidebarConfigItem[];
  onSaveConfig: (newConfig: SidebarConfigItem[]) => void;
}

export const CustomizeSidebarModal: React.FC<CustomizeSidebarModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [draftConfig, setDraftConfig] = useState<SidebarConfigItem[]>(config);

  useEffect(() => {
    if (isOpen) {
      setDraftConfig(config);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const toggleVisibility = (id: string) => {
    setDraftConfig((prev) =>
      prev.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item))
    );
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftConfig.length) return;

    const newArr = [...draftConfig];
    const temp = newArr[index];
    newArr[index] = newArr[targetIndex];
    newArr[targetIndex] = temp;
    setDraftConfig(newArr);
  };

  const handleReset = () => {
    setDraftConfig(DEFAULT_SIDEBAR_CONFIG);
  };

  const handleSave = () => {
    onSaveConfig(draftConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#DFE1E6] flex items-center justify-between bg-[#F4F5F7]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172B4D]">Customize sidebar</h2>
              <p className="text-[11px] text-[#5E6C84]">
                Show, hide, or reorder navigation items for your personal account
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#EBECF0] text-[#5E6C84] hover:text-[#172B4D] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body - Items Checklist */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          <div className="text-xs text-[#5E6C84] bg-[#FFFFFF] p-2.5 rounded border border-[#DFE1E6]">
            💡 <strong className="text-[#172B4D]">Tip:</strong> Uncheck items to hide them from your sidebar. Use the arrows to reorder. Changes only affect your view.
          </div>

          {['essentials', 'space', 'assets', 'apps'].map((sectionKey) => {
            const sectionItems = draftConfig.filter((item) => item.section === sectionKey);
            if (sectionItems.length === 0) return null;

            const sectionTitle =
              sectionKey === 'essentials'
                ? 'Jira Essentials'
                : sectionKey === 'space'
                ? 'Apex Bank SecOps Space'
                : sectionKey === 'assets'
                ? 'Assets & Goals'
                : 'Apps & Settings';

            return (
              <div key={sectionKey} className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#7A869A] px-1">
                  {sectionTitle}
                </div>
                <div className="space-y-1 bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-1.5">
                  {sectionItems.map((item) => {
                    const globalIndex = draftConfig.findIndex((d) => d.id === item.id);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded transition-colors ${
                          item.visible ? 'bg-[#FFFFFF] hover:bg-[#EBECF0]' : 'bg-[#F4F5F7]/50 opacity-60'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-[#172B4D]">
                          <input
                            type="checkbox"
                            checked={item.visible}
                            onChange={() => toggleVisibility(item.id)}
                            className="rounded bg-[#FFFFFF] border-[#DFE1E6] text-[#0052CC] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className={item.visible ? 'font-medium' : 'text-[#5E6C84] line-through'}>
                            {item.label}
                          </span>
                        </label>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveItem(globalIndex, 'up')}
                            disabled={globalIndex === 0}
                            className="p-1 rounded hover:bg-[#DFE1E6] text-[#5E6C84] hover:text-[#172B4D] disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Move up"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(globalIndex, 'down')}
                            disabled={globalIndex === draftConfig.length - 1}
                            className="p-1 rounded hover:bg-[#DFE1E6] text-[#5E6C84] hover:text-[#172B4D] disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Move down"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#DFE1E6] bg-[#F4F5F7] flex items-center justify-between">
          <button
            onClick={handleReset}
            className="jira-btn-subtle text-xs flex items-center gap-1 text-[#5E6C84] hover:text-[#172B4D]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to default</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="jira-btn-secondary text-xs">
              Cancel
            </button>
            <button onClick={handleSave} className="jira-btn-primary text-xs">
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
