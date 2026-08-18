import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  Copy,
  Layers,
  ArrowRight,
  Shield,
  Clock,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { AutomationRule } from '../../../shared/types/automation.js';
import { ProjectBlueprint } from '../../../shared/types/blueprints.js';

interface WrikeAutomationsViewProps {
  onRefreshTickets?: () => void;
  onNavigate?: (view: string) => void;
}

export const WrikeAutomationsView: React.FC<WrikeAutomationsViewProps> = ({
  onRefreshTickets,
  onNavigate,
}) => {
  const { fetchWithAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'RULES' | 'BLUEPRINTS'>('RULES');
  const [launchedMessage, setLaunchedMessage] = useState<string | null>(null);

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [blueprints, setBlueprints] = useState<ProjectBlueprint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [rulesRes, bpRes] = await Promise.all([
        fetchWithAuth('/api/automations'),
        fetchWithAuth('/api/blueprints'),
      ]);
      const rulesData = await rulesRes.json();
      const bpData = await bpRes.json();

      if (rulesData.success) setAutomationRules(rulesData.rules || []);
      if (bpData.success) setBlueprints(bpData.blueprints || []);
    } catch (err) {
      console.error('Failed to load automations / blueprints', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLaunch = async (blueprint: ProjectBlueprint) => {
    try {
      const res = await fetchWithAuth(`/api/blueprints/${blueprint.id}/launch`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setLaunchedMessage(
          `🚀 Blueprint "${blueprint.title}" successfully instantiated! Created ${data.createdTickets?.length || 0} scheduled tasks in database.`
        );
        if (onRefreshTickets) onRefreshTickets();
      }
    } catch (err) {
      console.error('Failed to launch blueprint', err);
    }
  };

  const getBlueprintIcon = (iconName: string) => {
    switch (iconName) {
      case 'Shield':
        return Shield;
      case 'Zap':
        return Zap;
      case 'Layers':
      default:
        return Layers;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F2F5FA] overflow-hidden select-none">
      {/* Wrike Automations Header */}
      <div className="bg-[#FFFFFF] border-b border-[#DCE1EB] px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E6F7EF] text-[#00B259] border border-[#B8EAD1] flex items-center justify-center font-bold text-xs">
            <Zap className="w-4 h-4 text-[#00B259]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#162136]">
                Wrike Automation Engine & Project Blueprints
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] text-[10px] font-bold border border-[#B8EAD1]">
                Real-Time Backend Synced
              </span>
            </div>
            <p className="text-[11px] text-[#657694]">
              Build custom trigger-condition-action workflow rules and launch turnkey enterprise project blueprints.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-[#F8FAFC] border border-[#DCE1EB] rounded-md p-0.5 text-xs">
          <button
            onClick={() => setActiveTab('RULES')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'RULES' ? 'bg-[#00B259] text-white font-semibold shadow-sm' : 'text-[#657694] hover:text-[#162136]'
            }`}
          >
            Automation Rules ({automationRules.length})
          </button>
          <button
            onClick={() => setActiveTab('BLUEPRINTS')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'BLUEPRINTS' ? 'bg-[#00B259] text-white font-semibold shadow-sm' : 'text-[#657694] hover:text-[#162136]'
            }`}
          >
            Project Blueprints ({blueprints.length})
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-4">
          {launchedMessage && (
            <div className="p-3.5 rounded-lg bg-[#E6F7EF] border border-[#B8EAD1] text-xs font-semibold text-[#007860] flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{launchedMessage}</span>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('gantt')}
                  className="px-2.5 py-1 rounded bg-[#00B259] text-white font-bold text-[11px] hover:bg-[#00964B]"
                >
                  View in Gantt
                </button>
              )}
            </div>
          )}

          {activeTab === 'RULES' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#657694]">
                  Active SecOps Workflow Automation Rules ({automationRules.length})
                </span>
                <button
                  onClick={() => alert('Add Custom Rule builder opened.')}
                  className="wrike-btn-primary text-xs py-1 px-3"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Automation Rule</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {automationRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="wrike-card p-4 flex flex-col justify-between space-y-3 shadow-wrike-sm hover:border-[#00B259] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-[#E6F7EF] text-[#00B259] flex items-center justify-center font-bold text-xs">
                          ⚡
                        </div>
                        <h4 className="font-bold text-sm text-[#162136]">{rule.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#657694] bg-[#F8FAFC] px-2 py-0.5 rounded border border-[#DCE1EB]">
                          {rule.executionCount || 0} Executions
                        </span>
                        <span className={`wrike-pill ${rule.isActive ? 'wrike-pill-green' : 'wrike-pill-gray'} text-[10px]`}>
                          {rule.isActive ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </div>
                    </div>

                    {/* Trigger -> Condition -> Action Pipeline */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#DCE1EB]">
                        <span className="text-[10px] font-bold text-[#007860] uppercase block">When (Trigger)</span>
                        <span className="font-medium text-[#2B3A57] mt-0.5 block">{rule.trigger}</span>
                      </div>
                      <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#DCE1EB]">
                        <span className="text-[10px] font-bold text-[#D46B08] uppercase block">If (Condition)</span>
                        <span className="font-medium text-[#2B3A57] mt-0.5 block">
                          {rule.conditions?.map((c) => `${c.field} ${c.operator} ${c.value}`).join(' AND ') || 'Default Condition'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#DCE1EB]">
                        <span className="text-[10px] font-bold text-[#0073D3] uppercase block">Then (Action)</span>
                        <span className="font-medium text-[#2B3A57] mt-0.5 block">
                          {rule.actions?.map((a) => `${a.type}`).join(', ') || 'Execute Action'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#657694]">
                  Turnkey Project Blueprints (1-Click Launch)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {blueprints.map((bp) => {
                  const Icon = getBlueprintIcon(bp.iconName);
                  return (
                    <div
                      key={bp.id}
                      className="wrike-card p-4 flex flex-col justify-between space-y-3 shadow-wrike-sm hover:border-[#00B259] transition-all"
                    >
                      <div>
                        <div className="w-8 h-8 rounded-lg bg-[#E6F7EF] text-[#00B259] border border-[#B8EAD1] flex items-center justify-center mb-2.5">
                          <Icon className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-sm text-[#162136] leading-snug">{bp.title}</h4>
                        <span className="text-[11px] font-semibold text-[#007860] block mt-0.5">{bp.domain}</span>
                        <p className="text-xs text-[#657694] mt-2 leading-relaxed">{bp.description}</p>
                      </div>

                      <div className="pt-3 border-t border-[#EBF0F7] space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-[#657694] font-mono">
                          <span>{bp.defaultTasks?.length || bp.taskCount} Tasks</span>
                          <span>Est: {bp.estimatedDays} Days</span>
                        </div>
                        <button
                          onClick={() => handleLaunch(bp)}
                          className="w-full wrike-btn-primary py-1.5 text-xs justify-center"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Launch Blueprint Project</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
