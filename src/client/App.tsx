import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { useI18n } from './context/I18nContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { WorkManagementContainer } from './components/views/WorkManagementContainer.js';
import { ProjectOperationsWorkspace } from './components/projects/ProjectOperationsWorkspace.js';
import { MyWorkOverviewView } from './components/views/MyWorkOverviewView.js';
import { ServiceCatalogView } from './components/views/ServiceCatalogView.js';
import { CMDBRelationshipMapView } from './components/assets/CMDBRelationshipMapView.js';
import { CMDBExplorerView } from './components/assets/CMDBExplorerView.js';
import { CMDBAssetInventoryView } from './components/assets/CMDBAssetInventoryView.js';
import { DiscoveryAdminView } from './components/assets/DiscoveryAdminView.js';
import { AuditComplianceView } from './components/governance/AuditComplianceView.js';
import { IdeateCanvasView } from './components/ideate/IdeateCanvasView.js';
import { WrikeRequestFormsView } from './components/views/WrikeRequestFormsView.js';
import { WrikeAutomationsView } from './components/views/WrikeAutomationsView.js';
import { DocumentProofingModal } from './components/proofing/DocumentProofingModal.js';
import { TicketSplitDetail } from './components/tickets/TicketSplitDetail.js';
import { CISODashboard } from './components/dashboards/CISODashboard.js';
import { LeadDashboard } from './components/dashboards/LeadDashboard.js';
import { AnalystDashboard } from './components/dashboards/AnalystDashboard.js';
import { IncidentCaseView } from './components/operations/IncidentCaseView.js';
import { VulnerabilityManagementView } from './components/operations/VulnerabilityManagementView.js';
import { DLPView } from './components/operations/DLPView.js';
import { RiskRegisterView } from './components/governance/RiskRegisterView.js';
import { ThreatModelWorkspace } from './components/governance/ThreatModelWorkspace.js';
import { SecurityExceptionsView } from './components/governance/SecurityExceptionsView.js';
import { ApprovalsView } from './components/governance/ApprovalsView.js';
import { KnowledgeBaseView } from './components/kb/KnowledgeBaseView.js';
import { AdminCenterView } from './components/admin/AdminCenterView.js';
import { DepartmentHubView } from './components/departments/DepartmentHubView.js';
import { DepartmentAdminPortal } from './components/departments/DepartmentAdminPortal.js';
import { UniversalWorkflowWorkspace } from './components/workflows/UniversalWorkflowWorkspace.js';
import { AccessDeniedView } from './components/common/AccessDeniedView.js';
import { LDAPSignInModal } from './components/auth/LDAPSignInModal.js';
import { BankAuthPortal } from './components/auth/BankAuthPortal.js';
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

const apiErrorMessage = (data: any, fallback: string): string => {
  const message = data?.error || data?.detail || data?.message || data?.title;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

export const App: React.FC = () => {
  const { currentUser, isLoading, fetchWithAuth } = useAuth();
  const { t } = useI18n();

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
    fetchWithAuth('/api/approvals/pending')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && (data.pendingApprovals || data.pending)) {
          const list = data.pendingApprovals || data.pending || [];
          setPendingApprovalsList(list);
          setPendingApprovalsCount(list.length);
        }
      })
      .catch(() => {});

    // Load Applications & Assets
    fetchWithAuth('/api/applications')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setApplications(data.applications);
      });

    fetchWithAuth('/api/assets')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAssets(data.assets);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-semantic-auth-loading flex flex-col items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-semantic-brand to-semantic-info p-0.5 shadow-brand-glow animate-pulse">
            <div className="w-full h-full bg-semantic-auth-loading rounded-[14px] flex items-center justify-center">
              <span className="text-xl">🛡️</span>
            </div>
          </div>
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

  if (!currentUser) {
    return <BankAuthPortal onLoginSuccess={loadData} />;
  }

  return (
    <AppLayout
      activeView={activeDestination}
      onSelectView={(v) => {
        handleNavigate(v);
      }}
      activeDepartmentId={activeDepartmentId}
      onSelectDepartment={(dId) => {
        setActiveDepartmentId(dId);
        if (dId) {
          setSelectedAdminDeptId(dId);
        }
      }}
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
        if (t && t.id) {
          handleSelectTicket(t);
        }
      }}
      onNavigate={handleNavigate}
      isCreateOpen={isCreateModalOpen}
      onOpenCreate={() => setIsCreateModalOpen(true)}
      onCloseCreate={() => setIsCreateModalOpen(false)}
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
              tickets={tickets.filter(
                (t) =>
                  t.assigneeId === currentUser?.id ||
                  (!t.assigneeId && (
                    (t.targetDepartmentId && t.targetDepartmentId === currentUser?.departmentId) ||
                    (t.departmentId && t.departmentId === currentUser?.departmentId) ||
                    (t.assignmentGroupId && currentUser?.teamIds?.includes(t.assignmentGroupId)) ||
                    t.participatingDepartmentIds?.includes(currentUser?.departmentId || '')
                  ))
              )}
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
              tickets={tickets.filter(
                (t) => t.reporterId === currentUser?.id
              )}
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
              onOpenTicket={(id) => handleNavigate(activeDestination, id)}
              onRefresh={loadData}
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
              tickets={scopedTickets.filter((t) => t.category === 'INCIDENT' || t.ticketTypeId === 'INCIDENT')}
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
              tickets={scopedTickets.filter(
                (t) =>
                  t.category === 'GENERAL_REQUEST' ||
                  t.category === 'IAM_REQUEST' ||
                  t.ticketTypeName?.includes('Request') ||
                  Boolean(t.tags?.includes('REQUEST'))
              )}
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
              tickets={scopedTickets.filter(
                (t) =>
                  Boolean(t.tags?.includes('CAB')) ||
                  Boolean(t.tags?.includes('CHANGE')) ||
                  Boolean(t.ticketTypeName?.includes('Change'))
              )}
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
              tickets={scopedTickets.filter(
                (t) =>
                  Boolean(t.tags?.includes('RCA')) ||
                  Boolean(t.tags?.includes('PROBLEM')) ||
                  Boolean(t.ticketTypeName?.includes('Problem'))
              )}
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
          {activeDestination === 'asset-inventory' && (
            <CMDBAssetInventoryView />
          )}

          {activeDestination === 'discovery-sources' && <DiscoveryAdminView mode="sources" onNavigateToRuns={(connectorId) => { handleNavigate('discovery-runs'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('aegis:discovery-select-connector', { detail: connectorId })), 0); }} />}
          {activeDestination === 'discovery-runs' && <DiscoveryAdminView mode="runs" />}
          {activeDestination === 'correlation-review' && <DiscoveryAdminView mode="correlation" />}

          {activeDestination === 'configuration-items' && (
            <CMDBExplorerView mode="all" initialCiId={cmdbFocusCiId} />
          )}

          {activeDestination === 'business-services' && (
            <CMDBExplorerView mode="business-services" />
          )}

          {activeDestination === 'applications' && (
            <CMDBExplorerView mode="applications" />
          )}

          {activeDestination === 'relationship-map' && (
            <CMDBRelationshipMapView onOpenDetails={(ciId) => { setCmdbFocusCiId(ciId); handleNavigate('configuration-items'); }} />
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
    </AppLayout>
  );
};
