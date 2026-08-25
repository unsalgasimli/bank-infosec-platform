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
import { DirectoryAssignmentSelect } from '../common/DirectoryAssignmentSelect.js';

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
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<BankUser[]>([]);
  const [directoryLoadError, setDirectoryLoadError] = useState<string | null>(null);

  // Test Connection State
  const [testingConnId, setTestingConnId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ connId: string; result: ConnectionTestResult } | null>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveMsg, setSettingsSaveMsg] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
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
      setLoadError(null);
      const res = await fetchWithAuth(`/api/departments/${departmentId}`);
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData?.error || 'Department data could not be loaded.');
      }
      setData(resData);
      setSettingsForm(resData.department?.settings || {});
    } catch (err: any) {
      console.error('Failed to load department admin details', err);
      setData(null);
      setLoadError(err?.message || 'Department data could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDepartmentData();
    setSelectedSectionId(null);
    setDirectoryLoadError(null);
    fetchWithAuth('/api/auth/users')
      .then(async (res) => {
        const resData = await res.json();
        if (!res.ok || !resData.success || !Array.isArray(resData.users)) {
          throw new Error(resData?.error || 'Live Active Directory users are unavailable.');
        }
        return resData.users;
      })
      .then((users) => setDirectoryUsers(users))
      .catch((error: any) => {
        setDirectoryUsers([]);
        setDirectoryLoadError(error?.message || 'Live Active Directory users are unavailable.');
      });
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
          userId: memberUserId,
          roles: isDeptAdminFlag ? ['DEPARTMENT_ADMIN', memberRole] : [memberRole],
          isDeptAdminFlag,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setIsAddMemberOpen(false);
        setMemberUserId('');
        loadDepartmentData();
      }
    } catch (err: any) {
      alert(`Failed to add member: ${err.message}`);
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!window.confirm('Delete this connector from the department?')) return;
    try {
      const res = await fetchWithAuth(`/api/departments/${dept.id}/connections/${connId}`, { method: 'DELETE' });
      const resData = await res.json();
      if (!resData.success) throw new Error(resData.error || 'Delete failed');
      await loadDepartmentData();
    } catch (err: any) {
      alert(`Failed to delete connector: ${err.message}`);
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

  if (isLoading) {
    return <div className="flex-1 grid place-items-center bg-semantic-page text-sm font-semibold text-semantic-jira-muted-strong">Loading live department data…</div>;
  }

  if (loadError || !data?.department) {
    return (
      <div className="flex-1 grid place-items-center bg-semantic-page p-6">
        <div className="max-w-md rounded-xl border border-semantic-danger-border bg-semantic-danger-surface p-5 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-semantic-danger" />
          <h2 className="mt-2 text-sm font-extrabold text-semantic-primary">Department data is unavailable</h2>
          <p className="mt-1 text-xs text-semantic-jira-muted-strong">{loadError || 'The backend did not return a department record.'}</p>
          <button onClick={loadDepartmentData} className="mt-4 rounded-lg bg-semantic-primary px-3 py-2 text-xs font-bold text-white">Retry</button>
        </div>
      </div>
    );
  }

  const totalMembers = data.stats?.totalMembers ?? data.members?.length ?? 0;
  const connectedConnectors = (data.connections || []).filter((connection: DepartmentConnection) => connection.status === 'CONNECTED');
  const measuredHealthScores = connectedConnectors
    .map((connection: DepartmentConnection) => connection.healthScore)
    .filter((score: unknown): score is number => typeof score === 'number');
  const averageHealth = measuredHealthScores.length
    ? Math.round(measuredHealthScores.reduce((total: number, score: number) => total + score, 0) / measuredHealthScores.length)
    : null;
  const selectedSection = dept.sections?.find((section) => section.id === selectedSectionId);
  const selectedSectionMembers = selectedSection
    ? (data.members || []).filter((member: BankUser) => member.sectionId === selectedSection.id)
    : [];
  const selectedSectionTickets = selectedSection
    ? (data.activeTickets || []).filter((ticket: any) => ticket.targetSectionId === selectedSection.id)
    : [];

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page overflow-hidden select-none">
      {/* Header Banner */}
      <div
        className="bg-semantic-panel border-b border-semantic-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm"
        style={{ borderTop: `4px solid ${dept.color || 'var(--color-jira-blue-500)'}` }}
      >
        <div className="flex items-center gap-3.5">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-semantic-subtle hover:bg-semantic-border-subtle text-semantic-jira-muted-strong hover:text-semantic-primary transition-colors border border-semantic-border"
            title="Back to All Departments"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs"
            style={{ backgroundColor: dept.color || 'var(--color-jira-blue-500)' }}
          >
            <Building2 className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-caption font-extrabold uppercase px-2 py-0.5 rounded bg-semantic-neutral-surface text-semantic-secondary border border-semantic-border">
                {dept.code}
              </span>
              <h1 className="text-base font-extrabold text-semantic-primary">{dept.name}</h1>
              {isDeptAdmin && (
                <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-extrabold border border-semantic-success-border">
                  ADMIN PRIVILEGES
                </span>
              )}
            </div>
            <p className="text-xs text-semantic-jira-muted-strong mt-0.5 max-w-2xl truncate">
              {dept.description || 'Department administration console, RBAC, SLAs and system connectors.'}
            </p>
            <p className="text-label text-semantic-jira-muted-strong mt-1">
              Department Manager: <span className="font-bold text-semantic-primary">{dept.managerName || 'Not assigned'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('cross-tasks')}
            className="px-3.5 py-2 rounded-lg bg-semantic-subtle hover:bg-semantic-neutral-surface text-semantic-primary border border-semantic-border text-xs font-bold flex items-center gap-2 shadow-xs"
          >
            <Zap className="w-4 h-4 text-semantic-brand" />
            <span>Launch Cross-Task</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-semantic-panel border-b border-semantic-border px-6 flex items-center gap-6 text-xs font-bold text-semantic-jira-muted-strong shrink-0 overflow-x-auto">
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
                isActive ? 'text-semantic-success font-extrabold' : 'hover:text-semantic-primary'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-semantic-brand' : 'text-semantic-jira-icon'}`} />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-semantic-brand rounded-t-md" />
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
            <div className="p-3.5 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{blueprintLaunchMsg}</span>
              </div>
              <button
                onClick={() => onNavigate('table')}
                className="px-2.5 py-1 rounded bg-semantic-brand text-white text-label font-bold"
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
                <div className="bg-semantic-panel border border-semantic-border rounded-xl p-4 shadow-xs">
                  <div className="text-label font-bold text-semantic-jira-muted-strong uppercase">Department Staff</div>
                  <div className="text-xl font-extrabold text-semantic-primary mt-1">
                    {totalMembers} Specialists
                  </div>
                  <div className="text-label text-semantic-success font-semibold mt-1">
                    {data.department.admins?.length ?? 0} Scoped Admins
                  </div>
                </div>

                <div className="bg-semantic-panel border border-semantic-border rounded-xl p-4 shadow-xs">
                  <div className="text-label font-bold text-semantic-jira-muted-strong uppercase">Integrated Connectors</div>
                  <div className="text-xl font-extrabold text-semantic-success mt-1">
                    {connectedConnectors.length} Active
                  </div>
                  <div className="text-label text-semantic-jira-muted-strong mt-1">
                    {averageHealth == null ? 'No verified health measurement' : `${averageHealth}% measured health`}
                  </div>
                </div>

                <div className="bg-semantic-panel border border-semantic-border rounded-xl p-4 shadow-xs">
                  <div className="text-label font-bold text-semantic-jira-muted-strong uppercase">In-Flight Tasks</div>
                  <div className="text-xl font-extrabold text-semantic-info mt-1">
                    {data?.stats?.openTasksCount || 0} Open
                  </div>
                  <div className="text-label text-semantic-jira-muted-strong mt-1">
                    {data?.stats?.slaBreachedCount || 0} SLA Breaches
                  </div>
                </div>

                <div className="bg-semantic-panel border border-semantic-border rounded-xl p-4 shadow-xs">
                  <div className="text-label font-bold text-semantic-jira-muted-strong uppercase">SLA Status</div>
                  <div className="text-xl font-extrabold text-semantic-primary mt-1">{data.stats?.slaBreachedCount ?? 0} Breaches</div>
                  <div className="text-label text-semantic-jira-muted-strong mt-1">Calculated from live department tasks</div>
                </div>
              </div>

              {/* Department Admins & Leadership Card */}
              <div className="bg-semantic-panel border border-semantic-border rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-semantic-border pb-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-semantic-primary">
                      Department Administrators & Managers
                    </h3>
                    <p className="text-xs text-semantic-jira-muted-strong">
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
                      className="p-3 bg-semantic-subtle border border-semantic-border rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-semantic-brand text-white flex items-center justify-center font-bold text-xs">
                          {adm.fullName?.[0] || 'A'}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-semantic-primary">{adm.fullName}</div>
                          <div className="text-label text-semantic-jira-muted-strong font-mono">{adm.email}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                        {adm.role}
                      </span>
                    </div>
                  ))}
                </div>
                {!data.department.admins?.length && (
                  <div className="rounded-lg border border-dashed border-semantic-border bg-semantic-subtle px-4 py-3 text-xs text-semantic-jira-muted-strong">
                    No active Active Directory administrator is assigned to this department.
                  </div>
                )}
              </div>

              {/* Department Sections */}
              <div className="bg-semantic-panel border border-semantic-border rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-semantic-border pb-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-semantic-primary">
                      {selectedSection ? selectedSection.name : `Department Sections (${dept.sections?.length || 0})`}
                    </h3>
                    <p className="text-xs text-semantic-jira-muted-strong">
                      {selectedSection
                        ? 'Section details, directory staff and routed work.'
                        : 'Active child sections synchronized from the directory.'}
                    </p>
                  </div>
                  {selectedSection ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSectionId(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-semantic-border bg-semantic-subtle px-3 py-1.5 text-caption font-bold text-semantic-primary hover:bg-semantic-border-subtle"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      All sections
                    </button>
                  ) : (
                    <span className="text-caption font-bold uppercase tracking-wide text-semantic-info">
                      {dept.sections?.length ? 'Directory linked' : 'No active sections'}
                    </span>
                  )}
                </div>

                {selectedSection ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-semantic-info/30 bg-semantic-info/5 p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-semantic-neutral-surface px-2 py-0.5 font-mono text-micro font-bold text-semantic-secondary">
                            {selectedSection.code}
                          </span>
                          <span className="rounded-full border border-semantic-success-border bg-semantic-success-surface px-2 py-0.5 text-micro font-bold uppercase text-semantic-success">
                            Active Directory
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-semantic-jira-muted-strong">
                          {selectedSection.managerName ? `Manager: ${selectedSection.managerName}` : 'No section manager assigned'}
                          {selectedSection.managerEmail ? ` · ${selectedSection.managerEmail}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-extrabold text-semantic-primary">{selectedSectionMembers.length}</div>
                        <div className="text-caption font-semibold text-semantic-jira-muted-strong">Live members</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
                      <div className="overflow-hidden rounded-xl border border-semantic-border">
                        <div className="flex items-center justify-between border-b border-semantic-border bg-semantic-subtle px-4 py-3">
                          <div>
                            <h4 className="text-xs font-extrabold text-semantic-primary">Section staff</h4>
                            <p className="mt-0.5 text-caption text-semantic-jira-muted-strong">Verified Active Directory members</p>
                          </div>
                          <Users className="h-4 w-4 text-semantic-jira-icon" />
                        </div>
                        {selectedSectionMembers.length ? (
                          <div className="divide-y divide-semantic-border">
                            {selectedSectionMembers.map((member: BankUser) => (
                              <div key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-semantic-brand text-xs font-bold text-white">
                                    {member.fullName?.[0] || 'U'}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-bold text-semantic-primary">{member.fullName}</div>
                                    <div className="truncate font-mono text-label text-semantic-jira-muted-strong">{member.email}</div>
                                  </div>
                                </div>
                                <span className="shrink-0 text-right text-label text-semantic-jira-muted-strong">{member.title || 'Directory member'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-5 text-xs text-semantic-jira-muted-strong">No active directory members are assigned to this section.</div>
                        )}
                      </div>

                      <div className="overflow-hidden rounded-xl border border-semantic-border">
                        <div className="flex items-center justify-between border-b border-semantic-border bg-semantic-subtle px-4 py-3">
                          <div>
                            <h4 className="text-xs font-extrabold text-semantic-primary">Section work queue</h4>
                            <p className="mt-0.5 text-caption text-semantic-jira-muted-strong">Open tasks routed to this section</p>
                          </div>
                          <CheckSquare className="h-4 w-4 text-semantic-jira-icon" />
                        </div>
                        {selectedSectionTickets.length ? (
                          <div className="divide-y divide-semantic-border">
                            {selectedSectionTickets.map((ticket: any) => (
                              <button
                                key={ticket.id}
                                type="button"
                                onClick={() => onNavigate('table')}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-semantic-subtle"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-bold text-semantic-primary">{ticket.title || ticket.subject || ticket.id}</span>
                                  <span className="mt-0.5 block text-label text-semantic-jira-muted-strong">{ticket.status || ticket.statusCategory || 'Open'}</span>
                                </span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-semantic-jira-icon" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-5 text-xs text-semantic-jira-muted-strong">No open tasks are currently routed to this section.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : dept.sections?.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dept.sections.map((section: any) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setSelectedSectionId(section.id)}
                        aria-label={`Open ${section.name} section details`}
                        className="group w-full rounded-xl border border-semantic-border bg-semantic-subtle p-3 text-left transition hover:border-semantic-info hover:bg-semantic-panel focus:outline-none focus:ring-2 focus:ring-semantic-info/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-xs text-semantic-primary">{section.name}</div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-semantic-neutral-surface text-semantic-secondary text-micro font-mono">{section.code}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-semantic-jira-icon transition group-hover:translate-x-0.5 group-hover:text-semantic-info" />
                          </div>
                        </div>
                        <div className="mt-2 text-label text-semantic-jira-muted-strong">
                          {section.memberCount || 0} members
                        </div>
                        <div className="mt-2 text-caption font-bold text-semantic-info">View section details</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-semantic-border bg-semantic-subtle px-4 py-3 text-xs text-semantic-jira-muted-strong">
                    No active child sections are present in the directory projection. Run a live AD sync/import to populate them.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MEMBERS & ROLES */}
          {activeTab === 'MEMBERS' && (
            <div className="bg-semantic-panel border border-semantic-border rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-semantic-border pb-3.5">
                <div>
                  <h3 className="font-extrabold text-sm text-semantic-primary">
                    Department Staff Directory ({data?.members?.length || 0} Specialists)
                  </h3>
                  <p className="text-xs text-semantic-jira-muted-strong">
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
                  <thead className="bg-semantic-subtle border-b border-semantic-border text-semantic-jira-muted-strong uppercase font-bold text-caption tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Employee Name</th>
                      <th className="px-3 py-3">Section</th>
                      <th className="px-3 py-3">Assigned Title</th>
                      <th className="px-3 py-3">RBAC Roles</th>
                      <th className="px-3 py-3">Clearance Tier</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-semantic-border">
                    {data?.members?.map((m: BankUser) => {
                      const isManager =
                        m.id === dept.managerId ||
                        m.roles?.includes('DEPARTMENT_MANAGER') ||
                        m.roles?.includes('INFOSEC_MANAGER') ||
                        m.roles?.includes('CISO') ||
                        /müdir|mudir|direktor|director|rəis|reis|sədr|head/i.test(m.title || '');

                      const isAparici =
                        !isManager &&
                        (m.roles?.includes('TEAM_LEAD') || /aparici|aparıcı|lead|baş |bas /i.test(m.title || ''));
                      const isBoyuk =
                        !isManager && !isAparici && /boyuk|böyük|senior/i.test(m.title || '');
                      const isKicik =
                        !isManager &&
                        !isAparici &&
                        !isBoyuk &&
                        /kicik|kiçik|junior|tecrube|təcrübə|assistent|intern/i.test(m.title || '');

                      return (
                        <tr
                          key={m.id}
                          className={`transition-colors ${
                            isManager
                              ? 'bg-semantic-warning-note hover:bg-semantic-warning-legacy'
                              : isBoyuk
                              ? 'bg-semantic-info-utility-alt hover:bg-semantic-info-utility'
                              : 'hover:bg-semantic-subtle'
                          }`}
                        >
                          <td className="px-4 py-3 font-bold text-semantic-primary">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{m.fullName}</span>
                              {isManager && (
                                <span className="px-2 py-0.5 rounded-full bg-semantic-warning-amber text-semantic-warning-strong text-micro font-extrabold border border-semantic-warning-soft-border tracking-wide uppercase shadow-xs">
                                  👑 Head / Müdir
                                </span>
                              )}
                              {isAparici && (
                                <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-micro font-bold border border-semantic-success-border tracking-wide uppercase shadow-xs">
                                  Aparıcı
                                </span>
                              )}
                              {isBoyuk && (
                                <span className="px-2 py-0.5 rounded-full bg-semantic-info-utility text-semantic-info-utility-text text-micro font-bold border border-semantic-info-utility-border tracking-wide uppercase shadow-xs">
                                  Böyük Mütəxəssis
                                </span>
                              )}
                              {isKicik && (
                                <span className="px-2 py-0.5 rounded-full bg-semantic-subtle text-semantic-muted text-micro font-bold border border-semantic-border tracking-wide uppercase shadow-xs">
                                  Kiçik Mütəxəssis
                                </span>
                              )}
                            </div>
                            <div className="text-label text-semantic-jira-icon font-mono font-normal">
                              {m.email}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-semantic-jira-muted-strong font-medium">
                            {m.section?.name || dept.sections?.find((section: any) => section.id === m.sectionId)?.name || '—'}
                          </td>
                          <td className="px-3 py-3 text-semantic-jira-muted-strong font-medium">
                            <span className={isManager ? 'font-bold text-semantic-primary' : ''}>
                              {m.title}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {m.roles?.map((r) => {
                                const isLeadershipRole =
                                  r === 'DEPARTMENT_MANAGER' ||
                                  r === 'INFOSEC_MANAGER' ||
                                  r === 'CISO' ||
                                  r === 'DEPARTMENT_ADMIN' ||
                                  r === 'PLATFORM_ADMIN' ||
                                  r === 'TEAM_LEAD';

                                return (
                                  <span
                                    key={r}
                                    className={`px-2 py-0.5 rounded text-caption font-mono font-bold border ${
                                      r === 'DEPARTMENT_MANAGER' || r === 'INFOSEC_MANAGER'
                                        ? 'bg-semantic-warning-amber text-semantic-warning-strong border-semantic-warning-soft-border'
                                        : r === 'CISO' || r === 'PLATFORM_ADMIN'
                                        ? 'bg-semantic-info-utility-alt text-semantic-jira-brand border-semantic-jira-info-border'
                                        : r === 'DEPARTMENT_ADMIN' || r === 'TEAM_LEAD'
                                        ? 'bg-semantic-success-surface text-semantic-success border-semantic-success-border'
                                        : 'bg-semantic-neutral-surface text-semantic-secondary border-semantic-border'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-semantic-purple-surface text-semantic-purple text-caption font-bold border border-semantic-purple-border">
                              {m.securityClearance}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold">
                              ACTIVE
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: INTERNAL SETTINGS & SLAS */}
          {activeTab === 'SETTINGS' && (
            <div className="bg-semantic-panel border border-semantic-border rounded-xl p-5 shadow-xs space-y-5">
              <div className="border-b border-semantic-border pb-3">
                <h3 className="font-extrabold text-sm text-semantic-primary">
                  Department Configuration & SLA Targets
                </h3>
                <p className="text-xs text-semantic-jira-muted-strong">
                  Configure response thresholds, auto-assignment pipelines, and dual-control rules for {dept.name}.
                </p>
              </div>

              {settingsSaveMsg && (
                <div className="p-3 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{settingsSaveMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-semantic-subtle rounded-xl border border-semantic-border">
                  <div>
                    <label className="block font-bold text-semantic-primary mb-1">
                      Standard SLA Response Target (Hours)
                    </label>
                    <input
                      type="number"
                      value={settingsForm.defaultSlaHours ?? ''}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, defaultSlaHours: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-semantic-panel border border-semantic-border rounded-lg text-xs font-mono font-bold"
                      placeholder="Not configured"
                    />
                    <p className="text-label text-semantic-jira-icon mt-1">Default turnaround time for standard tasks.</p>
                  </div>

                  <div>
                    <label className="block font-bold text-semantic-primary mb-1">
                      Critical P1 / Blocker SLA Target (Hours)
                    </label>
                    <input
                      type="number"
                      value={settingsForm.criticalSlaHours ?? ''}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, criticalSlaHours: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-semantic-panel border border-semantic-border rounded-lg text-xs font-mono font-bold text-semantic-brand-danger"
                      placeholder="Not configured"
                    />
                    <p className="text-label text-semantic-jira-icon mt-1">Emergency containment & response deadline.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-semantic-subtle rounded-xl border border-semantic-border space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer font-bold text-semantic-primary">
                      <input
                        type="checkbox"
                        checked={settingsForm.autoAssignEnabled !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, autoAssignEnabled: e.target.checked })
                        }
                        className="rounded text-semantic-brand focus:ring-0"
                      />
                      <span>Enable Smart Task Auto-Assignment</span>
                    </label>
                    <p className="text-label text-semantic-jira-muted-strong pl-6">
                      Automatically routes new incoming tasks to on-duty specialists based on workload.
                    </p>
                  </div>

                  <div className="p-4 bg-semantic-subtle rounded-xl border border-semantic-border space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer font-bold text-semantic-primary">
                      <input
                        type="checkbox"
                        checked={settingsForm.requireDualApproval !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, requireDualApproval: e.target.checked })
                        }
                        className="rounded text-semantic-brand focus:ring-0"
                      />
                      <span>Enforce 4-Eyes Dual-Control Approvals</span>
                    </label>
                    <p className="text-label text-semantic-jira-muted-strong pl-6">
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
                  <h3 className="font-extrabold text-sm text-semantic-primary">
                    {dept.name} Task Templates & Turnkey Blueprints
                  </h3>
                  <p className="text-xs text-semantic-jira-muted-strong">
                    Pre-packaged multi-step workflows tailored for {dept.name} operations.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.templates?.map((bp: ProjectBlueprint) => (
                  <div
                    key={bp.id}
                    className="bg-semantic-panel border border-semantic-border hover:border-semantic-brand rounded-xl p-5 flex flex-col justify-between space-y-3 shadow-xs transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-brand flex items-center justify-center font-bold">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm text-semantic-primary">{bp.title}</h4>
                            <span className="text-label font-bold text-semantic-success">{bp.domain}</span>
                          </div>
                        </div>

                        {bp.isCrossDepartment && (
                          <span className="px-2 py-0.5 rounded-full bg-semantic-purple-surface text-semantic-purple text-caption font-bold border border-semantic-purple-border">
                            CROSS-DEPT
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-semantic-jira-muted-strong mt-2.5 leading-relaxed">{bp.description}</p>
                    </div>

                    <div className="pt-3 border-t border-semantic-border flex items-center justify-between text-xs">
                      <span className="font-mono text-label text-semantic-jira-muted-strong">
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
                  <h3 className="font-extrabold text-sm text-semantic-primary">
                    {dept.name} System Connectors & APIs
                  </h3>
                  <p className="text-xs text-semantic-jira-muted-strong">
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
                <div className="p-4 rounded-xl bg-semantic-success-surface border border-semantic-success-border text-xs space-y-1.5 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 text-semantic-success font-extrabold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{testResult.result.message}</span>
                  </div>
                  <div className="font-mono text-label text-semantic-brand-ink pl-6">
                    Cipher: {testResult.result.details?.tlsCipher} | Latency: {testResult.result.latencyMs}ms | Verified: {new Date(testResult.result.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.connections?.map((conn: DepartmentConnection) => (
                  <div
                    key={conn.id}
                    className="bg-semantic-panel border border-semantic-border rounded-xl p-5 space-y-3.5 shadow-xs hover:border-semantic-border-strong transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-semantic-jira-soft text-semantic-jira-brand flex items-center justify-center font-bold border border-semantic-jira-soft-border">
                          <Link2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-semantic-primary">{conn.name}</h4>
                          </div>
                          <div className="text-label text-semantic-jira-muted-strong font-semibold">{conn.provider}</div>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success font-mono text-caption font-extrabold border border-semantic-success-border">
                        {conn.status}
                      </span>
                    </div>

                    <p className="text-xs text-semantic-jira-muted-strong leading-relaxed">{conn.description}</p>

                    <div className="p-2.5 bg-semantic-subtle rounded-lg border border-semantic-border font-mono text-label space-y-1 text-semantic-brand-ink">
                      <div className="truncate">
                        <span className="text-semantic-jira-icon">Endpoint:</span> {conn.endpointUrl}
                      </div>
                      <div className="flex items-center justify-between text-caption">
                        <span>Auth: {conn.authType}</span>
                        <span className="text-semantic-success font-bold">Latency: {conn.latencyMs == null ? 'Not measured' : `${conn.latencyMs}ms`}</span>
                        <span>Score: {conn.healthScore == null ? 'Not verified' : `${conn.healthScore}%`}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-caption text-semantic-jira-icon">
                        {conn.lastSyncAt ? `Synced ${new Date(conn.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not synchronized'}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestConnection(conn.id)}
                          disabled={testingConnId === conn.id}
                          className="px-3 py-1.5 rounded-lg bg-semantic-success-surface hover:bg-semantic-success-border text-semantic-success font-bold text-xs flex items-center gap-1.5 transition-colors border border-semantic-success-border"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testingConnId === conn.id ? 'animate-spin' : ''}`} />
                          <span>{testingConnId === conn.id ? 'Checking...' : 'Test Connection'}</span>
                        </button>
                        {isDeptAdmin && <button onClick={() => handleDeleteConnection(conn.id)} className="p-1.5 rounded-lg text-semantic-danger hover:bg-semantic-danger-surface" title="Delete connector"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
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
                <div key={wf.id} className="bg-semantic-panel border border-semantic-border rounded-xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-semantic-border pb-3">
                    <div>
                      <h3 className="font-extrabold text-sm text-semantic-primary">{wf.name}</h3>
                      <p className="text-xs text-semantic-jira-muted-strong">{wf.description}</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-semantic-neutral-surface text-semantic-secondary font-mono text-caption font-bold border border-semantic-border">
                      v{wf.version} State Machine
                    </span>
                  </div>

                  {/* Flow Stages */}
                  <div className="p-4 bg-semantic-subtle rounded-xl border border-semantic-border space-y-2">
                    <div className="text-label font-bold uppercase tracking-wider text-semantic-jira-muted-strong">
                      Process Lifecycle States & Role Transitions
                    </div>
                    <div className="flex items-center gap-3 overflow-x-auto py-2">
                      {wf.states?.map((st: any, idx: number) => (
                        <React.Fragment key={st.id}>
                          <div className="p-3 bg-semantic-panel rounded-xl border border-semantic-border space-y-1 min-w-dsFilter shadow-2xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                              <span className="font-extrabold text-xs text-semantic-primary">{st.name}</span>
                            </div>
                            <div className="text-caption font-mono text-semantic-jira-icon uppercase">{st.category}</div>
                          </div>
                          {idx < wf.states.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-semantic-brand shrink-0" />
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
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <h3 className="font-extrabold text-sm text-semantic-primary">Add Staff to {dept.name}</h3>
              <button onClick={() => setIsAddMemberOpen(false)} className="text-semantic-jira-icon hover:text-semantic-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-semantic-primary mb-1">Active Directory employee *</label>
                <DirectoryAssignmentSelect
                  kind="user"
                  value={memberUserId}
                  onChange={setMemberUserId}
                  departmentId={dept.id}
                  excludeUserIds={(data?.members || []).map((member: BankUser) => member.id)}
                  required
                  placeholder="Select a live directory record"
                  searchPlaceholder="Name, section, title or account…"
                />
                <p className={`text-label mt-1 ${directoryLoadError ? 'text-semantic-danger' : 'text-semantic-jira-icon'}`}>
                  {directoryLoadError || 'Only active users confirmed by the last AD synchronization are selectable.'}
                </p>
              </div>

              <div>
                <label className="block font-bold text-semantic-primary mb-1">Operational Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs"
                >
                  <option value="TEAM_LEAD">Team Lead / Approver</option>
                  <option value="SECURITY_ANALYST">Senior Specialist</option>
                  <option value="SOC_ANALYST">SOC / Incident Analyst</option>
                  <option value="APPSEC_ANALYST">AppSec / DevSecOps Engineer</option>
                  <option value="AUDITOR">Compliance Auditor</option>
                </select>
              </div>

              <div className="p-3 bg-semantic-success-surface rounded-lg border border-semantic-success-border">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-semantic-success">
                  <input
                    type="checkbox"
                    checked={isDeptAdminFlag}
                    onChange={(e) => setIsDeptAdminFlag(e.target.checked)}
                    className="rounded text-semantic-brand focus:ring-0"
                  />
                  <span>Grant Department Admin Rights ({dept.code} Admin)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-semantic-border">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-semantic-subtle text-semantic-jira-muted-strong font-bold text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={!memberUserId || Boolean(directoryLoadError)} className="wrike-btn-primary px-4 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
                  Save Specialist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Connection Modal */}
      {isAddConnOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <h3 className="font-extrabold text-sm text-semantic-primary">Add Connector to {dept.name}</h3>
              <button onClick={() => setIsAddConnOpen(false)} className="text-semantic-jira-icon hover:text-semantic-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddConnection} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-semantic-primary mb-1">Connector Name *</label>
                <input
                  type="text"
                  required
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  placeholder="e.g. Cisco Meraki Core VPN"
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-semantic-primary mb-1">System Type</label>
                  <select
                    value={connType}
                    onChange={(e) => setConnType(e.target.value)}
                    className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs"
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
                  <label className="block font-bold text-semantic-primary mb-1">Provider Vendor</label>
                  <input
                    type="text"
                    value={connProvider}
                    onChange={(e) => setConnProvider(e.target.value)}
                    placeholder="e.g. Cisco Systems"
                    className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-semantic-primary mb-1">Endpoint URL / API Host *</label>
                <input
                  type="text"
                  required
                  value={connUrl}
                  onChange={(e) => setConnUrl(e.target.value)}
                  placeholder="https://api.internal.apexbank.az"
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-semantic-primary mb-1">Authentication Method</label>
                <select
                  value={connAuthType}
                  onChange={(e) => setConnAuthType(e.target.value)}
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs"
                >
                  <option value="MTLS_CERTIFICATE">mTLS Certificate (Banking Grade)</option>
                  <option value="API_KEY">Secure API Key</option>
                  <option value="OAUTH2">OAuth 2.0 Client Credentials</option>
                  <option value="LDAP_BIND">Direct LDAP Bind</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-semantic-border">
                <button
                  type="button"
                  onClick={() => setIsAddConnOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-semantic-subtle text-semantic-jira-muted-strong font-bold text-xs"
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
