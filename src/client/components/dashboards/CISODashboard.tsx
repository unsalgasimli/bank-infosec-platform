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
      <div className="p-12 text-center text-[#5E6C84] text-xs font-mono">
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
    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F4F5F7] custom-scrollbar select-none text-xs">
      {/* Jira Dashboard Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DFE1E6]">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#5E6C84] mb-1">
            <span className="hover:underline cursor-pointer" onClick={() => onNavigate('ciso-dash')}>Dashboards</span>
            <span>/</span>
            <span className="text-[#172B4D]">Apex Bank Security Operations</span>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-[#172B4D] tracking-tight">
              CISO Cyber Risk & Operations Executive Dashboard
            </h1>
            <button
              onClick={() => setIsStarred(!isStarred)}
              className="text-[#FF8B00] hover:opacity-80 p-0.5"
              title={isStarred ? 'Unstar dashboard' : 'Star dashboard'}
            >
              <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
            </button>
            <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#5E6C84] text-[10px] font-mono border border-[#DFE1E6]">
              DEFAULT SYSTEM DASHBOARD
            </span>
          </div>
        </div>

        {/* Jira Dashboard Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center bg-[#FFFFFF] p-0.5 rounded border border-[#DFE1E6] text-xs">
            {(['TODAY', '7D', '30D', 'Q1'] as const).map((tr) => (
              <button
                key={tr}
                onClick={() => setTimeRange(tr)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  timeRange === tr ? 'bg-[#0052CC] text-white font-semibold' : 'text-[#5E6C84] hover:text-[#172B4D]'
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
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#FFFFFF] border-b border-[#DFE1E6] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#DE350B]" />
              <h3 className="font-bold text-[#172B4D] text-xs">
                Filter Results: Open Critical Security Issues (P1)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#FFEBE6] text-[#DE350B] font-mono text-[10px] font-bold border border-[#FFBDAD]">
                {criticalTickets.length} Issues
              </span>
              <button className="text-[#5E6C84] hover:text-[#172B4D] p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-3 flex-1 flex flex-col justify-between">
            {criticalTickets.length === 0 ? (
              <div className="py-10 text-center text-[#5E6C84] italic text-xs space-y-1">
                <div>No matching issues found for filter:</div>
                <div className="font-mono text-[11px] text-[#7A869A]">
                  project = "SEC" AND priority = "Critical" AND statusCategory != Done
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#DFE1E6]">
                {criticalTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className="py-2 px-2 hover:bg-[#EBECF0] rounded cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Badge type="PROJECT" value={ticket.projectCode} />
                      <span className="font-mono font-bold text-[#0052CC]">{ticket.key}</span>
                      <span className="font-medium text-[#172B4D] truncate">{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="jira-lozenge jira-lozenge-inprogress text-[10px]">
                        {ticket.statusName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-[#DFE1E6] flex items-center justify-between text-[11px] text-[#5E6C84]">
              <span>JQL: <code className="font-mono text-[#0052CC]">priority = Critical AND resolution = Unresolved</code></span>
              <button
                onClick={() => onNavigate('tickets')}
                className="text-[#0052CC] hover:underline font-medium flex items-center gap-1"
              >
                View all in search <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Gadget 2: SLA Performance & Resolution Velocity */}
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#FFFFFF] border-b border-[#DFE1E6] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0052CC]" />
              <h3 className="font-bold text-[#172B4D] text-xs">
                SLA Compliance & Remediation Velocity Gauge
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#E3FCEF] text-[#006644] font-mono text-[10px] font-bold border border-[#ABF5D1]">
                {metrics.slaComplianceRate || 100}% MET
              </span>
              <button className="text-[#5E6C84] hover:text-[#172B4D] p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
              <div className="p-2.5 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                <div className="text-[10px] text-[#5E6C84] uppercase">SLA Met Rate</div>
                <div className="text-lg font-bold text-[#006644] mt-0.5">{metrics.slaComplianceRate || 100}%</div>
                <div className="text-[9px] text-[#5E6C84] font-sans">Target: ≥ 98%</div>
              </div>
              <div className="p-2.5 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                <div className="text-[10px] text-[#5E6C84] uppercase">MTTR (Resolution)</div>
                <div className="text-lg font-bold text-[#172B4D] mt-0.5">{metrics.mttrHours || 6.4}h</div>
                <div className="text-[9px] text-[#5E6C84] font-sans">Target: ≤ 24h</div>
              </div>
              <div className="p-2.5 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                <div className="text-[10px] text-[#5E6C84] uppercase">MTTA (Triage)</div>
                <div className="text-lg font-bold text-[#0052CC] mt-0.5">{metrics.mttaMinutes || 18}m</div>
                <div className="text-[9px] text-[#5E6C84] font-sans">Target: ≤ 30m</div>
              </div>
              <div className="p-2.5 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                <div className="text-[10px] text-[#5E6C84] uppercase">Exceptions</div>
                <div className="text-lg font-bold text-[#172B4D] mt-0.5">{metrics.activeExceptionsCount || 0}</div>
                <div className="text-[9px] text-[#5E6C84] font-sans">Active & Validated</div>
              </div>
            </div>

            <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#172B4D]">SLA Escalation Timeline:</span>
                <span className="text-[#5E6C84]">0 Breached / 0 At Risk</span>
              </div>
              <div className="w-full h-2 bg-[#FFFFFF] rounded-full overflow-hidden border border-[#DFE1E6] flex">
                <div className="bg-[#006644] h-full" style={{ width: '100%' }} />
              </div>
            </div>

            <div className="pt-2 border-t border-[#DFE1E6] flex items-center justify-between text-[11px] text-[#5E6C84]">
              <span>Coverage: Tier-1 Core Banking Systems</span>
              <button
                onClick={() => onNavigate('overdue-tickets')}
                className="text-[#0052CC] hover:underline font-medium flex items-center gap-1"
              >
                View SLA Queues <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Gadget 3: Two-Dimensional Filter Statistics - 5x5 Enterprise Risk Matrix */}
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#FFFFFF] border-b border-[#DFE1E6] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0052CC]" />
              <h3 className="font-bold text-[#172B4D] text-xs">
                Two-Dimensional Filter Statistics: 5×5 Enterprise Risk Matrix
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#172B4D] font-mono text-[10px] border border-[#DFE1E6]">
                ISO 31000
              </span>
              <button className="text-[#5E6C84] hover:text-[#172B4D] p-1">
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
              <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded p-3 space-y-2">
                <div className="flex items-center justify-between text-xs border-b border-[#DFE1E6] pb-1.5">
                  <span className="font-bold text-[#172B4D]">
                    Matching Likelihood {selectedCell.likelihood} × Impact {selectedCell.impact} ({filteredRisks.length} records)
                  </span>
                  <button
                    onClick={() => setSelectedCell(null)}
                    className="text-[#0052CC] hover:underline text-[11px]"
                  >
                    Clear Filter
                  </button>
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                  {filteredRisks.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => onNavigate('risk-register')}
                      className="p-1.5 rounded bg-[#FFFFFF] hover:bg-[#EBECF0] border border-[#DFE1E6] flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="truncate">
                        <span className="font-mono text-[#0052CC] font-semibold mr-2">{r.riskCode}</span>
                        <span className="text-[#172B4D] text-[11px]">{r.title}</span>
                      </div>
                      <Badge type="SEVERITY" value={r.inherentRating} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-[#DFE1E6] flex items-center justify-between text-[11px] text-[#5E6C84]">
              <span>Matrix Dimensions: Likelihood (1–5) × Consequence (1–5)</span>
              <button
                onClick={() => onNavigate('risk-register')}
                className="text-[#0052CC] hover:underline font-medium flex items-center gap-1"
              >
                Open Risk Register <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Gadget 4: Issue Statistics - Workload by Security Domain */}
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#FFFFFF] border-b border-[#DFE1E6] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0052CC]" />
              <h3 className="font-bold text-[#172B4D] text-xs">
                Issue Statistics: Workload by Security Domain
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#172B4D] font-mono text-[10px] border border-[#DFE1E6]">
                {Object.keys(metrics.domainBreakdown || {}).length} Domains
              </span>
              <button className="text-[#5E6C84] hover:text-[#172B4D] p-1">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
            <div className="space-y-2.5 text-xs">
              {Object.entries(metrics.domainBreakdown || {}).map(([dom, count]: [string, any]) => (
                <div key={dom} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#172B4D]">{dom.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-bold text-[#172B4D]">{count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#FFFFFF] rounded-full overflow-hidden border border-[#DFE1E6]">
                    <div
                      className="h-full bg-[#0052CC] rounded-full"
                      style={{ width: `${Math.min(100, (count / (metrics.totalOpen || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] flex items-center justify-between text-xs">
              <div>
                <div className="text-[10px] text-[#5E6C84] uppercase">Total Active Infrastructure</div>
                <div className="text-sm font-bold text-[#172B4D] font-mono">
                  {applications.length} Apps • {risks.length} Risks
                </div>
              </div>
              <button
                onClick={() => onNavigate('applications')}
                className="jira-btn-secondary text-[11px] py-1"
              >
                Inspect CMDB
              </button>
            </div>

            <div className="pt-2 border-t border-[#DFE1E6] flex items-center justify-between text-[11px] text-[#5E6C84]">
              <span>Grouped by: <code className="font-mono text-[#0052CC]">cf[10020] (Domain)</code></span>
              <button
                onClick={() => onNavigate('tickets')}
                className="text-[#0052CC] hover:underline font-medium flex items-center gap-1"
              >
                View all tickets in Jira <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Executive Summary Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#0052CC]" />
                <h3 className="text-sm font-bold text-[#172B4D]">
                  Executive InfoSec Briefing & Board Summary
                </h3>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded text-[#5E6C84] hover:text-[#172B4D] hover:bg-[#EBECF0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#172B4D] font-sans leading-relaxed">
              <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-1 font-mono text-[11px]">
                <div>DATE: {new Date().toLocaleDateString()} | GENERATED BY: AegisSec CISO Executive Module</div>
                <div>CLASSIFICATION: <strong className="text-[#DE350B]">CONFIDENTIAL - BOARD & AUDIT COMMITTEE</strong></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
                <div className="p-2 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                  <div className="text-[#5E6C84] text-[10px]">CRITICAL FINDINGS</div>
                  <div className="text-lg font-bold text-[#DE350B]">{metrics.criticalCount}</div>
                </div>
                <div className="p-2 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                  <div className="text-[#5E6C84] text-[10px]">HIGH SEVERITY</div>
                  <div className="text-lg font-bold text-[#FF8B00]">{metrics.highCount}</div>
                </div>
                <div className="p-2 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                  <div className="text-[#5E6C84] text-[10px]">SLA COMPLIANCE</div>
                  <div className="text-lg font-bold text-[#006644]">{metrics.slaComplianceRate || 100}%</div>
                </div>
                <div className="p-2 rounded bg-[#FFFFFF] border border-[#DFE1E6]">
                  <div className="text-[#5E6C84] text-[10px]">ACTIVE INCIDENTS</div>
                  <div className="text-lg font-bold text-[#0052CC]">{metrics.incidentCount}</div>
                </div>
              </div>

              <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-1.5 text-xs">
                <div className="font-bold text-[#172B4D]">Key Executive Recommendations:</div>
                <ul className="list-disc pl-4 space-y-1 text-[#5E6C84]">
                  <li>Prioritize remediation of {metrics.criticalCount} critical findings affecting Tier-1 Digital Banking Core.</li>
                  <li>Review dual-control sign-off backlog to ensure no policy exceptions expire unrenewed.</li>
                  <li>Enforce SLA adherence across application development teams for OWASP Top 10 vulnerabilities.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#DFE1E6]">
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
