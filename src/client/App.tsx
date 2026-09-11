import React, { lazy, useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { useI18n } from './context/I18nContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
const WorkManagementContainer = lazy(() => import('./components/views/WorkManagementContainer.js').then((m) => ({ default: m.WorkManagementContainer })));
const ProjectOperationsWorkspace = lazy(() => import('./components/projects/ProjectOperationsWorkspace.js').then((m) => ({ default: m.ProjectOperationsWorkspace })));
const MyWorkOverviewView = lazy(() => import('./components/views/MyWorkOverviewView.js').then((m) => ({ default: m.MyWorkOverviewView })));
const ServiceCatalogView = lazy(() => import('./components/views/ServiceCatalogView.js').then((m) => ({ default: m.ServiceCatalogView })));
const CMDBExplorerView = lazy(() => import('./components/assets/CMDBExplorerView.js').then((m) => ({ default: m.CMDBExplorerView })));
const DiscoveryAdminView = lazy(() => import('./components/assets/DiscoveryAdminView.js').then((m) => ({ default: m.DiscoveryAdminView })));
const AuditComplianceView = lazy(() => import('./components/governance/AuditComplianceView.js').then((m) => ({ default: m.AuditComplianceView })));
const IdeateCanvasView = lazy(() => import('./components/ideate/IdeateCanvasView.js').then((m) => ({ default: m.IdeateCanvasView })));
const WrikeRequestFormsView = lazy(() => import('./components/views/WrikeRequestFormsView.js').then((m) => ({ default: m.WrikeRequestFormsView })));
const WrikeAutomationsView = lazy(() => import('./components/views/WrikeAutomationsView.js').then((m) => ({ default: m.WrikeAutomationsView })));
const DocumentProofingModal = lazy(() => import('./components/proofing/DocumentProofingModal.js').then((m) => ({ default: m.DocumentProofingModal })));
const TicketSplitDetail = lazy(() => import('./components/tickets/TicketSplitDetail.js').then((m) => ({ default: m.TicketSplitDetail })));
const CISODashboard = lazy(() => import('./components/dashboards/CISODashboard.js').then((m) => ({ default: m.CISODashboard })));
const LeadDashboard = lazy(() => import('./components/dashboards/LeadDashboard.js').then((m) => ({ default: m.LeadDashboard })));
const AnalystDashboard = lazy(() => import('./components/dashboards/AnalystDashboard.js').then((m) => ({ default: m.AnalystDashboard })));
const IncidentCaseView = lazy(() => import('./components/operations/IncidentCaseView.js').then((m) => ({ default: m.IncidentCaseView })));
const VulnerabilityManagementView = lazy(() => import('./components/operations/VulnerabilityManagementView.js').then((m) => ({ default: m.VulnerabilityManagementView })));
const DLPView = lazy(() => import('./components/operations/DLPView.js').then((m) => ({ default: m.DLPView })));
const RiskRegisterView = lazy(() => import('./components/governance/RiskRegisterView.js').then((m) => ({ default: m.RiskRegisterView })));
const ThreatModelWorkspace = lazy(() => import('./components/governance/ThreatModelWorkspace.js').then((m) => ({ default: m.ThreatModelWorkspace })));
const SecurityExceptionsView = lazy(() => import('./components/governance/SecurityExceptionsView.js').then((m) => ({ default: m.SecurityExceptionsView })));
const ApprovalsView = lazy(() => import('./components/governance/ApprovalsView.js').then((m) => ({ default: m.ApprovalsView })));
const KnowledgeBaseView = lazy(() => import('./components/kb/KnowledgeBaseView.js').then((m) => ({ default: m.KnowledgeBaseView })));
const AdminCenterView = lazy(() => import('./components/admin/AdminCenterView.js').then((m) => ({ default: m.AdminCenterView })));
const DepartmentHubView = lazy(() => import('./components/departments/DepartmentHubView.js').then((m) => ({ default: m.DepartmentHubView })));
const DepartmentAdminPortal = lazy(() => import('./components/departments/DepartmentAdminPortal.js').then((m) => ({ default: m.DepartmentAdminPortal })));
const UniversalWorkflowWorkspace = lazy(() => import('./components/workflows/UniversalWorkflowWorkspace.js').then((m) => ({ default: m.UniversalWorkflowWorkspace })));
const AliveDashboardView = lazy(() => import('./components/alive/views/AliveDashboardView.js').then((m) => ({ default: m.AliveDashboardView })));
const AliveWorkManagementView = lazy(() => import('./components/alive/views/AliveWorkManagementView.js').then((m) => ({ default: m.AliveWorkManagementView })));
const AliveApprovalsView = lazy(() => import('./components/alive/views/AliveApprovalsView.js').then((m) => ({ default: m.AliveApprovalsView })));
const AliveCMDBView = lazy(() => import('./components/alive/views/AliveCMDBView.js').then((m) => ({ default: m.AliveCMDBView })));
import { AccessDeniedView } from './components/common/AccessDeniedView.js';
import { LDAPSignInModal } from './components/auth/LDAPSignInModal.js';
import { BankAuthPortal } from './components/auth/BankAuthPortal.js';
import { FlightEasterEgg } from './components/game/FlightEasterEgg.js';
import { Ticket } from '../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../shared/types/asset.js';
import { BankDepartment } from '../shared/types/auth.js';
import { RiskRegisterItem } from '../shared/types/risk.js';
import { KBArticle } from '../shared/types/kb.js';
import {
  DestinationId,
  ViewMode,
  resolveLegacyRoute,
  canUserAccessDestination,
} from '../shared/types/navigation.js';
import {
  parseCurrentUrl,
  pushNavigationState,
} from './utils/urlRouter.js';
import { useUIExperience } from './context/UIExperienceContext.js';
import { AliveAppShell } from './components/alive/layout/AliveAppShell.js';
import { NAVIGATION_MODULES } from '../shared/types/navigation.js';

const apiErrorMessage = (data: any, fallback: string): string => {
  const message = data?.error || data?.detail || data?.message || data?.title;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

// Lazy view chunks can stall (proxy wedge, deploy mid-session). Escape the
// indefinite Suspense fallback with a retry affordance instead of a dead spinner.
const ViewSuspenseFallback: React.FC = () => {
  const { t } = useI18n();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (timedOut) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
        <p className="text-sm font-medium text-semantic-primary">{t('This view is taking too long to load')}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-semantic-border px-3 py-1.5 text-xs font-semibold text-semantic-primary transition-colors hover:bg-semantic-panel"
        >
          {t('Retry')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-semantic-muted" role="status">
      {t('Loading...')}
    </div>
  );
};

class ViewErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const { currentUser, isLoading, fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const { experience } = useUIExperience();
  const [loginPresentationActive, setLoginPresentationActive] = useState(false);

  // Initialize navigation and view mode state from the current browser URL
  const initialRoute = parseCurrentUrl();
  const [activeDestination, setActiveDestination] = useState<DestinationId | string>(
    initialRoute.destinationId || 'my-work-overview'
  );
  const [activeViewMode, setActiveViewMode] = useState<ViewMode>(initialRoute.viewMode || 'spreadsheet');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialRoute.ticketIdOrKey);

  const [isProofingOpen, setIsProofingOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('comp-standard-ho');
  const [selectedAdminDeptId, setSelectedAdminDeptId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [departments, setDepartments] = useState<BankDepartment[]>([]);
  const [applications, setApplications] = useState<BankApplication[]>([]);
  const [assets, setAssets] = useState<BankAsset[]>([]);
  const [risks, setRisks] = useState<RiskRegisterItem[]>([]);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [cisoMetrics, setCisoMetrics] = useState<any>(null);
  const [leadMetrics, setLeadMetrics] = useState<any>(null);
  const [analystWorkspace, setAnalystWorkspace] = useState<any>(null);
  const [pendingApprovalsList, setPendingApprovalsList] = useState<any[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  const [ticketDetailData, setTicketDetailData] = useState<any>(null);
  const [cmdbFocusCiId, setCmdbFocusCiId] = useState('');
  const [jqlQuery, setJqlQuery] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Handle browser popstate (Back/Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseCurrentUrl();
      setActiveDestination(parsed.destinationId);
      setActiveViewMode(parsed.viewMode);
      setSelectedTicketId(parsed.ticketIdOrKey);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const refreshPendingApprovals = () => {
    if (!currentUser) return;

    return fetchWithAuth('/api/approvals/pending')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && (data.pendingApprovals || data.pending)) {
          const list = data.pendingApprovals || data.pending || [];
          setPendingApprovalsList(list);
          setPendingApprovalsCount(list.length);
        }
      })
      .catch(() => {});
  };

  const loadData = () => {
    if (!currentUser) return;

    // Load Tickets
    const jqlParam = jqlQuery || (searchQuery ? `text ~ "${searchQuery}"` : '');
    const url = jqlParam ? `/api/tickets?jql=${encodeURIComponent(jqlParam)}` : '/api/tickets';

    fetchWithAuth(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTickets(data.tickets);
      })
      .catch((err) => console.error(err));

    // Load Pending Approvals
    refreshPendingApprovals();

    // Load Applications & Assets
    fetchWithAuth('/api/cmdb/applications')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.applications) && data.applications.length > 0) {
          setApplications(data.applications);
        } else {
          fetchWithAuth('/api/applications')
            .then((res) => res.json())
            .then((legacyData) => {
              if (legacyData.success && Array.isArray(legacyData.applications)) setApplications(legacyData.applications);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        fetchWithAuth('/api/applications')
          .then((res) => res.json())
          .then((legacyData) => {
            if (legacyData.success && Array.isArray(legacyData.applications)) setApplications(legacyData.applications);
          })
          .catch(() => {});
      });

    fetchWithAuth('/api/cmdb/assets?pageSize=100')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.assets) && data.assets.length > 0) {
          setAssets(data.assets);
        } else {
          fetchWithAuth('/api/assets')
            .then((res) => res.json())
            .then((legacyData) => {
              if (legacyData.success && Array.isArray(legacyData.assets)) setAssets(legacyData.assets);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        fetchWithAuth('/api/assets')
          .then((res) => res.json())
          .then((legacyData) => {
            if (legacyData.success && Array.isArray(legacyData.assets)) setAssets(legacyData.assets);
          })
          .catch(() => {});
      });

    // Load Risks
    fetchWithAuth('/api/risks')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRisks(data.risks);
      });

    // Load KB
    fetchWithAuth('/api/kb')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setKbArticles(data.articles);
      });

    // Load Departments
    fetchWithAuth('/api/departments')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.departments)) setDepartments(data.departments);
      })
      .catch(() => {});

    // Load Dashboards
    fetchWithAuth('/api/dashboards/ciso')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setCisoMetrics(data.metrics);
      });

    fetchWithAuth('/api/dashboards/lead')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLeadMetrics(data);
      });

    fetchWithAuth('/api/dashboards/analyst')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAnalystWorkspace(data);
      });
  };

  useEffect(() => {
    loadData();
  }, [currentUser, jqlQuery, searchQuery]);

  // Load ticket detail when selected
  useEffect(() => {
    if (selectedTicketId) {
      // Resolve either by id or key
      const resolvedId = tickets.find((t) => t.key === selectedTicketId || t.id === selectedTicketId)?.id || selectedTicketId;

      fetchWithAuth(`/api/tickets/${resolvedId}`)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            setTicketDetailData(data);
            return;
          }

          const fallback = res.status === 403
            ? 'Bu iş üçün giriş icazəniz yoxdur.'
            : `İş məlumatı yüklənmədi (${res.status || 'naməlum xəta'}).`;
          const message = apiErrorMessage(data, fallback);
          alert(res.status === 403 ? `Giriş qadağandır: ${message}` : `İş açıla bilmədi: ${message}`);
          setTicketDetailData(null);
          setSelectedTicketId(null);
          pushNavigationState(activeDestination, activeViewMode, null);
        })
        .catch((err) => console.error('Ticket detail request failed', err));
    } else {
      setTicketDetailData(null);
    }
  }, [selectedTicketId, currentUser, tickets]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
    pushNavigationState(activeDestination, activeViewMode, ticket.key || ticket.id);
  };

  // Unified navigation handler with URL history synchronization
  const handleNavigate = (route: string, ticketId?: string) => {
    const { destinationId, viewMode } = resolveLegacyRoute(route);
    const newViewMode = viewMode || activeViewMode;
    setActiveDestination(destinationId);
    if (viewMode) {
      setActiveViewMode(viewMode);
    }
    const nextTicketId = ticketId || null;
    setSelectedTicketId(nextTicketId);
    pushNavigationState(destinationId, newViewMode, nextTicketId);
  };

  const handleSelectViewMode = (mode: ViewMode) => {
    setActiveViewMode(mode);
    pushNavigationState(activeDestination, mode, selectedTicketId);
  };

  const handleTransition = async (transitionId: string, comment?: string, requiredFieldUpdates?: Record<string, any>) => {
    if (!selectedTicketId) return;
    const res = await fetchWithAuth(`/api/tickets/${selectedTicketId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionId, comment, requiredFieldUpdates }),
    });
    const data = await res.json();
    if (data.success) {
      loadData();
      fetchWithAuth(`/api/tickets/${selectedTicketId}`)
        .then((r) => r.json())
        .then((d) => setTicketDetailData(d));
    } else {
      alert(`Transition Failed: ${apiErrorMessage(data, 'Əməliyyat icra edilə bilmədi.')}`);
    }
  };

  const handleAddComment = async (content: string, visibility: any) => {
    if (!selectedTicketId) return;
    const res = await fetchWithAuth(`/api/tickets/${selectedTicketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, visibility }),
    });
    const data = await res.json();
    if (data.success) {
      fetchWithAuth(`/api/tickets/${selectedTicketId}`)
        .then((r) => r.json())
        .then((d) => setTicketDetailData(d));
    } else {
      throw new Error(data.error || 'Comment could not be posted.');
    }
  };

  const handleApprovalDecision = async (stepId: string, decision: any, comments: string) => {
    if (!ticketDetailData?.approvalChain) return;
    const chainId = ticketDetailData.approvalChain.id;
    const res = await fetchWithAuth(`/api/approvals/${chainId}/steps/${stepId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comments }),
    });
    const data = await res.json();
    if (data.success) {
      loadData();
      fetchWithAuth(`/api/tickets/${selectedTicketId}`)
        .then((r) => r.json())
        .then((d) => setTicketDetailData(d));
    } else {
      throw new Error(data.error || 'Approval decision could not be submitted.');
    }
  };

  // Synchronize active department to user's assigned department
  useEffect(() => {
    if (currentUser?.departmentId) {
      setActiveDepartmentId(currentUser.departmentId);
    }
  }, [currentUser]);

  // Department & specific task scoped tickets: each user only sees their own dept/sobe and specific tasks for them
  const isGlobalAdmin =
    currentUser?.roles?.includes('PLATFORM_ADMIN') || currentUser?.roles?.includes('CISO');
  const userDeptId = currentUser?.departmentId;
  const effectiveDeptId = userDeptId || activeDepartmentId;

  const scopedTickets = isGlobalAdmin && !activeDepartmentId
    ? tickets
    : tickets.filter((t) => {
        const isDirect =
          t.assigneeId === currentUser?.id ||
          t.reporterId === currentUser?.id ||
          t.watcherIds?.includes(currentUser?.id || '') ||
          t.participantIds?.includes(currentUser?.id || '');
        const isDeptTask = Boolean(
          effectiveDeptId &&
            (t.departmentId === effectiveDeptId ||
              t.targetDepartmentId === effectiveDeptId ||
              t.participatingDepartmentIds?.includes(effectiveDeptId))
        );
        return isDirect || isDeptTask;
      });

  // Check RBAC permission for the active destination
  const isAuthorized = canUserAccessDestination(currentUser, activeDestination);

  // Per-destination ticket scopes shared by the Classic and Alive implementations
  // so both experiences always render identical data.
  const myAssignedTickets = tickets.filter(
    (t) =>
      t.assigneeId === currentUser?.id ||
      (!t.assigneeId && (
        (t.targetDepartmentId && t.targetDepartmentId === currentUser?.departmentId) ||
        (t.departmentId && t.departmentId === currentUser?.departmentId) ||
        (t.assignmentGroupId && currentUser?.teamIds?.includes(t.assignmentGroupId)) ||
        t.participatingDepartmentIds?.includes(currentUser?.departmentId || '')
      ))
  );
  const mySubmittedTickets = tickets.filter(
    (t) => t.requesterId === currentUser?.id || t.reporterId === currentUser?.id
  );
  const incidentTickets = scopedTickets.filter((t) => t.category === 'INCIDENT' || t.ticketTypeId === 'INCIDENT');
  const serviceRequestTickets = scopedTickets.filter(
    (t) =>
      t.category === 'GENERAL_REQUEST' ||
      t.category === 'IAM_REQUEST' ||
      t.ticketTypeName?.includes('Request') ||
      Boolean(t.tags?.includes('REQUEST'))
  );
  const changeTickets = scopedTickets.filter(
    (t) =>
      Boolean(t.tags?.includes('CAB')) ||
      Boolean(t.tags?.includes('CHANGE')) ||
      Boolean(t.ticketTypeName?.includes('Change'))
  );
  const problemTickets = scopedTickets.filter(
    (t) =>
      Boolean(t.tags?.includes('RCA')) ||
      Boolean(t.tags?.includes('PROBLEM')) ||
      Boolean(t.ticketTypeName?.includes('Problem'))
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-semantic-auth-loading flex flex-col items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 border-slate-600 border-t-slate-200 animate-spin"
            role="status"
            aria-label="Loading"
          />
          <div className="text-sm font-semibold tracking-wide text-slate-200">
            {t('Verifying Secure Bank Session...')}
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {t('Active Directory LDAPS • Tier-1 PKI')}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser || loginPresentationActive) {
    return <BankAuthPortal
      onAuthenticationStart={() => setLoginPresentationActive(true)}
      onAuthenticationFailure={() => setLoginPresentationActive(false)}
      onLoginSuccess={() => { setLoginPresentationActive(false); loadData(); }}
    />;
  }

  const activeNavModule = NAVIGATION_MODULES.flatMap((m) => m.items).find((i) => i.id === activeDestination);
  const activeParentModule = NAVIGATION_MODULES.find((m) => m.items.some((i) => i.id === activeDestination));
  const activeViewTitle = activeNavModule
    ? t(activeNavModule.label)
    : String(activeDestination)
        .replace(/-/g, ' ')
        // Keep domain acronyms uppercase instead of "Dlp"/"Cmdb" title-casing.
        .replace(/\b(dlp|cmdb|grc|soc|sla|sop|api|iam|pki|sso|mfa|cve|cvss|iso|nist)\b/gi, (m) => m.toUpperCase())
        .replace(/\b\w/g, (c) => c.toUpperCase());
  const activeParentModuleTitle = activeParentModule ? t(activeParentModule.label) : undefined;



  const viewErrorFallback = (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
      <p className="text-sm font-medium text-semantic-primary">{t('View failed to load')}</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg border border-semantic-border px-3 py-1.5 text-xs font-semibold text-semantic-primary transition-colors hover:bg-semantic-panel"
      >
        {t('Retry')}
      </button>
    </div>
  );

  const workspaceContent = (
    <ViewErrorBoundary fallback={viewErrorFallback}>
      <React.Suspense
        fallback={<ViewSuspenseFallback />}
      >
      {/* If a ticket is open, show split detail */}
      {selectedTicketId && ticketDetailData?.ticket ? (
        <TicketSplitDetail
          ticket={ticketDetailData.ticket}
          transitions={ticketDetailData.transitions || []}
          comments={ticketDetailData.comments || []}
          attachments={ticketDetailData.attachments || []}
          auditEvents={ticketDetailData.auditEvents || []}
          approvalChain={ticketDetailData.approvalChain}
          application={ticketDetailData.application}
          asset={ticketDetailData.asset}
          cmdb={ticketDetailData.cmdb || []}
          lifecycle={ticketDetailData.lifecycle}
          onBack={() => {
            setSelectedTicketId(null);
            pushNavigationState(activeDestination, activeViewMode, null);
          }}
          onTransition={handleTransition}
          onAddComment={handleAddComment}
          onApprovalDecision={handleApprovalDecision}
          onUpdateTicket={async (updates) => {
            await fetchWithAuth(`/api/tickets/${selectedTicketId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            });
            loadData();
          }}
          onRefresh={async () => {
            loadData();
            const response = await fetchWithAuth(`/api/tickets/${selectedTicketId}`);
            const detail = await response.json();
            if (detail.success) setTicketDetailData(detail);
          }}
          onNavigateToTicket={(ticketId) => {
            setSelectedTicketId(ticketId);
          }}
        />
      ) : !isAuthorized ? (
        /* RBAC 403 Forbidden Shield */
        <AccessDeniedView
          destinationId={activeDestination}
          onReturnToSafeView={() => handleNavigate('my-work-overview')}
        />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* 1. MY WORK MODULE                                                         */}
          {/* ========================================================================= */}
          {activeDestination === 'my-work-overview' && (
            <MyWorkOverviewView
              tickets={tickets}
              pendingApprovalsCount={pendingApprovalsCount}
              onSelectTicket={handleSelectTicket}
              onNavigate={handleNavigate}
              onOpenCreate={() => setIsCreateModalOpen(true)}
            />
          )}

          {activeDestination === 'my-tasks' && (
            <WorkManagementContainer
              title="My Assigned Tasks"
              description="Tasks, remediation actions, and requests assigned directly to you."
              tickets={myAssignedTickets}
              applications={applications}
              assets={assets}
              departments={departments}
              activeViewMode={activeViewMode}
              onSelectViewMode={handleSelectViewMode}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onRefreshTickets={loadData}
              createButtonLabel="New Task"
              dataScope="assigned"
            />
          )}

          {activeDestination === 'my-requests' && (
            <WorkManagementContainer
              title="My Submitted Requests"
              description="Service tickets, access requests, and change orders submitted by you."
              tickets={mySubmittedTickets}
              applications={applications}
              assets={assets}
              departments={departments}
              activeViewMode={activeViewMode}
              onSelectViewMode={handleSelectViewMode}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onRefreshTickets={loadData}
              createButtonLabel="New Request"
              dataScope="reported"
            />
          )}

          {activeDestination === 'approvals' && (
            <ApprovalsView
              pendingApprovals={pendingApprovalsList}
              onRefresh={refreshPendingApprovals}
            />
          )}

          {/* ========================================================================= */}
          {/* 2. WORK MANAGEMENT MODULE                                                 */}
          {/* ========================================================================= */}
          {activeDestination === 'projects-tasks' && (
            <ProjectOperationsWorkspace />
          )}

          {activeDestination === 'workflows' && (
            <UniversalWorkflowWorkspace onRefreshTickets={loadData} />
          )}

          {/* ========================================================================= */}
          {/* 3. SERVICE MANAGEMENT MODULE                                              */}
          {/* ========================================================================= */}
          {activeDestination === 'service-incidents' && (
            <WorkManagementContainer
              title={t('Service Incidents')}
              description={t('Live service outage tickets, SLA countdown timers, and resolution tracking.')}
              tickets={incidentTickets}
              applications={applications}
              assets={assets}
              departments={departments}
              activeViewMode={activeViewMode}
              onSelectViewMode={handleSelectViewMode}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onRefreshTickets={loadData}
              createButtonLabel={t('Report Incident')}
            />
          )}

          {activeDestination === 'service-requests' && (
            <WorkManagementContainer
              title={t('Service Requests')}
              description={t('General IT, SecOps, and access fulfillment tickets.')}
              tickets={serviceRequestTickets}
              applications={applications}
              assets={assets}
              departments={departments}
              activeViewMode={activeViewMode}
              onSelectViewMode={handleSelectViewMode}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onRefreshTickets={loadData}
              createButtonLabel={t('New Request')}
            />
          )}

          {activeDestination === 'service-changes' && (
            <WorkManagementContainer
              title={t('Change Management (CAB)')}
              description={t('Production change authorizations, release windows, and rollback plans.')}
              tickets={changeTickets}
              applications={applications}
              assets={assets}
              departments={departments}
              activeViewMode={activeViewMode}
              onSelectViewMode={handleSelectViewMode}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onRefreshTickets={loadData}
              createButtonLabel={t('Request Change')}
            />
          )}

          {activeDestination === 'service-problems' && (
            <WorkManagementContainer
              title={t('Problem Management & RCA')}
              description={t('Root Cause Analysis (RCA) records and Known Error Database (KEDB).')}
              tickets={problemTickets}
              applications={applications}
              assets={assets}
              departments={departments}
              activeViewMode={activeViewMode}
              onSelectViewMode={handleSelectViewMode}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onRefreshTickets={loadData}
              createButtonLabel={t('Log Problem')}
            />
          )}

          {activeDestination === 'service-catalog' && (
            <ServiceCatalogView
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onNavigate={handleNavigate}
            />
          )}

          {/* ========================================================================= */}
          {/* 4. SECURITY & GRC MODULE                                                  */}
          {/* ========================================================================= */}
          {activeDestination === 'vulnerabilities' && (
            <VulnerabilityManagementView
              tickets={tickets}
              onSelectTicket={handleSelectTicket}
              onRefresh={loadData}
            />
          )}

          {activeDestination === 'security-incidents' && (
            <IncidentCaseView tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeDestination === 'policy-exceptions' && (
            <SecurityExceptionsView tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeDestination === 'risk-management' && (
            <RiskRegisterView risks={risks} />
          )}

          {activeDestination === 'threat-modeling' && (
            <ThreatModelWorkspace />
          )}

          {activeDestination === 'audit-compliance' && (
            <AuditComplianceView />
          )}

          {/* ========================================================================= */}
          {/* 5. ASSETS & CMDB MODULE                                                   */}
          {/* ========================================================================= */}
          {activeDestination === 'discovery-sources' && <DiscoveryAdminView mode="sources" onNavigateToRuns={(connectorId) => { handleNavigate('discovery-runs'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('aegis:discovery-select-connector', { detail: connectorId })), 0); }} />}
          {activeDestination === 'discovery-runs' && <DiscoveryAdminView mode="runs" />}

          {activeDestination === 'configuration-items' && (
            <CMDBExplorerView mode="all" initialCiId={cmdbFocusCiId} />
          )}

          {activeDestination === 'business-services' && (
            <CMDBExplorerView mode="business-services" />
          )}

          {activeDestination === 'applications' && (
            <CMDBExplorerView mode="applications" />
          )}

          {/* ========================================================================= */}
          {/* 6. KNOWLEDGE MODULE                                                       */}
          {/* ========================================================================= */}
          {activeDestination === 'knowledge-base' && (
            <KnowledgeBaseView articles={kbArticles} />
          )}

          {/* ========================================================================= */}
          {/* 7. ANALYTICS MODULE                                                       */}
          {/* ========================================================================= */}
          {activeDestination === 'operational-analytics' && (
            <AnalystDashboard
              myTickets={analystWorkspace?.myTickets || tickets.filter((t) => t.assigneeId === currentUser?.id)}
              myApprovals={analystWorkspace?.myApprovals || []}
              watchedTickets={analystWorkspace?.watchedTickets || []}
              slaApproaching={analystWorkspace?.slaApproaching || []}
              onSelectTicket={handleSelectTicket}
            />
          )}

          {activeDestination === 'executive-analytics' && (
            <CISODashboard
              metrics={cisoMetrics}
              risks={risks}
              tickets={tickets}
              applications={applications}
              onSelectTicket={handleSelectTicket}
              onNavigate={(v) => handleNavigate(v)}
            />
          )}

          {/* ========================================================================= */}
          {/* 8. ADMINISTRATION MODULE                                                  */}
          {/* ========================================================================= */}
          {activeDestination === 'admin-request-forms' && (
            <WrikeRequestFormsView
              onFormSubmitted={() => {
                loadData();
                handleNavigate('projects-tasks');
              }}
            />
          )}

          {activeDestination === 'admin-workflow-templates' && (
            <AdminCenterView initialTab="WORKFLOWS" onNavigate={handleNavigate} />
          )}

          {activeDestination === 'admin-automations' && (
            <WrikeAutomationsView
              onRefreshTickets={loadData}
            />
          )}

          {activeDestination === 'admin-sla-policies' && (
            <AdminCenterView initialTab="SLA" onNavigate={handleNavigate} />
          )}

          {activeDestination === 'admin-departments' && (
            <DepartmentHubView
              onSelectDepartment={(deptId) => {
                setSelectedAdminDeptId(deptId);
                handleNavigate('dept-admin');
              }}
              onNavigate={handleNavigate}
            />
          )}

          {activeDestination === 'dept-admin' && (
            <DepartmentAdminPortal
              departmentId={selectedAdminDeptId || currentUser?.departmentId || 'dept-secops'}
              onBack={() => handleNavigate('admin-departments')}
              onNavigate={handleNavigate}
              onRefreshData={loadData}
            />
          )}

          {activeDestination === 'admin-taxonomy' && (
            <AdminCenterView initialTab="TAXONOMY" onNavigate={handleNavigate} />
          )}

          {activeDestination === 'admin-integrations' && (
            <AdminCenterView initialTab="INTEGRATIONS" onNavigate={handleNavigate} />
          )}

          {activeDestination === 'admin-settings' && (
            <AdminCenterView initialTab="SETTINGS" onNavigate={handleNavigate} />
          )}

          {/* Legacy / Special Handlers */}
          {activeDestination === 'dlp-investigations' && (
            <DLPView tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeDestination === 'ideate' && (
            <IdeateCanvasView
              onNavigate={handleNavigate}
              onRefreshTickets={loadData}
            />
          )}
        </>
      )}

      {/* Document Proofing Modal */}
        {isProofingOpen && (
          <DocumentProofingModal
            isOpen={isProofingOpen}
            onClose={() => setIsProofingOpen(false)}
          />
        )}
      </React.Suspense>
    </ViewErrorBoundary>
  );

  // Alive experience swaps in its kinetic-first implementations for the
  // destinations that have one; every other destination keeps the shared
  // workspace content and inherits Alive styling through the token layer.
  const aliveWorkManagementConfig: Record<string, { title: string; description: string; createButtonLabel: string; tickets: Ticket[] }> = {
    'my-tasks': { title: 'My Assigned Tasks', description: 'Tasks, remediation actions, and requests assigned directly to you.', createButtonLabel: 'New Task', tickets: myAssignedTickets },
    'my-requests': { title: 'My Submitted Requests', description: 'Service tickets, access requests, and change orders submitted by you.', createButtonLabel: 'New Request', tickets: mySubmittedTickets },
    'service-incidents': { title: 'Service Incidents', description: 'Live service outage tickets, SLA countdown timers, and resolution tracking.', createButtonLabel: 'Report Incident', tickets: incidentTickets },
    'service-requests': { title: 'Service Requests', description: 'General IT, SecOps, and access fulfillment tickets.', createButtonLabel: 'New Request', tickets: serviceRequestTickets },
    'service-changes': { title: 'Change Management (CAB)', description: 'Production change authorizations, release windows, and rollback plans.', createButtonLabel: 'Request Change', tickets: changeTickets },
    'service-problems': { title: 'Problem Management & RCA', description: 'Root Cause Analysis (RCA) records and Known Error Database (KEDB).', createButtonLabel: 'Log Problem', tickets: problemTickets },
  };

  const buildAliveOverride = (): React.ReactNode => {
    // An open ticket or an RBAC block renders through the shared workspace
    // content (split detail / access shield), exactly like Classic.
    if ((selectedTicketId && ticketDetailData?.ticket) || !isAuthorized) return null;
    const workConfig = aliveWorkManagementConfig[activeDestination];
    if (workConfig) {
      return (
        <AliveWorkManagementView
          title={workConfig.title}
          description={workConfig.description}
          tickets={workConfig.tickets}
          applications={applications}
          assets={assets}
          departments={departments}
          onSelectTicket={handleSelectTicket}
          onOpenCreate={() => setIsCreateModalOpen(true)}
          onRefreshTickets={loadData}
          createButtonLabel={workConfig.createButtonLabel}
        />
      );
    }
    switch (activeDestination) {
      case 'my-work-overview':
        return (
          <AliveDashboardView
            tickets={tickets}
            pendingApprovalsCount={pendingApprovalsCount}
            onSelectTicket={handleSelectTicket}
            onNavigate={(v) => handleNavigate(v)}
            onOpenCreate={() => setIsCreateModalOpen(true)}
          />
        );
      case 'approvals':
        return (
          <AliveApprovalsView
            pendingApprovals={pendingApprovalsList}
            onOpenTicket={(ticketId) => {
              const match = tickets.find((tk) => tk.id === ticketId || tk.key === ticketId);
              if (match) handleSelectTicket(match);
            }}
            onRefresh={refreshPendingApprovals}
          />
        );
      case 'configuration-items':
      case 'applications':
      case 'business-services':
        return (
          <AliveCMDBView
            applications={applications}
            assets={assets}
            onOpenCreateTicket={() => setIsCreateModalOpen(true)}
          />
        );
      default:
        return null;
    }
  };

  const aliveOverrideElement = experience === 'alive' ? buildAliveOverride() : null;

  const shellChildren = aliveOverrideElement ? (
    <ViewErrorBoundary fallback={viewErrorFallback}>
      <React.Suspense fallback={<ViewSuspenseFallback />}>
        {aliveOverrideElement}
      </React.Suspense>
    </ViewErrorBoundary>
  ) : workspaceContent;

  if (experience === 'alive') {
    return (
      <AliveAppShell
        activeView={activeDestination}
        activeViewTitle={activeViewTitle}
        activeParentModuleTitle={activeParentModuleTitle}
        onSelectView={(v) => handleNavigate(v)}
        tickets={scopedTickets}
        applications={applications}
        assets={assets}
        risks={risks}
        kbArticles={kbArticles}
        pendingApprovalsCount={pendingApprovalsCount}
        departments={departments}
        departmentsCount={departments.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onTicketCreated={(t) => {
          loadData();
          if (t && t.id) handleSelectTicket(t);
        }}
        onNavigate={handleNavigate}
        isCreateOpen={isCreateModalOpen}
        onOpenCreate={() => setIsCreateModalOpen(true)}
        onCloseCreate={() => setIsCreateModalOpen(false)}
      >
        {shellChildren}
        <FlightEasterEgg />
      </AliveAppShell>
    );
  }

  return (
    <AppLayout
      activeView={activeDestination}
      onSelectView={(v) => handleNavigate(v)}
      departments={departments}
      activeDepartmentId={activeDepartmentId}
      onSelectDepartment={(dId) => {
        setActiveDepartmentId(dId);
        if (dId) setSelectedAdminDeptId(dId);
      }}
      activeCompanyId={activeCompanyId}
      onSelectCompany={setActiveCompanyId}
      tickets={scopedTickets}
      applications={applications}
      assets={assets}
      risks={risks}
      kbArticles={kbArticles}
      pendingApprovalsCount={pendingApprovalsCount}
      departmentsCount={departments.length}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onTicketCreated={(t) => {
        loadData();
        if (t && t.id) handleSelectTicket(t);
      }}
      onNavigate={handleNavigate}
      isCreateOpen={isCreateModalOpen}
      onOpenCreate={() => setIsCreateModalOpen(true)}
      onCloseCreate={() => setIsCreateModalOpen(false)}
    >
      {workspaceContent}
      <FlightEasterEgg />
    </AppLayout>
  );
};
