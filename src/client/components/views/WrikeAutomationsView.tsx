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
import { useI18n } from '../../context/I18nContext.js';
import { AutomationRule } from '../../../shared/types/automation.js';
import { ProjectBlueprint } from '../../../shared/types/blueprints.js';

interface WrikeAutomationsViewProps {
  onRefreshTickets?: () => void;
}

export const WrikeAutomationsView: React.FC<WrikeAutomationsViewProps> = ({
  onRefreshTickets,
}) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
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
    <div className="flex-1 flex flex-col h-full bg-semantic-page-muted overflow-hidden select-none">
      {/* Wrike Automations Header */}
      <div className="bg-semantic-panel border-b border-semantic-surface-alt px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-wrike-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center font-bold text-xs">
            <Zap className="w-4 h-4 text-semantic-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-semantic-primary">
                {t('Wrike Automation Engine & Project Blueprints')}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                {t('Real-Time Backend Synced')}
              </span>
            </div>
            <p className="text-label text-semantic-jira-muted-alt">
              {t('Build custom trigger-condition-action workflow rules and launch turnkey enterprise project blueprints.')}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-semantic-subtle border border-semantic-surface-alt rounded-md p-0.5 text-xs">
          <button
            onClick={() => setActiveTab('RULES')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'RULES' ? 'bg-semantic-brand text-white font-semibold shadow-sm' : 'text-semantic-jira-muted-alt hover:text-semantic-primary'
            }`}
          >
            {t('Automation Rules')} ({automationRules.length})
          </button>
          <button
            onClick={() => setActiveTab('BLUEPRINTS')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'BLUEPRINTS' ? 'bg-semantic-brand text-white font-semibold shadow-sm' : 'text-semantic-jira-muted-alt hover:text-semantic-primary'
            }`}
          >
            {t('Project Blueprints')} ({blueprints.length})
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-4">
          {launchedMessage && (
            <div className="p-3.5 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{launchedMessage}</span>
              </div>
            </div>
          )}

          {activeTab === 'RULES' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-semantic-jira-muted-alt">
                  {t('Active SecOps Workflow Automation Rules')} ({automationRules.length})
                </span>
                <button
                  onClick={() => alert('Add Custom Rule builder opened.')}
                  className="wrike-btn-primary text-xs py-1 px-3"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('Create Automation Rule')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {automationRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="wrike-card p-4 flex flex-col justify-between space-y-3 shadow-wrike-sm hover:border-semantic-brand transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-semantic-success-surface text-semantic-brand flex items-center justify-center font-bold text-xs">
                          ⚡
                        </div>
                        <h4 className="font-bold text-sm text-semantic-primary">{rule.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-caption font-mono text-semantic-jira-muted-alt bg-semantic-subtle px-2 py-0.5 rounded border border-semantic-surface-alt">
                          {rule.executionCount || 0} {t('Executions')}
                        </span>
                        <span className={`wrike-pill ${rule.isActive ? 'wrike-pill-green' : 'wrike-pill-gray'} text-caption`}>
                          {rule.isActive ? t('ACTIVE') : t('DISABLED')}
                        </span>
                      </div>
                    </div>

                    {/* Trigger -> Condition -> Action Pipeline */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-2.5 bg-semantic-subtle rounded-lg border border-semantic-surface-alt">
                        <span className="text-caption font-bold text-semantic-success uppercase block">{t('When (Trigger)')}</span>
                        <span className="font-medium text-semantic-brand-ink mt-0.5 block">{rule.trigger}</span>
                      </div>
                      <div className="p-2.5 bg-semantic-subtle rounded-lg border border-semantic-surface-alt">
                        <span className="text-caption font-bold text-semantic-warning uppercase block">{t('If (Condition)')}</span>
                        <span className="font-medium text-semantic-brand-ink mt-0.5 block">
                          {rule.conditions?.map((c) => `${c.field} ${c.operator} ${c.value}`).join(' AND ') || t('Default Condition')}
                        </span>
                      </div>
                      <div className="p-2.5 bg-semantic-subtle rounded-lg border border-semantic-surface-alt">
                        <span className="text-caption font-bold text-semantic-info uppercase block">{t('Then (Action)')}</span>
                        <span className="font-medium text-semantic-brand-ink mt-0.5 block">
                          {rule.actions?.map((a) => `${a.type}`).join(', ') || t('Execute Action')}
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
                <span className="text-xs font-bold uppercase tracking-wider text-semantic-jira-muted-alt">
                  {t('Turnkey Project Blueprints (1-Click Launch)')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {blueprints.map((bp) => {
                  const Icon = getBlueprintIcon(bp.iconName);
                  return (
                    <div
                      key={bp.id}
                      className="wrike-card p-4 flex flex-col justify-between space-y-3 shadow-wrike-sm hover:border-semantic-brand transition-all"
                    >
                      <div>
                        <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center mb-2.5">
                          <Icon className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-sm text-semantic-primary leading-snug">{bp.title}</h4>
                        <span className="text-label font-semibold text-semantic-success block mt-0.5">{bp.domain}</span>
                        <p className="text-xs text-semantic-jira-muted-alt mt-2 leading-relaxed">{bp.description}</p>
                      </div>

                      <div className="pt-3 border-t border-semantic-table space-y-2">
                        <div className="flex items-center justify-between text-label text-semantic-jira-muted-alt font-mono">
                          <span>{bp.defaultTasks?.length || bp.taskCount} {t('Tasks')}</span>
                          <span>{t('Est:')} {bp.estimatedDays} {t('Days')}</span>
                        </div>
                        <button
                          onClick={() => handleLaunch(bp)}
                          className="w-full wrike-btn-primary py-1.5 text-xs justify-center"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{t('Launch Blueprint Project')}</span>
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
