import React from 'react';
import { Activity, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { BankApplication } from '../../../shared/types/asset.js';
import { Ticket } from '../../../shared/types/ticket.js';
import { useI18n } from '../../context/I18nContext.js';

interface BusinessServicesViewProps {
  applications: BankApplication[];
  tickets: Ticket[];
  onSelectTicket?: (ticket: Ticket) => void;
}

/** Displays only CMDB applications and their current, ticket-derived posture. */
export const BusinessServicesView: React.FC<BusinessServicesViewProps> = ({ applications, tickets, onSelectTicket }) => {
  const { t } = useI18n();
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-semantic-subtle custom-scrollbar select-none">
      <div className="wrike-card p-6 bg-gradient-to-r from-semantic-panel via-semantic-subtle to-semantic-success-surface/30 border border-semantic-border shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-semantic-success text-white flex items-center justify-center shadow-md"><Activity className="w-6 h-6" /></div>
        <div>
          <h1 className="text-xl font-bold text-semantic-primary">{t('Business Service Posture')}</h1>
          <p className="text-xs text-semantic-muted mt-0.5">{t('Derived from authorized CMDB applications and active tickets. Availability is shown only when a monitoring integration provides it.')}</p>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="wrike-card p-12 text-center text-semantic-muted text-sm">
          <ShieldCheck className="w-9 h-9 mx-auto mb-3 text-semantic-placeholder" />
          {t('No CMDB applications are available in your authorized scope.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {applications.map((application) => {
            const activeTickets = tickets.filter((ticket) => ticket.applicationId === application.id && ticket.statusCategory !== 'DONE');
            const urgentTickets = activeTickets.filter((ticket) => ticket.slaState === 'BREACHED' || ticket.slaState === 'AT_RISK' || ticket.technicalSeverity === 'CRITICAL');
            const requiresAttention = urgentTickets.length > 0;
            return (
              <div key={application.id} className="wrike-card p-5 space-y-4 hover:border-semantic-success transition-all shadow-xs">
                <div className="flex items-start justify-between gap-4 border-b border-semantic-border pb-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-semantic-info">{application.code}</span><span className="px-2 py-0.5 rounded-full bg-semantic-neutral-surface text-semantic-secondary font-mono text-caption font-bold border border-semantic-border">{application.criticality}</span></div>
                    <h3 className="font-bold text-sm text-semantic-primary mt-1">{application.name}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${requiresAttention ? 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border' : 'bg-semantic-success-surface text-semantic-success border-semantic-success-border'}`}>
                    {requiresAttention ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {requiresAttention ? t('ATTENTION REQUIRED') : t('NO URGENT TICKETS')}
                  </span>
                </div>
                <p className="text-xs text-semantic-muted leading-relaxed">{application.description || t('No CMDB description has been supplied.')}</p>
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-semantic-subtle border border-semantic-border text-xs">
                  <div><span className="text-semantic-muted">{t('Open tickets')}</span><div className="font-mono font-bold text-semantic-primary mt-0.5">{activeTickets.length}</div></div>
                  <div><span className="text-semantic-muted">{t('Urgent / SLA risk')}</span><div className={`font-mono font-bold mt-0.5 ${requiresAttention ? 'text-semantic-danger' : 'text-semantic-success'}`}>{urgentTickets.length}</div></div>
                </div>
                <div className="text-xs text-semantic-muted flex items-center justify-between"><span>{t('Monitoring telemetry:')} <strong className="text-semantic-secondary">{t('not connected')}</strong></span>{urgentTickets[0] && <button onClick={() => onSelectTicket?.(urgentTickets[0])} className="text-semantic-info font-bold hover:underline">{t('Open ticket →')}</button>}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
