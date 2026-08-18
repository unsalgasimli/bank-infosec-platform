import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { WrikeTableView } from './components/views/WrikeTableView.js';
import { IdeateCanvasView } from './components/ideate/IdeateCanvasView.js';
import { WrikeGanttView } from './components/views/WrikeGanttView.js';
import { WrikeWorkloadView } from './components/views/WrikeWorkloadView.js';
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
import { SecurityExceptionsView } from './components/governance/SecurityExceptionsView.js';
import { ApprovalsView } from './components/governance/ApprovalsView.js';
import { ApplicationCMDBView } from './components/assets/ApplicationCMDBView.js';
import { AssetInventoryView } from './components/assets/AssetInventoryView.js';
import { KnowledgeBaseView } from './components/kb/KnowledgeBaseView.js';
import { AdminCenterView } from './components/admin/AdminCenterView.js';
import { TicketKanbanBoard } from './components/tickets/TicketKanbanBoard.js';
import { DepartmentHubView } from './components/departments/DepartmentHubView.js';
import { DepartmentAdminPortal } from './components/departments/DepartmentAdminPortal.js';
import { CrossDepartmentHubView } from './components/departments/CrossDepartmentHubView.js';
import { Ticket } from '../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../shared/types/asset.js';
import { RiskRegisterItem } from '../shared/types/risk.js';
import { KBArticle } from '../shared/types/kb.js';

