import React from 'react';
import { Shield, AlertTriangle, Clock, CheckCircle2, Flame, Layers, TrendingUp, Lock, FileText, ArrowRight } from 'lucide-react';
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
  if (!metrics) {
    return <div className="p-8 text-center text-slate-400 text-xs">Loading CISO Executive telemetry...</div>;
  }

  const criticalTickets = tickets.filter(
    (t) => t.technicalSeverity === 'CRITICAL' && t.statusCategory !== 'DONE'
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      {/* Top Header Card */}
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-mono font-medium text-slate-400 uppercase tracking-wider">
              Apex Bank International • Cybersecurity & GRC
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            CISO Risk & Operations Overview
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
            Real-time cybersecurity posture, SLA compliance metrics, 5×5 enterprise risk heat map, and vulnerability distribution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 px-3.5 rounded-md bg-bank-950 border border-slate-800 text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">SLA Compliance</div>
            <div className="text-lg font-mono font-bold text-emerald-400">{metrics.slaComplianceRate}%</div>
          </div>
          <div className="p-2.5 px-3.5 rounded-md bg-bank-950 border border-slate-800 text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">MTTA</div>
            <div className="text-lg font-mono font-bold text-blue-400">{metrics.mttaMinutes} min</div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Open Criticals */}
        <div className="bg-bank-900 border border-red-900/60 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-300">Open Criticals</span>
            <div className="p-1.5 rounded bg-red-950 text-red-400 border border-red-900">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-2">{metrics.criticalCount}</div>
          <div className="text-[11px] text-red-400 mt-1 font-medium">Requires immediate remediation oversight</div>
        </div>

        {/* Open Highs */}
        <div className="bg-bank-900 border border-orange-900/60 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-300">Open High Severity</span>
            <div className="p-1.5 rounded bg-orange-950 text-orange-400 border border-orange-900">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-2">{metrics.highCount}</div>
          <div className="text-[11px] text-orange-400 mt-1 font-medium">Under active engineering remediation</div>
        </div>

        {/* SLA Breaches */}
        <div className="bg-bank-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">SLA Breached / At Risk</span>
            <div className="p-1.5 rounded bg-bank-950 text-amber-400 border border-slate-800">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-2">
            <span className={metrics.slaBreached > 0 ? 'text-red-400' : 'text-slate-200'}>{metrics.slaBreached}</span>
            <span className="text-slate-500 text-base font-normal"> / {metrics.slaAtRisk}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Regulatory escalation deadline tracking</div>
        </div>

        {/* Active Governance Exceptions */}
        <div className="bg-bank-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Exceptions</span>
            <div className="p-1.5 rounded bg-bank-950 text-purple-400 border border-slate-800">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-2">{metrics.activeExceptionsCount}</div>
          <div className="text-[11px] text-purple-400 mt-1">With validated compensating controls</div>
        </div>
      </div>

      {/* 5x5 Risk Heat Map + Domain Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RiskHeatMap risks={risks} />

        {/* Domain Distribution */}
        <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Security Domain Workload Breakdown
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Open Cases</span>
            </div>
            <div className="space-y-2.5 text-xs">
              {Object.entries(metrics.domainBreakdown || {}).map(([dom, count]: [string, any]) => (
                <div key={dom} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-300">{dom.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-bold text-white">{count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-bank-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.min(100, (count / (metrics.totalOpen || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Mean Time To Remediate (MTTR): <strong className="text-white font-mono">{metrics.mttrHours} hrs</strong></span>
            <button
              onClick={() => onNavigate('tickets')}
              className="text-blue-400 hover:underline font-semibold flex items-center gap-1"
            >
              View all tickets <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Critical Security Incidents & Findings Action Table */}
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Critical Bank Tickets Requiring Immediate Action
            </h3>
          </div>
          <span className="text-[11px] font-mono bg-red-950 text-red-300 px-2 py-0.5 rounded border border-red-800 font-semibold">
            {criticalTickets.length} Priority One
          </span>
        </div>

        <div className="divide-y divide-slate-800 text-xs">
          {criticalTickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket(ticket)}
              className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 px-2 rounded transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge type="PROJECT" value={ticket.projectCode} />
                <span className="font-mono font-semibold text-white">{ticket.key}</span>
                <span className="text-slate-200 font-medium truncate max-w-lg">{ticket.title}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge type="SEVERITY" value={ticket.technicalSeverity} />
                <Badge type="SLA" value={ticket.slaState} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

