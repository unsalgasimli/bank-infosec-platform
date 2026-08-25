import React, { useState } from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Flame,
  Layers,
  TrendingUp,
  Lock,
  FileText,
  ArrowRight,
  Download,
  Calendar,
  Sparkles,
  Printer,
  X,
  ExternalLink,
  Star,
  Plus,
  LayoutGrid,
  Share2,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import { RiskHeatMap } from '../common/RiskHeatMap.js';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { BankApplication } from '../../../shared/types/asset.js';
import { Badge } from '../common/Badge.js';

interface CISODashboardProps {
  metrics: any;
  risks: RiskRegisterItem[];
  tickets: Ticket[];
  applications: BankApplication[];
  onSelectTicket: (ticket: Ticket) => void;
  onNavigate: (view: string) => void;
}

export const CISODashboard: React.FC<CISODashboardProps> = ({
  metrics,
  risks,
  tickets,
  applications,
  onSelectTicket,
  onNavigate,
}) => {
  const [selectedCell, setSelectedCell] = useState<{ likelihood: number; impact: number } | null>(null);
  const [timeRange, setTimeRange] = useState<'TODAY' | '7D' | '30D' | 'Q1'>('30D');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isStarred, setIsStarred] = useState(true);

  if (!metrics) {
    return (
      <div className="p-12 text-center text-semantic-jira-muted text-xs font-mono">
        Loading Jira Dashboard Gadgets...
      </div>
    );
  }

  const criticalTickets = tickets.filter(
    (t) => t.technicalSeverity === 'CRITICAL' && t.statusCategory !== 'DONE'
  );

  const filteredRisks = selectedCell
    ? risks.filter((r) => r.likelihood === selectedCell.likelihood && r.impact === selectedCell.impact)
    : risks;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-semantic-jira-surface custom-scrollbar select-none text-xs">
      {/* Jira Dashboard Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-semantic-jira-border">
        <div>
          <div className="flex items-center gap-1.5 text-label text-semantic-jira-muted mb-1">
            <span className="hover:underline cursor-pointer" onClick={() => onNavigate('ciso-dash')}>Dashboards</span>
            <span>/</span>
            <span className="text-semantic-jira-primary">Apex Bank Security Operations</span>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-semantic-jira-primary tracking-tight">
              CISO Cyber Risk & Operations Executive Dashboard
            </h1>
            <button
              onClick={() => setIsStarred(!isStarred)}
              className="text-semantic-warning-bright hover:opacity-80 p-0.5"
              title={isStarred ? 'Unstar dashboard' : 'Star dashboard'}
            >
              <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
            </button>
            <span className="px-2 py-0.5 rounded bg-semantic-panel text-semantic-jira-muted text-caption font-mono border border-semantic-jira-border">
              DEFAULT SYSTEM DASHBOARD
            </span>
          </div>
        </div>

        {/* Jira Dashboard Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center bg-semantic-panel p-0.5 rounded border border-semantic-jira-border text-xs">
            {(['TODAY', '7D', '30D', 'Q1'] as const).map((tr) => (
              <button
                key={tr}
                onClick={() => setTimeRange(tr)}
                className={`px-2.5 py-1 rounded text-label font-medium transition-colors ${
                  timeRange === tr ? 'bg-semantic-jira-brand text-white font-semibold' : 'text-semantic-jira-muted hover:text-semantic-jira-primary'
                }`}
              >
                {tr === 'TODAY' ? 'Today' : tr === '7D' ? '7 Days' : tr === '30D' ? '30 Days' : 'Q1 2026'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="jira-btn-secondary py-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Briefing</span>
          </button>

          <button
            className="jira-btn-subtle py-1"
            title="Edit Layout"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Edit layout</span>
          </button>

          <button
            className="jira-btn-subtle p-1.5"
            title="Dashboard options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2-Column Jira Gadget Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gadget 1: Filter Results - Open Critical Security Findings */}
        <div className="bg-semantic-panel border border-semantic-jira-border rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-semantic-panel border-b border-semantic-jira-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-semantic-danger-strong" />
              <h3 className="font-bold text-semantic-jira-primary text-xs">
                Filter Results: Open Critical Security Issues (P1)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-semantic-jira-blocked-surface text-semantic-danger-strong font-mono text-caption font-bold border border-semantic-jira-blocked-border">
                {criticalTickets.length} Issues
              </span>
              <button className="text-semantic-jira-muted hover:text-semantic-jira-primary p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-3 flex-1 flex flex-col justify-between">
            {criticalTickets.length === 0 ? (
              <div className="py-10 text-center text-semantic-jira-muted italic text-xs space-y-1">
                <div>No matching issues found for filter:</div>
                <div className="font-mono text-label text-semantic-jira-muted-light">
                  project = "SEC" AND priority = "Critical" AND statusCategory != Done
                </div>
              </div>
            ) : (
              <div className="divide-y divide-semantic-jira-border">
                {criticalTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className="py-2 px-2 hover:bg-semantic-jira-hover rounded cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Badge type="PROJECT" value={ticket.projectCode} />
                      <span className="font-mono font-bold text-semantic-jira-brand">{ticket.key}</span>
                      <span className="font-medium text-semantic-jira-primary truncate">{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="jira-lozenge jira-lozenge-inprogress text-caption">
                        {ticket.statusName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-semantic-jira-border flex items-center justify-between text-label text-semantic-jira-muted">
              <span>JQL: <code className="font-mono text-semantic-jira-brand">priority = Critical AND resolution = Unresolved</code></span>
              <button
                onClick={() => onNavigate('tickets')}
                className="text-semantic-jira-brand hover:underline font-medium flex items-center gap-1"
              >
                View all in search <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Gadget 2: SLA Performance & Resolution Velocity */}
        <div className="bg-semantic-panel border border-semantic-jira-border rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-semantic-panel border-b border-semantic-jira-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-semantic-jira-brand" />
              <h3 className="font-bold text-semantic-jira-primary text-xs">
                SLA Compliance & Remediation Velocity Gauge
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-semantic-success-soft text-semantic-success font-mono text-caption font-bold border border-semantic-success-soft-border">
                {metrics.slaComplianceRate || 100}% MET
              </span>
              <button className="text-semantic-jira-muted hover:text-semantic-jira-primary p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
              <div className="p-2.5 rounded bg-semantic-panel border border-semantic-jira-border">
                <div className="text-caption text-semantic-jira-muted uppercase">SLA Met Rate</div>
                <div className="text-lg font-bold text-semantic-success mt-0.5">{metrics.slaComplianceRate || 100}%</div>
                <div className="text-micro text-semantic-jira-muted font-sans">Target: ≥ 98%</div>
              </div>
              <div className="p-2.5 rounded bg-semantic-panel border border-semantic-jira-border">
                <div className="text-caption text-semantic-jira-muted uppercase">MTTR (Resolution)</div>
                <div className="text-lg font-bold text-semantic-jira-primary mt-0.5">{metrics.mttrHours || 6.4}h</div>
                <div className="text-micro text-semantic-jira-muted font-sans">Target: ≤ 24h</div>
              </div>
              <div className="p-2.5 rounded bg-semantic-panel border border-semantic-jira-border">
                <div className="text-caption text-semantic-jira-muted uppercase">MTTA (Triage)</div>
                <div className="text-lg font-bold text-semantic-jira-brand mt-0.5">{metrics.mttaMinutes || 18}m</div>
                <div className="text-micro text-semantic-jira-muted font-sans">Target: ≤ 30m</div>
              </div>
              <div className="p-2.5 rounded bg-semantic-panel border border-semantic-jira-border">
                <div className="text-caption text-semantic-jira-muted uppercase">Exceptions</div>
                <div className="text-lg font-bold text-semantic-jira-primary mt-0.5">{metrics.activeExceptionsCount || 0}</div>
                <div className="text-micro text-semantic-jira-muted font-sans">Active & Validated</div>
              </div>
            </div>

            <div className="p-3 bg-semantic-panel rounded border border-semantic-jira-border space-y-1.5">
              <div className="flex items-center justify-between text-label">
                <span className="font-semibold text-semantic-jira-primary">SLA Escalation Timeline:</span>
                <span className="text-semantic-jira-muted">0 Breached / 0 At Risk</span>
              </div>
              <div className="w-full h-2 bg-semantic-panel rounded-full overflow-hidden border border-semantic-jira-border flex">
                <div className="bg-semantic-success h-full w-full" />
              </div>
            </div>

            <div className="pt-2 border-t border-semantic-jira-border flex items-center justify-between text-label text-semantic-jira-muted">
              <span>Coverage: Tier-1 Core Banking Systems</span>
              <button
                onClick={() => onNavigate('overdue-tickets')}
                className="text-semantic-jira-brand hover:underline font-medium flex items-center gap-1"
              >
                View SLA Queues <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Gadget 3: Two-Dimensional Filter Statistics - 5x5 Enterprise Risk Matrix */}
        <div className="bg-semantic-panel border border-semantic-jira-border rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-semantic-panel border-b border-semantic-jira-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-semantic-jira-brand" />
              <h3 className="font-bold text-semantic-jira-primary text-xs">
                Two-Dimensional Filter Statistics: 5×5 Enterprise Risk Matrix
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-semantic-panel text-semantic-jira-primary font-mono text-caption border border-semantic-jira-border">
                ISO 31000
              </span>
              <button className="text-semantic-jira-muted hover:text-semantic-jira-primary p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
            <RiskHeatMap
              risks={risks}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
            />

            {/* Selected Cell Preview */}
            {selectedCell && (
              <div className="bg-semantic-panel border border-semantic-jira-border rounded p-3 space-y-2">
                <div className="flex items-center justify-between text-xs border-b border-semantic-jira-border pb-1.5">
                  <span className="font-bold text-semantic-jira-primary">
                    Matching Likelihood {selectedCell.likelihood} × Impact {selectedCell.impact} ({filteredRisks.length} records)
                  </span>
                  <button
                    onClick={() => setSelectedCell(null)}
                    className="text-semantic-jira-brand hover:underline text-label"
                  >
                    Clear Filter
                  </button>
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                  {filteredRisks.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => onNavigate('risk-register')}
                      className="p-1.5 rounded bg-semantic-panel hover:bg-semantic-jira-hover border border-semantic-jira-border flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="truncate">
                        <span className="font-mono text-semantic-jira-brand font-semibold mr-2">{r.riskCode}</span>
                        <span className="text-semantic-jira-primary text-label">{r.title}</span>
                      </div>
                      <Badge type="SEVERITY" value={r.inherentRating} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-semantic-jira-border flex items-center justify-between text-label text-semantic-jira-muted">
              <span>Matrix Dimensions: Likelihood (1–5) × Consequence (1–5)</span>
              <button
                onClick={() => onNavigate('risk-register')}
                className="text-semantic-jira-brand hover:underline font-medium flex items-center gap-1"
              >
                Open Risk Register <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Gadget 4: Issue Statistics - Workload by Security Domain */}
        <div className="bg-semantic-panel border border-semantic-jira-border rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-semantic-panel border-b border-semantic-jira-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-semantic-jira-brand" />
              <h3 className="font-bold text-semantic-jira-primary text-xs">
                Issue Statistics: Workload by Security Domain
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-semantic-panel text-semantic-jira-primary font-mono text-caption border border-semantic-jira-border">
                {Object.keys(metrics.domainBreakdown || {}).length} Domains
              </span>
              <button className="text-semantic-jira-muted hover:text-semantic-jira-primary p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
            <div className="space-y-2.5 text-xs">
              {Object.entries(metrics.domainBreakdown || {}).map(([dom, count]: [string, any]) => (
                <div key={dom} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-semantic-jira-primary">{dom.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-bold text-semantic-jira-primary">{count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-semantic-panel rounded-full overflow-hidden border border-semantic-jira-border">
                    <div
                      className="h-full bg-semantic-jira-brand rounded-full"
                      style={{ width: `${Math.min(100, (count / (metrics.totalOpen || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-semantic-panel rounded border border-semantic-jira-border flex items-center justify-between text-xs">
              <div>
                <div className="text-caption text-semantic-jira-muted uppercase">Total Active Infrastructure</div>
                <div className="text-sm font-bold text-semantic-jira-primary font-mono">
                  {applications.length} Apps • {risks.length} Risks
                </div>
              </div>
              <button
                onClick={() => onNavigate('applications')}
                className="jira-btn-secondary text-label py-1"
              >
                Inspect CMDB
              </button>
            </div>

            <div className="pt-2 border-t border-semantic-jira-border flex items-center justify-between text-label text-semantic-jira-muted">
              <span>Grouped by: <code className="font-mono text-semantic-jira-brand">cf[10020] (Domain)</code></span>
              <button
                onClick={() => onNavigate('tickets')}
                className="text-semantic-jira-brand hover:underline font-medium flex items-center gap-1"
              >
                View all tickets in Jira <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Executive Summary Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-dsOverlay flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl bg-semantic-panel border border-semantic-jira-border rounded-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-semantic-jira-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-semantic-jira-brand" />
                <h3 className="text-sm font-bold text-semantic-jira-primary">
                  Executive InfoSec Briefing & Board Summary
                </h3>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded text-semantic-jira-muted hover:text-semantic-jira-primary hover:bg-semantic-jira-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-semantic-jira-primary font-sans leading-relaxed">
              <div className="p-3 bg-semantic-panel rounded border border-semantic-jira-border space-y-1 font-mono text-label">
                <div>DATE: {new Date().toLocaleDateString()} | GENERATED BY: AegisSec CISO Executive Module</div>
                <div>CLASSIFICATION: <strong className="text-semantic-danger-strong">CONFIDENTIAL - BOARD & AUDIT COMMITTEE</strong></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
                <div className="p-2 rounded bg-semantic-panel border border-semantic-jira-border">
                  <div className="text-semantic-jira-muted text-caption">CRITICAL FINDINGS</div>
                  <div className="text-lg font-bold text-semantic-danger-strong">{metrics.criticalCount}</div>
                </div>
                <div className="p-2 rounded bg-semantic-panel border border-semantic-jira-border">
                  <div className="text-semantic-jira-muted text-caption">HIGH SEVERITY</div>
                  <div className="text-lg font-bold text-semantic-warning-bright">{metrics.highCount}</div>
                </div>
                <div className="p-2 rounded bg-semantic-panel border border-semantic-jira-border">
                  <div className="text-semantic-jira-muted text-caption">SLA COMPLIANCE</div>
                  <div className="text-lg font-bold text-semantic-success">{metrics.slaComplianceRate || 100}%</div>
                </div>
                <div className="p-2 rounded bg-semantic-panel border border-semantic-jira-border">
                  <div className="text-semantic-jira-muted text-caption">ACTIVE INCIDENTS</div>
                  <div className="text-lg font-bold text-semantic-jira-brand">{metrics.incidentCount}</div>
                </div>
              </div>

              <div className="p-3 bg-semantic-panel rounded border border-semantic-jira-border space-y-1.5 text-xs">
                <div className="font-bold text-semantic-jira-primary">Key Executive Recommendations:</div>
                <ul className="list-disc pl-4 space-y-1 text-semantic-jira-muted">
                  <li>Prioritize remediation of {metrics.criticalCount} critical findings affecting Tier-1 Digital Banking Core.</li>
                  <li>Review dual-control sign-off backlog to ensure no policy exceptions expire unrenewed.</li>
                  <li>Enforce SLA adherence across application development teams for OWASP Top 10 vulnerabilities.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-semantic-jira-border">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="jira-btn-subtle"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print();
                  setIsExportModalOpen(false);
                }}
                className="jira-btn-primary flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export / Print PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
