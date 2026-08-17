import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { Lock, ShieldAlert, FileText, UserX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface DLPViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const DLPView: React.FC<DLPViewProps> = ({ tickets, onSelectTicket }) => {
  const { currentUser } = useAuth();
  const dlpTickets = tickets.filter((t) => t.category === 'DLP_ALERT' || t.projectCode === 'DLP');

  const canViewDLP = currentUser?.roles.some((r) =>
    ['CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DLP_ANALYST'].includes(r)
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-purple-400 border border-slate-800">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Data Loss Prevention & Insider Threat Forensics
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Restricted investigation of customer PII leakage, unapproved cloud uploads, and USB data movements.
            </p>
          </div>
        </div>
        <Badge type="CONFIDENTIALITY" value="HIGHLY_RESTRICTED_HR_LEGAL" />
      </div>

      {!canViewDLP ? (
        <div className="p-10 text-center bg-bank-900 border border-red-900/60 rounded-lg space-y-3">
          <UserX className="w-10 h-10 text-red-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">Access Restricted by ABAC Policy</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You do not have the required <strong>DLP_ANALYST</strong> or <strong>CISO</strong> role clearance to view confidential employee data investigations. Switch personas from the top bar to test authorized access.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {dlpTickets.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectTicket(t)}
              className="p-4 bg-bank-900 border border-slate-800 hover:border-slate-700 rounded-lg cursor-pointer transition-colors space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-semibold text-white text-xs">{t.key}</span>
                  <Badge type="CONFIDENTIALITY" value={t.confidentiality} />
                </div>
                <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
              </div>
              <h3 className="text-xs font-semibold text-slate-100">{t.title}</h3>
              <p className="text-[11px] text-slate-400 line-clamp-2">{t.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

