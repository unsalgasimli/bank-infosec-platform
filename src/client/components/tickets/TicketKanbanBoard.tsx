import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';

interface TicketKanbanBoardProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onTransitionTicket?: (ticketId: string, transitionId: string) => Promise<void> | void;
  onRefreshTickets?: () => void;
}

interface ColumnDef {
  id: string;
  name: string;
  categories: Ticket['statusCategory'][];
  statusMatch: string[];
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'col-todo',
    name: 'TO DO',
    categories: ['TO_DO'],
    statusMatch: ['OPEN', 'NEW_TRIAGE', 'IDENTIFIED', 'DRAFT_EXCEPTION', 'INC_NEW'],
  },
  {
    id: 'col-progress',
    name: 'IN PROGRESS',
    categories: ['IN_PROGRESS'],
    statusMatch: ['IN_PROGRESS', 'CONTAINMENT', 'REMEDIATION_IN_PROGRESS'],
  },
  {
    id: 'col-review',
    name: 'IN REVIEW',
    categories: ['IN_REVIEW'],
    statusMatch: ['UNDER_REVIEW', 'PENDING_CISO_APPROVAL', 'PENDING_RETEST', 'APPROVAL_PENDING'],
  },
  {
    id: 'col-done',
    name: 'DONE',
    categories: ['DONE', 'CANCELLED'],
    statusMatch: ['RESOLVED', 'CLOSED', 'EXCEPTION_APPROVED', 'RISK_MITIGATED', 'DONE'],
  },
];

