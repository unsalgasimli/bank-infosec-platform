import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Shield,
  Users,
  Server,
  CreditCard,
  Building2,
  ChevronRight,
  Sparkles,
  X,
  Lock,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { ProjectBlueprint } from '../../../shared/types/blueprints.js';

interface CrossDepartmentHubViewProps {
  onSelectTicket?: (ticket: Ticket) => void;
  onNavigate: (view: string, id?: string) => void;
  onRefreshTickets?: () => void;
}

export const CrossDepartmentHubView: React.FC<CrossDepartmentHubViewProps> = ({
  onSelectTicket,
  onNavigate,
  onRefreshTickets,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [parentWorkflows, setParentWorkflows] = useState<Ticket[]>([]);
  const [crossTickets, setCrossTickets] = useState<Ticket[]>([]);
  const [blueprints, setBlueprints] = useState<ProjectBlueprint[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('bp-cross-onboarding');
  const [customTitle, setCustomTitle] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchSuccessMsg, setLaunchSuccessMsg] = useState<string | null>(null);

  const loadCrossData = async () => {
    try {
      setIsLoading(true);
      const [crossRes, deptRes] = await Promise.all([
        fetchWithAuth('/api/cross-tasks'),
        fetchWithAuth('/api/departments'),
      ]);
      const crossData = await crossRes.json();
      const deptData = await deptRes.json();

      if (crossData.success) {
        setCrossTickets(crossData.crossTickets || []);
        setParentWorkflows(crossData.parentWorkflows || []);
        setBlueprints(crossData.blueprints || []);
      }
      if (deptData.success) {
        setDepartments(deptData.departments || []);
      }
    } catch (err) {
      console.error('Failed to load cross-department data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCrossData();
  }, [currentUser]);

  const handleLaunchCrossWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLaunching(true);
      const res = await fetchWithAuth('/api/cross-tasks/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprintId: selectedBlueprintId,
          customTitle: customTitle || undefined,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setLaunchSuccessMsg(resData.message);
        setIsLaunchModalOpen(false);
        setCustomTitle('');
        loadCrossData();
        if (onRefreshTickets) onRefreshTickets();
        setTimeout(() => setLaunchSuccessMsg(null), 5000);
      } else {
        alert(`Launch failed: ${resData.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const getDeptColor = (deptId?: string) => {
    const dept = departments.find((d) => d.id === deptId || d.code === deptId);
    return dept?.color || 'var(--color-jira-blue-500)';
  };

  const getDeptCode = (deptId?: string) => {
    const dept = departments.find((d) => d.id === deptId || d.code === deptId);
    return dept?.code || deptId?.toUpperCase() || 'DEPT';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page overflow-hidden select-none">
      {/* Header Bar */}
      <div className="bg-semantic-panel border-b border-semantic-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-semantic-purple-surface text-semantic-purple border border-semantic-purple-border flex items-center justify-center font-bold shadow-xs">
            <Layers className="w-5 h-5 text-semantic-purple" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-extrabold text-semantic-primary tracking-tight">
                Cross-Department Task Orchestration Hub
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-purple-surface text-semantic-purple text-caption font-extrabold border border-semantic-purple-border">
                Multi-Dept Pipeline Engine
              </span>
            </div>
            <p className="text-xs text-semantic-jira-muted-strong mt-0.5">
              Orchestrate end-to-end tasks spanning HR, IT Operations, Infosec, Core Banking, and GRC with dependency tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsLaunchModalOpen(true)}
            className="wrike-btn-primary px-3.5 py-2 text-xs font-bold flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Launch Cross-Task Pipeline</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Success Notification */}
          {launchSuccessMsg && (
            <div className="p-4 rounded-xl bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{launchSuccessMsg}</span>
              </div>
              <button
                onClick={() => onNavigate('table')}
                className="px-3 py-1 rounded-lg bg-semantic-brand text-white font-bold text-label"
              >
                View in Table
              </button>
            </div>
          )}

          {/* Cross-Department Pipeline Blueprints */}
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-semantic-primary">
                  Turnkey Cross-Department Pipelines (1-Click Orchestration)
                </h3>
                <p className="text-xs text-semantic-jira-muted-strong">
                  Automated dependency chains connecting multiple bank departments.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blueprints.map((bp) => (
                <div
                  key={bp.id}
                  className="p-5 bg-semantic-subtle border border-semantic-border hover:border-semantic-purple rounded-xl flex flex-col justify-between space-y-3.5 transition-all shadow-2xs group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-semantic-purple-surface text-semantic-purple flex items-center justify-center font-bold">
                          <Layers className="w-4 h-4" />
                        </div>
                        <h4 className="font-extrabold text-sm text-semantic-primary group-hover:text-semantic-purple transition-colors">
                          {bp.title}
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                        {bp.defaultTasks?.length || bp.taskCount} Steps
                      </span>
                    </div>

                    <p className="text-xs text-semantic-jira-muted-strong leading-relaxed line-clamp-2">{bp.description}</p>

                    {/* Participating Department Badges */}
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      <span className="text-caption font-bold text-semantic-jira-icon uppercase mr-1">Units:</span>
                      {bp.participatingDepartments?.map((dId) => (
                        <span
                          key={dId}
                          className="px-2 py-0.5 rounded text-caption font-mono font-bold text-white shadow-2xs"
                          style={{ backgroundColor: getDeptColor(dId) }}
                        >
                          {getDeptCode(dId)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-semantic-border flex items-center justify-between text-xs">
                    <span className="font-mono text-label text-semantic-jira-muted-strong">
                      Est. Duration: {bp.estimatedDays} Business Days
                    </span>

                    <button
                      onClick={() => {
                        setSelectedBlueprintId(bp.id);
                        setIsLaunchModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-semantic-purple hover:bg-semantic-purple-strong text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      <span>Launch Pipeline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Cross-Department Pipelines & Live Handoff Matrix */}
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-semantic-primary">
                  Active Multi-Department Pipelines & Handoffs ({parentWorkflows.length})
                </h3>
                <p className="text-xs text-semantic-jira-muted-strong">
                  Live status across participating banking squads.
                </p>
              </div>
            </div>

            {parentWorkflows.length === 0 ? (
              <div className="py-12 text-center text-semantic-jira-muted-strong space-y-2">
                <Layers className="w-8 h-8 mx-auto text-semantic-border-strong" />
                <div className="font-bold text-xs text-semantic-primary">No active cross-department pipelines yet</div>
                <p className="text-label">Click "Launch Cross-Task Pipeline" to orchestrate your first multi-dept workflow.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {parentWorkflows.map((parent) => {
                  const subtasks = crossTickets
                    .filter((t) => t.parentTaskId === parent.id || (t.crossDepartmentId === parent.crossDepartmentId && !t.isCrossDepartmentParent))
                    .sort((a, b) => (a.departmentStepIndex || 0) - (b.departmentStepIndex || 0));

                  return (
                    <div
                      key={parent.id}
                      className="p-5 bg-semantic-subtle border border-semantic-border rounded-xl space-y-4 shadow-2xs"
                    >
                      {/* Pipeline Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-semantic-border pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-semantic-purple-surface text-semantic-purple border border-semantic-purple-border">
                            {parent.key}
                          </span>
                          <h4 className="font-extrabold text-sm text-semantic-primary">{parent.title}</h4>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                            {parent.statusName}
                          </span>
                          <span className="font-mono text-label text-semantic-jira-muted-strong">
                            {subtasks.length} Subtasks Linked
                          </span>
                        </div>
                      </div>

                      {/* Visual Multi-Department Step Flow Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 py-1">
                        {subtasks.map((st, idx) => {
                          const isDone = st.statusCategory === 'DONE';
                          const isWaiting = st.statusId === 'WAITING_ON_DEPENDENCY';
                          const deptCode = getDeptCode(st.departmentId || st.targetDepartmentId);
                          const deptColor = getDeptColor(st.departmentId || st.targetDepartmentId);

                          return (
                            <div
                              key={st.id}
                              onClick={() => onSelectTicket && onSelectTicket(st)}
                              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                                isDone
                                  ? 'bg-semantic-panel border-semantic-success-border'
                                  : isWaiting
                                  ? 'bg-semantic-panel border-semantic-border opacity-75'
                                  : 'bg-semantic-panel border-semantic-purple shadow-xs'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span
                                  className="px-2 py-0.5 rounded text-micro font-mono font-bold text-white"
                                  style={{ backgroundColor: deptColor }}
                                >
                                  {deptCode} (Step {idx + 1})
                                </span>

                                <span
                                  className={`text-micro font-bold px-1.5 py-0.2 rounded ${
                                    isDone
                                      ? 'bg-semantic-success-surface text-semantic-success'
                                      : isWaiting
                                      ? 'bg-semantic-neutral-surface text-semantic-jira-icon'
                                      : 'bg-semantic-purple-surface text-semantic-purple'
                                  }`}
                                >
                                  {isDone ? 'DONE' : isWaiting ? 'PENDING STEP' : 'IN PROGRESS'}
                                </span>
                              </div>

                              <div className="font-bold text-semantic-primary text-xs line-clamp-2 leading-snug">
                                {st.title}
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-semantic-neutral-surface flex items-center justify-between text-caption font-mono text-semantic-jira-icon">
                                <span>{st.key}</span>
                                <span className="text-semantic-info font-semibold">Inspect →</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Launch Cross-Department Workflow Wizard Modal */}
      {isLaunchModalOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-semantic-purple-surface text-semantic-purple flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-semantic-primary">Launch Multi-Dept Pipeline</h3>
                  <p className="text-xs text-semantic-jira-muted-strong">Instantiate coordinated tasks across banking units.</p>
                </div>
              </div>
              <button
                onClick={() => setIsLaunchModalOpen(false)}
                className="text-semantic-jira-icon hover:text-semantic-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLaunchCrossWorkflow} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-semantic-primary mb-1.5">Select Pipeline Blueprint</label>
                <div className="space-y-2">
                  {blueprints.map((bp) => (
                    <label
                      key={bp.id}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        selectedBlueprintId === bp.id
                          ? 'bg-semantic-purple-surface border-semantic-purple shadow-xs'
                          : 'bg-semantic-subtle border-semantic-border hover:bg-semantic-neutral-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="bp"
                          value={bp.id}
                          checked={selectedBlueprintId === bp.id}
                          onChange={(e) => setSelectedBlueprintId(e.target.value)}
                          className="text-semantic-purple focus:ring-0"
                        />
                        <div>
                          <div className="font-bold text-xs text-semantic-primary">{bp.title}</div>
                          <div className="text-label text-semantic-jira-muted-strong mt-0.5">
                            {bp.defaultTasks?.length || bp.taskCount} Subtasks | Units: {bp.participatingDepartments?.map((d) => getDeptCode(d)).join(' → ')}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-semantic-primary mb-1">Custom Pipeline Title (Optional)</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Employee Onboarding: Samir Gasimov (Senior AppSec Engineer)"
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-medium focus:outline-none focus:border-semantic-purple"
                />
              </div>

              <div className="p-3.5 bg-semantic-subtle rounded-xl border border-semantic-border text-label text-semantic-jira-muted-strong space-y-1">
                <div className="font-bold text-semantic-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-semantic-purple" />
                  <span>Automatic Dependency & SLA Synchronization</span>
                </div>
                <p>
                  Each subtask will be generated with strict Finish-to-Start dependency constraints and assigned to the respective Department Lead.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-semantic-border">
                <button
                  type="button"
                  onClick={() => setIsLaunchModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-semantic-subtle text-semantic-jira-muted-strong font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLaunching}
                  className="px-5 py-2 rounded-lg bg-semantic-purple hover:bg-semantic-purple-strong text-white font-bold text-xs flex items-center gap-2 shadow-sm"
                >
                  {isLaunching ? 'Instantiating Tasks...' : 'Execute & Dispatch Pipeline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
