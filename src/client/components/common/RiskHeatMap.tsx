import React from 'react';
import { RiskRegisterItem } from '../../shared/types/risk.js';

interface RiskHeatMapProps {
  risks: RiskRegisterItem[];
  onSelectRisk?: (risk: RiskRegisterItem) => void;
}

export const RiskHeatMap: React.FC<RiskHeatMapProps> = ({ risks, onSelectRisk }) => {
  // 5x5 matrix where Y is Likelihood (5 down to 1) and X is Impact (1 to 5)
  const getCellRating = (l: number, i: number): { bg: string; text: string; rating: string } => {
    const score = l * i;
    if (score >= 15) return { bg: 'bg-red-950/80 border-red-800 hover:bg-red-900', text: 'text-red-300', rating: 'CRITICAL' };
    if (score >= 10) return { bg: 'bg-orange-950/80 border-orange-800 hover:bg-orange-900', text: 'text-orange-300', rating: 'HIGH' };
    if (score >= 5) return { bg: 'bg-amber-950/80 border-amber-800 hover:bg-amber-900', text: 'text-amber-300', rating: 'MEDIUM' };
    return { bg: 'bg-emerald-950/80 border-emerald-800 hover:bg-emerald-900', text: 'text-emerald-300', rating: 'LOW' };
  };

  const getRisksInCell = (l: number, i: number) => {
    return risks.filter((r) => r.likelihood === l && r.impact === i);
  };

  const likelihoodLabels = ['5 (Almost Certain)', '4 (Likely)', '3 (Possible)', '2 (Unlikely)', '1 (Rare)'];
  const impactLabels = ['1 (Negligible)', '2 (Minor)', '3 (Moderate)', '4 (Significant)', '5 (Catastrophic)'];

  return (
    <div className="bg-bank-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">5×5 Enterprise Risk Heat Matrix</h3>
          <p className="text-xs text-slate-400">Likelihood vs Impact distribution across banking operations</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Critical (15-25)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> High (10-14)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Medium (5-9)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Low (1-4)</div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Y Axis Label */}
        <div className="flex flex-col justify-between py-8 text-xs font-semibold text-slate-400 w-28 text-right pr-2">
          {likelihoodLabels.map((lbl, idx) => (
            <div key={idx} className="h-10 flex items-center justify-end">{lbl}</div>
          ))}
        </div>

        {/* 5x5 Grid */}
        <div className="flex-1">
          <div className="grid grid-rows-5 gap-1.5">
            {[5, 4, 3, 2, 1].map((l) => (
              <div key={l} className="grid grid-cols-5 gap-1.5 h-11">
                {[1, 2, 3, 4, 5].map((i) => {
                  const cell = getCellRating(l, i);
                  const matching = getRisksInCell(l, i);
                  return (
                    <div
                      key={i}
                      className={`rounded-md border p-1.5 flex items-center justify-center transition-all cursor-pointer relative group ${cell.bg}`}
                    >
                      {matching.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={`w-6 h-6 rounded-full bg-bank-950/80 border border-white/20 flex items-center justify-center text-xs font-bold ${cell.text}`}>
                            {matching.length}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-mono">{l * i}</span>
                      )}

                      {/* Tooltip on hover */}
                      {matching.length > 0 && (
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-30 w-48 p-2 bg-bank-950 border border-slate-700 rounded-lg shadow-xl text-xs">
                          <div className="font-bold text-white border-b border-slate-800 pb-1 mb-1">
                            {cell.rating} (Score {l * i}) - {matching.length} Risks
                          </div>
                          {matching.map((r) => (
                            <div
                              key={r.id}
                              onClick={() => onSelectRisk && onSelectRisk(r)}
                              className="text-slate-300 hover:text-white truncate cursor-pointer py-0.5"
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
          <div className="grid grid-cols-5 gap-1.5 mt-2 text-center text-xs text-slate-400 font-semibold">
            {impactLabels.map((lbl, idx) => (
              <div key={idx} className="truncate px-1">{lbl}</div>
            ))}
          </div>
          <div className="text-center text-xs text-slate-500 uppercase tracking-wider font-bold mt-2">
            Impact (Severity of Consequence) →
          </div>
        </div>
      </div>
    </div>
  );
};
