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
    <div className="flex-1 overflow-x-auto p-4 flex gap-3 bg-semantic-jira-surface custom-scrollbar">
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
            className="w-72 shrink-0 bg-semantic-panel border border-semantic-jira-border rounded-md flex flex-col max-h-full overflow-hidden shadow-sm"
          >
            {/* Column Header */}
            <div className="p-3 border-b border-semantic-jira-border flex items-center justify-between bg-semantic-jira-surface/60">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-semantic-jira-primary uppercase tracking-wider">
                  {col.name}
                </span>
                <span className="px-1.5 py-0.2 rounded bg-semantic-jira-hover text-semantic-jira-muted font-mono text-caption font-semibold">
                  {colTickets.length}
                </span>
              </div>
            </div>

            {/* Column Cards Container */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {colTickets.length === 0 ? (
                <div className="text-center py-10 text-label text-semantic-jira-muted-light italic border border-dashed border-semantic-jira-border rounded">
                  No issues in this column
                </div>
              ) : (
                colTickets.map((ticket) => {
                  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket)}
                      className="p-3 bg-semantic-panel hover:bg-semantic-jira-hover border border-semantic-jira-border hover:border-semantic-jira-brand rounded cursor-pointer transition-all space-y-2 group shadow-sm"
                    >
                      {/* Card Header: Key + Type + Severity */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge type="PROJECT" value={ticket.projectCode} size="sm" />
                          <span className="font-mono font-bold text-semantic-jira-brand text-xs group-hover:underline">
                            {ticket.key}
                          </span>
                        </div>
                        <Badge type="SEVERITY" value={ticket.technicalSeverity} size="sm" />
                      </div>

                      {/* Summary */}
                      <h4 className="text-xs font-semibold text-semantic-jira-primary leading-snug line-clamp-2">
                        {ticket.title}
                      </h4>

                      {/* Finding or CVE snippet */}
                      {(ticket.findingDetails?.cweId || ticket.findingDetails?.cveId) && (
                        <div className="flex items-center gap-1.5 flex-wrap text-caption font-mono">
                          {ticket.findingDetails?.cweId && (
                            <span className="px-1.5 py-0.2 rounded bg-semantic-panel text-semantic-jira-brand border border-semantic-jira-border">
                              {ticket.findingDetails.cweId}
                            </span>
                          )}
                          {ticket.findingDetails?.cveId && (
                            <span className="px-1.5 py-0.2 rounded bg-semantic-panel text-semantic-danger-strong border border-semantic-jira-border">
                              {ticket.findingDetails.cveId}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Card Footer: SLA + Assignee */}
                      <div className="flex items-center justify-between pt-2 border-t border-semantic-jira-border text-label">
                        <SLARing
                          remainingMinutes={ticket.slaRemainingMinutes}
                          state={ticket.slaState}
                          size="sm"
                        />

                        <div className="flex items-center gap-1.5">
                          {assignee ? (
                            <div
                              className="w-5 h-5 rounded-full bg-semantic-jira-brand flex items-center justify-center text-caption font-bold text-white shadow-sm"
                              title={`Assignee: ${assignee.fullName}`}
                            >
                              {assignee.fullName.charAt(0)}
                            </div>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-semantic-info-soft text-semantic-info-strong border border-semantic-info-soft-border text-caption font-bold">
                              {ticket.targetDepartmentId || ticket.departmentId ? 'Şöbə Növbəsi' : 'Təyin edilməyib'}
                            </span>
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

