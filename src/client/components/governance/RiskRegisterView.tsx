import React, { useState } from 'react';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { RiskHeatMap } from '../common/RiskHeatMap.js';
import { Badge } from '../common/Badge.js';
import { Shield, Plus, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

interface RiskRegisterViewProps {
  risks: RiskRegisterItem[];
  onSelectRisk?: (risk: RiskRegisterItem) => void;
}

export const RiskRegisterView: React.FC<RiskRegisterViewProps> = ({ risks, onSelectRisk }) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Banking Enterprise Risk Register
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              5×5 Risk matrix assessment, inherent vs residual risk calculation, and treatment plan tracking.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-blue-950 text-blue-300 border border-blue-800 rounded-full text-xs font-mono font-bold">
          {risks.length} Registered Risks
        </span>
      </div>

      {/* Heat Map */}
      <RiskHeatMap risks={risks} onSelectRisk={onSelectRisk} />

      {/* Risk Table */}
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Enterprise Risk Portfolio
        </h3>

        <div className="divide-y divide-slate-800 text-xs">
          {risks.map((risk) => (
            <div
              key={risk.id}
              className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-lg transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-navy-300 text-sm">{risk.riskCode}</span>
                  <Badge type="SEVERITY" value={risk.inherentRating} size="sm" />
                  <span className="text-slate-400">→ Residual:</span>
                  <Badge type="SEVERITY" value={risk.residualRating} size="sm" />
                  <span className="px-2 py-0.5 rounded bg-bank-950 text-slate-300 border border-slate-700 text-[10px] font-mono">
                    Strategy: {risk.treatmentStrategy}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white">{risk.title}</h4>
                <p className="text-xs text-slate-400">{risk.description}</p>
                <div className="text-[11px] text-emerald-400 pt-1">
                  <strong>Treatment Plan:</strong> {risk.treatmentPlan} (Deadline: {risk.treatmentDeadline})
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs font-mono font-bold text-slate-200">
                  Inherent Score: <span className="text-red-400">{risk.inherentScore}</span> / 25
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Owner: {risk.ownerName}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