export const App: React.FC = () => {
  const { currentUser, fetchWithAuth } = useAuth();

  const [activeView, setActiveView] = useState<string>('table');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isProofingOpen, setIsProofingOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null);
  const [selectedAdminDeptId, setSelectedAdminDeptId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [applications, setApplications] = useState<BankApplication[]>([]);
  const [assets, setAssets] = useState<BankAsset[]>([]);
  const [risks, setRisks] = useState<RiskRegisterItem[]>([]);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [cisoMetrics, setCisoMetrics] = useState<any>(null);
  const [leadMetrics, setLeadMetrics] = useState<any>(null);
  const [analystWorkspace, setAnalystWorkspace] = useState<any>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  const [ticketDetailData, setTicketDetailData] = useState<any>(null);
  const [jqlQuery, setJqlQuery] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = () => {
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
        if (data.success && data.pendingApprovals) {
          setPendingApprovalsCount(data.pendingApprovals.length);
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
      fetchWithAuth(`/api/tickets/${selectedTicketId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setTicketDetailData(data);
          } else {
            alert(`Access Denied: ${data.error}`);
            setSelectedTicketId(null);
          }
        })
        .catch((err) => console.error(err));
    } else {
      setTicketDetailData(null);
    }
  }, [selectedTicketId, currentUser]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
  };

  const handleNavigate = (view: string, ticketId?: string) => {
    setActiveView(view);
    if (ticketId) {
      setSelectedTicketId(ticketId);
    } else {
      setSelectedTicketId(null);
    }
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
      alert(`Transition Failed: ${data.error}`);
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
      alert(`Approval Failed: ${data.error}`);
    }
  };

  const handleCreateTaskFromIdea = async (idea: any) => {
    const res = await fetchWithAuth('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectCode: 'SEC',
        ticketTypeId: idea.category || 'INCIDENT',
        title: idea.title,
        description: idea.description,
        technicalSeverity: 'HIGH',
        businessPriority: idea.priority || 'P2_HIGH',
        businessImpact: 'SIGNIFICANT',
        confidentiality: 'RESTRICTED',
        tags: idea.tags || ['IDEATE'],
      }),
    });
    const data = await res.json();
    if (data.success) {
      loadData();
    }
  };

  return (
    <AppLayout
      activeView={activeView}
      onSelectView={(v) => {
        setActiveView(v);
        setSelectedTicketId(null);
      }}
      activeDepartmentId={activeDepartmentId}
      onSelectDepartment={(dId) => {
        setActiveDepartmentId(dId);
        if (dId) {
          setSelectedAdminDeptId(dId);
        }
      }}
      tickets={
        activeDepartmentId
          ? tickets.filter(
              (t) =>
                t.departmentId === activeDepartmentId ||
                t.targetDepartmentId === activeDepartmentId ||
                t.participatingDepartmentIds?.includes(activeDepartmentId)
            )
          : tickets
      }
      applications={applications}
      assets={assets}
      risks={risks}
      kbArticles={kbArticles}
      pendingApprovalsCount={pendingApprovalsCount}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onRunJql={(jql) => {
        setJqlQuery(jql);
        setActiveView('table');
      }}
      onTicketCreated={(t) => {
        loadData();
        if (t && t.id) {
          setSelectedTicketId(t.id);
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
          lifecycle={ticketDetailData.lifecycle}
          onBack={() => setSelectedTicketId(null)}
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
        />
      ) : (
        <>
          {/* Wrike Core Feature Views */}
          {(activeView === 'table' || activeView === 'tickets') && (
            <WrikeTableView
              tickets={
                activeDepartmentId
                  ? tickets.filter(
                      (t) =>
                        t.departmentId === activeDepartmentId ||
                        t.targetDepartmentId === activeDepartmentId ||
                        t.participatingDepartmentIds?.includes(activeDepartmentId)
                    )
                  : tickets
              }
              applications={applications}
              assets={assets}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
            />
          )}

          {/* Bank Multi-Department Hub & Admin Portal */}
          {activeView === 'departments' && (
            <DepartmentHubView
              onSelectDepartment={(deptId) => {
                setSelectedAdminDeptId(deptId);
                setActiveView('dept-admin');
              }}
              onNavigate={handleNavigate}
            />
          )}

          {activeView === 'dept-admin' && (
            <DepartmentAdminPortal
              departmentId={selectedAdminDeptId || currentUser?.departmentId || 'dept-secops'}
              onBack={() => setActiveView('departments')}
              onNavigate={handleNavigate}
              onRefreshData={loadData}
            />
          )}

          {/* Cross-Department Orchestration Pipelines */}
          {activeView === 'cross-tasks' && (
            <CrossDepartmentHubView
              onSelectTicket={handleSelectTicket}
              onNavigate={handleNavigate}
              onRefreshTickets={loadData}
            />
          )}

          {activeView === 'ideate' && (
            <IdeateCanvasView
              onNavigate={handleNavigate}
              onRefreshTickets={loadData}
            />
          )}

          {activeView === 'gantt' && (
            <WrikeGanttView
              tickets={tickets}
              onSelectTicket={handleSelectTicket}
              onOpenCreate={() => setIsCreateModalOpen(true)}
            />
          )}

          {activeView === 'board' && (
            <TicketKanbanBoard tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeView === 'workload' && (
            <WrikeWorkloadView
              tickets={tickets}
              onSelectTicket={handleSelectTicket}
              onRefreshTickets={loadData}
            />
          )}

          {activeView === 'request-forms' && (
            <WrikeRequestFormsView
              onFormSubmitted={() => {
                loadData();
                setActiveView('table');
              }}
            />
          )}

          {activeView === 'automations' && (
            <WrikeAutomationsView
              onRefreshTickets={loadData}
              onNavigate={handleNavigate}
            />
          )}

          {activeView === 'ciso-dash' && (
            <CISODashboard
              metrics={cisoMetrics}
              risks={risks}
              tickets={tickets}
              applications={applications}
              onSelectTicket={handleSelectTicket}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'soc-incidents' && (
            <IncidentCaseView tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeView === 'vulnerabilities' && (
            <VulnerabilityManagementView
              tickets={tickets}
              onSelectTicket={handleSelectTicket}
              onRefresh={loadData}
            />
          )}

          {activeView === 'dlp-investigations' && (
            <DLPView tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeView === 'risk-register' && (
            <RiskRegisterView risks={risks} />
          )}

          {activeView === 'security-exceptions' && (
            <SecurityExceptionsView tickets={tickets} onSelectTicket={handleSelectTicket} />
          )}

          {activeView === 'approvals' && (
            <ApprovalsView
              pendingApprovals={
                analystWorkspace?.myApprovals?.map((chain: any) => ({
                  chain,
                  step: chain.steps.find((s: any) => s.status === 'PENDING'),
                })) || []
              }
              onOpenTicket={(id) => setSelectedTicketId(id)}
            />
          )}

          {activeView === 'applications' && (
            <ApplicationCMDBView applications={applications} />
          )}

          {activeView === 'assets' && (
            <AssetInventoryView assets={assets} />
          )}

          {activeView === 'knowledge-base' && (
            <KnowledgeBaseView articles={kbArticles} />
          )}

          {activeView === 'admin-center' && (
            <AdminCenterView />
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