const normalizeStatus = (value?: string): string =>
  (value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

export const getKanbanColumnId = (ticket: Pick<Ticket, 'statusCategory' | 'statusId' | 'statusName'>): string => {
  const statusValues = [normalizeStatus(ticket.statusId), normalizeStatus(ticket.statusName)];
  const byStatus = COLUMNS.find((column) => column.statusMatch.some((status) => statusValues.includes(status)));
  if (byStatus) return byStatus.id;

  return COLUMNS.find((column) => column.categories.includes(ticket.statusCategory))?.id || 'col-todo';
};

const transitionMatchesColumn = (transition: { toStateId?: string }, column: ColumnDef): boolean => {
  const targetState = normalizeStatus(transition.toStateId);
  return column.statusMatch.includes(targetState) || column.categories.some((category) => {
    if (category === 'TO_DO') return ['OPEN', 'NEW_TRIAGE', 'IDENTIFIED', 'DRAFT_EXCEPTION', 'INC_NEW'].includes(targetState);
    if (category === 'IN_PROGRESS') return ['IN_PROGRESS', 'CONTAINMENT', 'REMEDIATION_IN_PROGRESS'].includes(targetState);
    if (category === 'IN_REVIEW') return ['UNDER_REVIEW', 'PENDING_CISO_APPROVAL', 'PENDING_RETEST', 'APPROVAL_PENDING'].includes(targetState);
    return ['RESOLVED', 'CLOSED', 'EXCEPTION_APPROVED', 'RISK_MITIGATED', 'DONE'].includes(targetState);
  });
};

export const TicketKanbanBoard: React.FC<TicketKanbanBoardProps> = ({
  tickets,
  onSelectTicket,
  onTransitionTicket,
  onRefreshTickets,
}) => {
  const { allUsers, fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [draggedTicketId, setDraggedTicketId] = React.useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = React.useState<string | null>(null);
  const [movingTicketId, setMovingTicketId] = React.useState<string | null>(null);
  const [moveMessage, setMoveMessage] = React.useState<string | null>(null);

  const moveTicket = async (ticket: Ticket, targetColumn: ColumnDef) => {
    if (movingTicketId || getKanbanColumnId(ticket) === targetColumn.id) return;

    setMovingTicketId(ticket.id);
    setMoveMessage(null);
    try {
      const detailResponse = await fetchWithAuth(`/api/tickets/${ticket.id}`);
      const detail = await detailResponse.json();
      if (!detailResponse.ok || !detail.success) {
        throw new Error(detail.error || 'Ticket details could not be loaded.');
      }

      const transition = (detail.transitions || []).find((candidate: { toStateId?: string }) =>
        transitionMatchesColumn(candidate, targetColumn)
      );
      if (!transition) {
        throw new Error(`No allowed workflow transition moves this ticket to ${targetColumn.name}. Open the ticket to review its allowed next steps.`);
      }

      if (onTransitionTicket) {
        await onTransitionTicket(ticket.id, transition.id);
      } else {
        const response = await fetchWithAuth(`/api/tickets/${ticket.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transitionId: transition.id }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Ticket transition failed.');
        }
      }
      onRefreshTickets?.();
    } catch (error) {
      setMoveMessage(error instanceof Error ? error.message : 'Ticket transition failed.');
    } finally {
      setMovingTicketId(null);
      setDraggedTicketId(null);
      setDragOverColumnId(null);
    }
  };

  return (
    <div className="flex-1 overflow-x-auto p-4 bg-semantic-jira-surface custom-scrollbar">
      <div className="flex min-h-full gap-3">
        {COLUMNS.map((col) => {
          const colTickets = tickets.filter((ticket) => getKanbanColumnId(ticket) === col.id);

          return (
            <div
              key={col.id}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedTicketId) setDragOverColumnId(col.id);
              }}
              onDragLeave={() => setDragOverColumnId((current) => current === col.id ? null : current)}
              onDrop={(event) => {
                event.preventDefault();
                const ticket = tickets.find((candidate) => candidate.id === event.dataTransfer.getData('text/ticket-id'));
                if (ticket) void moveTicket(ticket, col);
              }}
              className={`w-72 shrink-0 bg-semantic-panel border rounded-md flex flex-col max-h-full overflow-hidden shadow-sm transition-colors ${
                dragOverColumnId === col.id ? 'border-semantic-jira-brand ring-2 ring-semantic-jira-brand/20 bg-semantic-jira-hover/40' : 'border-semantic-jira-border'
              }`}
            >
            {/* Column Header */}
            <div className="p-3 border-b border-semantic-jira-border flex items-center justify-between bg-semantic-jira-surface/60">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-semantic-jira-primary uppercase tracking-wider">
                  {t(col.name)}
                </span>
                <span className="px-1.5 py-0.2 rounded bg-semantic-jira-hover text-semantic-jira-muted font-mono text-caption font-semibold">
                  {colTickets.length}
                </span>
              </div>
              {dragOverColumnId === col.id && <span className="text-caption font-semibold text-semantic-jira-brand">{t('Drop to move')}</span>}
            </div>

            {/* Column Cards Container */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {colTickets.length === 0 ? (
                <div className="text-center py-10 text-label text-semantic-jira-muted-light italic border border-dashed border-semantic-jira-border rounded">
                  {t('No issues in this column')}
                </div>
              ) : (
                colTickets.map((ticket) => {
                  const assignee = allUsers.find((u) => u.id === ticket.assigneeId);

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket)}
                      draggable={!movingTicketId}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/ticket-id', ticket.id);
                        setDraggedTicketId(ticket.id);
                        setMoveMessage(null);
                      }}
                      onDragEnd={() => {
                        setDraggedTicketId(null);
                        setDragOverColumnId(null);
                      }}
                      className={`p-3 bg-semantic-panel hover:bg-semantic-jira-hover border border-semantic-jira-border hover:border-semantic-jira-brand rounded cursor-grab active:cursor-grabbing transition-all space-y-2 group shadow-sm ${movingTicketId === ticket.id ? 'opacity-60' : ''}`}
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

                      <div className="flex items-center justify-between gap-2 text-caption text-semantic-jira-muted">
                        <span className="truncate">{ticket.statusName}</span>
                        {movingTicketId === ticket.id && <span className="shrink-0 text-semantic-jira-brand">{t('Moving...')}</span>}
                      </div>

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
                              {ticket.targetDepartmentId || ticket.departmentId ? t('Department Queue') : t('Unassigned')}
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
      {moveMessage && (
        <div role="status" className="mt-3 max-w-3xl rounded border border-semantic-warning-soft-border bg-semantic-warning-soft-bg px-3 py-2 text-xs text-semantic-warning-strong">
          {moveMessage}
        </div>
      )}
    </div>
  );
};
