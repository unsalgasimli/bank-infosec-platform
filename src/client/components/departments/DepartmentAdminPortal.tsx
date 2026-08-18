import React, { useState, useEffect } from 'react';
import {
  Building2,
  ArrowLeft,
  Users,
  Link2,
  FileText,
  Workflow as WorkflowIcon,
  Settings,
  Shield,
  Activity,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Server,
  CreditCard,
  CheckSquare,
  Lock,
  RefreshCw,
  Trash2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  X,
  Sliders,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { DepartmentConnection, ConnectionTestResult } from '../../../shared/types/connections.js';
import { BankDepartment, BankUser } from '../../../shared/types/auth.js';
import { ProjectBlueprint } from '../../../shared/types/blueprints.js';

interface DepartmentAdminPortalProps {
  departmentId: string;
  onBack: () => void;
  onNavigate: (view: string, id?: string) => void;
  onRefreshData?: () => void;
}

export const DepartmentAdminPortal: React.FC<DepartmentAdminPortalProps> = ({
  departmentId,
  onBack,
  onNavigate,
  onRefreshData,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MEMBERS' | 'SETTINGS' | 'TEMPLATES' | 'CONNECTIONS' | 'FLOWS'>('OVERVIEW');
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Test Connection State
  const [testingConnId, setTestingConnId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ connId: string; result: ConnectionTestResult } | null>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveMsg, setSettingsSaveMsg] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberTitle, setMemberTitle] = useState('');
  const [memberRole, setMemberRole] = useState('SECURITY_ANALYST');
  const [isDeptAdminFlag, setIsDeptAdminFlag] = useState(false);

  // Add Connection Modal State
  const [isAddConnOpen, setIsAddConnOpen] = useState(false);
  const [connName, setConnName] = useState('');
  const [connType, setConnType] = useState('COMMUNICATION');
  const [connProvider, setConnProvider] = useState('');
  const [connUrl, setConnUrl] = useState('');
  const [connAuthType, setConnAuthType] = useState('API_KEY');

  // Launch Blueprint Message
  const [blueprintLaunchMsg, setBlueprintLaunchMsg] = useState<string | null>(null);

  const loadDepartmentData = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth(`/api/departments/${departmentId}`);
      const resData = await res.json();
      if (resData.success) {
        setData(resData);
        setSettingsForm(resData.department?.settings || {});
      }
    } catch (err) {
      console.error('Failed to load department admin details', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDepartmentData();
  }, [departmentId, currentUser]);

  const dept: BankDepartment = data?.department || {
    id: departmentId,
    name: 'Department',
    code: 'DEPT',
    divisionId: 'div-sec',
  };

  const isSuperAdmin = currentUser?.roles?.includes('PLATFORM_ADMIN') || currentUser?.roles?.includes('CISO');
  const isDeptAdmin =
    isSuperAdmin ||
    dept.adminUserIds?.includes(currentUser?.id || '') ||
    dept.managerId === currentUser?.id ||
    (currentUser?.departmentId === dept.id && currentUser?.roles?.includes('DEPARTMENT_ADMIN'));

  // Handler: Test Connection
  const handleTestConnection = async (connId: string) => {
    try {
      setTestingConnId(connId);
      setTestResult(null);
      const res = await fetchWithAuth(`/api/departments/${dept.id}/connections/${connId}/test`, {
        method: 'POST',
      });
      const resData = await res.json();
      if (resData.success) {
        setTestResult({ connId, result: resData.testResult });
        loadDepartmentData();
      }
    } catch (err) {
      console.error('Connection test failed', err);
    } finally {
      setTestingConnId(null);
    }
  };

  // Handler: Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingSettings(true);
      const res = await fetchWithAuth(`/api/departments/${dept.id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const resData = await res.json();
      if (resData.success) {
        setSettingsSaveMsg('Department configuration successfully applied to live SLA engine.');
        setTimeout(() => setSettingsSaveMsg(null), 4000);
      }
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Handler: Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`/api/departments/${dept.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: memberName,
          email: memberEmail,
          title: memberTitle,
          roles: isDeptAdminFlag ? ['DEPARTMENT_ADMIN', memberRole] : [memberRole],
          isDeptAdminFlag,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setIsAddMemberOpen(false);
        setMemberName('');
        setMemberEmail('');
        setMemberTitle('');
        loadDepartmentData();
      }
    } catch (err: any) {
      alert(`Failed to add member: ${err.message}`);
    }
  };

  // Handler: Add Connection
  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`/api/departments/${dept.id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connName,
          type: connType,
          provider: connProvider,
          endpointUrl: connUrl,
          authType: connAuthType,
          syncFrequencyMinutes: 15,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setIsAddConnOpen(false);
        setConnName('');
        setConnProvider('');
        setConnUrl('');
        loadDepartmentData();
      }
    } catch (err: any) {
      alert(`Failed to add connection: ${err.message}`);
    }
  };

  // Handler: Launch Blueprint Task
  const handleLaunchBlueprint = async (bp: ProjectBlueprint) => {
    try {
      const res = await fetchWithAuth(`/api/blueprints/${bp.id}/launch`, { method: 'POST' });
      const resData = await res.json();
      if (resData.success) {
        setBlueprintLaunchMsg(
          `🚀 Blueprint "${bp.title}" launched! Created ${resData.createdTickets?.length || 0} scheduled tasks for ${dept.name}.`
        );
        loadDepartmentData();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      alert(`Launch error: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F6FB] overflow-hidden select-none">
      {/* Header Banner */}
      <div
        className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm"
        style={{ borderTop: `4px solid ${dept.color || '#0052CC'}` }}
      >
        <div className="flex items-center gap-3.5">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[#F8FAFC] hover:bg-[#EDF2F7] text-[#5A6A85] hover:text-[#162136] transition-colors border border-[#E2E8F0]"
            title="Back to All Departments"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs"
            style={{ backgroundColor: dept.color || '#0052CC' }}
          >
            <Building2 className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                {dept.code}
              </span>
              <h1 className="text-base font-extrabold text-[#162136]">{dept.name}</h1>
              {isDeptAdmin && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] text-[10px] font-extrabold border border-[#B8EAD1]">
                  ADMIN PRIVILEGES
                </span>
              )}
            </div>
            <p className="text-xs text-[#5A6A85] mt-0.5 max-w-2xl truncate">
              {dept.description || 'Department administration console, RBAC, SLAs and system connectors.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('cross-tasks')}
            className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#162136] border border-[#E2E8F0] text-xs font-bold flex items-center gap-2 shadow-xs"
          >
            <Zap className="w-4 h-4 text-[#00B259]" />
            <span>Launch Cross-Task</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-6 flex items-center gap-6 text-xs font-bold text-[#5A6A85] shrink-0 overflow-x-auto">
        {[
          { id: 'OVERVIEW', label: 'Department Overview', icon: Activity },
          { id: 'MEMBERS', label: `Staff & Roles (${data?.members?.length || 0})`, icon: Users },
          { id: 'SETTINGS', label: 'Internal Settings & SLAs', icon: Sliders },
          { id: 'TEMPLATES', label: `Task Templates (${data?.templates?.length || 0})`, icon: FileText },
          { id: 'CONNECTIONS', label: `System Connectors (${data?.connections?.length || 0})`, icon: Link2 },
          { id: 'FLOWS', label: `Workflows & Flows (${data?.workflows?.length || 0})`, icon: WorkflowIcon },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3.5 flex items-center gap-2 relative transition-colors ${
                isActive ? 'text-[#007860] font-extrabold' : 'hover:text-[#162136]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#00B259]' : 'text-[#8D99AE]'}`} />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00B259] rounded-t-md" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Global Alerts / Messages */}
          {blueprintLaunchMsg && (
            <div className="p-3.5 rounded-lg bg-[#E6F7EF] border border-[#B8EAD1] text-xs font-semibold text-[#007860] flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{blueprintLaunchMsg}</span>
              </div>
              <button
                onClick={() => onNavigate('table')}
                className="px-2.5 py-1 rounded bg-[#00B259] text-white text-[11px] font-bold"
              >
                View Tasks
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-5">
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-[#5A6A85] uppercase">Department Staff</div>
                  <div className="text-xl font-extrabold text-[#162136] mt-1">
                    {data?.members?.length || 0} Specialists
                  </div>
                  <div className="text-[11px] text-[#007860] font-semibold mt-1">
                    {data?.department?.admins?.length || 1} Scoped Admins
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-[#5A6A85] uppercase">Integrated Connectors</div>
                  <div className="text-xl font-extrabold text-[#007860] mt-1">
                    {data?.connections?.length || 0} Active
                  </div>
                  <div className="text-[11px] text-[#5A6A85] mt-1">100% Health Score</div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-[#5A6A85] uppercase">In-Flight Tasks</div>
                  <div className="text-xl font-extrabold text-[#0073D3] mt-1">
                    {data?.stats?.openTasksCount || 0} Open
                  </div>
                  <div className="text-[11px] text-[#5A6A85] mt-1">
                    {data?.stats?.slaBreachedCount || 0} SLA Breaches
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-[#5A6A85] uppercase">Target SLA Met</div>
                  <div className="text-xl font-extrabold text-[#162136] mt-1">98.4%</div>
                  <div className="text-[11px] text-[#007860] font-semibold mt-1">Regulatory Compliant</div>
                </div>
              </div>

              {/* Department Admins & Leadership Card */}
              <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-[#162136]">
                      Department Administrators & Managers
                    </h3>
                    <p className="text-xs text-[#5A6A85]">
                      Personnel authorized to manage internal {dept.name} settings and assign roles.
                    </p>
                  </div>
                  {isDeptAdmin && (
                    <button
                      onClick={() => setIsAddMemberOpen(true)}
                      className="wrike-btn-primary py-1 px-3 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Staff</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data?.department?.admins?.map((adm: any) => (
                    <div
                      key={adm.id}
                      className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#00B259] text-white flex items-center justify-center font-bold text-xs">
                          {adm.fullName?.[0] || 'A'}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-[#162136]">{adm.fullName}</div>
                          <div className="text-[11px] text-[#5A6A85] font-mono">{adm.email}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] text-[10px] font-bold border border-[#B8EAD1]">
                        {adm.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEMBERS & ROLES */}
          {activeTab === 'MEMBERS' && (
            <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
                <div>
                  <h3 className="font-extrabold text-sm text-[#162136]">
                    Department Staff Directory ({data?.members?.length || 0} Specialists)
                  </h3>
                  <p className="text-xs text-[#5A6A85]">
                    Internal role assignments and access clearance for {dept.name}.
                  </p>
                </div>
                {isDeptAdmin && (
                  <button
                    onClick={() => setIsAddMemberOpen(true)}
                    className="wrike-btn-primary py-1.5 px-3 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Member</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#5A6A85] uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Employee Name</th>
                      <th className="px-3 py-3">Assigned Title</th>
                      <th className="px-3 py-3">RBAC Roles</th>
                      <th className="px-3 py-3">Clearance Tier</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {data?.members?.map((m: BankUser) => (
                      <tr key={m.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-4 py-3 font-bold text-[#162136]">
                          <div>{m.fullName}</div>
                          <div className="text-[11px] text-[#8D99AE] font-mono font-normal">
                            {m.email}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#5A6A85] font-medium">{m.title}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {m.roles?.map((r) => (
                              <span
                                key={r}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                  r === 'DEPARTMENT_ADMIN' || r === 'PLATFORM_ADMIN'
                                    ? 'bg-[#E6F7EF] text-[#007860] border-[#B8EAD1]'
                                    : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]'
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded-full bg-[#FAF5FF] text-[#722ED1] text-[10px] font-bold border border-[#EFDBFF]">
                            {m.securityClearance}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] text-[10px] font-bold">
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: INTERNAL SETTINGS & SLAS */}
          {activeTab === 'SETTINGS' && (
            <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-5">
              <div className="border-b border-[#E2E8F0] pb-3">
                <h3 className="font-extrabold text-sm text-[#162136]">
                  Department Configuration & SLA Targets
                </h3>
                <p className="text-xs text-[#5A6A85]">
                  Configure response thresholds, auto-assignment pipelines, and dual-control rules for {dept.name}.
                </p>
              </div>

              {settingsSaveMsg && (
                <div className="p-3 rounded-lg bg-[#E6F7EF] border border-[#B8EAD1] text-xs font-semibold text-[#007860] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{settingsSaveMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                  <div>
                    <label className="block font-bold text-[#162136] mb-1">
                      Standard SLA Response Target (Hours)
                    </label>
                    <input
                      type="number"
                      value={settingsForm.defaultSlaHours || 24}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, defaultSlaHours: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg text-xs font-mono font-bold"
                    />
                    <p className="text-[11px] text-[#8D99AE] mt-1">Default turnaround time for standard tasks.</p>
                  </div>

                  <div>
                    <label className="block font-bold text-[#162136] mb-1">
                      Critical P1 / Blocker SLA Target (Hours)
                    </label>
                    <input
                      type="number"
                      value={settingsForm.criticalSlaHours || 2}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, criticalSlaHours: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg text-xs font-mono font-bold text-[#E51739]"
                    />
                    <p className="text-[11px] text-[#8D99AE] mt-1">Emergency containment & response deadline.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer font-bold text-[#162136]">
                      <input
                        type="checkbox"
                        checked={settingsForm.autoAssignEnabled !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, autoAssignEnabled: e.target.checked })
                        }
                        className="rounded text-[#00B259] focus:ring-0"
                      />
                      <span>Enable Smart Task Auto-Assignment</span>
                    </label>
                    <p className="text-[11px] text-[#5A6A85] pl-6">
                      Automatically routes new incoming tasks to on-duty specialists based on workload.
                    </p>
                  </div>

                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer font-bold text-[#162136]">
                      <input
                        type="checkbox"
                        checked={settingsForm.requireDualApproval !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, requireDualApproval: e.target.checked })
                        }
                        className="rounded text-[#00B259] focus:ring-0"
                      />
                      <span>Enforce 4-Eyes Dual-Control Approvals</span>
                    </label>
                    <p className="text-[11px] text-[#5A6A85] pl-6">
                      Requires two department sign-offs before critical tickets can be resolved.
                    </p>
                  </div>
                </div>

                {isDeptAdmin && (
                  <div className="flex justify-end pt-3">
                    <button
                      type="submit"
                      disabled={isSavingSettings}
                      className="wrike-btn-primary px-5 py-2 text-xs font-bold"
                    >
                      {isSavingSettings ? 'Saving Settings...' : 'Apply Department Settings'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* TAB 4: TASK TEMPLATES & BLUEPRINTS */}
          {activeTab === 'TEMPLATES' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-[#162136]">
                    {dept.name} Task Templates & Turnkey Blueprints
                  </h3>
                  <p className="text-xs text-[#5A6A85]">
                    Pre-packaged multi-step workflows tailored for {dept.name} operations.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.templates?.map((bp: ProjectBlueprint) => (
                  <div
                    key={bp.id}
                    className="bg-[#FFFFFF] border border-[#E2E8F0] hover:border-[#00B259] rounded-xl p-5 flex flex-col justify-between space-y-3 shadow-xs transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#E6F7EF] text-[#00B259] flex items-center justify-center font-bold">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm text-[#162136]">{bp.title}</h4>
                            <span className="text-[11px] font-bold text-[#007860]">{bp.domain}</span>
                          </div>
                        </div>

                        {bp.isCrossDepartment && (
                          <span className="px-2 py-0.5 rounded-full bg-[#FAF5FF] text-[#722ED1] text-[10px] font-bold border border-[#EFDBFF]">
                            CROSS-DEPT
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#5A6A85] mt-2.5 leading-relaxed">{bp.description}</p>
                    </div>

                    <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                      <span className="font-mono text-[11px] text-[#5A6A85]">
                        {bp.defaultTasks?.length || bp.taskCount} Subtasks | {bp.estimatedDays} Days
                      </span>

                      <button
                        onClick={() => handleLaunchBlueprint(bp)}
                        className="wrike-btn-primary py-1 px-3 text-xs flex items-center gap-1.5"
                      >
                        <Play className="w-3 h-3" />
                        <span>Launch Tasks</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: CONNECTIONS & INTEGRATIONS */}
          {activeTab === 'CONNECTIONS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-[#162136]">
                    {dept.name} System Connectors & APIs
                  </h3>
                  <p className="text-xs text-[#5A6A85]">
                    Connected core platforms, identity providers, SIEM, and databases.
                  </p>
                </div>
                {isDeptAdmin && (
                  <button
                    onClick={() => setIsAddConnOpen(true)}
                    className="wrike-btn-primary py-1.5 px-3 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Connector</span>
                  </button>
                )}
              </div>

              {/* Test Result Live Banner */}
              {testResult && (
                <div className="p-4 rounded-xl bg-[#E6F7EF] border border-[#B8EAD1] text-xs space-y-1.5 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 text-[#007860] font-extrabold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{testResult.result.message}</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#2B3A57] pl-6">
                    Cipher: {testResult.result.details?.tlsCipher} | Latency: {testResult.result.latencyMs}ms | Verified: {new Date(testResult.result.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.connections?.map((conn: DepartmentConnection) => (
                  <div
                    key={conn.id}
                    className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 space-y-3.5 shadow-xs hover:border-[#CBD5E1] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#F0F5FF] text-[#0052CC] flex items-center justify-center font-bold border border-[#D6E4FF]">
                          <Link2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-[#162136]">{conn.name}</h4>
                          </div>
                          <div className="text-[11px] text-[#5A6A85] font-semibold">{conn.provider}</div>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] font-mono text-[10px] font-extrabold border border-[#B8EAD1]">
                        {conn.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#5A6A85] leading-relaxed">{conn.description}</p>

                    <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] font-mono text-[11px] space-y-1 text-[#2B3A57]">
                      <div className="truncate">
                        <span className="text-[#8D99AE]">Endpoint:</span> {conn.endpointUrl}
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span>Auth: {conn.authType}</span>
                        <span className="text-[#007860] font-bold">Latency: {conn.latencyMs || 8}ms</span>
                        <span>Score: {conn.healthScore || 98}%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-[10px] text-[#8D99AE]">
                        Synced {new Date(conn.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      <button
                        onClick={() => handleTestConnection(conn.id)}
                        disabled={testingConnId === conn.id}
                        className="px-3 py-1.5 rounded-lg bg-[#E6F7EF] hover:bg-[#B8EAD1] text-[#007860] font-bold text-xs flex items-center gap-1.5 transition-colors border border-[#B8EAD1]"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingConnId === conn.id ? 'animate-spin' : ''}`} />
                        <span>{testingConnId === conn.id ? 'Pinging...' : 'Test Connection'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: WORKFLOWS & FLOWS */}
          {activeTab === 'FLOWS' && (
            <div className="space-y-4">
              {data?.workflows?.map((wf: any) => (
                <div key={wf.id} className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                    <div>
                      <h3 className="font-extrabold text-sm text-[#162136]">{wf.name}</h3>
                      <p className="text-xs text-[#5A6A85]">{wf.description}</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] font-mono text-[10px] font-bold border border-[#E2E8F0]">
                      v{wf.version} State Machine
                    </span>
                  </div>

                  {/* Flow Stages */}
                  <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#5A6A85]">
                      Process Lifecycle States & Role Transitions
                    </div>
                    <div className="flex items-center gap-3 overflow-x-auto py-2">
                      {wf.states?.map((st: any, idx: number) => (
                        <React.Fragment key={st.id}>
                          <div className="p-3 bg-[#FFFFFF] rounded-xl border border-[#E2E8F0] space-y-1 min-w-[140px] shadow-2xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                              <span className="font-extrabold text-xs text-[#162136]">{st.name}</span>
                            </div>
                            <div className="text-[10px] font-mono text-[#8D99AE] uppercase">{st.category}</div>
                          </div>
                          {idx < wf.states.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-[#00B259] shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-extrabold text-sm text-[#162136]">Add Staff to {dept.name}</h3>
              <button onClick={() => setIsAddMemberOpen(false)} className="text-[#8D99AE] hover:text-[#162136]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#162136] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="e.g. Samira Mammadova"
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-[#162136] mb-1">Corporate Email *</label>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="s.mammadova@apexbank.int"
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-[#162136] mb-1">Position / Job Title</label>
                <input
                  type="text"
                  value={memberTitle}
                  onChange={(e) => setMemberTitle(e.target.value)}
                  placeholder="e.g. Lead Systems Engineer"
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-[#162136] mb-1">Operational Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                >
                  <option value="TEAM_LEAD">Team Lead / Approver</option>
                  <option value="SECURITY_ANALYST">Senior Specialist</option>
                  <option value="SOC_ANALYST">SOC / Incident Analyst</option>
                  <option value="APPSEC_ANALYST">AppSec / DevSecOps Engineer</option>
                  <option value="AUDITOR">Compliance Auditor</option>
                </select>
              </div>

              <div className="p-3 bg-[#E6F7EF] rounded-lg border border-[#B8EAD1]">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-[#007860]">
                  <input
                    type="checkbox"
                    checked={isDeptAdminFlag}
                    onChange={(e) => setIsDeptAdminFlag(e.target.checked)}
                    className="rounded text-[#00B259] focus:ring-0"
                  />
                  <span>Grant Department Admin Rights ({dept.code} Admin)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#F8FAFC] text-[#5A6A85] font-bold text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="wrike-btn-primary px-4 py-1.5 text-xs font-bold">
                  Save Specialist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Connection Modal */}
      {isAddConnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-extrabold text-sm text-[#162136]">Add Connector to {dept.name}</h3>
              <button onClick={() => setIsAddConnOpen(false)} className="text-[#8D99AE] hover:text-[#162136]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddConnection} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#162136] mb-1">Connector Name *</label>
                <input
                  type="text"
                  required
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  placeholder="e.g. Cisco Meraki Core VPN"
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#162136] mb-1">System Type</label>
                  <select
                    value={connType}
                    onChange={(e) => setConnType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                  >
                    <option value="ACTIVE_DIRECTORY">Active Directory</option>
                    <option value="SIEM">SIEM Telemetry</option>
                    <option value="EDR">EDR Endpoint</option>
                    <option value="CLOUD_INFRA">Cloud Infrastructure</option>
                    <option value="HRIS">HRIS Human Capital</option>
                    <option value="CORE_BANKING">Core Banking Ledger</option>
                    <option value="PAYMENT_GATEWAY">Payment Gateway</option>
                    <option value="COMMUNICATION">Network & Communication</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#162136] mb-1">Provider Vendor</label>
                  <input
                    type="text"
                    value={connProvider}
                    onChange={(e) => setConnProvider(e.target.value)}
                    placeholder="e.g. Cisco Systems"
                    className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#162136] mb-1">Endpoint URL / API Host *</label>
                <input
                  type="text"
                  required
                  value={connUrl}
                  onChange={(e) => setConnUrl(e.target.value)}
                  placeholder="https://api.internal.apexbank.az"
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#162136] mb-1">Authentication Method</label>
                <select
                  value={connAuthType}
                  onChange={(e) => setConnAuthType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
                >
                  <option value="MTLS_CERTIFICATE">mTLS Certificate (Banking Grade)</option>
                  <option value="API_KEY">Secure API Key</option>
                  <option value="OAUTH2">OAuth 2.0 Client Credentials</option>
                  <option value="LDAP_BIND">Direct LDAP Bind</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAddConnOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#F8FAFC] text-[#5A6A85] font-bold text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="wrike-btn-primary px-4 py-1.5 text-xs font-bold">
                  Save Connector
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
