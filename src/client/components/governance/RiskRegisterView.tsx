import React, { useState } from 'react';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { RiskHeatMap } from '../common/RiskHeatMap.js';
import { Badge } from '../common/Badge.js';
import { Shield, Plus, Search, Filter, X, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface RiskRegisterViewProps {
  risks: RiskRegisterItem[];
  onSelectRisk?: (risk: RiskRegisterItem) => void;
}

export const RiskRegisterView: React.FC<RiskRegisterViewProps> = ({ risks, onSelectRisk }) => {
  const { fetchWithAuth } = useAuth();
  const [selectedCell, setSelectedCell] = useState<{ likelihood: number; impact: number } | null>(null);
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New risk form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(4);
  const [treatmentStrategy, setTreatmentStrategy] = useState<'MITIGATE' | 'ACCEPT' | 'TRANSFER' | 'AVOID'>('MITIGATE');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [ownerName, setOwnerName] = useState('SecOps Engineering Lead');
  const [deadline, setDeadline] = useState('2026-10-31');

  const filteredRisks = risks.filter((r) => {
    if (selectedCell && (r.likelihood !== selectedCell.likelihood || r.impact !== selectedCell.impact)) {
      return false;
    }
    if (strategyFilter !== 'ALL' && r.treatmentStrategy !== strategyFilter) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.riskCode.toLowerCase().includes(q) ||
        r.ownerName?.toLowerCase().includes(q) ||
        r.treatmentPlan.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    try {
      const res = await fetchWithAuth('/api/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          likelihood,
          impact,
          treatmentStrategy,
          treatmentPlan,
          treatmentDeadline: deadline,
          ownerName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setTitle('');
        setDescription('');
        setTreatmentPlan('');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight">
              Enterprise Risk Register & Heat Matrix
            </h1>
            <p className="text-xs text-semantic-jira-muted mt-0.5">
              ISO 31000 / NIST RMF 5×5 Risk matrix assessment, inherent vs residual risk calculation, and treatment tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="px-3 py-1 bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border rounded font-mono text-xs font-bold">
            {risks.length} Portfolio Risks
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            className="jira-btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Risk Assessment</span>
          </button>
        </div>
      </div>

      {/* Heat Map with interactive cell click */}
      <RiskHeatMap
        risks={risks}
        onSelectRisk={onSelectRisk}
        selectedCell={selectedCell}
        onSelectCell={setSelectedCell}
      />

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-jira-border pb-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-light mr-1">Treatment:</span>
          {[
            { id: 'ALL', label: 'All Strategies' },
            { id: 'MITIGATE', label: 'Mitigate (Control)' },
            { id: 'ACCEPT', label: 'Accept (Governance)' },
            { id: 'TRANSFER', label: 'Transfer (Insurance/Vendor)' },
            { id: 'AVOID', label: 'Avoid (Decommission)' },
          ].map((strat) => (
            <button
              key={strat.id}
              onClick={() => setStrategyFilter(strat.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                strategyFilter === strat.id
                  ? 'bg-semantic-jira-brand text-white font-semibold shadow-sm'
                  : 'bg-semantic-panel text-semantic-jira-muted hover:text-semantic-jira-primary border border-semantic-jira-border'
              }`}
            >
              {strat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-semantic-jira-muted absolute left-2.5 top-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search risk code, title, owner..."
            className="jira-input pl-8"
          />
        </div>
      </div>

      {/* Risk Table */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
            Active Risk Portfolio ({filteredRisks.length})
          </h3>
          {selectedCell && (
            <span className="text-label text-semantic-jira-brand font-mono">
              Filtered: Likelihood {selectedCell.likelihood} × Impact {selectedCell.impact}
            </span>
          )}
        </div>

        {filteredRisks.length === 0 ? (
          <div className="py-16 text-center text-semantic-jira-muted text-xs italic bg-semantic-panel rounded border border-semantic-jira-border">
            No enterprise risks matched the active matrix cell or search filters.
          </div>
        ) : (
          <div className="divide-y divide-semantic-jira-border text-xs">
            {filteredRisks.map((risk) => (
              <div
                key={risk.id}
                onClick={() => onSelectRisk && onSelectRisk(risk)}
                className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-semantic-jira-hover px-2.5 rounded transition-colors group cursor-pointer"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-semantic-jira-brand text-xs group-hover:underline">
                      {risk.riskCode}
                    </span>
                    <Badge type="SEVERITY" value={risk.inherentRating} size="sm" />
                    <span className="text-semantic-jira-muted text-caption">→ Residual:</span>
                    <Badge type="SEVERITY" value={risk.residualRating} size="sm" />
                    <span className="px-2 py-0.5 rounded bg-semantic-panel text-semantic-jira-brand border border-semantic-jira-border text-caption font-mono font-semibold">
                      {risk.treatmentStrategy}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-semantic-jira-primary group-hover:text-semantic-jira-brand">{risk.title}</h4>
                  <p className="text-label text-semantic-jira-muted leading-relaxed">{risk.description}</p>
                  <div className="text-label text-semantic-success pt-0.5 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span><strong className="text-semantic-jira-primary">Treatment:</strong> {risk.treatmentPlan} (Target: {risk.treatmentDeadline})</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-semantic-jira-primary">
                    Inherent: <span className="text-semantic-danger-strong font-bold">{risk.inherentScore}</span> / 25
                  </div>
                  <div className="text-label text-semantic-jira-muted mt-0.5">Owner: <strong className="text-semantic-jira-primary">{risk.ownerName}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Risk Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-dsOverlay flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-jira-border rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-jira-border pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-semantic-jira-brand" />
                <h3 className="text-sm font-bold text-semantic-jira-primary">New Enterprise Risk Assessment</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRisk} className="space-y-3 text-xs">
              <div>
                <label className="block text-semantic-jira-muted mb-1">Risk Title / Threat Statement:</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unpatched Kubernetes Node Ingress Vulnerability"
                  required
                  className="jira-input"
                />
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Detailed Context & Risk Scenario:</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe impact on banking operations, confidentiality, and data loss vector..."
                  rows={2}
                  className="jira-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Likelihood (1 to 5):</label>
                  <select
                    value={likelihood}
                    onChange={(e) => setLikelihood(Number(e.target.value))}
                    className="jira-input"
                  >
                    <option value={5}>5 - Almost Certain (Weekly)</option>
                    <option value={4}>4 - Likely (Monthly)</option>
                    <option value={3}>3 - Possible (Quarterly)</option>
                    <option value={2}>2 - Unlikely (Annual)</option>
                    <option value={1}>1 - Rare (Multi-year)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Impact (1 to 5):</label>
                  <select
                    value={impact}
                    onChange={(e) => setImpact(Number(e.target.value))}
                    className="jira-input"
                  >
                    <option value={5}>5 - Catastrophic (&gt;$1M / Outage)</option>
                    <option value={4}>4 - Significant (Regulatory Fine)</option>
                    <option value={3}>3 - Moderate (Service Impairment)</option>
                    <option value={2}>2 - Minor (Internal Impact)</option>
                    <option value={1}>1 - Negligible</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Treatment Strategy:</label>
                  <select
                    value={treatmentStrategy}
                    onChange={(e) => setTreatmentStrategy(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="MITIGATE">Mitigate (Implement Controls)</option>
                    <option value="ACCEPT">Accept (Formal Risk Acceptance)</option>
                    <option value="TRANSFER">Transfer (Cyber Insurance/SLA)</option>
                    <option value="AVOID">Avoid (Decommission Service)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Target Deadline:</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker();
                      } catch {}
                    }}
                    className="jira-input cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Actionable Remediation / Treatment Plan:</label>
                <input
                  type="text"
                  value={treatmentPlan}
                  onChange={(e) => setTreatmentPlan(e.target.value)}
                  placeholder="Describe the risk treatment plan"
                  className="jira-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-semantic-jira-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="jira-btn-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="jira-btn-primary"
                >
                  Register Risk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
