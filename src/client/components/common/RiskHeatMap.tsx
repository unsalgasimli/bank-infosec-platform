import React from 'react';
import { RiskRegisterItem } from '../../../shared/types/risk.js';
import { Filter, X } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.js';

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
  const { t } = useI18n();

  // 5x5 matrix where Y is Likelihood (5 down to 1) and X is Impact (1 to 5)
  const getCellRating = (l: number, i: number): { bg: string; text: string; rating: string } => {
    const score = l * i;
    if (score >= 15) return { bg: 'bg-semantic-jira-blocked-surface border-semantic-jira-blocked-border hover:bg-semantic-jira-blocked-surface', text: 'text-semantic-danger-strong', rating: t('CRITICAL') };
    if (score >= 10) return { bg: 'bg-semantic-warning-highlight border-semantic-warning-border-strong hover:bg-semantic-warning-border-strong', text: 'text-semantic-jira-primary', rating: t('HIGH') };
    if (score >= 5) return { bg: 'bg-semantic-warning-soft border-semantic-jira-border hover:bg-semantic-warning-highlight', text: 'text-semantic-jira-primary', rating: t('MEDIUM') };
    return { bg: 'bg-semantic-jira-brand-surface border-semantic-jira-info-border hover:bg-semantic-jira-brand-surface', text: 'text-semantic-jira-brand', rating: t('LOW') };
  };

  const getRisksInCell = (l: number, i: number) => {
    return risks.filter((r) => r.likelihood === l && r.impact === i);
  };

  const likelihoodLabels = [
    `5 (${t('Almost Certain')})`,
    `4 (${t('Likely')})`,
    `3 (${t('Possible')})`,
    `2 (${t('Unlikely')})`,
    `1 (${t('Rare')})`,
  ];
  const impactLabels = [
    `1 (${t('Negligible')})`,
    `2 (${t('Minor')})`,
    `3 (${t('Moderate')})`,
    `4 (${t('Significant')})`,
    `5 (${t('Catastrophic')})`,
  ];

  return (
    <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
              {t('5×5 Enterprise Risk Heat Matrix')}
            </h3>
            {selectedCell && (
              <span className="px-2 py-0.5 rounded bg-semantic-jira-brand-surface border border-semantic-jira-info-border text-semantic-jira-brand text-caption font-mono flex items-center gap-1">
                <Filter className="w-2.5 h-2.5" /> L:{selectedCell.likelihood} × I:{selectedCell.impact}
                <button onClick={() => onSelectCell && onSelectCell(null)} className="hover:text-semantic-jira-primary ml-1">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-semantic-jira-muted mt-0.5">{t('Click on any cell to filter the risks by exact likelihood & impact')}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-semantic-jira-muted flex-wrap">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-semantic-danger-strong" /> {t('Critical (15-25)')}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-semantic-warning-bright" /> {t('High (10-14)')}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-semantic-warning-medium" /> {t('Medium (5-9)')}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-semantic-jira-brand" /> {t('Low (1-4)')}</div>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Y Axis Label */}
        <div className="flex flex-col justify-between py-6 text-label font-medium text-semantic-jira-muted w-28 text-right pr-2">
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
                      className={`rounded-lg border p-1 flex items-center justify-center transition-all cursor-pointer relative group ${cell.bg} ${
                        isSelected ? 'ring-2 ring-semantic-jira-brand border-white scale-[1.03] z-dsContent shadow-lg' : ''
                      }`}
                      title={`Likelihood ${l}, Impact ${i} (Score ${l * i}) - ${matching.length} risks`}
                    >
                      {matching.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={`w-6 h-6 rounded bg-semantic-panel border border-semantic-jira-border flex items-center justify-center text-xs font-bold ${cell.text}`}>
                            {matching.length}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-semantic-jira-muted font-medium">{l * i}</span>
                      )}

                      {/* Tooltip on hover */}
                      {matching.length > 0 && (
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-dsHeader w-56 p-2.5 bg-semantic-panel border border-semantic-jira-border rounded-md shadow-xl text-xs">
                          <div className="font-bold text-semantic-jira-primary border-b border-semantic-jira-border pb-1 mb-1 flex items-center justify-between">
                            <span>{cell.rating} (Score {l * i})</span>
                            <span className="font-mono text-semantic-jira-brand">{matching.length} Risks</span>
                          </div>
                          {matching.slice(0, 4).map((r) => (
                            <div
                              key={r.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRisk && onSelectRisk(r);
                              }}
                              className="text-semantic-jira-muted hover:text-semantic-jira-primary truncate cursor-pointer py-0.5 text-label"
                            >
                              • {r.riskCode}: {r.title}
                            </div>
                          ))}
                          {matching.length > 4 && (
                            <div className="text-caption text-semantic-jira-muted-light italic mt-0.5">
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
          <div className="grid grid-cols-5 gap-1.5 mt-2 text-center text-label text-semantic-jira-muted font-medium">
            {impactLabels.map((lbl, idx) => (
              <div key={idx} className="truncate px-1">{lbl}</div>
            ))}
          </div>
          <div className="text-center text-[11px] font-bold uppercase tracking-wider text-semantic-jira-muted mt-2">
            {t('Impact (Severity of Consequence)')} →
          </div>
        </div>
      </div>
    </div>
  );
};



