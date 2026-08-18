import React from 'react';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { Filter, X } from 'lucide-react';

interface RiskHeatMapProps {
  risks: RiskRegisterItem[];
  onSelectRisk?: (risk: RiskRegisterItem) => void;
  selectedCell?: { likelihood: number; impact: number } | null;
  onSelectCell?: (cell: { likelihood: number; impact: number } | null) => void;
}

export const RiskHeatMap: React.FC<RiskHeatMapProps> = ({
  risks,
  onSelectRisk,
  selectedCell = null,
  onSelectCell,
}) => {
  // 5x5 matrix where Y is Likelihood (5 down to 1) and X is Impact (1 to 5)
  const getCellRating = (l: number, i: number): { bg: string; text: string; rating: string } => {
    const score = l * i;
    if (score >= 15) return { bg: 'bg-[#FFEBE6] border-[#FFBDAD] hover:bg-[#FFD2CC]', text: 'text-[#DE350B]', rating: 'CRITICAL' };
    if (score >= 10) return { bg: 'bg-[#FFF0B3] border-[#FFE380] hover:bg-[#FFE380]', text: 'text-[#172B4D]', rating: 'HIGH' };
    if (score >= 5) return { bg: 'bg-[#FFFAE6] border-[#DFE1E6] hover:bg-[#FFF0B3]', text: 'text-[#172B4D]', rating: 'MEDIUM' };
    return { bg: 'bg-[#DEEBFF] border-[#B3D4FF] hover:bg-[#C0DCFF]', text: 'text-[#0052CC]', rating: 'LOW' };
  };

  const getRisksInCell = (l: number, i: number) => {
    return risks.filter((r) => r.likelihood === l && r.impact === i);
  };

  const likelihoodLabels = ['5 (Almost Certain)', '4 (Likely)', '3 (Possible)', '2 (Unlikely)', '1 (Rare)'];
  const impactLabels = ['1 (Negligible)', '2 (Minor)', '3 (Moderate)', '4 (Significant)', '5 (Catastrophic)'];

  return (
    <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              5×5 Enterprise Risk Heat Matrix
            </h3>
            {selectedCell && (
              <span className="px-2 py-0.5 rounded bg-[#DEEBFF] border border-[#B3D4FF] text-[#0052CC] text-[10px] font-mono flex items-center gap-1">
                <Filter className="w-2.5 h-2.5" /> L:{selectedCell.likelihood} × I:{selectedCell.impact}
                <button onClick={() => onSelectCell && onSelectCell(null)} className="hover:text-[#172B4D] ml-1">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-[#5E6C84] mt-0.5">Click on any cell to filter the risks by exact likelihood & impact</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#5E6C84]">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#DE350B]" /> Critical (15-25)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#FF8B00]" /> High (10-14)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#FFC400]" /> Medium (5-9)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#0052CC]" /> Low (1-4)</div>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Y Axis Label */}
        <div className="flex flex-col justify-between py-6 text-[11px] font-medium text-[#5E6C84] w-28 text-right pr-2">
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
                  const isSelected = selectedCell?.likelihood === l && selectedCell?.impact === i;

                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (onSelectCell) {
                          onSelectCell(isSelected ? null : { likelihood: l, impact: i });
                        }
                      }}
                      className={`rounded border p-1 flex items-center justify-center transition-all cursor-pointer relative group ${cell.bg} ${
                        isSelected ? 'ring-2 ring-[#0052CC] border-white scale-[1.03] z-10 shadow-lg' : ''
                      }`}
                      title={`Likelihood ${l}, Impact ${i} (Score ${l * i}) - ${matching.length} risks`}
                    >
                      {matching.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={`w-6 h-6 rounded bg-[#FFFFFF] border border-[#DFE1E6] flex items-center justify-center text-xs font-bold ${cell.text}`}>
                            {matching.length}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#7A869A] font-mono">{l * i}</span>
                      )}

                      {/* Tooltip on hover */}
                      {matching.length > 0 && (
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-30 w-56 p-2.5 bg-[#FFFFFF] border border-[#DFE1E6] rounded-md shadow-xl text-xs">
                          <div className="font-bold text-[#172B4D] border-b border-[#DFE1E6] pb-1 mb-1 flex items-center justify-between">
                            <span>{cell.rating} (Score {l * i})</span>
                            <span className="font-mono text-[#0052CC]">{matching.length} Risks</span>
                          </div>
                          {matching.slice(0, 4).map((r) => (
                            <div
                              key={r.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRisk && onSelectRisk(r);
                              }}
                              className="text-[#5E6C84] hover:text-[#172B4D] truncate cursor-pointer py-0.5 text-[11px]"
                            >
                              • {r.riskCode}: {r.title}
                            </div>
                          ))}
                          {matching.length > 4 && (
                            <div className="text-[10px] text-[#7A869A] italic mt-0.5">
                              + {matching.length - 4} more risks (click cell to filter)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* X Axis Labels */}
          <div className="grid grid-cols-5 gap-1.5 mt-2 text-center text-[11px] text-[#5E6C84] font-medium">
            {impactLabels.map((lbl, idx) => (
              <div key={idx} className="truncate px-1">{lbl}</div>
            ))}
          </div>
          <div className="text-center text-[11px] text-[#7A869A] uppercase tracking-wider font-semibold mt-2">
            Impact (Severity of Consequence) →
          </div>
        </div>
      </div>
    </div>
  );
};



