import React from 'react';
import { Activity, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { BankApplication } from '../../../shared/types/asset.js';
import { Ticket } from '../../../shared/types/ticket.js';

interface BusinessServicesViewProps {
  applications: BankApplication[];
  tickets: Ticket[];
  onSelectTicket?: (ticket: Ticket) => void;
}

/** Displays only CMDB applications and their current, ticket-derived posture. */
export const BusinessServicesView: React.FC<BusinessServicesViewProps> = ({ applications, tickets, onSelectTicket }) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8FAFC] custom-scrollbar select-none">
      <div className="wrike-card p-6 bg-gradient-to-r from-[#FFFFFF] via-[#F8FAFC] to-[#E6F7EF]/30 border border-[#E2E8F0] shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#007860] text-white flex items-center justify-center shadow-md"><Activity className="w-6 h-6" /></div>
        <div>
          <h1 className="text-xl font-bold text-[#162136]">Business Service Posture</h1>
          <p className="text-xs text-[#64748B] mt-0.5">Derived from authorized CMDB applications and active tickets. Availability is shown only when a monitoring integration provides it.</p>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="wrike-card p-12 text-center text-[#64748B] text-sm">
          <ShieldCheck className="w-9 h-9 mx-auto mb-3 text-[#94A3B8]" />
          No CMDB applications are available in your authorized scope.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {applications.map((application) => {
            const activeTickets = tickets.filter((ticket) => ticket.applicationId === application.id && ticket.statusCategory !== 'DONE');
            const urgentTickets = activeTickets.filter((ticket) => ticket.slaState === 'BREACHED' || ticket.slaState === 'AT_RISK' || ticket.technicalSeverity === 'CRITICAL');
            const requiresAttention = urgentTickets.length > 0;
            return (
              <div key={application.id} className="wrike-card p-5 space-y-4 hover:border-[#007860] transition-all shadow-xs">
                <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] pb-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-[#0073D3]">{application.code}</span><span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] font-mono text-[10px] font-bold border border-[#E2E8F0]">{application.criticality}</span></div>
                    <h3 className="font-bold text-sm text-[#162136] mt-1">{application.name}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${requiresAttention ? 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA]' : 'bg-[#E6F7EF] text-[#007860] border-[#B8EAD1]'}`}>
                    {requiresAttention ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {requiresAttention ? 'ATTENTION REQUIRED' : 'NO URGENT TICKETS'}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] leading-relaxed">{application.description || 'No CMDB description has been supplied.'}</p>
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                  <div><span className="text-[#64748B]">Open tickets</span><div className="font-mono font-bold text-[#162136] mt-0.5">{activeTickets.length}</div></div>
                  <div><span className="text-[#64748B]">Urgent / SLA risk</span><div className={`font-mono font-bold mt-0.5 ${requiresAttention ? 'text-[#CF1322]' : 'text-[#007860]'}`}>{urgentTickets.length}</div></div>
                </div>
                <div className="text-xs text-[#64748B] flex items-center justify-between"><span>Monitoring telemetry: <strong className="text-[#475569]">not connected</strong></span>{urgentTickets[0] && <button onClick={() => onSelectTicket?.(urgentTickets[0])} className="text-[#0073D3] font-bold hover:underline">Open ticket →</button>}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
