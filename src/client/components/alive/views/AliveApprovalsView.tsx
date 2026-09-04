import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ArrowRight,
  FileText,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.js';
import { useI18n } from '../../../context/I18nContext.js';

interface AliveApprovalsViewProps {
  pendingApprovals: any[];
  onOpenTicket: (ticketId: string) => void;
  onRefresh: () => void;
}

export const AliveApprovalsView: React.FC<AliveApprovalsViewProps> = ({
  pendingApprovals,
  onOpenTicket,
  onRefresh,
}) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleDecision = async (
    chainId: string,
    stepId: string,
    decision: 'APPROVED' | 'REJECTED',
    ticketId?: string
  ) => {
    setProcessingId(stepId);
    try {
      const res = await fetchWithAuth(`/api/approvals/${chainId}/steps/${stepId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comments: `${decision} via Alive Fast Authorization Console` }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || t('Approval submission failed.'));
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-semantic-panel select-none">
      {/* Header */}
      <div className="px-6 py-4 border-b border-semantic-border flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-semantic-strongest tracking-tight">
              {t('Dual-Control Maker-Checker Approvals')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono text-xs font-bold border border-amber-500/20">
              {pendingApprovals.length} {t('pending')}
            </span>
          </div>
          <p className="text-xs text-semantic-secondary mt-0.5">
            {t('Tier-1 cryptographic authorization gate for banking production changes, elevated access, and firewall rules.')}
          </p>
        </div>
      </div>

      {/* Approvals List */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-4 custom-scrollbar">
        {pendingApprovals.length === 0 ? (
          <div className="py-24 text-center text-semantic-muted">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-[#00F576] opacity-75" />
            <div className="font-semibold text-base text-semantic-primary">
              {t('No Pending Authorizations')}
            </div>
            <div className="text-xs mt-1">
              {t('All maker-checker dual control requests in your queue have been processed.')}
            </div>
          </div>
        ) : (
          pendingApprovals.map((appr) => {
            const isProcessing = processingId === appr.stepId;
            const chainId = appr.chainId || appr.id;
            const stepId = appr.stepId || appr.currentStepId;

            return (
              <div
                key={appr.id || appr.stepId}
                className="alive-card p-5 border-semantic-border hover:border-semantic-border-strong flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-caption font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {appr.stepName || t('Dual-Control Sign-Off')}
                    </span>
                    {appr.ticketKey && (
                      <span className="font-mono text-xs font-bold text-[#00F576]">
                        {appr.ticketKey}
                      </span>
                    )}
                  </div>

                  <div className="font-bold text-sm text-semantic-primary">
                    {appr.ticketTitle || appr.title || t('Privileged Access Authorization')}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-semantic-muted">
                    {appr.requesterName && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        <span>{appr.requesterName}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-mono text-caption">
                      <Lock className="w-3.5 h-3.5 text-[#00F576]" />
                      <span>{t('Tier-1 PKI Validated')}</span>
                    </span>
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {appr.ticketId && (
                    <button
                      type="button"
                      onClick={() => onOpenTicket(appr.ticketId)}
                      className="alive-btn-secondary py-1.5 px-3 text-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{t('View Ticket')}</span>
                    </button>
                  )}

                  {chainId && stepId && (
                    <>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleDecision(chainId, stepId, 'REJECTED', appr.ticketId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{t('Reject')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleDecision(chainId, stepId, 'APPROVED', appr.ticketId)}
                        className="alive-btn-primary py-1.5 px-3.5 text-xs disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('Authorize (Approve)')}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
