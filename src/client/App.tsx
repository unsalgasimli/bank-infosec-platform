import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { TicketListView } from './components/tickets/TicketListView.js';
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
import { Ticket } from '../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../shared/types/asset.js';
import { RiskRegisterItem } from '../shared/types/risk.js';
import { KBArticle } from '../shared/types/kb.js';

export const App: React.FC = () => {
  const { currentUser, fetchWithAuth } = useAuth();

  const [activeView, setActiveView] = useState<string>('ciso-dash');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [applications, setApplications] = useState<BankApplication[]>([]);
  const [assets, setAssets] = useState<BankAsset[]>([]);
  const [risks, setRisks] = useState<RiskRegisterItem[]>([]);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [cisoMetrics, setCisoMetrics] = useState<any>(null);
  const [leadMetrics, setLeadMetrics] = useState<any>(null);
  const [analystWorkspace, setAnalystWorkspace] = useState<any>(null);

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

  const handleTransition = async (transitionId: string, comment?: string) => {
    if (!selectedTicketId) return;
    const res = await fetchWithAuth(`/api/tickets/${selectedTicketId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionId, comment }),
    });
    const data = await res.json();
    if (data.success) {
      loadData();
      // Reload ticket detail
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
      // Reload ticket detail
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

  return (
    <AppLayout
      activeView={activeView}
      onSelectView={(v) => {
        setActiveView(v);
        setSelectedTicketId(null);
      }}
      tickets={tickets}
      applications={applications}
      assets={assets}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onTicketCreated={(t) => {
        loadData();
        setSelectedTicketId(t.id);
      }}
      onNavigate={handleNavigate}
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
        />
      ) : (
        <>
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

          {activeView === 'lead-dash' && (
            <LeadDashboard
              workload={leadMetrics?.workload || []}
              queues={leadMetrics?.queues || []}
              onSelectQueue={(jql) => {
                setJqlQuery(jql);
                setActiveView('tickets');
              }}
            />
          )}

          {activeView === 'analyst-dash' && (
            <AnalystDashboard
              myTickets={analystWorkspace?.myTickets || []}
              myApprovals={analystWorkspace?.myApprovals || []}
              watchedTickets={analystWorkspace?.watchedTickets || []}
              slaApproaching={analystWorkspace?.slaApproaching || []}
              onSelectTicket={handleSelectTicket}
            />
          )}

          {(activeView === 'tickets' || activeView === 'my-tickets' || activeView === 'watched-tickets' || activeView === 'overdue-tickets') && (
            <TicketListView
              tickets={
                activeView === 'my-tickets'
                  ? tickets.filter((t) => t.assigneeId === currentUser?.id)
                  : activeView === 'watched-tickets'
                  ? tickets.filter((t) => t.watcherIds.includes(currentUser?.id || ''))
                  : activeView === 'overdue-tickets'
                  ? tickets.filter((t) => t.slaState === 'AT_RISK' || t.slaState === 'BREACHED')
                  : tickets
              }
              applications={applications}
              assets={assets}
              onSelectTicket={handleSelectTicket}
              onRefresh={loadData}
              jqlQuery={jqlQuery}
              onJqlChange={setJqlQuery}
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
    </AppLayout>
  );
};
