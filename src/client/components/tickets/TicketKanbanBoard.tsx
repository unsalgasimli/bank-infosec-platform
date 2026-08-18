import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { useAuth } from '../../context/AuthContext.js';

interface TicketKanbanBoardProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onTransitionTicket?: (ticketId: string, transitionId: string) => void;
}

interface ColumnDef {
  id: string;
  name: string;
  category: 'TO_DO' | 'IN_PROGRESS' | 'DONE';
  statusMatch: string[];
}

export const TicketKanbanBoard: React.FC<TicketKanbanBoardProps> = ({
  tickets,
  onSelectTicket,
}) => {
  const { allUsers } = useAuth();

  const columns: ColumnDef[] = [
    {
      id: 'col-todo',
      name: 'TO DO',
      category: 'TO_DO',
      statusMatch: ['Open', 'New Triage', 'Identified', 'Draft Exception', 'TO_DO', 'OPEN', 'INC_NEW'],
    },
    {
      id: 'col-progress',
      name: 'IN PROGRESS',
      category: 'IN_PROGRESS',
      statusMatch: ['In Progress', 'Containment & Eradication', 'Remediation In Progress', 'IN_PROGRESS', 'CONTAINMENT'],
    },
    {
      id: 'col-review',
      name: 'IN REVIEW',
      category: 'IN_PROGRESS',
      statusMatch: ['Under Review', 'Pending CISO Approval', 'Pending Retest', 'UNDER_REVIEW', 'APPROVAL_PENDING'],
    },
    {
      id: 'col-done',
      name: 'DONE',
      category: 'DONE',
      statusMatch: ['Resolved', 'Closed', 'Exception Approved', 'Risk Mitigated', 'DONE', 'CLOSED', 'RESOLVED'],
    },
  ];

  return (
    <div className="flex-1 overflow-x-auto p-4 flex gap-3 bg-[#F4F5F7] custom-scrollbar">
      {columns.map((col) => {
        const colTickets = tickets.filter((t) => {
          if (col.category === 'DONE' && t.statusCategory === 'DONE') return true;
          if (col.category === 'TO_DO' && t.statusCategory === 'TO_DO') return true;
          return col.statusMatch.some(
            (s) =>
              t.statusName.toLowerCase().includes(s.toLowerCase()) ||
              t.statusId?.toLowerCase() === s.toLowerCase()
          );
        });

        return (
          <div
            key={col.id}
            className="w-72 shrink-0 bg-[#FFFFFF] border border-[#DFE1E6] rounded-md flex flex-col max-h-full overflow-hidden shadow-sm"
          >
            {/* Column Header */}
            <div className="p-3 border-b border-[#DFE1E6] flex items-center justify-between bg-[#F4F5F7]/60">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[#172B4D] uppercase tracking-wider">
                  {col.name}
                </span>
                <span className="px-1.5 py-0.2 rounded bg-[#EBECF0] text-[#5E6C84] font-mono text-[10px] font-semibold">
                  {colTickets.length}
                </span>
              </div>
            </div>

            {/* Column Cards Container */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {colTickets.length === 0 ? (
                <div className="text-center py-10 text-[11px] text-[#7A869A] italic border border-dashed border-[#DFE1E6] rounded">
                  No issues in this column
                </div>
              ) : (
                colTickets.map((ticket) => {
                  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket)}
                      className="p-3 bg-[#FFFFFF] hover:bg-[#EBECF0] border border-[#DFE1E6] hover:border-[#0052CC] rounded cursor-pointer transition-all space-y-2 group shadow-sm"
                    >
                      {/* Card Header: Key + Type + Severity */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge type="PROJECT" value={ticket.projectCode} size="sm" />
                          <span className="font-mono font-bold text-[#0052CC] text-xs group-hover:underline">
                            {ticket.key}
                          </span>
                        </div>
                        <Badge type="SEVERITY" value={ticket.technicalSeverity} size="sm" />
                      </div>

                      {/* Summary */}
                      <h4 className="text-xs font-semibold text-[#172B4D] leading-snug line-clamp-2">
                        {ticket.title}
                      </h4>

                      {/* Finding or CVE snippet */}
                      {(ticket.findingDetails?.cweId || ticket.findingDetails?.cveId) && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                          {ticket.findingDetails?.cweId && (
                            <span className="px-1.5 py-0.2 rounded bg-[#FFFFFF] text-[#0052CC] border border-[#DFE1E6]">
                              {ticket.findingDetails.cweId}
                            </span>
                          )}
                          {ticket.findingDetails?.cveId && (
                            <span className="px-1.5 py-0.2 rounded bg-[#FFFFFF] text-[#DE350B] border border-[#DFE1E6]">
                              {ticket.findingDetails.cveId}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Card Footer: SLA + Assignee */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#DFE1E6] text-[11px]">
                        <SLARing
                          remainingMinutes={ticket.slaRemainingMinutes}
                          state={ticket.slaState}
                          size="sm"
                        />

                        <div className="flex items-center gap-1.5">
                          {assignee ? (
                            <div
                              className="w-5 h-5 rounded-full bg-[#0052CC] flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                              title={`Assignee: ${assignee.fullName}`}
                            >
                              {assignee.fullName.charAt(0)}
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#7A869A] italic">Unassigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

