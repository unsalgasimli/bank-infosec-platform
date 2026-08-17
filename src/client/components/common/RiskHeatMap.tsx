import React, { useState } from 'react';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { Shield, AlertTriangle, ArrowRight, Info } from 'lucide-react';

interface RiskHeatMapProps {
  risks: RiskRegisterItem[];
  onSelectRisk?: (risk: RiskRegisterItem) => void;
}

export const RiskHeatMap: React.FC<RiskHeatMapProps> = ({ risks, onSelectRisk }) => {
  // 5x5 matrix where Y is Likelihood (5 down to 1) and X is Impact (1 to 5)
  const getCellRating = (l: number, i: number): { bg: string; text: string; rating: string } => {
    const score = l * i;
    if (score >= 15) return { bg: 'bg-red-950/70 border-red-900 hover:bg-red-900/80', text: 'text-red-300', rating: 'CRITICAL' };
    if (score >= 10) return { bg: 'bg-orange-950/70 border-orange-900 hover:bg-orange-900/80', text: 'text-orange-300', rating: 'HIGH' };
    if (score >= 5) return { bg: 'bg-amber-950/70 border-amber-900 hover:bg-amber-900/80', text: 'text-amber-300', rating: 'MEDIUM' };
    return { bg: 'bg-emerald-950/60 border-emerald-900 hover:bg-emerald-900/80', text: 'text-emerald-300', rating: 'LOW' };
  };

  const getRisksInCell = (l: number, i: number) => {
    return risks.filter((r) => r.likelihood === l && r.impact === i);
  };

  const likelihoodLabels = ['5 (Almost Certain)', '4 (Likely)', '3 (Possible)', '2 (Unlikely)', '1 (Rare)'];
  const impactLabels = ['1 (Negligible)', '2 (Minor)', '3 (Moderate)', '4 (Significant)', '5 (Catastrophic)'];

  return (
    <div className="bg-bank-900 border border-slate-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">5×5 Enterprise Risk Heat Matrix</h3>
          <p className="text-xs text-slate-400 mt-0.5">Likelihood vs Impact distribution across banking operations</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Critical (15-25)</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400" /> High (10-14)</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Medium (5-9)</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Low (1-4)</div>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Y Axis Label */}
        <div className="flex flex-col justify-between py-6 text-[11px] font-medium text-slate-400 w-28 text-right pr-2">
          {likelihoodLabels.map((lbl, idx) => (
            <div key={idx} className="h-10 flex items-center justify-end">{lbl}</div>
          ))}
        </div>

        {/* 5x5 Grid */}
        <div className="flex-1">
          <div className="grid grid-rows-5 gap-1.5">
            {[5, 4, 3, 2, 1].map((l) => (
              <div key={l} className="grid grid-cols-5 gap-1.5 h-10">
                {[1, 2, 3, 4, 5].map((i) => {
                  const cell = getCellRating(l, i);
                  const matching = getRisksInCell(l, i);
                  return (
                    <div
                      key={i}
                      className={`rounded border p-1 flex items-center justify-center transition-colors cursor-pointer relative group ${cell.bg}`}
                    >
                      {matching.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={`w-5 h-5 rounded bg-bank-950 border border-slate-700 flex items-center justify-center text-xs font-bold ${cell.text}`}>
                            {matching.length}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">{l * i}</span>
                      )}

                      {/* Tooltip on hover */}
                      {matching.length > 0 && (
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-30 w-52 p-2.5 bg-bank-900 border border-slate-700 rounded-md shadow-xl text-xs">
                          <div className="font-bold text-white border-b border-slate-800 pb-1 mb-1">
                            {cell.rating} (Score {l * i}) - {matching.length} Risks
                          </div>
                          {matching.map((r) => (
                            <div
                              key={r.id}
                              onClick={() => onSelectRisk && onSelectRisk(r)}
                              className="text-slate-300 hover:text-white truncate cursor-pointer py-0.5 text-[11px]"
                            >
                              • {r.riskCode}: {r.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* X Axis Labels */}
          <div className="grid grid-cols-5 gap-1.5 mt-2 text-center text-[11px] text-slate-400 font-medium">
            {impactLabels.map((lbl, idx) => (
              <div key={idx} className="truncate px-1">{lbl}</div>
            ))}
          </div>
          <div className="text-center text-[11px] text-slate-500 uppercase tracking-wider font-semibold mt-2">
            Impact (Severity of Consequence) →
          </div>
        </div>
      </div>
    </div>
  );
};

