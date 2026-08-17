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
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      <div className="bg-bank-900 border border-purple-900/60 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-purple-950 text-purple-400 border border-purple-800">
            <Lock className="w-6 h-6" />
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
        <div className="p-12 text-center bg-bank-900 border border-red-900/60 rounded-xl space-y-3">
          <UserX className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Access Restricted by Bank ABAC Policy</h3>
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
              className="p-5 bg-bank-900 border border-purple-900/50 hover:border-purple-500 rounded-xl cursor-pointer transition-all space-y-3 shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-bold text-white">{t.key}</span>
                  <Badge type="CONFIDENTIALITY" value={t.confidentiality} />
                </div>
                <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
              </div>
              <h3 className="text-sm font-bold text-slate-100">{t.title}</h3>
              <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
