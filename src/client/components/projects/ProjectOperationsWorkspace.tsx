import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Code,
  Eye,
  FileCheck,
  FileText,
  Filter,
  FolderKanban,
  Globe,
  Hash,
  Layers,
  ListChecks,
  Loader2,
  LockKeyhole,
  Mail,
  Plus,
  RotateCw,
  Scale,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import type { BankDepartment, BankUser, LDAPGroupInfo } from '../../../shared/types/auth.js';
import { PROJECT_WORK_ITEM_TYPES, type Project, type ProjectHealth, type ProjectMember, type ProjectMilestone, type ProjectRole, type ProjectSummary } from '../../../shared/types/project.js';
import { Modal } from '../common/Modal.js';
import { CustomSelect, type SelectOption } from '../common/CustomSelect.js';
import { DirectoryAssignmentSelect } from '../common/DirectoryAssignmentSelect.js';
import { AccessibleDatePicker } from '../common/AccessibleDatePicker.js';

type ProjectPayload = ProjectSummary & { tasks?: Ticket[]; activity?: any[] };
type WorkspaceTab = 'overview' | 'tasks' | 'kanban' | 'timeline' | 'capacity' | 'files' | 'activity' | 'settings' | 'access';

const tabs: Array<[WorkspaceTab, string]> = [
  ['overview', 'Overview'],
  ['tasks', 'Tasks'],
  ['kanban', 'Kanban'],
  ['timeline', 'Timeline'],
  ['capacity', 'Capacity'],
  ['files', 'Files'],
  ['activity', 'Activity'],
];

const healthStyle: Record<ProjectHealth, string> = {
  ON_TRACK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AT_RISK: 'bg-amber-50 text-amber-700 border-amber-200',
  DELAYED: 'bg-rose-50 text-rose-700 border-rose-200',
  BLOCKED: 'bg-red-50 text-red-700 border-red-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
  ON_HOLD: 'bg-violet-50 text-violet-700 border-violet-200',
};

