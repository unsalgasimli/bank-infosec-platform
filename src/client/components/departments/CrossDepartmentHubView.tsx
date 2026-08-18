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
  GitBranch,
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
    return dept?.color || '#0052CC';
  };

  const getDeptCode = (deptId?: string) => {
    const dept = departments.find((d) => d.id === deptId || d.code === deptId);
    return dept?.code || deptId?.toUpperCase() || 'DEPT';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F6FB] overflow-hidden select-none">
      {/* Header Bar */}
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#FAF5FF] text-[#722ED1] border border-[#EFDBFF] flex items-center justify-center font-bold shadow-xs">
            <Layers className="w-5 h-5 text-[#722ED1]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-extrabold text-[#162136] tracking-tight">
                Cross-Department Task Orchestration Hub
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#FAF5FF] text-[#722ED1] text-[10px] font-extrabold border border-[#EFDBFF]">
                Multi-Dept Pipeline Engine
              </span>
            </div>
            <p className="text-xs text-[#5A6A85] mt-0.5">
              Orchestrate end-to-end tasks spanning HR, IT Operations, Infosec, Core Banking, and GRC with dependency tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('gantt')}
            className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#162136] border border-[#E2E8F0] text-xs font-bold flex items-center gap-2 shadow-xs"
          >
            <GitBranch className="w-4 h-4 text-[#0073D3]" />
            <span>Gantt Dependencies</span>
          </button>

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
            <div className="p-4 rounded-xl bg-[#E6F7EF] border border-[#B8EAD1] text-xs font-semibold text-[#007860] flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{launchSuccessMsg}</span>
              </div>
              <button
                onClick={() => onNavigate('table')}
                className="px-3 py-1 rounded-lg bg-[#00B259] text-white font-bold text-[11px]"
              >
                View in Table
              </button>
            </div>
          )}

          {/* Cross-Department Pipeline Blueprints */}
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-[#162136]">
                  Turnkey Cross-Department Pipelines (1-Click Orchestration)
                </h3>
                <p className="text-xs text-[#5A6A85]">
                  Automated dependency chains connecting multiple bank departments.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blueprints.map((bp) => (
                <div
                  key={bp.id}
                  className="p-5 bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#722ED1] rounded-xl flex flex-col justify-between space-y-3.5 transition-all shadow-2xs group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#FAF5FF] text-[#722ED1] flex items-center justify-center font-bold">
                          <Layers className="w-4 h-4" />
                        </div>
                        <h4 className="font-extrabold text-sm text-[#162136] group-hover:text-[#722ED1] transition-colors">
                          {bp.title}
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] text-[10px] font-bold border border-[#B8EAD1]">
                        {bp.defaultTasks?.length || bp.taskCount} Steps
                      </span>
                    </div>

                    <p className="text-xs text-[#5A6A85] leading-relaxed line-clamp-2">{bp.description}</p>

                    {/* Participating Department Badges */}
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      <span className="text-[10px] font-bold text-[#8D99AE] uppercase mr-1">Units:</span>
                      {bp.participatingDepartments?.map((dId) => (
                        <span
                          key={dId}
                          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white shadow-2xs"
                          style={{ backgroundColor: getDeptColor(dId) }}
                        >
                          {getDeptCode(dId)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-[#5A6A85]">
                      Est. Duration: {bp.estimatedDays} Business Days
                    </span>

                    <button
                      onClick={() => {
                        setSelectedBlueprintId(bp.id);
                        setIsLaunchModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#722ED1] hover:bg-[#531DAB] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
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
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-[#162136]">
                  Active Multi-Department Pipelines & Handoffs ({parentWorkflows.length})
                </h3>
                <p className="text-xs text-[#5A6A85]">
                  Live status across participating banking squads.
                </p>
              </div>
            </div>

            {parentWorkflows.length === 0 ? (
              <div className="py-12 text-center text-[#5A6A85] space-y-2">
                <Layers className="w-8 h-8 mx-auto text-[#CBD5E1]" />
                <div className="font-bold text-xs text-[#162136]">No active cross-department pipelines yet</div>
                <p className="text-[11px]">Click "Launch Cross-Task Pipeline" to orchestrate your first multi-dept workflow.</p>
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
                      className="p-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-4 shadow-2xs"
                    >
                      {/* Pipeline Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-[#FAF5FF] text-[#722ED1] border border-[#EFDBFF]">
                            {parent.key}
                          </span>
                          <h4 className="font-extrabold text-sm text-[#162136]">{parent.title}</h4>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] text-[10px] font-bold border border-[#B8EAD1]">
                            {parent.statusName}
                          </span>
                          <span className="font-mono text-[11px] text-[#5A6A85]">
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
                                  ? 'bg-[#FFFFFF] border-[#B8EAD1]'
                                  : isWaiting
                                  ? 'bg-[#FFFFFF] border-[#E2E8F0] opacity-75'
                                  : 'bg-[#FFFFFF] border-[#722ED1] shadow-xs'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span
                                  className="px-2 py-0.5 rounded text-[9px] font-mono font-bold text-white"
                                  style={{ backgroundColor: deptColor }}
                                >
                                  {deptCode} (Step {idx + 1})
                                </span>

                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                    isDone
                                      ? 'bg-[#E6F7EF] text-[#007860]'
                                      : isWaiting
                                      ? 'bg-[#F1F5F9] text-[#8D99AE]'
                                      : 'bg-[#FAF5FF] text-[#722ED1]'
                                  }`}
                                >
                                  {isDone ? 'DONE' : isWaiting ? 'PENDING STEP' : 'IN PROGRESS'}
                                </span>
                              </div>

                              <div className="font-bold text-[#162136] text-xs line-clamp-2 leading-snug">
                                {st.title}
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-[#F1F5F9] flex items-center justify-between text-[10px] font-mono text-[#8D99AE]">
                                <span>{st.key}</span>
                                <span className="text-[#0073D3] font-semibold">Inspect →</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FAF5FF] text-[#722ED1] flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#162136]">Launch Multi-Dept Pipeline</h3>
                  <p className="text-xs text-[#5A6A85]">Instantiate coordinated tasks across banking units.</p>
                </div>
              </div>
              <button
                onClick={() => setIsLaunchModalOpen(false)}
                className="text-[#8D99AE] hover:text-[#162136]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLaunchCrossWorkflow} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#162136] mb-1.5">Select Pipeline Blueprint</label>
                <div className="space-y-2">
                  {blueprints.map((bp) => (
                    <label
                      key={bp.id}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        selectedBlueprintId === bp.id
                          ? 'bg-[#FAF5FF] border-[#722ED1] shadow-xs'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="bp"
                          value={bp.id}
                          checked={selectedBlueprintId === bp.id}
                          onChange={(e) => setSelectedBlueprintId(e.target.value)}
                          className="text-[#722ED1] focus:ring-0"
                        />
                        <div>
                          <div className="font-bold text-xs text-[#162136]">{bp.title}</div>
                          <div className="text-[11px] text-[#5A6A85] mt-0.5">
                            {bp.defaultTasks?.length || bp.taskCount} Subtasks | Units: {bp.participatingDepartments?.map((d) => getDeptCode(d)).join(' → ')}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#162136] mb-1">Custom Pipeline Title (Optional)</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Employee Onboarding: Samir Gasimov (Senior AppSec Engineer)"
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-medium focus:outline-none focus:border-[#722ED1]"
                />
              </div>

              <div className="p-3.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[11px] text-[#5A6A85] space-y-1">
                <div className="font-bold text-[#162136] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#722ED1]" />
                  <span>Automatic Dependency & SLA Synchronization</span>
                </div>
                <p>
                  Each subtask will be generated with strict Finish-to-Start dependency constraints and assigned to the respective Department Lead.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsLaunchModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#F8FAFC] text-[#5A6A85] font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLaunching}
                  className="px-5 py-2 rounded-lg bg-[#722ED1] hover:bg-[#531DAB] text-white font-bold text-xs flex items-center gap-2 shadow-sm"
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