const display = (value?: string) =>
  value ? new Date(value).toLocaleDateString('az-AZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const avatar = (nameOrId?: string) => (nameOrId || 'U').replace(/^usr-/, '').slice(0, 2).toUpperCase();

export const ProjectOperationsWorkspace: React.FC = () => {
  const { currentUser, allUsers, fetchWithAuth } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selected, setSelected] = useState<ProjectPayload | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [status, setStatus] = useState('ACTIVE');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);

  // Directory metadata state
  const [departments, setDepartments] = useState<BankDepartment[]>([]);
  const [ldapGroups, setLdapGroups] = useState<LDAPGroupInfo[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const loadDirectoryData = async () => {
    try {
      const [deptRes, groupRes, teamRes] = await Promise.all([
        fetchWithAuth('/api/departments'),
        fetchWithAuth('/api/auth/ldap/groups'),
        fetchWithAuth('/api/teams'),
      ]);
      if (deptRes.ok) {
        const d = await deptRes.json();
        if (d.success && Array.isArray(d.departments)) setDepartments(d.departments);
      }
      if (groupRes.ok) {
        const g = await groupRes.json();
        if (g.success && Array.isArray(g.groups)) setLdapGroups(g.groups);
      }
      if (teamRes.ok) {
        const t = await teamRes.json();
        if (t.success && Array.isArray(t.teams)) setTeams(t.teams);
      }
    } catch (e) {
      console.warn('Directory lookup initialization warning:', e);
    }
  };

  useEffect(() => {
    void loadDirectoryData();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/projects?status=${encodeURIComponent(status)}&search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unable to load projects.');
      setProjects(data.projects || []);
    } catch (e: any) {
      setError(e.message || 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  };

  const openProject = async (id: string) => {
    try {
      setError('');
      const res = await fetchWithAuth(`/api/projects/${id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unable to open project.');
      setSelected(data);
      setTab('overview');
    } catch (e: any) {
      setError(e.message || 'Unable to open project.');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadProjects, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [status, query]);

  const refreshSelected = async () => {
    if (selected) await openProject(selected.project.id);
    await loadProjects();
  };

  const request = async (method: 'POST' | 'PATCH', url: string, body: unknown) => {
    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Operation failed.');
    return data;
  };
  const post = (url: string, body: unknown) => request('POST', url, body);
  const patch = (url: string, body: unknown) => request('PATCH', url, body);

  if (selected) {
    return (
      <ProjectDetail
        projectData={selected}
        currentUserId={currentUser?.id}
        allUsers={allUsers || []}
        departments={departments}
        ldapGroups={ldapGroups}
        teams={teams}
        tab={tab}
        setTab={setTab}
        onBack={() => {
          setSelected(null);
          setTab('overview');
        }}
        onRefresh={refreshSelected}
        post={post}
        patch={patch}
        fetchWithAuth={fetchWithAuth}
        showTaskForm={showTaskForm}
        setShowTaskForm={setShowTaskForm}
        showMilestoneForm={showMilestoneForm}
        setShowMilestoneForm={setShowMilestoneForm}
        showMemberForm={showMemberForm}
        setShowMemberForm={setShowMemberForm}
      />
    );
  }

  return (
    <div className="flex-1 min-w-0 h-full overflow-auto bg-semantic-project-canvas p-4 md:p-6">
      <div className="max-w-[1440px] mx-auto space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-semantic-muted">
              <FolderKanban className="w-4 h-4 text-semantic-brand" /> Work management
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-semantic-primary">Projects &amp; Tasks</h1>
            <p className="mt-1 text-sm text-semantic-jira-muted-strong">
              Project operations workspace with Active Directory access boundaries, delivery tracking, and milestone governance.
            </p>
          </div>
          <button onClick={() => setShowProjectForm(true)} className="wrike-btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-semantic-border bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex overflow-x-auto gap-1">
            {[
              ['ACTIVE', 'Active'],
              ['MY', 'My Projects'],
              ['AT_RISK', 'At Risk'],
              ['COMPLETED', 'Completed'],
              ['ARCHIVED', 'Archived'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatus(val)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
                  status === val ? 'bg-semantic-primary text-white' : 'text-semantic-jira-muted-stronger hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-2.5 w-3.5 h-3.5 text-semantic-jira-icon" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="wrike-input w-full min-w-[240px] py-2 pl-8 text-xs"
                placeholder="Search project or key…"
              />
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {loading ? (
          <div className="rounded-xl border border-semantic-border bg-white p-12 text-center text-sm text-semantic-muted">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-semantic-success" />
            Loading authorized projects…
          </div>
        ) : projects.length === 0 ? (
          <EmptyProjectList onCreate={() => setShowProjectForm(true)} hasFilters={Boolean(query || status !== 'ACTIVE')} />
        ) : (
          <ProjectList projects={projects} allUsers={allUsers || []} onOpen={(project) => openProject(project.project.id)} />
        )}
      </div>

      {showProjectForm && (
        <ProjectForm
          allUsers={allUsers || []}
          departments={departments}
          currentUser={currentUser}
          onClose={() => setShowProjectForm(false)}
          onCreate={async (body: any) => {
            try {
              const data = await post('/api/projects', body);
              setShowProjectForm(false);
              await loadProjects();
              if (data.project?.project?.id) await openProject(data.project.project.id);
            } catch (e: any) {
              setError(e.message);
            }
          }}
        />
      )}
    </div>
  );
};

const ProjectList: React.FC<{
  projects: ProjectSummary[];
  allUsers: BankUser[];
  onOpen: (project: ProjectSummary) => void;
}> = ({ projects, allUsers, onOpen }) => {
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);

  return (
    <div className="overflow-hidden rounded-xl border border-semantic-border bg-white shadow-sm">
      <div className="hidden grid-cols-[minmax(250px,2fr)_110px_150px_160px_120px_105px_105px_170px_100px] gap-3 border-b border-semantic-border bg-semantic-subtle px-4 py-3 text-caption font-bold uppercase tracking-wider text-semantic-muted lg:grid">
        <span>Project</span>
        <span>Health</span>
        <span>Progress</span>
        <span>Owner</span>
        <span>Active tasks</span>
        <span>Blocked</span>
        <span>Overdue</span>
        <span>Next milestone</span>
        <span>Target</span>
      </div>
      {projects.map((summary) => {
        const owner = userMap.get(summary.project.ownerId);
        const ownerName = owner?.fullName || summary.project.ownerId || 'Unassigned';
        const ownerInitials = avatar(owner?.fullName || summary.project.ownerId);

        return (
          <button
            key={summary.project.id}
            onClick={() => onOpen(summary)}
            className="grid w-full gap-3 border-b border-semantic-border-subtle px-4 py-4 text-left transition-colors hover:bg-semantic-subtle lg:grid-cols-[minmax(250px,2fr)_110px_150px_160px_120px_105px_105px_170px_100px] lg:items-center"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-semantic-primary">{summary.project.name}</span>
                <span className="rounded border border-semantic-project-border bg-semantic-subtle px-1.5 py-0.5 font-mono text-caption text-semantic-jira-muted-stronger">
                  {summary.project.key}
                </span>
              </div>
              <div className="mt-1 font-mono text-label text-semantic-jira-icon">{summary.project.identifier}</div>
            </div>

            <Health health={summary.health} />

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-semantic-content-alt">
                <span>{summary.progressPercent}%</span>
                <span>
                  {summary.taskCounts.completed}/{summary.taskCounts.total}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-slate-100">
                <div className="h-full rounded bg-semantic-brand" style={{ width: `${summary.progressPercent}%` }} />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-semantic-jira-muted-stronger">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-semantic-success-ring text-caption font-bold text-semantic-success">
                {ownerInitials}
              </span>
              <span className="truncate max-w-[120px]" title={ownerName}>
                {ownerName}
              </span>
            </div>

            <span className="text-sm font-semibold text-semantic-content-alt">{summary.taskCounts.active}</span>
            <Count value={summary.taskCounts.blocked} warn />
            <Count value={summary.taskCounts.overdue} danger />
            <span className="truncate text-xs text-semantic-jira-muted-stronger">
              {summary.nextMilestone ? `${summary.nextMilestone.name} · ${display(summary.nextMilestone.targetDate)}` : 'No milestone'}
            </span>
            <span className="text-xs text-semantic-jira-muted-stronger">{display(summary.project.targetDate)}</span>
          </button>
        );
      })}
    </div>
  );
};

const Count: React.FC<{ value: number; warn?: boolean; danger?: boolean }> = ({ value, warn, danger }) => (
  <span className={`text-sm font-semibold ${danger && value ? 'text-rose-600' : warn && value ? 'text-amber-600' : 'text-semantic-jira-muted-stronger'}`}>
    {value}
  </span>
);

const Health: React.FC<{ health: ProjectHealth }> = ({ health }) => (
  <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-caption font-bold ${healthStyle[health]}`}>
    <CircleDot className="w-3 h-3" />
    {health.replace('_', ' ')}
  </span>
);

const EmptyProjectList: React.FC<{ onCreate: () => void; hasFilters: boolean }> = ({ onCreate, hasFilters }) => (
  <div className="rounded-xl border border-dashed border-semantic-border-strong bg-white px-6 py-16 text-center">
    <FolderKanban className="mx-auto h-9 w-9 text-semantic-placeholder" />
    <h2 className="mt-3 font-bold text-semantic-primary">{hasFilters ? 'No projects match these filters' : 'No projects yet'}</h2>
    <p className="mx-auto mt-1 max-w-md text-sm text-semantic-muted">
      {hasFilters
        ? 'Clear or adjust filters to see authorized project workspaces.'
        : 'Create a project, define LDAP access boundaries and delivery milestones, then break work into actionable tasks.'}
    </p>
    {!hasFilters && (
      <button onClick={onCreate} className="wrike-btn-primary mx-auto mt-5 px-4 py-2 text-sm">
        <Plus className="w-4 h-4" /> Create Project
      </button>
    )}
  </div>
);

const ProjectDetail: React.FC<any> = ({
  projectData,
  currentUserId,
  allUsers = [],
  departments = [],
  ldapGroups = [],
  teams = [],
  tab,
  setTab,
  onBack,
  onRefresh,
  post,
  patch,
  fetchWithAuth,
  showTaskForm,
  setShowTaskForm,
  showMilestoneForm,
  setShowMilestoneForm,
  showMemberForm,
  setShowMemberForm,
}) => {
  const { project, health, progressPercent, members } = projectData as ProjectPayload;
  const userMap: Map<string, BankUser> = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);

  const canManage = members.some(
    (member: ProjectMember) =>
      member.subjectType === 'USER' && member.subjectId === currentUserId && ['OWNER', 'PROJECT_MANAGER'].includes(member.role)
  );

  const daysRemaining = project.targetDate ? Math.ceil((new Date(project.targetDate).getTime() - Date.now()) / 86400000) : null;

  const ownerUser = userMap.get(project.ownerId);
  const managerUser = project.managerId ? userMap.get(project.managerId) : undefined;

  return (
    <div className="flex-1 min-w-0 h-full overflow-auto bg-semantic-project-canvas">
      <div className="sticky top-0 z-dsSticky border-b border-semantic-project-border-strong bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-dsContent px-4 pt-3 md:px-6">
          <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-semantic-jira-muted-stronger hover:text-semantic-success">
            <ArrowLeft className="w-3.5 h-3.5" /> All projects
          </button>
          <div className="flex flex-col gap-3 pb-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-semantic-primary">{project.name}</h1>
                <span className="rounded border border-semantic-project-border bg-semantic-subtle px-2 py-1 font-mono text-xs text-semantic-jira-muted-stronger">
                  {project.key} · {project.identifier}
                </span>
                <Health health={health} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-semantic-jira-muted-strong">
                <span className="font-semibold text-semantic-primary">{project.status.replace('_', ' ')}</span>
                <span>Priority: <b>{project.priority}</b></span>
                <span>
                  Owner: <b>{ownerUser?.fullName || project.ownerId}</b>
                </span>
                <span>
                  Manager: <b>{managerUser?.fullName || project.managerId || '—'}</b>
                </span>
                <span>Target: <b>{display(project.targetDate)}</b></span>
                <span className={daysRemaining !== null && daysRemaining < 0 ? 'font-bold text-rose-600' : ''}>
                  {daysRemaining === null
                    ? 'No target date'
                    : daysRemaining < 0
                    ? `${Math.abs(daysRemaining)} days overdue`
                    : `${daysRemaining} days remaining`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold text-semantic-primary">{progressPercent}%</div>
                <div className="text-caption font-semibold uppercase tracking-wide text-semantic-muted">Project progress</div>
              </div>
              <div className="h-9 w-9 rounded-full border-4 border-semantic-success-ring border-r-semantic-brand" />
            </div>
          </div>
          <div className="flex overflow-x-auto gap-1 border-t border-semantic-border-subtle pt-2">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${
                  tab === value ? 'border-semantic-brand text-semantic-success' : 'border-transparent text-semantic-muted hover:text-semantic-primary'
                }`}
              >
                {label}
              </button>
            ))}
            {canManage && (
              <>
                <button
                  onClick={() => setTab('settings')}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${
                    tab === 'settings' ? 'border-semantic-brand text-semantic-success' : 'border-transparent text-semantic-muted'
                  }`}
                >
                  Settings
                </button>
                <button
                  onClick={() => setTab('access')}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${
                    tab === 'access' ? 'border-semantic-brand text-semantic-success' : 'border-transparent text-semantic-muted'
                  }`}
                >
                  Access &amp; Permissions
                </button>
              </>
            )}
          </div>
        </div>
      </div>

        <main className="mx-auto max-w-dsContent p-4 md:p-6">
        {tab === 'overview' && (
          <Overview
            data={projectData}
            allUsers={allUsers}
            departments={departments}
            ldapGroups={ldapGroups}
            teams={teams}
            onTask={() => setShowTaskForm(true)}
            onMilestone={() => setShowMilestoneForm(true)}
            onMember={() => setShowMemberForm(true)}
            post={post}
            onRefresh={onRefresh}
          />
        )}
        {tab === 'tasks' && (
          <Tasks
            data={projectData}
            allUsers={allUsers}
            onTask={() => setShowTaskForm(true)}
            post={post}
            patch={patch}
            onRefresh={onRefresh}
            fetchWithAuth={fetchWithAuth}
            currentUserId={currentUserId}
          />
        )}
        {tab === 'kanban' && <Kanban data={projectData} allUsers={allUsers} patch={patch} onRefresh={onRefresh} />}
        {tab === 'timeline' && <Timeline data={projectData} />}
        {tab === 'capacity' && <Capacity data={projectData} allUsers={allUsers} />}
        {tab === 'files' && <Files />}
        {tab === 'activity' && <Activity data={projectData} allUsers={allUsers} />}
        {tab === 'access' && (
          <Access
            data={projectData}
            allUsers={allUsers}
            departments={departments}
            ldapGroups={ldapGroups}
            teams={teams}
            currentUserId={currentUserId}
            canManage={canManage}
            onMember={() => setShowMemberForm(true)}
            onRefresh={onRefresh}
            fetchWithAuth={fetchWithAuth}
          />
        )}
        {tab === 'settings' && <Settings project={project} patch={patch} onRefresh={onRefresh} fetchWithAuth={fetchWithAuth} />}
      </main>

      {showTaskForm && (
        <TaskForm
          project={project}
          milestones={projectData.milestones}
          tasks={projectData.tasks || []}
          members={members || []}
          allUsers={allUsers || []}
          departments={departments}
          onClose={() => setShowTaskForm(false)}
          onCreate={async (body: any) => {
            await post(`/api/projects/${project.id}/tasks`, body);
            setShowTaskForm(false);
            await onRefresh();
          }}
        />
      )}

      {showMilestoneForm && (
        <MilestoneForm
          onClose={() => setShowMilestoneForm(false)}
          onCreate={async (body: any) => {
            await post(`/api/projects/${project.id}/milestones`, body);
            setShowMilestoneForm(false);
            await onRefresh();
          }}
        />
      )}

      {showMemberForm && (
        <MemberForm
          allUsers={allUsers || []}
          departments={departments}
          ldapGroups={ldapGroups}
          teams={teams}
          onClose={() => setShowMemberForm(false)}
          onCreate={async (body: any) => {
            await post(`/api/projects/${project.id}/members`, body);
            setShowMemberForm(false);
            await onRefresh();
          }}
        />
      )}
    </div>
  );
};

const Overview: React.FC<any> = ({ data, allUsers = [], departments = [], ldapGroups = [], teams = [], onTask, onMilestone, onMember, post, onRefresh }) => {
  const { project, health, healthReasons, progressPercent, taskCounts, nextMilestone, milestones, myTasks, recentlyCompleted, upcoming, risks, latestUpdate, members } = data as ProjectPayload;
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);
  const deptMap = useMemo(() => new Map<string, BankDepartment>(departments.map((d: BankDepartment) => [d.id, d])), [departments]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <section className="rounded-xl border border-semantic-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-caption font-bold uppercase tracking-widest text-semantic-muted">Project health</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-3xl font-bold text-semantic-primary">{progressPercent}%</span>
                <Health health={health} />
              </div>
              <p className="mt-2 text-sm text-semantic-jira-muted-stronger">
                {taskCounts.completed} / {taskCounts.total} tasks completed · {taskCounts.active} in progress ·{' '}
                <span className="font-semibold text-amber-700">{taskCounts.blocked} blocked</span> ·{' '}
                <span className="font-semibold text-rose-700">{taskCounts.overdue} overdue</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={onTask} className="wrike-btn-primary px-3 py-2 text-xs">
                <Plus className="w-3.5 h-3.5" /> Create task
              </button>
              <button onClick={onMilestone} className="wrike-btn-secondary px-3 py-2 text-xs">
                Create milestone
              </button>
            </div>
          </div>
          {healthReasons.length > 0 && (
            <div className="mt-4 rounded-lg border border-semantic-warning-note-border bg-semantic-warning-note px-3 py-2 text-xs text-semantic-warning-note-text">
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
              {healthReasons.join(' · ')}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
          <SectionTitle
            title="Milestone timeline"
            action={
              <button onClick={onMilestone} className="text-xs font-semibold text-semantic-success hover:underline">
                + Add milestone
              </button>
            }
          />
          <div className="divide-y divide-semantic-border-subtle">
            {milestones.length ? (
              milestones.map((milestone: any) => (
                <div key={milestone.id} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      milestone.status === 'COMPLETED' ? 'bg-semantic-brand' : milestone.status === 'DELAYED' ? 'bg-rose-500' : 'bg-semantic-info'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3 text-sm font-semibold text-semantic-content-alt">
                      <span>{milestone.name}</span>
                      <span>{milestone.progressPercent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                      <div className="h-full rounded bg-semantic-info" style={{ width: `${milestone.progressPercent}%` }} />
                    </div>
                    <div className="mt-1 text-label text-semantic-muted">
                      {milestone.status.replace('_', ' ')} · {milestone.taskCount} tasks · Target {display(milestone.targetDate)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <ProjectEmpty
                icon={<CalendarDays />}
                title="No milestones yet"
                text="Define delivery checkpoints to make the plan and next commitment visible."
                action="Create Milestone"
                onClick={onMilestone}
              />
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
            <SectionTitle title="My work" />
            <WorkList tasks={myTasks} empty="No active work assigned or watched by you." />
          </section>
          <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
            <SectionTitle title="Recently completed" />
            <WorkList tasks={recentlyCompleted} empty="Completed work will appear here." done />
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
            <SectionTitle title="Upcoming" />
            <div className="divide-y divide-semantic-border-subtle">
              {upcoming.map((item: any) => (
                <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="truncate text-semantic-content-alt">{item.title}</span>
                  <span className="shrink-0 text-xs text-semantic-muted">{display(item.dueDate)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
            <SectionTitle title="Risks & blockers" />
            <div className="divide-y divide-semantic-border-subtle">
              {risks.length ? (
                risks.map((risk: any) => (
                  <div className="px-5 py-3" key={risk.id}>
                    <div className="flex gap-2 text-sm font-semibold text-semantic-content-alt">
                      <span className={risk.severity === 'CRITICAL' ? 'text-rose-600' : 'text-amber-600'}>{risk.severity}</span>
                      {risk.title}
                    </div>
                    <div className="mt-1 text-xs text-semantic-muted">
                      {risk.status} · Owner {userMap.get(risk.ownerId)?.fullName || risk.ownerId || 'Unassigned'}
                    </div>
                  </div>
                ))
              ) : (
                <ProjectEmpty icon={<AlertTriangle />} title="No project risks recorded" text="Blockers from tasks are still reflected in calculated health." />
              )}
            </div>
          </section>
        </div>
      </div>

      <aside className="space-y-5">
        <section className="rounded-xl border border-semantic-border bg-white p-4 shadow-sm">
          <p className="text-caption font-bold uppercase tracking-widest text-semantic-muted">Project summary</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-semantic-muted">Objective</dt>
              <dd className="mt-0.5 text-semantic-content-alt font-medium">{project.objective || project.description || 'Not defined'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-semantic-muted">Start</dt>
                <dd className="text-semantic-content-alt font-medium">{display(project.startDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-semantic-muted">Target</dt>
                <dd className="text-semantic-content-alt font-medium">{display(project.targetDate)}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-semantic-muted">Next milestone</dt>
              <dd className="mt-0.5 font-semibold text-semantic-content-alt">
                {nextMilestone ? `${nextMilestone.name} · ${display(nextMilestone.targetDate)}` : 'None'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
          <SectionTitle
            title="Project Team"
            action={
              <button onClick={onMember} className="text-xs font-semibold text-semantic-success hover:underline">
                Manage Access
              </button>
            }
          />
          <div className="space-y-3 px-4 pb-4">
            {members.slice(0, 7).map((member: ProjectMember) => {
              let name = member.subjectId;
              let subtitle = member.role.replace('_', ' ');
              let isAd = false;
              let initial = avatar(member.subjectId);

              if (member.subjectType === 'USER') {
                const u = userMap.get(member.subjectId);
                if (u) {
                  name = u.fullName || u.username;
                  subtitle = `${u.title || 'Specialist'} · ${member.role.replace('_', ' ')}`;
                  isAd = u.directorySource === 'ACTIVE_DIRECTORY';
                  initial = avatar(u.fullName || u.username);
                }
              } else if (member.subjectType === 'DEPARTMENT') {
                const d = deptMap.get(member.subjectId) || departments.find((dept: any) => dept.code === member.subjectId);
                name = d?.name || member.subjectId;
                subtitle = `Department · ${member.role.replace('_', ' ')}`;
                initial = 'DP';
              } else if (member.subjectType === 'GROUP') {
                name = member.subjectId;
                subtitle = `LDAP Group · ${member.role.replace('_', ' ')}`;
                initial = 'SG';
                isAd = true;
              } else if (member.subjectType === 'TEAM') {
                name = member.subjectId.replace(/^team-/, '').replace(/-/g, ' ').toUpperCase();
                subtitle = `Team Squad · ${member.role.replace('_', ' ')}`;
                initial = 'TM';
              }

              return (
                <div className="flex items-center gap-2.5 text-xs" key={member.id}>
                  <div className="relative">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-semantic-success-surface font-bold text-semantic-success border border-semantic-success-border">
                      {initial}
                    </span>
                    {isAd && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-overline text-white" title="Active Directory Verified">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-semantic-content-alt">{name}</div>
                    <div className="truncate text-caption text-semantic-muted">{subtitle}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
          <SectionTitle title="Latest project update" />
          <div className="p-4">
            <p className="text-sm text-semantic-jira-muted-stronger">{latestUpdate?.body || 'No status update posted yet.'}</p>
            <StatusUpdateForm
              onSubmit={async (body: string) => {
                await post(`/api/projects/${project.id}/status-updates`, { body });
                await onRefresh();
              }}
            />
          </div>
        </section>
      </aside>
    </div>
  );
};

const SectionTitle: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between border-b border-semantic-border-subtle px-5 py-3">
    <h2 className="text-sm font-bold text-semantic-primary">{title}</h2>
    {action}
  </div>
);

const ProjectEmpty: React.FC<any> = ({ icon, title, text, action, onClick }) => (
  <div className="px-5 py-8 text-center text-semantic-muted">
    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
    <p className="mt-2 text-sm font-semibold text-semantic-content-alt">{title}</p>
    <p className="mt-1 text-xs">{text}</p>
    {action && (
      <button onClick={onClick} className="mt-3 text-xs font-semibold text-semantic-success hover:underline">
        {action}
      </button>
    )}
  </div>
);

const WorkList: React.FC<any> = ({ tasks, empty, done }) => (
  <div className="divide-y divide-semantic-border-subtle">
    {tasks?.length ? (
      tasks.slice(0, 6).map((task: Ticket) => (
        <div className="px-5 py-3" key={task.id}>
          <div className="flex gap-2">
            <span className="font-mono text-xs font-bold text-semantic-info">{task.key}</span>
            <span className="truncate text-sm font-semibold text-semantic-content-alt">{task.title}</span>
          </div>
          <div className="mt-1 text-label text-semantic-muted">
            {done
              ? `Completed ${display(task.resolvedAt || task.updatedAt)}`
              : `${task.projectTaskStatus?.replace('_', ' ') || task.statusName} · Due ${display(task.dueDate)}`}
          </div>
        </div>
      ))
    ) : (
      <ProjectEmpty icon={<ListChecks />} title="Nothing here" text={empty} />
    )}
  </div>
);

const StatusUpdateForm: React.FC<{ onSubmit: (body: string) => Promise<void> }> = ({ onSubmit }) => {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className="wrike-input min-h-[70px] w-full text-xs"
        placeholder="Post a concise project update…"
      />
      <button
        disabled={!body.trim() || busy}
        onClick={async () => {
          setBusy(true);
          await onSubmit(body);
          setBody('');
          setBusy(false);
        }}
        className="mt-2 text-xs font-semibold text-semantic-success disabled:opacity-40"
      >
        Post update
      </button>
    </div>
  );
};

const Tasks: React.FC<any> = ({ data, allUsers = [], onTask, post, patch, onRefresh, fetchWithAuth, currentUserId }) => {
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [serverTasks, setServerTasks] = useState<Ticket[] | null>(null);
  const [taskDetail, setTaskDetail] = useState<any>(null);
  const [detailError, setDetailError] = useState('');
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);

  const openTask = async (task: Ticket) => {
    setDetailError('');
    try {
      const response = await fetchWithAuth(`/api/projects/${data.project.id}/tasks/${task.id}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Unable to open work item.');
      setTaskDetail(result);
    } catch (cause: any) {
      setDetailError(cause.message || 'Unable to open work item.');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ taskStatus: filter });
      if (query.trim()) params.set('taskSearch', query.trim());
      void fetchWithAuth(`/api/projects/${data.project.id}?${params.toString()}`).then((response: Response) => response.json()).then((result: any) => {
        if (result.success) setServerTasks(result.tasks || []);
      }).catch(() => setServerTasks(null));
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [data.project.id, fetchWithAuth, filter, query]);

  const tasks = serverTasks || data.tasks || [];

  return (
    <section className="overflow-hidden rounded-xl border border-semantic-border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-semantic-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-semantic-primary">Project tasks</h2>
          <p className="text-xs text-semantic-muted">Project-scoped work only. Use All Tasks for cross-project work.</p>
        </div>
        <div className="flex gap-2">
          <label className="relative min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-semantic-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="wrike-input w-full py-2 pl-8 text-xs" placeholder="Search key or summary…" />
          </label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="wrike-select text-xs">
            <option value="ALL">All tasks</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="BLOCKED">Blocked</option>
            <option value="OVERDUE">Overdue</option>
            <option value="DONE">Completed</option>
          </select>
          <button onClick={onTask} className="wrike-btn-primary px-3 py-2 text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Create task
          </button>
        </div>
      </div>
      {detailError && <p role="alert" className="px-4 pt-3 text-xs font-semibold text-rose-700">{detailError}</p>}
      {tasks.length ? (
        <div className="overflow-auto">
          <table className="wrike-table min-w-[1000px]">
            <thead>
              <tr>
                <th>Key</th>
                <th className="min-w-[280px]">Task summary</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Milestone</th>
                <th>Due</th>
                <th>Blocker</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task: Ticket) => {
                const assignee = userMap.get(task.assigneeId || '');
                const assigneeName = assignee?.fullName || task.assigneeId || 'Unassigned';

                return (
                  <tr key={task.id}>
                    <td className="font-mono text-xs font-bold text-semantic-info">
                      <button type="button" onClick={() => openTask(task)} className="hover:underline">{task.key}</button>
                    </td>
                    <td>
                      <button type="button" onClick={() => openTask(task)} className="text-left font-semibold text-semantic-content-alt hover:text-semantic-success hover:underline">{task.title}</button>
                      <div className="mt-1 text-caption text-semantic-muted">
                        {task.estimatedHours ? `${task.estimatedHours}h estimated` : 'No estimate'}
                      </div>
                    </td>
                    <td>
                      <select
                        value={task.projectTaskStatus || 'TO_DO'}
                        onChange={async (event) => {
                          await patch(`/api/projects/${data.project.id}/tasks/${task.id}`, {
                            status: event.target.value,
                            expectedVersion: task.version,
                            blockedReason: event.target.value === 'BLOCKED' ? task.blockedReason || 'Blocker requires review' : undefined,
                          });
                          await onRefresh();
                        }}
                        className="wrike-select text-label"
                      >
                        <option value="BACKLOG">BACKLOG</option>
                        <option value="TO_DO">TO_DO</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="IN_REVIEW">IN_REVIEW</option>
                        <option value="BLOCKED">BLOCKED</option>
                        <option value="DONE">DONE</option>
                      </select>
                    </td>
                    <td className="text-xs">
                      <span className="font-medium text-semantic-content-alt">{assigneeName}</span>
                    </td>
                    <td className="text-xs">
                      {task.businessPriority
                        .replace('P1_URGENT', 'Critical')
                        .replace('P2_HIGH', 'High')
                        .replace('P3_MEDIUM', 'Medium')
                        .replace('P4_LOW', 'Low')}
                    </td>
                    <td className="text-xs">
                      {data.milestones.find((milestone: ProjectMilestone) => milestone.id === task.milestoneId)?.name || '—'}
                    </td>
                    <td className={`text-xs ${task.statusCategory !== 'DONE' && new Date(task.dueDate).getTime() < Date.now() ? 'font-bold text-rose-600' : ''}`}>
                      {display(task.dueDate)}
                    </td>
                    <td className="max-w-[160px] truncate text-xs text-rose-600">{task.blockedReason || '—'}</td>
                    <td>
                      <div className="h-1.5 w-16 overflow-hidden rounded bg-slate-100">
                        <div
                          className={`h-full ${task.statusCategory === 'DONE' ? 'bg-semantic-brand' : 'bg-semantic-info'}`}
                          style={{
                            width: task.statusCategory === 'DONE' ? '100%' : task.statusCategory === 'IN_PROGRESS' ? '50%' : '0%',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ProjectEmpty
          icon={<ListChecks />}
          title="No tasks yet"
          text="Break the project into milestones and actionable tasks to begin tracking progress."
          action="+ Create Task"
          onClick={onTask}
        />
      )}
      {taskDetail && (
        <ProjectTaskDetail
          detail={taskDetail}
          projectId={data.project.id}
          currentUserId={currentUserId}
          tasks={data.tasks || []}
          post={post}
          onClose={() => setTaskDetail(null)}
          onCommentAdded={(comment: any) => setTaskDetail((current: any) => ({ ...current, comments: [comment, ...(current?.comments || [])] }))}
          onAttachmentAdded={(attachment: any) => setTaskDetail((current: any) => ({ ...current, attachments: [attachment, ...(current?.attachments || [])] }))}
          onDependencyAdded={(dependency: any) => setTaskDetail((current: any) => ({ ...current, dependencies: [dependency, ...(current?.dependencies || [])] }))}
        />
      )}
    </section>
  );
};

const ProjectTaskDetail: React.FC<any> = ({ detail, projectId, currentUserId, tasks = [], post, onClose, onCommentAdded, onAttachmentAdded, onDependencyAdded }) => {
  const [content, setContent] = useState('');
  const [dependencyTargetId, setDependencyTargetId] = useState('');
  const [dependencyType, setDependencyType] = useState('BLOCKS');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const task = detail.task as Ticket;
  const [watching, setWatching] = useState(task.watcherIds.includes(currentUserId));

  const addComment = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await post(`/api/projects/${projectId}/tasks/${task.id}/comments`, { content: content.trim() });
      onCommentAdded(result.comment);
      setContent('');
    } catch (cause: any) {
      setError(cause.message || 'Unable to add comment.');
    } finally {
      setSaving(false);
    }
  };

  const uploadEvidence = async (file?: File) => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Unable to read the selected file.'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      const result = await post('/api/storage/upload', { ticketId: task.id, fileName: file.name, fileBase64, mimeType: file.type || 'application/octet-stream', evidenceType: 'AUDIT_WORKPAPER' });
      onAttachmentAdded(result.attachment);
    } catch (cause: any) {
      setError(cause.message || 'Unable to upload evidence.');
    } finally {
      setSaving(false);
    }
  };

  const addDependency = async () => {
    if (!dependencyTargetId) return;
    setSaving(true);
    setError('');
    try {
      const result = await post(`/api/projects/${projectId}/tasks/${task.id}/dependencies`, { sourceTaskId: task.id, targetTaskId: dependencyTargetId, type: dependencyType });
      onDependencyAdded(result.dependency);
      setDependencyTargetId('');
    } catch (cause: any) {
      setError(cause.message || 'Unable to add dependency.');
    } finally {
      setSaving(false);
    }
  };

  const toggleWatch = async () => {
    setSaving(true); setError('');
    try {
      const result = await post(`/api/projects/${projectId}/tasks/${task.id}/watchers/toggle`, {});
      setWatching(result.watching);
    } catch (cause: any) { setError(cause.message || 'Unable to update watcher status.'); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${task.key} · ${task.title}`} subtitle={`${task.projectWorkItemType || 'TASK'} · ${(task.projectTaskStatus || 'TO_DO').replace(/_/g, ' ')}`} icon={<ListChecks className="h-5 w-5" />} maxWidth="3xl">
      <div className="space-y-6 text-sm">
        <div className="flex justify-end"><button type="button" onClick={toggleWatch} disabled={saving} className="wrike-btn-secondary px-3 py-2 text-xs disabled:opacity-50">{watching ? 'Unwatch' : 'Watch'}</button></div>
        <div className="grid gap-3 rounded-xl border border-semantic-border bg-semantic-subtle p-4 sm:grid-cols-3">
          <div><div className="text-caption font-semibold uppercase text-semantic-muted">Assignee</div><div className="mt-1 font-semibold text-semantic-content-alt">{task.assigneeId || 'Unassigned'}</div></div>
          <div><div className="text-caption font-semibold uppercase text-semantic-muted">Due date</div><div className="mt-1 font-semibold text-semantic-content-alt">{display(task.dueDate)}</div></div>
          <div><div className="text-caption font-semibold uppercase text-semantic-muted">Priority</div><div className="mt-1 font-semibold text-semantic-content-alt">{task.businessPriority?.replace(/_/g, ' ') || '—'}</div></div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-semantic-content-alt">Description</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-semantic-jira-muted-stronger">{task.description || 'No description provided.'}</p>
        </div>
        <div>
          <h3 className="text-sm font-bold text-semantic-content-alt">Dependencies</h3>
          {(detail.dependencies || []).length ? (
            <ul className="mt-2 space-y-1 text-xs text-semantic-jira-muted-stronger">
              {detail.dependencies.map((dependency: any) => <li key={dependency.id}>{dependency.type.replace(/_/g, ' ')} · {dependency.sourceTaskId === task.id ? 'Blocks' : 'Blocked by'} a project work item</li>)}
            </ul>
          ) : <p className="mt-2 text-xs text-semantic-muted">No project dependencies recorded.</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select value={dependencyType} onChange={(event) => setDependencyType(event.target.value)} className="wrike-select text-xs"><option value="BLOCKS">Blocks</option><option value="DEPENDS_ON">Depends on</option><option value="REQUIRED_BY">Required by</option><option value="RELATES_TO">Relates to</option><option value="DUPLICATES">Duplicates</option></select>
            <select value={dependencyTargetId} onChange={(event) => setDependencyTargetId(event.target.value)} className="wrike-select min-w-0 flex-1 text-xs"><option value="">Select project work item…</option>{tasks.filter((candidate: Ticket) => candidate.id !== task.id).map((candidate: Ticket) => <option key={candidate.id} value={candidate.id}>{candidate.key} · {candidate.title}</option>)}</select>
            <button type="button" disabled={!dependencyTargetId || saving} onClick={addDependency} className="wrike-btn-secondary px-3 py-2 text-xs disabled:opacity-50">Link</button>
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-semantic-content-alt">Evidence & attachments</h3><label className="cursor-pointer text-xs font-semibold text-semantic-success hover:underline">{saving ? 'Uploading…' : 'Attach evidence'}<input type="file" className="sr-only" disabled={saving} onChange={(event) => { void uploadEvidence(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div>
          {(detail.attachments || []).length ? <ul className="mt-2 space-y-2">{detail.attachments.map((attachment: any) => <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-semantic-border px-3 py-2 text-xs"><span className="min-w-0 truncate font-semibold text-semantic-content-alt">{attachment.fileName}</span><a className="shrink-0 font-semibold text-semantic-success hover:underline" href={`/api/storage/attachments/${encodeURIComponent(attachment.id)}/download`}>Download</a></li>)}</ul> : <p className="mt-2 text-xs text-semantic-muted">No evidence attached to this work item.</p>}
        </div>
        <div className="border-t border-semantic-border pt-5">
          <h3 className="text-sm font-bold text-semantic-content-alt">Discussion</h3>
          <div className="mt-3 space-y-3">
            {(detail.comments || []).map((comment: any) => (
              <article key={comment.id} className="rounded-lg border border-semantic-border bg-white p-3">
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-semantic-content-alt">{comment.authorName}</span><time className="text-semantic-muted">{display(comment.createdAt)}</time></div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-semantic-jira-muted-stronger">{comment.content}</p>
              </article>
            ))}
            {!(detail.comments || []).length && <p className="text-xs text-semantic-muted">No comments yet.</p>}
          </div>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} className="wrike-input mt-4 min-h-[92px] w-full text-sm" placeholder="Add a project-scoped comment…" />
          {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
          <div className="mt-2 flex justify-end"><button type="button" onClick={addComment} disabled={!content.trim() || saving} className="wrike-btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Posting…' : 'Post comment'}</button></div>
        </div>
        <div className="border-t border-semantic-border pt-5">
          <h3 className="text-sm font-bold text-semantic-content-alt">Work item history</h3>
          {(detail.activity || []).length ? <ul className="mt-2 space-y-1 text-xs text-semantic-jira-muted-stronger">{detail.activity.map((event: any) => <li key={event.id}>{event.action.replace(/_/g, ' ')} · {display(event.createdAt)}</li>)}</ul> : <p className="mt-2 text-xs text-semantic-muted">No task-specific project activity recorded.</p>}
        </div>
      </div>
    </Modal>
  );
};

const Kanban: React.FC<any> = ({ data, allUsers = [], patch, onRefresh }) => {
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);

  return (
    <div className="grid min-w-[1100px] grid-cols-6 gap-3 overflow-auto">
      {['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'].map((status) => {
        const tasks = (data.tasks || []).filter((task: Ticket) => (task.projectTaskStatus || 'TO_DO') === status);
        return (
          <section className="rounded-xl border border-semantic-border bg-semantic-subtle" key={status}>
            <div className="flex items-center justify-between border-b border-semantic-border px-3 py-3 text-xs font-bold text-semantic-content-alt">
              <span>{status.replace('_', ' ')}</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-caption text-slate-700">{tasks.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {tasks.map((task: Ticket) => {
                const assignee = userMap.get(task.assigneeId || '');
                const assigneeName = assignee?.fullName || task.assigneeId || 'Unassigned';

                return (
                  <article key={task.id} className="rounded-lg border border-semantic-border bg-white p-3 shadow-sm">
                    <div className="font-mono text-caption font-bold text-semantic-info">{task.key}</div>
                    <div className="mt-1 text-xs font-semibold text-semantic-content-alt">{task.title}</div>
                    <div className="mt-3 flex items-center justify-between text-caption text-semantic-muted">
                      <span className="truncate max-w-[100px]">{assigneeName}</span>
                      <span className={task.blockedReason ? 'text-rose-600 font-semibold' : ''}>
                        {task.blockedReason ? 'Blocked' : display(task.dueDate)}
                      </span>
                    </div>
                    <select
                      value={status}
                      onChange={async (event) => {
                        await patch(`/api/projects/${data.project.id}/tasks/${task.id}`, {
                          status: event.target.value,
                          expectedVersion: task.version,
                          blockedReason: event.target.value === 'BLOCKED' ? task.blockedReason || 'Blocker requires review' : undefined,
                        });
                        await onRefresh();
                      }}
                      className="mt-2 w-full border-0 bg-transparent text-caption font-semibold text-semantic-success focus:ring-0"
                    >
                      <option value="BACKLOG">BACKLOG</option>
                      <option value="TO_DO">TO_DO</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="IN_REVIEW">IN_REVIEW</option>
                      <option value="BLOCKED">BLOCKED</option>
                      <option value="DONE">DONE</option>
                    </select>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const Timeline: React.FC<any> = ({ data }) => (
  <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
    <SectionTitle title="Project timeline" />
    <div className="divide-y divide-semantic-border-subtle">
      {[
        ...data.milestones.map((m: ProjectMilestone) => ({ type: 'Milestone', title: m.name, date: m.targetDate, state: m.status })),
        ...data.tasks.map((t: Ticket) => ({
          type: t.parentTicketId ? 'Subtask' : 'Task',
          title: `${t.key} ${t.title}`,
          date: t.dueDate,
          state: t.projectTaskStatus,
        })),
      ]
        .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
        .map((item: any, index: number) => (
          <div className="grid grid-cols-[90px_20px_1fr] gap-3 px-5 py-3" key={`${item.type}-${index}`}>
            <div className="text-xs text-semantic-muted">{display(item.date)}</div>
            <div className="mt-1.5 h-2 w-2 rounded-full bg-semantic-info" />
            <div>
              <div className="text-sm font-semibold text-semantic-content-alt">{item.title}</div>
              <div className="text-caption uppercase tracking-wide text-semantic-muted">
                {item.type} · {String(item.state || '').replace('_', ' ')}
              </div>
            </div>
          </div>
        ))}
    </div>
  </section>
);

const Capacity: React.FC<any> = ({ data, allUsers = [] }) => {
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);

  const rows: any[] = Object.values(
    (data.tasks || []).reduce((acc: Record<string, { user: string; tasks: Ticket[]; estimate: number; actual: number; overdue: number }>, task: Ticket) => {
      const user = task.assigneeId || 'Unassigned';
      const entry = (acc[user] ||= { user, tasks: [], estimate: 0, actual: 0, overdue: 0 });
      entry.tasks.push(task);
      entry.estimate += task.estimatedHours || 0;
      entry.actual += task.actualHours || 0;
      if (task.statusCategory !== 'DONE' && new Date(task.dueDate).getTime() < Date.now()) entry.overdue += 1;
      return acc;
    }, {})
  );

  return (
    <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
      <SectionTitle title="Capacity & workload" />
      <div className="overflow-auto">
        <table className="wrike-table">
          <thead>
            <tr>
              <th>Member / Assignee</th>
              <th>Assigned tasks</th>
              <th>Estimated hours</th>
              <th>Completed hours</th>
              <th>Overdue</th>
              <th>Utilization</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => {
              const u = userMap.get(row.user);
              const displayName = u?.fullName || row.user;
              const title = u?.title ? ` (${u.title})` : '';

              return (
                <tr key={row.user}>
                  <td className="font-semibold">
                    {displayName}
                    <span className="text-xs text-semantic-muted font-normal">{title}</span>
                  </td>
                  <td>{row.tasks.length}</td>
                  <td>{row.estimate ? `${row.estimate}h` : <span className="text-semantic-jira-icon">Missing estimates</span>}</td>
                  <td>{row.actual ? `${row.actual}h` : '—'}</td>
                  <td className={row.overdue ? 'font-bold text-rose-600' : ''}>{row.overdue}</td>
                  <td>
                    {row.estimate ? (
                      <>
                        <div className="h-1.5 w-28 overflow-hidden rounded bg-slate-100">
                          <div
                            className={`h-full ${row.estimate > 40 ? 'bg-rose-500' : 'bg-semantic-brand'}`}
                            style={{ width: `${Math.min(100, (row.estimate / 40) * 100)}%` }}
                          />
                        </div>
                        <span className="text-caption text-semantic-muted">{row.estimate}h / 40h</span>
                      </>
                    ) : (
                      <span className="text-xs text-semantic-jira-icon">Insufficient data</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const Files: React.FC = () => (
  <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
    <SectionTitle title="Project files" />
    <ProjectEmpty icon={<FileText />} title="No project files yet" text="Files attached to project tasks remain in the task evidence record." />
  </section>
);

const Activity: React.FC<any> = ({ data, allUsers = [] }) => {
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);

  return (
    <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
      <SectionTitle title="Project activity" />
      <div className="divide-y divide-semantic-border-subtle">
        {data.activity?.length ? (
          data.activity.map((event: any) => {
            const actor = userMap.get(event.actorId);
            const actorName = actor?.fullName || event.actorId;

            return (
              <div key={event.id} className="flex gap-3 px-5 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-caption font-bold text-semantic-jira-muted-stronger">
                  {avatar(actorName)}
                </span>
                <div>
                  <div className="text-sm text-semantic-content-alt">
                    <b>{actorName}</b> {event.action.replace(/_/g, ' ').toLowerCase()}
                  </div>
                  <div className="mt-1 text-label text-semantic-muted">
                    {new Date(event.createdAt).toLocaleString('az-AZ')} · {event.objectType}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <ProjectEmpty icon={<Clock3 />} title="No activity yet" text="Meaningful project actions will be captured here." />
        )}
      </div>
    </section>
  );
};

// ==========================================
// ENTERPRISE PROJECT ACCESS MANAGEMENT TAB
// ==========================================
const Access: React.FC<{
  data: ProjectPayload;
  allUsers: BankUser[];
  departments: BankDepartment[];
  ldapGroups: LDAPGroupInfo[];
  teams: any[];
  currentUserId?: string;
  canManage?: boolean;
  onMember: () => void;
  onRefresh: () => Promise<void>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}> = ({
  data,
  allUsers = [],
  departments = [],
  ldapGroups = [],
  teams = [],
  canManage = false,
  onMember,
  onRefresh,
  fetchWithAuth,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'USER' | 'DEPARTMENT' | 'GROUP' | 'TEAM'>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<ProjectMember | null>(null);
  const [actionError, setActionError] = useState('');

  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);
  const deptMap = useMemo(() => new Map<string, BankDepartment>(departments.map((d: BankDepartment) => [d.id, d])), [departments]);
  const groupMap = useMemo(() => new Map<string, LDAPGroupInfo>(ldapGroups.map((g: LDAPGroupInfo) => [g.name.toLowerCase(), g])), [ldapGroups]);
  const teamMap = useMemo(() => new Map<string, any>(teams.map((t: any) => [t.id, t])), [teams]);

  // Resolve rich LDAP entity attributes for display
  const resolveMemberDetails = (member: ProjectMember) => {
    if (member.subjectType === 'USER') {
      const u = userMap.get(member.subjectId);
      const dept = u ? deptMap.get(u.departmentId) : undefined;
      return {
        id: member.id,
        name: u?.fullName || member.subjectId,
        username: u?.sAMAccountName || u?.username || member.subjectId,
        title: u?.title || 'Bank Specialist',
        department: dept?.name || u?.departmentId || 'Bank Division',
        email: u?.email || '—',
        isAd: u?.directorySource === 'ACTIVE_DIRECTORY' || Boolean(u?.sAMAccountName),
        typeBadge: 'USER',
        typeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        initials: avatar(u?.fullName || u?.username || member.subjectId),
      };
    }
    if (member.subjectType === 'DEPARTMENT') {
      const d = deptMap.get(member.subjectId) || departments.find((dept) => dept.code === member.subjectId);
      return {
        id: member.id,
        name: d?.name || member.subjectId,
        username: d?.code || 'DEPT',
        title: `Department Scope (${d?.memberCount || 0} employees)`,
        department: 'Organizational Unit',
        email: 'Inherited Access',
        isAd: true,
        typeBadge: 'DEPARTMENT',
        typeColor: 'bg-purple-50 text-purple-800 border-purple-200',
        initials: 'DP',
      };
    }
    if (member.subjectType === 'GROUP') {
      const g = groupMap.get(member.subjectId.toLowerCase());
      return {
        id: member.id,
        name: member.subjectId,
        username: 'LDAP Group',
        title: g?.description || 'Active Directory Security / Distribution Group',
        department: g?.type === 'SECURITY_DISTRIBUTION_GROUP' ? 'Security & Distribution' : 'Distribution Group',
        email: `${g?.memberCount || 1} members`,
        isAd: true,
        typeBadge: 'GROUP',
        typeColor: 'bg-amber-50 text-amber-800 border-amber-200',
        initials: 'SG',
      };
    }
    if (member.subjectType === 'TEAM') {
      const t = teamMap.get(member.subjectId);
      return {
        id: member.id,
        name: t?.name || member.subjectId.replace(/^team-/, '').replace(/-/g, ' ').toUpperCase(),
        username: t?.code || 'SQUAD',
        title: t?.description || 'Functional Operations Squad',
        department: 'Team Unit',
        email: 'Cross-functional',
        isAd: false,
        typeBadge: 'TEAM',
        typeColor: 'bg-blue-50 text-blue-800 border-blue-200',
        initials: 'TM',
      };
    }
    return {
      id: member.id,
      name: member.subjectId,
      username: member.subjectId,
      title: member.subjectType,
      department: 'Custom Entity',
      email: '—',
      isAd: false,
      typeBadge: member.subjectType,
      typeColor: 'bg-slate-50 text-slate-800 border-slate-200',
      initials: '?',
    };
  };

  const membersWithDetails = useMemo(() => {
    return (data.members || []).map((member) => ({
      member,
      details: resolveMemberDetails(member),
    }));
  }, [data.members, userMap, deptMap, groupMap, teamMap]);

  // Filtering
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return membersWithDetails.filter(({ member, details }) => {
      const matchesType = typeFilter === 'ALL' || member.subjectType === typeFilter;
      const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
      const matchesQuery =
        !q ||
        details.name.toLowerCase().includes(q) ||
        details.username.toLowerCase().includes(q) ||
        details.title.toLowerCase().includes(q) ||
        details.department.toLowerCase().includes(q) ||
        details.email.toLowerCase().includes(q);
      return matchesType && matchesRole && matchesQuery;
    });
  }, [membersWithDetails, search, typeFilter, roleFilter]);

  // Role modification
  const handleRoleChange = async (member: ProjectMember, newRole: string) => {
    try {
      setBusyMemberId(member.id);
      setActionError('');
      const res = await fetchWithAuth(`/api/projects/${data.project.id}/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const resData = await res.json();
      if (!resData.success) throw new Error(resData.error || 'Failed to update member role.');
      await onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update role.');
    } finally {
      setBusyMemberId(null);
    }
  };

  // Member removal
  const handleRemoveMember = async (member: ProjectMember) => {
    try {
      setBusyMemberId(member.id);
      setActionError('');
      const res = await fetchWithAuth(`/api/projects/${data.project.id}/members/${member.id}`, {
        method: 'DELETE',
      });
      const resData = await res.json();
      if (!resData.success) throw new Error(resData.error || 'Failed to remove member.');
      setRemoveCandidate(null);
      await onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove member.');
    } finally {
      setBusyMemberId(null);
    }
  };

  // Stats
  const directUsersCount = membersWithDetails.filter((m) => m.member.subjectType === 'USER').length;
  const groupsCount = membersWithDetails.filter((m) => ['GROUP', 'DEPARTMENT', 'TEAM'].includes(m.member.subjectType)).length;
  const managersCount = membersWithDetails.filter((m) => ['OWNER', 'PROJECT_MANAGER'].includes(m.member.role)).length;

  return (
    <div className="space-y-5">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-semantic-border bg-white p-4 shadow-sm">
          <div className="text-label font-bold uppercase tracking-wider text-semantic-muted">Total Access Subjects</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-2xl font-bold text-semantic-primary">{membersWithDetails.length}</span>
            <Users className="w-5 h-5 text-semantic-success" />
          </div>
        </div>

        <div className="rounded-xl border border-semantic-border bg-white p-4 shadow-sm">
          <div className="text-label font-bold uppercase tracking-wider text-semantic-muted">Direct LDAP Users</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-2xl font-bold text-semantic-primary">{directUsersCount}</span>
            <UserCheck className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="rounded-xl border border-semantic-border bg-white p-4 shadow-sm">
          <div className="text-label font-bold uppercase tracking-wider text-semantic-muted">Depts &amp; Groups</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-2xl font-bold text-semantic-primary">{groupsCount}</span>
            <ShieldCheck className="w-5 h-5 text-amber-600" />
          </div>
        </div>

        <div className="rounded-xl border border-semantic-border bg-white p-4 shadow-sm">
          <div className="text-label font-bold uppercase tracking-wider text-semantic-muted">Project Governance</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-2xl font-bold text-semantic-primary">{managersCount}</span>
            <LockKeyhole className="w-5 h-5 text-blue-600" />
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Access Table Card */}
      <section className="overflow-hidden rounded-xl border border-semantic-border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-semantic-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-semantic-primary flex items-center gap-2">
              <Shield className="w-4 h-4 text-semantic-success" /> Project Access &amp; Active Directory Members
            </h2>
            <p className="text-xs text-semantic-muted mt-0.5">
              Granular project permission boundary enforced by backend Active Directory identity &amp; RBAC rules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onMember} className="wrike-btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" /> Add project member
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3 border-b border-semantic-border-subtle bg-semantic-subtle p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1">
            {[
              ['ALL', 'All Subjects'],
              ['USER', 'Users (LDAP)'],
              ['DEPARTMENT', 'Departments'],
              ['GROUP', 'Security Groups'],
              ['TEAM', 'Teams'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTypeFilter(val as any)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  typeFilter === val ? 'bg-semantic-primary text-white shadow-sm' : 'text-semantic-jira-muted-stronger hover:bg-slate-200/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="wrike-select py-1.5 text-xs min-w-dsFilter"
            >
              <option value="ALL">All Roles</option>
              <option value="OWNER">Owner</option>
              <option value="PROJECT_MANAGER">Project Manager</option>
              <option value="CONTRIBUTOR">Contributor</option>
              <option value="VIEWER">Viewer</option>
              <option value="RESTRICTED_CONTRIBUTOR">Restricted</option>
            </select>

            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-semantic-jira-icon" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, email, title..."
                className="wrike-input py-1.5 pl-8 pr-7 text-xs w-full sm:w-[220px]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Member Table */}
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="wrike-table min-w-[900px]">
              <thead>
                <tr>
                  <th className="min-w-[260px]">Access Subject</th>
                  <th className="min-w-[200px]">LDAP Organization / Scope</th>
                  <th className="min-w-[180px]">Project Role</th>
                  <th className="min-w-[140px]">Added Date</th>
                  {canManage && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ member, details }) => {
                  const isBusy = busyMemberId === member.id;

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Subject Name & Info */}
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-semantic-success-surface text-xs font-bold text-semantic-success border border-semantic-success-border">
                              {details.initials}
                            </span>
                            {details.isAd && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-micro font-bold text-white border-2 border-white"
                                title="Active Directory Account"
                              >
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-semantic-primary">{details.name}</span>
                              <span className={`rounded px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider border ${details.typeColor}`}>
                                {details.typeBadge}
                              </span>
                            </div>
                            <div className="text-xs text-semantic-muted truncate mt-0.5">{details.title}</div>
                          </div>
                        </div>
                      </td>

                      {/* LDAP Organization / Email */}
                      <td>
                        <div className="text-xs">
                          <div className="font-medium text-semantic-content-alt flex items-center gap-1.5">
                            {details.isAd && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            <span className="truncate">{details.department}</span>
                          </div>
                          <div className="text-semantic-jira-icon text-label font-mono truncate mt-0.5">{details.email}</div>
                        </div>
                      </td>

                      {/* Project Role */}
                      <td>
                        {canManage ? (
                          <div className="relative max-w-dsTruncateWide">
                            <select
                              disabled={isBusy}
                              value={member.role}
                              onChange={(e) => handleRoleChange(member, e.target.value)}
                              className={`wrike-select py-1.5 text-xs w-full font-semibold ${
                                member.role === 'OWNER'
                                  ? 'text-purple-700 bg-purple-50/50 border-purple-200'
                                  : member.role === 'PROJECT_MANAGER'
                                  ? 'text-blue-700 bg-blue-50/50 border-blue-200'
                                  : member.role === 'CONTRIBUTOR'
                                  ? 'text-emerald-700 bg-emerald-50/50 border-emerald-200'
                                  : 'text-slate-700'
                              }`}
                            >
                              <option value="OWNER">Owner (Full Control)</option>
                              <option value="PROJECT_MANAGER">Project Manager</option>
                              <option value="CONTRIBUTOR">Contributor</option>
                              <option value="VIEWER">Viewer (Read-only)</option>
                              <option value="RESTRICTED_CONTRIBUTOR">Restricted Contributor</option>
                            </select>
                            {isBusy && (
                              <Loader2 className="absolute right-7 top-2.5 w-3.5 h-3.5 animate-spin text-semantic-success" />
                            )}
                          </div>
                        ) : (
                          <span
                            className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold ${
                              member.role === 'OWNER'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : member.role === 'PROJECT_MANAGER'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : member.role === 'CONTRIBUTOR'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {member.role.replace('_', ' ')}
                          </span>
                        )}
                      </td>

                      {/* Added Date */}
                      <td className="text-xs text-semantic-muted">
                        <div>{display(member.createdAt)}</div>
                        <div className="text-caption text-semantic-jira-icon">By {member.addedByUserId || 'System'}</div>
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="text-right">
                          <button
                            disabled={isBusy}
                            onClick={() => setRemoveCandidate(member)}
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-40"
                            title="Revoke access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-semantic-muted">
            <Users className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="font-semibold text-semantic-primary">No members match the current filter criteria.</p>
            <p className="text-xs mt-1">Try clearing your search query or selecting a different subject type.</p>
            <button
              onClick={() => {
                setSearch('');
                setTypeFilter('ALL');
                setRoleFilter('ALL');
              }}
              className="mt-3 text-xs font-semibold text-semantic-success hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </section>

      {/* Revocation Confirmation Modal */}
      {removeCandidate && (
        <Modal
          isOpen={true}
          onClose={() => setRemoveCandidate(null)}
          title="Revoke Project Access"
          icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
          subtitle="Are you sure you want to remove this subject from project access boundary?"
          maxWidth="md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setRemoveCandidate(null)}
                disabled={Boolean(busyMemberId)}
                className="wrike-btn-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemoveMember(removeCandidate)}
                disabled={Boolean(busyMemberId)}
                className="bg-rose-600 text-white hover:bg-rose-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              >
                {busyMemberId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Revoke access</span>
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-semantic-jira-muted-stronger">
            <p>
              You are about to remove <b>{removeCandidate.subjectId}</b> ({removeCandidate.subjectType}) from this project.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
              The subject will immediately lose their <b>{removeCandidate.role}</b> permissions for this project and its scoped tasks.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Settings: React.FC<any> = ({ project, patch, onRefresh, fetchWithAuth }) => {
  const configuredTypes = project.workItemTypes?.length ? project.workItemTypes : [...PROJECT_WORK_ITEM_TYPES];
  const [workItemTypes, setWorkItemTypes] = useState<string[]>(configuredTypes);
  const [workflowId, setWorkflowId] = useState(project.workflowId || '');
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; version: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWorkItemTypes(project.workItemTypes?.length ? project.workItemTypes : [...PROJECT_WORK_ITEM_TYPES]);
    setWorkflowId(project.workflowId || '');
    setError('');
    setSaved(false);
  }, [project.id, project.workItemTypes]);

  useEffect(() => {
    void fetchWithAuth('/api/projects/workflow-options').then((response: Response) => response.json()).then((result: any) => {
      if (result.success) setWorkflows(result.workflows || []);
    }).catch(() => setWorkflows([]));
  }, [fetchWithAuth]);

  const toggleType = (type: string) => {
    setSaved(false);
    setWorkItemTypes((current) => (current.includes(type) ? current.filter((value) => value !== type) : [...current, type]));
  };

  const save = async () => {
    if (workItemTypes.length === 0) {
      setError('Enable at least one work-item type.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await patch(`/api/projects/${project.id}`, { workItemTypes, workflowId: workflowId || undefined });
      await onRefresh();
      setSaved(true);
    } catch (cause: any) {
      setError(cause.message || 'Unable to save the work-item scheme.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-semantic-border bg-white shadow-sm">
      <SectionTitle title="Project settings" />
      <div className="space-y-6 p-5 text-sm text-semantic-jira-muted-stronger">
        <div className="space-y-3">
          <p>
            Progress weighting: <b className="text-semantic-content-alt">{project.progressWeighting.replace('_', ' ')}</b>
          </p>
          <p>
            Project status: <b className="text-semantic-content-alt">{project.status.replace('_', ' ')}</b>
          </p>
        </div>

        <div className="border-t border-semantic-border pt-5">
          <div className="mb-5 max-w-xl">
            <label className="text-sm font-bold text-semantic-content-alt" htmlFor="project-workflow-scheme">Workflow scheme</label>
            <p className="mt-1 text-xs text-semantic-jira-icon">When selected, work-item transitions are validated by the platform workflow graph and its role rules.</p>
            <select id="project-workflow-scheme" value={workflowId} onChange={(event) => { setWorkflowId(event.target.value); setSaved(false); }} className="wrike-select mt-2 w-full text-sm">
              <option value="">Platform project default</option>
              {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · v{workflow.version}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <h3 className="text-sm font-bold text-semantic-content-alt">Work-item type scheme</h3>
            <p className="mt-1 text-xs text-semantic-jira-icon">Only enabled types can be created in this project. Existing work remains available for audit even if its type is later disabled.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROJECT_WORK_ITEM_TYPES.map((type) => {
              const selected = workItemTypes.includes(type);
              return (
                <label key={type} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${selected ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-semantic-border bg-white text-semantic-jira-muted-stronger hover:border-emerald-200'}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleType(type)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  {type.replace(/_/g, ' ')}
                </label>
              );
            })}
          </div>
          {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
          {saved && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">Work-item type scheme saved.</p>}
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="wrike-btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save type scheme'}
            </button>
          </div>
        </div>

        <p className="text-xs">Archiving preserves project history, ticket links, and LDAP access audit events.</p>
      </div>
    </section>
  );
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, required, hint, icon, children, className = '' }) => (
  <div className={`space-y-1.5 ${className}`}>
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-1.5 text-xs font-bold text-semantic-content-alt">
        {icon && <span className="text-semantic-muted">{icon}</span>}
        <span>{label}</span>
        {required && <span className="text-rose-500 font-bold">*</span>}
      </label>
      {hint && <span className="text-label text-semantic-jira-icon font-normal">{hint}</span>}
    </div>
    {children}
  </div>
);

const FormSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, children, className = '' }) => (
  <div className={`space-y-3.5 ${className}`}>
    <div className="border-b border-semantic-border pb-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-semantic-muted">{title}</h3>
      {description && <p className="text-label text-semantic-jira-icon mt-0.5">{description}</p>}
    </div>
    <div className="grid gap-4 md:grid-cols-2">{children}</div>
  </div>
);

const priorityOptions: SelectOption[] = [
  {
    value: 'CRITICAL',
    label: 'Critical',
    sublabel: 'Urgent attention required',
    badge: 'P1',
    badgeColor: 'bg-rose-100 text-rose-700 border border-rose-200',
    icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
  },
  {
    value: 'HIGH',
    label: 'High',
    sublabel: 'High delivery impact',
    badge: 'P2',
    badgeColor: 'bg-amber-100 text-amber-700 border border-amber-200',
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  },
  {
    value: 'MEDIUM',
    label: 'Medium',
    sublabel: 'Standard business priority',
    badge: 'P3',
    badgeColor: 'bg-blue-100 text-blue-700 border border-blue-200',
    icon: <CircleDot className="w-4 h-4 text-blue-500" />,
  },
  {
    value: 'LOW',
    label: 'Low',
    sublabel: 'Minor / opportunistic work',
    badge: 'P4',
    badgeColor: 'bg-slate-100 text-slate-700 border border-slate-200',
    icon: <CircleDot className="w-4 h-4 text-slate-400" />,
  },
];

const categoryOptions: SelectOption[] = [
  {
    value: 'INFORMATION_SECURITY',
    label: 'Information Security',
    sublabel: 'InfoSec, SOC, GRC & Red Team',
    icon: <Shield className="w-4 h-4 text-semantic-success" />,
  },
  {
    value: 'IT',
    label: 'IT & Infrastructure',
    sublabel: 'Core systems, networks & endpoints',
    icon: <Server className="w-4 h-4 text-blue-600" />,
  },
  {
    value: 'SOFTWARE_DEVELOPMENT',
    label: 'Software Development',
    sublabel: 'Engineering & digital services',
    icon: <Code className="w-4 h-4 text-indigo-600" />,
  },
  {
    value: 'COMPLIANCE',
    label: 'Compliance & Regulatory',
    sublabel: 'Central Bank, ISO, PCI-DSS',
    icon: <FileCheck className="w-4 h-4 text-purple-600" />,
  },
  {
    value: 'OPERATIONS',
    label: 'Business Operations',
    sublabel: 'Banking ops & workflows',
    icon: <ActivityIcon className="w-4 h-4 text-amber-600" />,
  },
  {
    value: 'HR',
    label: 'Human Resources',
    sublabel: 'Talent & organizational security',
    icon: <Users className="w-4 h-4 text-pink-600" />,
  },
  {
    value: 'OTHER',
    label: 'General / Other',
    sublabel: 'Uncategorized project initiative',
    icon: <FolderKanban className="w-4 h-4 text-slate-500" />,
  },
];

const progressWeightingOptions: SelectOption[] = [
  {
    value: 'EQUAL',
    label: 'Equal task weight',
    sublabel: 'Every task contributes equally to progress',
  },
  {
    value: 'STORY_POINTS',
    label: 'Story points',
    sublabel: 'Weighted proportionally by task story points',
  },
  {
    value: 'ESTIMATED_EFFORT',
    label: 'Estimated effort',
    sublabel: 'Weighted by estimated task hours',
  },
  {
    value: 'MANUAL',
    label: 'Manual task weight',
    sublabel: 'Directly specified percentage / milestones',
  },
];

const taskStatusOptions: SelectOption[] = [
  { value: 'BACKLOG', label: 'Backlog', badge: 'BACKLOG', badgeColor: 'bg-slate-100 text-slate-700' },
  { value: 'TO_DO', label: 'To Do', badge: 'TODO', badgeColor: 'bg-blue-50 text-blue-700' },
  { value: 'IN_PROGRESS', label: 'In Progress', badge: 'ACTIVE', badgeColor: 'bg-indigo-50 text-indigo-700' },
  { value: 'IN_REVIEW', label: 'In Review', badge: 'REVIEW', badgeColor: 'bg-amber-50 text-amber-700' },
  { value: 'BLOCKED', label: 'Blocked', badge: 'BLOCKED', badgeColor: 'bg-rose-50 text-rose-700' },
  { value: 'DONE', label: 'Completed', badge: 'DONE', badgeColor: 'bg-emerald-50 text-emerald-700' },
];

const milestoneStatusOptions: SelectOption[] = [
  { value: 'PLANNED', label: 'Planned', badge: 'PLAN', badgeColor: 'bg-blue-50 text-blue-700' },
  { value: 'IN_PROGRESS', label: 'In Progress', badge: 'ACTIVE', badgeColor: 'bg-indigo-50 text-indigo-700' },
  { value: 'COMPLETED', label: 'Completed', badge: 'DONE', badgeColor: 'bg-emerald-50 text-emerald-700' },
  { value: 'DELAYED', label: 'Delayed', badge: 'DELAY', badgeColor: 'bg-rose-50 text-rose-700' },
];

const subjectTypeOptions: SelectOption[] = [
  { value: 'USER', label: 'User (Active Directory Employee)', icon: <Users className="w-4 h-4 text-emerald-600" /> },
  { value: 'DEPARTMENT', label: 'Department / Unit', icon: <Building2 className="w-4 h-4 text-purple-600" /> },
  { value: 'GROUP', label: 'Active Directory Security / Distribution Group', icon: <Shield className="w-4 h-4 text-amber-600" /> },
  { value: 'TEAM', label: 'Team Squad', icon: <FolderKanban className="w-4 h-4 text-blue-600" /> },
];

const memberRoleOptions: SelectOption[] = [
  { value: 'OWNER', label: 'Owner (Full Control)', sublabel: 'Project lifecycle, governance & settings' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager', sublabel: 'Delivery orchestration, tasks & milestones' },
  { value: 'CONTRIBUTOR', label: 'Contributor', sublabel: 'Task creation, progress updates & evidence' },
  { value: 'VIEWER', label: 'Viewer', sublabel: 'Read-only visibility into deliverables' },
  { value: 'RESTRICTED_CONTRIBUTOR', label: 'Restricted Contributor', sublabel: 'Limited assignment scope' },
];

// ==========================================
// PROJECT CREATION FORM
// ==========================================
const ProjectForm: React.FC<{
  allUsers: BankUser[];
  departments: BankDepartment[];
  currentUser?: BankUser | null;
  onClose: () => void;
  onCreate: (body: any) => Promise<void>;
}> = ({ allUsers = [], departments = [], currentUser, onClose, onCreate }) => {
  const [form, setForm] = useState<any>({
    name: '',
    key: '',
    description: '',
    departmentId: currentUser?.departmentId || '',
    sectionId: currentUser?.sectionId || '',
    ownerId: currentUser?.id || '',
    managerId: currentUser?.id || '',
    startDate: '',
    targetDate: '',
    priority: 'MEDIUM',
    businessCriticality: 'MEDIUM',
    category: 'INFORMATION_SECURITY',
    progressWeighting: 'EQUAL',
    workItemTypes: ['TASK', 'SUBTASK'],
    tags: '',
  });
  const [userEditedKey, setUserEditedKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));

  const handleNameChange = (name: string) => {
    setForm((current: any) => {
      const next = { ...current, name };
      if (!userEditedKey) {
        const words = name.trim().split(/\s+/).filter(Boolean);
        let derivedKey = '';
        if (words.length >= 2) {
          derivedKey = words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
        } else if (name.length >= 3) {
          derivedKey = name.slice(0, 4).toUpperCase();
        }
        if (derivedKey) next.key = derivedKey;
      }
      return next;
    });
  };

  // Department options from /api/departments (Apex Bank GRC | Admin Departments Hub)
  const departmentOptions: SelectOption[] = useMemo(() => {
    const emptyOption: SelectOption = { value: '', label: 'Departament seçin...' };
    const depts = departments
      .filter((d: BankDepartment) => d.isActive !== false)
      .map((d: BankDepartment) => ({
        value: d.id,
        label: d.name,
        icon: <Building2 className="w-4 h-4 text-purple-600" />,
      }));
    return [emptyOption, ...depts];
  }, [departments]);

  // Section options (Şöbə / Bölmə) dynamically filtered by chosen department
  const sectionOptions: SelectOption[] = useMemo(() => {
    const activeDepts = departments.filter((d: BankDepartment) => d.isActive !== false);
    const targetDepts = form.departmentId
      ? activeDepts.filter((d: BankDepartment) => d.id === form.departmentId)
      : activeDepts;

    const sectionsList: SelectOption[] = [
      { value: '', label: form.departmentId ? 'Bütün departament üzrə (Şöbə seçilməyib)' : 'Şöbə / Bölmə seçin (istəyə bağlı)...' }
    ];

    for (const dept of targetDepts) {
      const sections = (dept.sections || []).filter((s: any) => s.isActive !== false);

      for (const sec of sections) {
        sectionsList.push({
          value: sec.id,
          label: sec.name,
          icon: <Layers className="w-4 h-4 text-indigo-600" />,
        });
      }
    }

    return sectionsList;
  }, [departments, form.departmentId]);

  // Employee options for Project Owner and Project Manager
  const userOptions: SelectOption[] = useMemo(() => {
    return allUsers
      .filter((u: BankUser) => u.isActive !== false)
      .map((u: BankUser) => ({
        value: u.id,
        label: u.fullName || u.username,
        icon: (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-semantic-success-surface text-caption font-bold text-semantic-success border border-semantic-success-border">
            {avatar(u.fullName || u.username)}
          </span>
        ),
      }));
  }, [allUsers]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Create Project"
      icon={<FolderKanban className="w-5 h-5 text-semantic-success" />}
      subtitle="Define project metadata, delivery schedule, risk classification, and progress weighting model."
      maxWidth="2xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="wrike-btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="project-creation-form"
            disabled={busy || !form.name.trim() || !form.key.trim()}
            className="wrike-btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Create project</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form
        id="project-creation-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onCreate({
              ...form,
              tags: String(form.tags || '')
                .split(',')
                .map((tag: string) => tag.trim())
                .filter(Boolean),
            });
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-6"
      >
        <FormSection title="Project Details" description="Core naming and delivery objective">
          <Field label="Project name" required>
            <input
              autoFocus
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="wrike-input w-full text-sm"
              placeholder="e.g. DLP Modernization & Endpoint Rollout"
            />
          </Field>

          <Field label="Project key / short code" required hint="Used as ticket prefix (e.g. DLP-1)">
            <input
              required
              value={form.key}
              onChange={(e) => {
                setUserEditedKey(true);
                set('key', e.target.value.toUpperCase());
              }}
              className="wrike-input w-full font-mono text-sm uppercase tracking-wider font-semibold"
              placeholder="DLP"
              maxLength={8}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Description / objective">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className="wrike-input min-h-[85px] w-full text-sm resize-y"
                placeholder="What this project will achieve, deliverables, scope boundaries, and business goals..."
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Ownership & Department" description="Active Directory organizational routing">
          <Field label="Department" hint="Primary organizational unit">
            <CustomSelect
              value={form.departmentId}
              onChange={(value) => {
                setForm((current: any) => {
                  let nextSectionId = current.sectionId;
                  if (value && nextSectionId) {
                    const currentDept = departments.find((d) => d.id === value);
                    const hasSection = (currentDept?.sections || []).some((s: any) => s.id === nextSectionId);
                    if (!hasSection) nextSectionId = '';
                  }
                  return { ...current, departmentId: value, sectionId: nextSectionId };
                });
              }}
              options={departmentOptions}
              placeholder="Departament seçin..."
              searchPlaceholder="Departament adı ilə axtarın..."
              searchable
            />
          </Field>

          <Field label="Section / Unit" hint="Specific department section or sub-unit">
            <CustomSelect
              value={form.sectionId || ''}
              onChange={(value) => {
                setForm((current: any) => {
                  let nextDeptId = current.departmentId;
                  if (value) {
                    for (const dept of departments) {
                      const sec = (dept.sections || []).find((s: any) => s.id === value);
                      if (sec) {
                        nextDeptId = dept.id;
                        break;
                      }
                    }
                  }
                  return { ...current, sectionId: value, departmentId: nextDeptId };
                });
              }}
              options={sectionOptions}
              placeholder="Şöbə / Bölmə seçin (istəyə bağlı)..."
              searchPlaceholder="Şöbə adı ilə axtarın..."
              searchable
            />
          </Field>

          <Field label="Project Owner" required hint="Accountable project owner">
            <CustomSelect
              value={form.ownerId}
              onChange={(value) => set('ownerId', value)}
              options={userOptions}
              placeholder="Layihə sahibini seçin..."
              searchPlaceholder="Ad ilə axtarın..."
              searchable
            />
          </Field>

          <Field label="Project Manager" hint="Operational delivery lead">
            <CustomSelect
              value={form.managerId}
              onChange={(value) => set('managerId', value)}
              options={userOptions}
              placeholder="Layihə menecerini seçin..."
              searchPlaceholder="Ad ilə axtarın..."
              searchable
            />
          </Field>
        </FormSection>

        <FormSection title="Schedule & Timeline" description="Target baseline for delivery commitments">
          <Field label="Start date">
            <AccessibleDatePicker
              value={form.startDate || ''}
              onChange={(val) => set('startDate', val)}
              placeholder="Select start date..."
            />
          </Field>

          <Field label="Target completion">
            <AccessibleDatePicker
              value={form.targetDate || ''}
              onChange={(val) => set('targetDate', val)}
              placeholder="Select target date..."
            />
          </Field>
        </FormSection>

        <FormSection title="Governance & Classification" description="Priority weighting, category, and progress model">
          <Field label="Priority" required>
            <CustomSelect
              value={form.priority}
              onChange={(value) => set('priority', value)}
              options={priorityOptions}
              searchable={false}
            />
          </Field>

          <Field label="Category" required>
            <CustomSelect
              value={form.category}
              onChange={(value) => set('category', value)}
              options={categoryOptions}
              searchable={false}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Enabled work-item types" hint="Only these types can be created in this project.">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-semantic-border-subtle bg-semantic-subtle p-3 sm:grid-cols-3">
                {PROJECT_WORK_ITEM_TYPES.map((type) => {
                  const selected = form.workItemTypes.includes(type);
                  return (
                    <label key={type} className="flex cursor-pointer items-center gap-2 text-xs font-medium text-semantic-content-alt">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => set('workItemTypes', selected ? form.workItemTypes.filter((value: string) => value !== type) : [...form.workItemTypes, type])}
                        className="h-3.5 w-3.5 rounded border-semantic-border text-semantic-success focus:ring-semantic-success"
                      />
                      {type.replace(/_/g, ' ')}
                    </label>
                  );
                })}
              </div>
            </Field>
          </div>

          <Field label="Tags" hint="Comma-separated labels">
            <div className="relative">
              <input
                value={form.tags || ''}
                onChange={(e) => set('tags', e.target.value)}
                className="wrike-input w-full pl-9 pr-3 text-sm"
                placeholder="DLP, compliance, q3-goal"
              />
              <TagIcon className="w-4 h-4 text-semantic-jira-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </Field>

          <Field label="Progress weighting" required hint="Calculation method">
            <CustomSelect
              value={form.progressWeighting}
              onChange={(value) => set('progressWeighting', value)}
              options={progressWeightingOptions}
              searchable={false}
            />
          </Field>
        </FormSection>
      </form>
    </Modal>
  );
};

// ==========================================
// TASK CREATION FORM
// ==========================================
const TaskForm: React.FC<{
  project: Project;
  milestones: ProjectMilestone[];
  tasks: Ticket[];
  members: ProjectMember[];
  allUsers: BankUser[];
  departments?: BankDepartment[];
  onClose: () => void;
  onCreate: (body: any) => Promise<void>;
}> = ({ project, milestones, tasks, allUsers = [], departments = [], onClose, onCreate }) => {
  const [form, setForm] = useState<any>({
    title: '',
    projectWorkItemType: 'TASK',
    description: '',
    status: 'TO_DO',
    dueDate: project.targetDate || '',
    businessPriority: project.priority === 'CRITICAL' ? 'P1_URGENT' : project.priority === 'HIGH' ? 'P2_HIGH' : 'P3_MEDIUM',
    milestoneId: '',
    parentTicketId: '',
    assigneeId: '',
    estimatedHours: '',
    storyPoints: '',
    tags: '',
    blockedReason: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));

  const deptMap = useMemo(() => new Map<string, BankDepartment>(departments.map((d: BankDepartment) => [d.id, d])), [departments]);

  const assigneeOptions: SelectOption[] = useMemo(() => {
    const unassignedOption: SelectOption = {
      value: '',
      label: 'Unassigned',
      sublabel: 'No direct assignee assigned',
      icon: <UserX className="w-4 h-4 text-slate-400" />,
    };

    const userOpts: SelectOption[] = allUsers.map((u: BankUser) => {
      const dept = deptMap.get(u.departmentId);
      return {
        value: u.id,
        label: u.fullName || u.username,
        sublabel: `${u.title || 'Specialist'} · ${dept?.name || u.departmentId} (@${u.sAMAccountName || u.username})`,
        badge: u.directorySource === 'ACTIVE_DIRECTORY' ? 'AD' : undefined,
        badgeColor: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
        icon: (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-semantic-success-surface text-label font-bold text-semantic-success border border-semantic-success-border">
            {avatar(u.fullName || u.username)}
          </span>
        ),
      };
    });

    return [unassignedOption, ...userOpts];
  }, [allUsers, deptMap]);

  const milestoneSelectOptions: SelectOption[] = [
    { value: '', label: 'No milestone' },
    ...milestones.map((m: ProjectMilestone) => ({
      value: m.id,
      label: m.name,
      sublabel: m.targetDate ? `Target ${display(m.targetDate)}` : undefined,
      icon: <CalendarDays className="w-4 h-4 text-semantic-info" />,
    })),
  ];

  const parentTaskOptions: SelectOption[] = [
    { value: '', label: 'Top-level task' },
    ...tasks
      .filter((t: Ticket) => !t.parentTicketId)
      .map((t: Ticket) => ({
        value: t.id,
        label: `${t.key} · ${t.title}`,
        icon: <ListChecks className="w-4 h-4 text-semantic-info" />,
      })),
  ];

  const prioritySelectOptions: SelectOption[] = [
    { value: 'P1_URGENT', label: 'P1 - Urgent / Critical', badge: 'P1', badgeColor: 'bg-rose-100 text-rose-700' },
    { value: 'P2_HIGH', label: 'P2 - High', badge: 'P2', badgeColor: 'bg-amber-100 text-amber-700' },
    { value: 'P3_MEDIUM', label: 'P3 - Medium', badge: 'P3', badgeColor: 'bg-blue-100 text-blue-700' },
    { value: 'P4_LOW', label: 'P4 - Low', badge: 'P4', badgeColor: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Create task in ${project.key}`}
      icon={<Plus className="w-5 h-5 text-semantic-success" />}
      subtitle={`Add a tracked deliverable or action item to ${project.name}.`}
      maxWidth="2xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="wrike-btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="task-creation-form"
            disabled={busy || !form.title.trim()}
            className="wrike-btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Create task</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form
        id="task-creation-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onCreate({
              ...form,
              milestoneId: form.milestoneId || undefined,
              parentTicketId: form.parentTicketId || undefined,
              assigneeId: form.assigneeId || undefined,
              estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
              storyPoints: form.storyPoints ? Number(form.storyPoints) : undefined,
              tags: String(form.tags || '')
                .split(',')
                .map((tag: string) => tag.trim())
                .filter(Boolean),
            });
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-6"
      >
        <FormSection title="Task Overview">
          <Field label="Work item type" required>
            <CustomSelect
              value={form.projectWorkItemType}
              onChange={(value) => set('projectWorkItemType', value)}
              options={(project.workItemTypes?.length ? project.workItemTypes : [...PROJECT_WORK_ITEM_TYPES]).map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
              searchable={false}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Task summary" required>
              <input
                autoFocus
                required
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className="wrike-input w-full text-sm"
                placeholder="e.g. Implement Office add-in security policy"
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Detailed description">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className="wrike-input min-h-[75px] w-full text-sm resize-y"
                placeholder="Specific acceptance criteria, scope, and technical context..."
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Structure & Hierarchy">
          <Field label="Milestone / epic">
            <CustomSelect
              value={form.milestoneId || ''}
              onChange={(value) => set('milestoneId', value)}
              options={milestoneSelectOptions}
              searchable={milestones.length > 5}
            />
          </Field>

          <Field label="Parent task (optional subtask)">
            <CustomSelect
              value={form.parentTicketId || ''}
              onChange={(value) => setForm((current: any) => ({ ...current, parentTicketId: value, projectWorkItemType: value ? 'SUBTASK' : current.projectWorkItemType === 'SUBTASK' ? 'TASK' : current.projectWorkItemType }))}
              options={parentTaskOptions}
              searchable={tasks.length > 5}
            />
          </Field>
        </FormSection>

        <FormSection title="Planning & Ownership">
          <Field label="Status" required>
            <CustomSelect
              value={form.status}
              onChange={(value) => set('status', value)}
              options={taskStatusOptions}
              searchable={false}
            />
          </Field>

          <Field label="Priority" required>
            <CustomSelect
              value={form.businessPriority}
              onChange={(value) => set('businessPriority', value)}
              options={prioritySelectOptions}
              searchable={false}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Assignee (Active Directory)" hint="Select from domain employees">
              <CustomSelect
                value={form.assigneeId || ''}
                onChange={(value) => set('assigneeId', value)}
                options={assigneeOptions}
                placeholder="İcraçı təyin edin..."
                searchPlaceholder="Ad, vəzifə və ya sAMAccountName axtarın..."
                searchable
              />
            </Field>
          </div>

          <Field label="Due date" required>
            <AccessibleDatePicker
              value={form.dueDate}
              onChange={(val) => set('dueDate', val)}
              placeholder="Select due date..."
            />
          </Field>

          <Field label="Estimated effort (hours)">
            <input
              type="number"
              min="0"
              value={form.estimatedHours || ''}
              onChange={(e) => set('estimatedHours', e.target.value)}
              className="wrike-input w-full text-sm"
              placeholder="e.g. 8"
            />
          </Field>

          <Field label="Story points / weight">
            <input
              type="number"
              min="0"
              value={form.storyPoints || ''}
              onChange={(e) => set('storyPoints', e.target.value)}
              className="wrike-input w-full text-sm"
              placeholder="e.g. 5"
            />
          </Field>

          {form.status === 'BLOCKED' && (
            <div className="md:col-span-2">
              <Field label="Blocking reason" required>
                <input
                  required
                  value={form.blockedReason || ''}
                  onChange={(e) => set('blockedReason', e.target.value)}
                  className="wrike-input w-full border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 text-sm"
                  placeholder="e.g. Blocked by DLP-17 — architectural approval pending"
                />
              </Field>
            </div>
          )}
        </FormSection>
      </form>
    </Modal>
  );
};

// ==========================================
// MILESTONE CREATION FORM
// ==========================================
const MilestoneForm: React.FC<any> = ({ onClose, onCreate }) => {
  const [form, setForm] = useState<any>({ name: '', status: 'PLANNED', startDate: '', targetDate: '' });
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Create Milestone"
      icon={<CalendarDays className="w-5 h-5 text-semantic-success" />}
      subtitle="Define a key delivery checkpoint, major sprint goal, or compliance audit gate."
      maxWidth="lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="wrike-btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="milestone-creation-form"
            disabled={busy || !form.name.trim()}
            className="wrike-btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Create milestone</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form
        id="milestone-creation-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onCreate(form);
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <Field label="Milestone name" required>
          <input
            autoFocus
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="wrike-input w-full text-sm"
            placeholder="e.g. Pilot deployment & security sign-off"
          />
        </Field>

        <Field label="Status" required>
          <CustomSelect
            value={form.status}
            onChange={(value) => set('status', value)}
            options={milestoneStatusOptions}
            searchable={false}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">
            <AccessibleDatePicker
              value={form.startDate || ''}
              onChange={(val) => set('startDate', val)}
              placeholder="Select start date..."
            />
          </Field>

          <Field label="Target date">
            <AccessibleDatePicker
              value={form.targetDate || ''}
              onChange={(val) => set('targetDate', val)}
              placeholder="Select target date..."
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
};

// ==========================================
// ADD PROJECT MEMBER MODAL (LDAP INTEGRATED)
// ==========================================
const MemberForm: React.FC<{
  allUsers: BankUser[];
  departments: BankDepartment[];
  ldapGroups: LDAPGroupInfo[];
  teams: any[];
  onClose: () => void;
  onCreate: (body: any) => Promise<void>;
}> = ({ allUsers = [], departments = [], ldapGroups = [], teams = [], onClose, onCreate }) => {
  const [form, setForm] = useState({ subjectType: 'USER', subjectId: '', role: 'CONTRIBUTOR' });
  const [busy, setBusy] = useState(false);

  const deptMap = useMemo(() => new Map<string, BankDepartment>(departments.map((d: BankDepartment) => [d.id, d])), [departments]);
  const userMap = useMemo(() => new Map<string, BankUser>(allUsers.map((u: BankUser) => [u.id, u])), [allUsers]);
  const groupMap = useMemo(() => new Map<string, LDAPGroupInfo>(ldapGroups.map((g: LDAPGroupInfo) => [g.name, g])), [ldapGroups]);
  const teamMap = useMemo(() => new Map<string, any>(teams.map((t: any) => [t.id, t])), [teams]);

  // Options for USER
  const userOptions: SelectOption[] = useMemo(() => {
    return allUsers
      .filter((u: BankUser) => u.isActive)
      .map((u: BankUser) => {
        const dept = deptMap.get(u.departmentId);
        const initials = avatar(u.fullName || u.username);
        return {
          value: u.id,
          label: u.fullName || u.username,
          sublabel: `${u.title || 'Employee'} · ${dept?.name || u.departmentId} (@${u.sAMAccountName || u.username})`,
          badge: u.directorySource === 'ACTIVE_DIRECTORY' ? 'Active Directory' : 'Local',
          badgeColor: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
          icon: (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-semantic-success-surface text-label font-bold text-semantic-success border border-semantic-success-border">
              {initials}
            </span>
          ),
        };
      });
  }, [allUsers, deptMap]);

  // Options for DEPARTMENT
  const departmentOptions: SelectOption[] = useMemo(() => {
    return departments
      .filter((d: BankDepartment) => d.isActive !== false)
      .map((d: BankDepartment) => ({
        value: d.id,
        label: d.name,
        sublabel: `Code: ${d.code} · ${d.memberCount || 0} active domain users`,
        icon: <Building2 className="w-4 h-4 text-purple-600" />,
        badge: `${d.memberCount || 0} users`,
        badgeColor: 'bg-purple-50 text-purple-700 border border-purple-200',
      }));
  }, [departments]);

  // Options for GROUP
  const groupOptions: SelectOption[] = useMemo(() => {
    return ldapGroups.map((g: LDAPGroupInfo) => ({
      value: g.name,
      label: g.name,
      sublabel: `${g.description || 'Active Directory Distribution Group'} · ${g.memberCount} members`,
      icon: <Shield className="w-4 h-4 text-amber-600" />,
      badge: g.type === 'SECURITY_DISTRIBUTION_GROUP' ? 'Security & Distribution' : 'Distribution',
      badgeColor: 'bg-amber-50 text-amber-700 border border-amber-200',
    }));
  }, [ldapGroups]);

  // Options for TEAM
  const teamOptions: SelectOption[] = useMemo(() => {
    return teams.map((t: any) => ({
      value: t.id,
      label: t.name,
      sublabel: t.description || 'Operational Squad',
      icon: <Users className="w-4 h-4 text-blue-600" />,
    }));
  }, [teams]);

  // Selected item live preview details
  const selectedPreview = useMemo(() => {
    if (!form.subjectId) return null;
    if (form.subjectType === 'USER') {
      const u = userMap.get(form.subjectId);
      if (!u) return null;
      const dept = deptMap.get(u.departmentId);
      return {
        title: u.fullName || u.username,
        subtitle: u.title || 'Bank Specialist',
        username: `@${u.sAMAccountName || u.username}`,
        email: u.email,
        department: dept?.name || u.departmentId,
        isAd: u.directorySource === 'ACTIVE_DIRECTORY' || Boolean(u.sAMAccountName),
        groups: (u.distributionGroups || []).slice(0, 3),
        initials: avatar(u.fullName || u.username),
      };
    }
    if (form.subjectType === 'DEPARTMENT') {
      const d = deptMap.get(form.subjectId) || departments.find((dept: BankDepartment) => dept.code === form.subjectId);
      if (!d) return null;
      return {
        title: d.name,
        subtitle: `Department Code: ${d.code}`,
        username: 'Organizational Unit',
        email: `${d.memberCount || 0} active domain users inherited`,
        department: d.description || 'Expressbank Organizational Unit',
        isAd: true,
        groups: [],
        initials: 'DP',
      };
    }
    if (form.subjectType === 'GROUP') {
      const g = groupMap.get(form.subjectId);
      return {
        title: form.subjectId,
        subtitle: g?.description || 'Active Directory Distribution Group',
        username: g?.type === 'SECURITY_DISTRIBUTION_GROUP' ? 'Security & Distribution Group' : 'Distribution Group',
        email: `${g?.memberCount || 1} group members inherit access`,
        department: 'Active Directory Directory Group',
        isAd: true,
        groups: [],
        initials: 'SG',
      };
    }
    if (form.subjectType === 'TEAM') {
      const t = teamMap.get(form.subjectId);
      return {
        title: t?.name || form.subjectId,
        subtitle: t?.description || 'Operational Squad',
        username: 'Squad Access Boundary',
        email: 'Cross-functional operational team',
        department: 'Banking Operations',
        isAd: false,
        groups: [],
        initials: 'TM',
      };
    }
    return null;
  }, [form.subjectType, form.subjectId, userMap, deptMap, groupMap, teamMap, departments]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Add Project Member"
      icon={<UserPlus className="w-5 h-5 text-semantic-success" />}
      subtitle="Grant granular project access, managerial roles, or execution rights with Active Directory validation."
      maxWidth="lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="wrike-btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="member-creation-form"
            disabled={busy || !form.subjectId.trim()}
            className="wrike-btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Adding...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Add member</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form
        id="member-creation-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onCreate(form);
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
          <LockKeyhole className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            Membership is a backend-enforced project permission boundary. Active Directory domain identities and organizational units inherit granular task and milestone access.
          </span>
        </div>

        {/* Subject Type Selector */}
        <Field label="Access subject type" required hint="Select domain identity category">
          <CustomSelect
            value={form.subjectType}
            onChange={(value) => setForm({ ...form, subjectType: value, subjectId: '' })}
            options={subjectTypeOptions}
            searchable={false}
          />
        </Field>

        {/* Dynamic LDAP / Directory Picker */}
        {form.subjectType === 'USER' && (
          <Field label="Select Active Directory Employee" required hint="Search employee directory">
            <CustomSelect
              value={form.subjectId}
              onChange={(value) => setForm({ ...form, subjectId: value })}
              options={userOptions}
              placeholder="Əməkdaş seçin..."
              searchPlaceholder="Ad, vəzifə və ya sAMAccountName axtarın..."
              searchable
            />
          </Field>
        )}

        {form.subjectType === 'DEPARTMENT' && (
          <Field label="Select Bank Department" required hint="Organizational unit">
            <CustomSelect
              value={form.subjectId}
              onChange={(value) => setForm({ ...form, subjectId: value })}
              options={departmentOptions}
              placeholder="Departament seçin..."
              searchPlaceholder="Departament adı və ya kodu axtarın..."
              searchable
            />
          </Field>
        )}

        {form.subjectType === 'GROUP' && (
          <Field label="Select Active Directory Group" required hint="Distribution & security groups">
            <CustomSelect
              value={form.subjectId}
              onChange={(value) => setForm({ ...form, subjectId: value })}
              options={groupOptions}
              searchable={true}
              placeholder="Search and select LDAP group..."
              searchPlaceholder="Type security or distribution group name..."
            />
          </Field>
        )}

        {form.subjectType === 'TEAM' && (
          <Field label="Select Operational Team" required hint="Functional squads">
            <CustomSelect
              value={form.subjectId}
              onChange={(value) => setForm({ ...form, subjectId: value })}
              options={teamOptions}
              searchable={true}
              placeholder="Select team squad..."
              searchPlaceholder="Type team name..."
            />
          </Field>
        )}

        {/* Live Profile / Entity Preview Box */}
        {selectedPreview && (
          <div className="rounded-xl border border-emerald-200 bg-semantic-project-success p-3.5 text-xs text-semantic-primary shadow-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="relative">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-semantic-success border border-semantic-success-border shadow-xs">
                  {selectedPreview.initials}
                </span>
                {selectedPreview.isAd && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-micro font-bold text-white border border-white"
                    title="Active Directory Verified"
                  >
                    ✓
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-semantic-primary truncate">{selectedPreview.title}</div>
                  {selectedPreview.isAd && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-100/80 px-1.5 py-0.5 text-caption font-bold text-emerald-800 border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-700" /> Active Directory Verified
                    </span>
                  )}
                </div>
                <div className="text-slate-600 font-medium">{selectedPreview.subtitle}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label text-slate-500 pt-1">
                  <span>{selectedPreview.username}</span>
                  <span>{selectedPreview.email}</span>
                  <span>{selectedPreview.department}</span>
                </div>
                {selectedPreview.groups && selectedPreview.groups.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1 items-center">
                    <span className="text-caption text-slate-500 font-semibold">AD Groups:</span>
                    {selectedPreview.groups.map((g: string) => (
                      <span key={g} className="rounded bg-white px-1.5 py-0.5 text-micro font-medium border border-slate-200 text-slate-700">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Project Role Selector */}
        <Field label="Project role" required hint="Permission authorization boundary">
          <CustomSelect
            value={form.role}
            onChange={(value) => setForm({ ...form, role: value })}
            options={memberRoleOptions}
            searchable={false}
          />
        </Field>
      </form>
    </Modal>
  );
};
